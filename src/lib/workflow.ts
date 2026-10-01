import type { ContentStatus } from "@prisma/client";

/**
 * Editorial workflow: DRAFT -> IN_REVIEW -> PUBLISHED -> ARCHIVED.
 *
 * Content is never hard-deleted from the public site. ARCHIVED hides an item
 * while keeping it recoverable, and permanent deletion is a separate,
 * deliberately separate Super Administrator action.
 */

export const CONTENT_STATUSES: ContentStatus[] = [
  "DRAFT",
  "IN_REVIEW",
  "PUBLISHED",
  "ARCHIVED",
];

/** Which status changes each role is allowed to make. */
const ALLOWED_TRANSITIONS: Record<ContentStatus, ContentStatus[]> = {
  DRAFT: ["DRAFT", "IN_REVIEW", "PUBLISHED", "ARCHIVED"],
  IN_REVIEW: ["IN_REVIEW", "DRAFT", "PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["PUBLISHED", "DRAFT", "ARCHIVED"],
  ARCHIVED: ["ARCHIVED", "DRAFT", "PUBLISHED"],
};

export function canTransition(from: ContentStatus, to: ContentStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function transitionError(
  from: ContentStatus,
  to: ContentStatus
): string | null {
  if (from === to) return null;
  if (canTransition(from, to)) return null;
  return `Content cannot move from ${statusLabel(from)} to ${statusLabel(to)}.`;
}

export function statusLabel(status: ContentStatus): string {
  switch (status) {
    case "DRAFT":
      return "Draft";
    case "IN_REVIEW":
      return "In review";
    case "PUBLISHED":
      return "Published";
    case "ARCHIVED":
      return "Archived";
  }
}

export function statusHint(status: ContentStatus): string {
  switch (status) {
    case "DRAFT":
      return "Only visible to CMS users. Not shown on the website.";
    case "IN_REVIEW":
      return "Submitted for review. Not shown on the website yet.";
    case "PUBLISHED":
      return "Live on the public website.";
    case "ARCHIVED":
      return "Removed from the website but kept so it can be restored.";
  }
}

/**
 * Resolves the publish timestamp for a status change.
 * Publishing stamps `now`; unpublishing or archiving clears it so the item stops
 * appearing in date-ordered public listings.
 */
export function resolvePublishedAt(
  to: ContentStatus,
  existing: Date | null
): Date | null {
  if (to === "PUBLISHED") return existing ?? new Date();
  return null;
}

/** Only PUBLISHED items are visible to the public, and never soft-deleted ones. */
export const PUBLIC_WHERE = {
  status: "PUBLISHED" as ContentStatus,
  deletedAt: null,
};
