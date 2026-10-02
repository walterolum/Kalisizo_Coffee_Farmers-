/**
 * The CMS permission matrix, kept free of any server-only import.
 *
 * This is a single source of truth shared by the API routes and the admin UI.
 * It lives apart from `src/backend/admin-guard.ts` because that module imports
 * `next/server` and (lazily) Prisma, neither of which may be pulled into a
 * client bundle — the admin panels need the same matrix to decide which actions
 * to offer. The server still re-checks every request; this only shapes the UI.
 */
/**
 * The CMS roles, declared here rather than derived from the matrix so the type
 * alias is not circular. Kept in step with `USER_ROLES` in `@/backend/auth`.
 */
export const ROLES = ["SUPER_ADMIN", "CONTENT_ADMIN", "EDITOR"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = {
  /** Read CMS data (dashboards, lists, activity log, contact inquiries). */
  viewCms: ["SUPER_ADMIN", "CONTENT_ADMIN", "EDITOR"],
  /** Create and edit drafts. */
  editContent: ["SUPER_ADMIN", "CONTENT_ADMIN", "EDITOR"],
  /** Move content from DRAFT/IN_REVIEW to PUBLISHED, or back. */
  publishContent: ["SUPER_ADMIN", "CONTENT_ADMIN"],
  /** Archive, soft-delete or permanently remove content. */
  deleteContent: ["SUPER_ADMIN", "CONTENT_ADMIN"],
  /** Edit site-wide configuration (contact details, social links, settings). */
  manageSettings: ["SUPER_ADMIN", "CONTENT_ADMIN"],
  /** Upload media. */
  manageMedia: ["SUPER_ADMIN", "CONTENT_ADMIN", "EDITOR"],
  /** Create, edit, deactivate or delete CMS accounts. */
  manageUsers: ["SUPER_ADMIN"],
  /** Restore archived content and manage the activity/audit log. */
  manageSystem: ["SUPER_ADMIN"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;
