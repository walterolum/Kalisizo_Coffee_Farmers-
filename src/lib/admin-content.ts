import { NextResponse } from "next/server";
import type { ContentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { adminRateLimit, can, requirePermission, roleLabel } from "@/lib/admin-guard";
import { badRequest, notFound, parseBody, serviceUnavailable } from "@/lib/http";
import { assertFresh, publish, publishMeta, recordAudit } from "@/lib/publish";
import { uniqueSlug } from "@/lib/slug";
import { RESERVED_PAGE_SLUGS } from "@/lib/reserved-slugs";
import { sanitizeContentRow } from "@/lib/sanitize";
import { resolvePublishedAt, transitionError } from "@/lib/workflow";
import type { z } from "zod";

/**
 * Generic create/update/soft-delete handler for editorial content.
 *
 * Every content type shares the same lifecycle rules, so they are enforced here
 * once instead of being re-implemented per route:
 *   - Editors may create and edit but cannot publish or delete (role checks).
 *   - A status change must be a legal transition and is attributed in the audit
 *     log as a STATUS_CHANGE rather than a plain UPDATE.
 *   - `publishedAt` is derived from the status, never accepted from the client.
 *   - Deletion is soft (sets `deletedAt`) so published content is recoverable.
 */

/**
 * Whether an admin list filtered to this status should include soft-deleted rows.
 *
 * Archiving sets `deletedAt`, and admin list routes begin from `deletedAt: null`
 * so that deleted content never leaks into normal views. That default would also
 * hide exactly the rows the Archived filter exists to list, which left a Super
 * Admin able to archive a record but never able to find it again in order to
 * restore it. Asking for ARCHIVED explicitly is therefore treated as consent to
 * see soft-deleted rows; every other status keeps them hidden.
 */
export function includesSoftDeleted(status: ContentStatus | null): boolean {
  return status === "ARCHIVED";
}

export type ContentModel =
  | "newsArticle"
  | "event"
  | "project"
  | "announcement"
  | "publication"
  | "page"
  | "service"
  | "galleryAlbum"
  | "galleryImage"
  // Home-page modules, which are managed content but not part of the
  // DRAFT -> IN_REVIEW -> PUBLISHED editorial flow.
  | "faqItem"
  | "successStory"
  | "storeLocation";

type HandlerConfig<S extends z.ZodTypeAny> = {
  req: Request;
  model: ContentModel;
  /** Audit-log label, e.g. "news". */
  targetType: string;
  /** Realtime collection name, e.g. "news". */
  collection: string;
  schema: S;
  /** Maps validated input to the Prisma write payload. */
  toData: (input: z.infer<S>) => Record<string, unknown>;
  /** Human-readable title used in audit summaries. */
  titleOf: (record: Record<string, unknown>) => string;
  /** Extra work after create/update, e.g. syncing tags. */
  afterWrite?: (record: Record<string, unknown>, input: z.infer<S>) => Promise<void>;
  /** Build the Prisma where clause from validated input. */
  buildWhere?: (input: z.infer<S>) => Record<string, unknown>;
};

function delegateOf(model: ContentModel) {
  return (prisma as unknown as Record<string, Record<string, unknown>>)[model] as {
    findUnique(args: unknown): Promise<Record<string, unknown> | null>;
    update(args: unknown): Promise<Record<string, unknown>>;
  };
}

/**
 * Shared implementation for POST (create or update) on admin content routes.
 */
export async function handleContentWrite<S extends z.ZodTypeAny>(
  config: HandlerConfig<S>
): Promise<NextResponse> {
  const { req, model, targetType, collection, schema, toData, titleOf } = config;
  const guard = await requirePermission(req, "editContent");
  if ("response" in guard) return guard.response;
  const user = guard.user;

  const limited = adminRateLimit(req, targetType);
  if (limited) return limited;

  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data as Record<string, unknown>;
  const id = typeof input.id === "string" ? input.id : undefined;
  const baseUpdatedAt =
    typeof input.baseUpdatedAt === "string" ? input.baseUpdatedAt : undefined;

  const delegate = delegateOf(model);

  try {
    if (id) {
      const existing = await delegate.findUnique({ where: { id } });
      if (!existing) {
        return notFound(`${label(targetType)} not found.`);
      }
      // Already-deleted rows are treated as absent so a stale CMS tab cannot
      // resurrect an archived item.
      if (existing.deletedAt) {
        return notFound(`${label(targetType)} has been deleted.`);
      }

      const currentStatus = (existing.status as ContentStatus | undefined) ?? "DRAFT";
      const requestedStatus = input.status as ContentStatus | undefined;
      const statusChanged = Boolean(requestedStatus && requestedStatus !== currentStatus);

      // Publishing is a separate permission from editing: an Editor may revise
      // a live article but may not push it to, or pull it back from, PUBLISHED.
      if (statusChanged && !can(user, "publishContent")) {
        return NextResponse.json(
          {
            error: "forbidden",
            message: `Your role (${roleLabel(user.role)}) cannot change publication status. Ask a Content Administrator to review it.`,
          },
          { status: 403 }
        );
      }

      if (statusChanged) {
        const illegal = transitionError(currentStatus, requestedStatus!);
        if (illegal) return badRequest(illegal, "status");
      }

      if (baseUpdatedAt) {
        const currentUpdatedAt =
          existing.updatedAt instanceof Date ? existing.updatedAt : new Date(String(existing.updatedAt));
        const conflict = await assertFresh(targetType, currentUpdatedAt, baseUpdatedAt);
        if (conflict) return conflict;
      }

      // Rich text is sanitised here, at the boundary, before it reaches Prisma.
      // See `@/lib/sanitize` for why this is an allowlist and why it is applied
      // on write rather than on render: the public pages inject these fields
      // with `dangerouslySetInnerHTML`, so an unsanitised body is stored XSS
      // running for every visitor as soon as the item is published.
      const data = sanitizeContentRow(model, toData(parsed.data));
      if (requestedStatus) {
        data.status = requestedStatus;
        data.publishedAt = resolvePublishedAt(
          requestedStatus,
          existing.publishedAt instanceof Date ? existing.publishedAt : null
        );
      }

      // A slug sent on update is a *rename*, and it has to go through the same
      // derivation as a create. Without this the reserved-slug protection only
      // covers creation: an editor could create a page as `careers`, then edit it
      // and set the slug to `about`. The validator accepts that � `about` matches
      // its pattern perfectly � and the write is applied verbatim, so the static
      // /about route starts shadowing the row and /p/about becomes a second URL
      // for the same content.
      //
      // Skipped when the slug is absent or unchanged, so an ordinary edit does not
      // spend a query or churn the URL. `excludeId` keeps the row's own slug
      // available to it, so re-saving an unchanged name is a no-op rather than
      // appending -2 to itself.
      if (SLUG_MODELS.has(model) && typeof input.slug === "string" && input.slug.trim()) {
        const currentSlug = typeof existing.slug === "string" ? existing.slug : undefined;
        const requestedSlug = input.slug.trim();
        if (requestedSlug !== currentSlug) {
          data.slug = await uniqueSlug(
            delegate as unknown as {
              findFirst(args: {
                where: { slug: string; NOT?: { id: string } };
                select: { slug: true };
              }): Promise<{ slug: string } | null>;
            },
            requestedSlug,
            id,
            // Only `Page` is served from a catch-all that competes with the
            // hand-written routes; see reserved-slugs.ts.
            model === "page" ? RESERVED_PAGE_SLUGS : undefined
          );
        }
      }

      const updated = await delegate.update({ where: { id }, data });
      if (config.afterWrite) await config.afterWrite(updated, parsed.data);

      await recordAudit({
        actor: user,
        action: statusChanged ? "STATUS_CHANGE" : "UPDATE",
        targetType,
        targetId: id,
        summary: statusChanged
          ? `Moved "${titleOf(updated)}" from ${currentStatus} to ${requestedStatus}`
          : `Updated ${label(targetType).toLowerCase()} "${titleOf(updated)}"`,
        before: existing,
        after: updated,
      });
      await publish(user, [collection]);

      return NextResponse.json({ ...updated, ...publishMeta(user) });
    }

    // Creating published content is also a publish action, so an Editor's
    // drafts can never go straight to the live site.
    const requestedStatus = (input.status as ContentStatus | undefined) ?? "DRAFT";
    const createsLiveContent =
      requestedStatus === "PUBLISHED" || requestedStatus === "ARCHIVED";
    if (createsLiveContent && !can(user, "publishContent")) {
      return NextResponse.json(
        {
          error: "forbidden",
          message: `Your role (${roleLabel(user.role)}) cannot publish content. It has not been saved. Ask a Content Administrator to review it.`,
        },
        { status: 403 }
      );
    }

    const data: Record<string, unknown> = {
      // Sanitised on the way in, for the same reason as the update branch.
      ...sanitizeContentRow(model, toData(parsed.data)),
      status: requestedStatus,
      publishedAt: resolvePublishedAt(requestedStatus, null),
    };

    // Most editorial models carry a required, unique `slug` column with no
    // default, so it has to exist by the time the row is inserted. Deriving it
    // here rather than in each route keeps create working for every type: a
    // route that only back-filled the slug after the insert could never
    // create a row at all. Pages and services may supply their own slug, which
    // is honoured when it is not already taken.
    if (SLUG_MODELS.has(model)) {
      const requested = typeof input.slug === "string" ? input.slug.trim() : "";
      const base = requested || String(input.title ?? "");
      data.slug = await uniqueSlug(
        delegate as unknown as {
          findFirst(args: {
            where: { slug: string; NOT?: { id: string } };
            select: { slug: true };
          }): Promise<{ slug: string } | null>;
        },
        base,
        undefined,
        // Only `Page` is served from a catch-all that competes with hand-written
        // routes. The other slug models each own a dedicated prefix
        // (`/news/<slug>`, `/events/<slug>`, ...), so a slug of `about` there is
        // unambiguous and reserving it would only be surprising.
        model === "page" ? RESERVED_PAGE_SLUGS : undefined
      );
    }

    const client = (prisma as unknown as Record<string, { create(args: unknown): Promise<Record<string, unknown>> }>)[
      model
    ];
    const created = await client.create({ data });
    if (config.afterWrite) await config.afterWrite(created, parsed.data);

    await recordAudit({
      actor: user,
      action: "CREATE",
      targetType,
      targetId: String(created.id ?? ""),
      summary: `Created ${label(targetType).toLowerCase()} "${titleOf(created)}" as ${requestedStatus}`,
      after: created,
    });
    await publish(user, [collection]);

    return NextResponse.json({ ...created, ...publishMeta(user) }, { status: 201 });
  } catch (error) {
    console.error(`[api] write ${targetType} failed:`, error);
    return serviceUnavailable(`Could not save this ${label(targetType).toLowerCase()}.`);
  }
}

/**
 * Models that take part in the DRAFT/IN_REVIEW/PUBLISHED workflow. The
 * home-page modules below do not � they are live-or-archived by `deletedAt`
 * alone, so writing `status`/`publishedAt` on them would be rejected by Prisma.
 */
const WORKFLOW_MODELS: ReadonlySet<ContentModel> = new Set([
  "newsArticle",
  "event",
  "project",
  "announcement",
  "publication",
  "page",
  "service",
  "galleryAlbum",
  "galleryImage",
]);

/**
 * Whether a model is in the editorial workflow.
 *
 * Exported because it decides something a test needs to be able to check: a
 * workflow model is invisible on the public site until it is published, so the
 * CMS must have its own list route for it. A non-workflow model is public as
 * soon as it is saved, so reading through the public endpoint is equivalent and
 * needs no separate route. Reading a workflow model through the public endpoint
 * is how drafts came to disappear from the Programs panel after saving.
 */
export function isWorkflowModel(model: string): boolean {
  return WORKFLOW_MODELS.has(model as ContentModel);
}

/**
 * Models whose table declares `slug` as a required, unique column, so a value
 * must be supplied on insert. `galleryImage` is the one editorial model without
 * a slug: it is addressed by id and is not published at its own URL.
 */
const SLUG_MODELS: ReadonlySet<ContentModel> = new Set([
  "newsArticle",
  "event",
  "project",
  "announcement",
  "publication",
  "page",
  "service",
  "galleryAlbum",
]);

/** Soft-deletes content. Archives rather than destroying so it can be restored. */
export async function handleContentDelete(
  req: Request,
  id: string,
  model: ContentModel,
  targetType: string,
  collection: string,
  titleField = "title"
): Promise<NextResponse> {
  const guard = await requirePermission(req, "deleteContent");
  if ("response" in guard) return guard.response;
  const user = guard.user;

  const limited = adminRateLimit(req, `${targetType}:delete`);
  if (limited) return limited;

  const delegate = delegateOf(model) as unknown as {
    findUnique(args: unknown): Promise<Record<string, unknown> | null>;
    update(args: unknown): Promise<Record<string, unknown>>;
  };

  try {
    const existing = await delegate.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) {
      return notFound(`${label(targetType)} not found.`);
    }

    const updated = await delegate.update({
      where: { id },
      data: archiveData(model),
    });

    await recordAudit({
      actor: user,
      action: "DELETE",
      targetType,
      targetId: id,
      summary: `Archived ${label(targetType).toLowerCase()} "${String(existing[titleField] ?? id)}"`,
      before: existing,
      after: updated,
    });
    await publish(user, [collection]);

    return NextResponse.json({ ok: true, archivedId: id, ...publishMeta(user) });
  } catch (error) {
    console.error(`[api] delete ${targetType}/${id} failed:`, error);
    return serviceUnavailable(`Could not delete this ${label(targetType).toLowerCase()}.`);
  }
}

/** Restores a soft-deleted record. */
export async function handleContentRestore(
  req: Request,
  id: string,
  model: ContentModel,
  targetType: string,
  collection: string,
  titleField = "title"
): Promise<NextResponse> {
  const guard = await requirePermission(req, "manageSystem");
  if ("response" in guard) return guard.response;
  const user = guard.user;

  const limited = adminRateLimit(req, `${targetType}:restore`);
  if (limited) return limited;

  const delegate = delegateOf(model) as unknown as {
    findUnique(args: unknown): Promise<Record<string, unknown> | null>;
    update(args: unknown): Promise<Record<string, unknown>>;
  };

  try {
    const existing = await delegate.findUnique({ where: { id } });
    if (!existing) return notFound(`${label(targetType)} not found.`);
    if (!existing.deletedAt) {
      return badRequest("This item is not deleted.", "id");
    }

    const updated = await delegate.update({
      where: { id },
      // Restored content always returns as a draft so a Super Administrator
      // re-publishes deliberately rather than it reappearing live.
      data: restoreData(model),
    });

    await recordAudit({
      actor: user,
      action: "UPDATE",
      targetType,
      targetId: id,
      summary: `Restored "${String(existing[titleField] ?? id)}" from the archive`,
      before: existing,
      after: updated,
    });
    await publish(user, [collection]);

    return NextResponse.json({ ok: true, restoredId: id, ...publishMeta(user) });
  } catch (error) {
    console.error(`[api] restore ${targetType}/${id} failed:`, error);
    return serviceUnavailable(`Could not restore this ${label(targetType).toLowerCase()}.`);
  }
}

/**
 * The write that hides a record. Workflow models are also moved to ARCHIVED so
 * they drop out of date-ordered public listings; the other models only carry a
 * `deletedAt` column.
 */
function archiveData(model: ContentModel): Record<string, unknown> {
  const data: Record<string, unknown> = { deletedAt: new Date() };
  if (WORKFLOW_MODELS.has(model)) {
    data.status = "ARCHIVED";
    data.publishedAt = null;
  }
  return data;
}

/** Mirror of `archiveData` for the restore path. */
function restoreData(model: ContentModel): Record<string, unknown> {
  const data: Record<string, unknown> = { deletedAt: null };
  if (WORKFLOW_MODELS.has(model)) {
    data.status = "DRAFT";
    data.publishedAt = null;
  }
  return data;
}

function label(targetType: string): string {
  return targetType.charAt(0).toUpperCase() + targetType.slice(1);
}
