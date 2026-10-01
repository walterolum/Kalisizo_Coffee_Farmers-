import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminRateLimit, requirePermission } from "@/lib/admin-guard";
import { parseBody } from "@/lib/http";
import { settingsSchema } from "@/lib/validators";
import { assertFresh, publish, publishMeta, recordAudit } from "@/lib/publish";
import { ensureCooperativeInfo, readSiteSettings } from "@/lib/site-settings";
import { matchExistingSocialIds, planSocialWrites } from "@/lib/socials";

export async function GET(req: Request) {
  const guard = await requirePermission(req, "viewCms");
  if ("response" in guard) return guard.response;
  const limited = adminRateLimit(req, "settings");
  if (limited) return limited;

  try {
    const settings = await readSiteSettings();
    return NextResponse.json(settings ?? { error: "not_configured" });
  } catch (error) {
    console.error("[api] GET /api/v1/admin/settings failed:", error);
    return NextResponse.json(
      { error: "service_unavailable", message: "Could not load settings." },
      { status: 503 }
    );
  }
}

export async function POST(req: Request) {
  const guard = await requirePermission(req, "manageSettings");
  if ("response" in guard) return guard.response;
  const user = guard.user;

  const limited = adminRateLimit(req, "settings");
  if (limited) return limited;

  const parsed = await parseBody(req, settingsSchema);
  if (!parsed.ok) return parsed.response;

  // `baseUpdatedAt` is a concurrency token for `assertFresh` below, not a column
  // on `CooperativeInfo`. `settingsSchema` declares it, so it survives
  // validation and would otherwise be handed to Prisma as an unknown argument,
  // which fails the whole save. It must be destructured out of `data`.
  // Three CMS screens write to this one row: About (mission, vision, taglines),
  // Contact (phones, email, address, socials) and Logo (logoUrl). Each submits
  // only the fields it displays, so an **omitted** field has to mean "leave it
  // alone" — not "clear it".
  //
  // That is why `settingsSchema` carries no `.default()` on these fields. With
  // one, zod fills `phoneNumbers: []` for a request that never mentioned phones,
  // and saving the About section silently wiped the cooperative's real contact
  // details. Clearing a field is still possible: send it explicitly as an empty
  // string or an empty list.
  const { socials, baseUpdatedAt, ...submitted } = parsed.data;
  const data = Object.fromEntries(
    Object.entries(submitted).filter(([, value]) => value !== undefined)
  );

  try {
    const existing = await ensureCooperativeInfo();
    const existingSocials = await prisma.socialLink.findMany({
      orderBy: { displayOrder: "asc" },
    });

    if (existing.updatedAt && baseUpdatedAt) {
      const conflict = await assertFresh("settings", existing.updatedAt, baseUpdatedAt);
      if (conflict) return conflict;
    }

    // A request carrying no editable field is a client bug, not a save.
    // Accepting it would report success while changing nothing.
    if (Object.keys(data).length === 0 && socials === undefined) {
      return NextResponse.json(
        { error: "validation_error", message: "No settings fields were provided." },
        { status: 400 }
      );
    }

    // Resolved before anything is written. A handle that cannot become a link is
    // reported against its row and the whole save is refused, because a save
    // that quietly drops a handle is indistinguishable from one that worked.
    const plan = socials === undefined ? null : planSocialWrites(socials);
    if (plan?.problems.length) {
      return NextResponse.json(
        {
          error: "validation_error",
          message: plan.problems.map((problem) => problem.message).join(" "),
          field: `socials[${plan.problems[0].index}]`,
        },
        { status: 400 }
      );
    }

    const info = Object.keys(data).length
      ? await prisma.cooperativeInfo.update({
          where: { id: existing.id },
          data,
        })
      : existing;

    // Social profiles are touched only when the request actually carried a
    // `socials` array. Within that array the list is the whole list: the CMS form
    // submits every row it has, in order, so anything not in the plan is a link
    // the editor removed and is deleted rather than left behind as a ghost.
    if (plan) {
      const writes = matchExistingSocialIds(plan.writes, existingSocials);
      const keep = new Set(writes.map((write) => write.id));
      const removed = existingSocials
        .filter((link) => !keep.has(link.id))
        .map((link) => link.id);

      if (writes.length || removed.length) {
        await prisma.$transaction([
          ...writes.map((write) =>
            prisma.socialLink.upsert({
              where: { id: write.id },
              create: {
                id: write.id,
                platform: write.platform,
                handle: write.handle,
                url: write.url,
                displayOrder: write.displayOrder,
                isActive: true,
              },
              update: {
                platform: write.platform,
                handle: write.handle,
                url: write.url,
                displayOrder: write.displayOrder,
                isActive: true,
              },
            })
          ),
          ...(removed.length
            ? [prisma.socialLink.deleteMany({ where: { id: { in: removed } } })]
            : []),
        ]);
      }
    }

    const fresh = await readSiteSettings();

    await recordAudit({
      actor: user,
      action: "UPDATE",
      targetType: "settings",
      targetId: info.id,
      summary: "Updated cooperative settings (mission, contact details, social links)",
      before: { ...existing, socials: existingSocials },
      after: { ...info, socials: fresh?.socials ?? [] },
    });
    publish(user, ["settings"]);

    return NextResponse.json({ ...fresh, ...publishMeta(user) });
  } catch (error) {
    console.error("[api] POST /api/v1/admin/settings failed:", error);
    return NextResponse.json(
      { error: "service_unavailable", message: "Could not save cooperative settings." },
      { status: 503 }
    );
  }
}

export const dynamic = "force-dynamic";
