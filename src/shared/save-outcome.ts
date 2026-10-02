/**
 * How the CMS describes a save to the administrator.
 *
 * This exists as its own module, with no React in it, for one reason: the
 * version that lived inside `AdminClient.tsx` always said "Published
 * successfully" no matter what the server had actually stored. Nothing about
 * that was visible in a diff of the panel code, because the panel did not send a
 * status at all — the wrong message lived in the shared helper, and the missing
 * status lived in the caller. Extracting it lets a test assert the one property
 * that matters: a save is described by the status the database holds.
 */

/** The saved row as the API returns it, plus the attribution the CMS adds. */
export type SaveResult = {
  status?: string | null;
  publishedAt?: string | null;
  publishedBy?: string;
};

export type SaveOutcome = { message: string; kind: "success" | "error" };

export function formatSavedAt(iso?: string | null): string {
  if (!iso) return "just now";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "just now" : d.toLocaleString();
}

/**
 * Describes a save from the status the server actually stored.
 *
 * A missing status means the model's table has no status column, and those
 * records (leadership, locations, FAQs, success stories, products) are live the
 * moment they are saved — so "saved, live on the site" is accurate rather than
 * optimistic.
 */
export function saveOutcome(res: SaveResult): SaveOutcome {
  const who = res.publishedBy ?? "you";
  const when = res.publishedAt ? formatSavedAt(res.publishedAt) : "";

  switch (res.status) {
    case "PUBLISHED":
      return {
        message: `Published · live on the site${when ? ` · ${when}` : ""} · by ${who}`,
        kind: "success",
      };
    case "IN_REVIEW":
      return { message: "Saved and sent for review.", kind: "success" };
    case "ARCHIVED":
      return { message: "Archived · removed from the public site.", kind: "success" };
    case "DRAFT":
      return { message: "Saved as a draft · not visible on the site yet.", kind: "success" };
    default:
      return {
        message: `Saved${when ? ` · ${when}` : ""} · live on the site.`,
        kind: "success",
      };
  }
}
