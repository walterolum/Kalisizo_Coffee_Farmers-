import { NextResponse } from "next/server";
import { broadcastRealtimeUpdate } from "@/lib/realtime-server";
import { prisma } from "@/lib/prisma";
import type { AuthUser } from "@/lib/auth";

// Shared helpers for CMS save/publish flows:
// - recordAudit: append to the audit trail (who/what/when/success + before/after snapshots).
// - publishMeta: authoritative publish timestamp + actor, returned to the client after the
//   database write has confirmed so the UI only reports success when it is real.
// - assertFresh: optimistic-concurrency guard used to detect "another admin changed this row
//   since you loaded it" so newer changes are never silently overwritten.

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "STATUS_CHANGE"
  | "LOGIN"
  | "USER_CHANGE";

type AuditInput = {
  actor: AuthUser;
  action: AuditAction;
  targetType: string;
  targetId?: string | null;
  summary: string;
  status?: "SUCCESS" | "ERROR";
  before?: unknown;
  after?: unknown;
};

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actor.sub,
        actorName: input.actor.name,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        summary: input.summary,
        status: input.status ?? "SUCCESS",
        before: input.before != null ? (input.before as object) : undefined,
        after: input.after != null ? (input.after as object) : undefined,
      },
    });
  } catch (error) {
    console.error(`[audit] failed to write audit log (${input.targetType} ${input.actor.email}):`, error);
  }
}

/** Publish metadata is produced only AFTER the DB write confirms. */
export function publishMeta(actor: AuthUser): { publishedAt: string; publishedBy: string } {
  return { publishedAt: new Date().toISOString(), publishedBy: actor.name };
}

/**
 * Optimistic concurrency guard. When the client includes `baseUpdatedAt` (the updatedAt of the
 * row it loaded), and the current row has been modified after that, refuse the save with a 409
 * so the newer content is never silently clobbered. Returns null when the request is fresh.
 *
 * A small tolerance window absorbs clock skew between web + DB servers.
 */
export async function assertFresh(
  targetType: string,
  currentUpdatedAt: Date,
  baseUpdatedAt?: string,
  toleranceMs = 1500
): Promise<NextResponse | null> {
  if (!baseUpdatedAt) return null;
  const base = new Date(baseUpdatedAt);
  if (Number.isNaN(base.getTime())) return null;
  if (currentUpdatedAt.getTime() <= base.getTime() + toleranceMs) return null;

  let who: string | null = null;
  try {
    const last = await prisma.auditLog.findFirst({
      where: { targetType, status: "SUCCESS" },
      orderBy: { createdAt: "desc" },
    });
    who = last?.actorName ?? null;
  } catch {
    /* audit is best-effort */
  }

  return NextResponse.json(
    {
      error: "conflict",
      message: `This content was changed${who ? ` by ${who}` : ""} after you opened it. No changes were saved. Load the latest version and reapply your edits.`,
    },
    { status: 409 }
  );
}

/**
 * Publish + tell every connected client (public pages included) which collection changed.
 *
 * Awaited rather than fired and forgotten. The Supabase transport is a network
 * call, and on Vercel anything still in flight once the response is returned can
 * be frozen — so a broadcast that was not awaited would be dropped under exactly
 * the load that matters, while appearing to work in development.
 *
 * Errors are still contained here. The row is already committed by the time this
 * runs; letting a delivery failure propagate would report the save as failed and
 * tell an admin their content was lost when it is sitting in the database.
 */
export async function publish(
  actor: AuthUser,
  collections: string[],
  meta?: Record<string, unknown>
): Promise<void> {
  try {
    await broadcastRealtimeUpdate({ collections, publishedBy: actor.name, ...meta });
  } catch {
    /* ignore */
  }
}