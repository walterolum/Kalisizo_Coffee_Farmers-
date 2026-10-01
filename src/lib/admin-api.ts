/**
 * Client helpers for the authenticated CMS API.
 *
 * These are deliberately separate from the legacy `fetchLocations`/`fetchFaq`
 * helpers in `src/lib/api.ts`: those are public read endpoints used by the old
 * server components, whereas everything here attaches the bearer token that
 * `AdminClient` stores on login and surfaces a typed error the panels can render.
 *
 * The server remains the authority on validation, permissions, workflow and
 * optimistic concurrency; these helpers only shape requests and unwrap
 * responses. Every server-side rule is re-checked there.
 */
import { canTransition } from "@/lib/workflow";

/**
 * Where the bearer token lives.
 *
 * Exported so `@/components/admin/panel-kit` reads and clears the same key rather
 * than keeping its own copy of the literal. Two literals is how a client ends up
 * authenticated against one key while logging out from another.
 */
export const TOKEN_KEY = "kc_admin_token";

/**
 * Editorial content types that share the DRAFT → IN_REVIEW → PUBLISHED flow.
 * These are the path segments under `/api/v1/admin/`, so the gallery types
 * include their nested segment.
 */
export type ContentType =
  | "news"
  | "events"
  | "projects"
  | "announcements"
  | "publications"
  | "pages"
  | "gallery/albums"
  | "gallery/images";

export const CONTENT_TYPES: readonly ContentType[] = [
  "news",
  "events",
  "projects",
  "announcements",
  "publications",
  "pages",
  "gallery/albums",
  "gallery/images",
];

export type ContentStatus = "DRAFT" | "IN_REVIEW" | "PUBLISHED" | "ARCHIVED";

export const CONTENT_STATUSES: readonly ContentStatus[] = [
  "DRAFT",
  "IN_REVIEW",
  "PUBLISHED",
  "ARCHIVED",
];

/**
 * Legal status transitions, derived from the server's workflow table in
 * `@/lib/workflow` rather than restated here, so the status picker never offers
 * a move the API will reject and never hides one it would accept — such as a
 * Content Administrator publishing straight from a draft. That module imports
 * only Prisma *types*, so it is safe to pull into a client bundle.
 */
export const STATUS_TRANSITIONS: Record<
  ContentStatus,
  readonly ContentStatus[]
> = {
  DRAFT: CONTENT_STATUSES.filter((to) => canTransition("DRAFT", to)),
  IN_REVIEW: CONTENT_STATUSES.filter((to) => canTransition("IN_REVIEW", to)),
  PUBLISHED: CONTENT_STATUSES.filter((to) => canTransition("PUBLISHED", to)),
  ARCHIVED: CONTENT_STATUSES.filter((to) => canTransition("ARCHIVED", to)),
};

/** Envelope shared by every paginated admin list endpoint. */
export type Paginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
};

export type AuditEntry = {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  summary: string;
  before: unknown;
  after: unknown;
  createdAt: string;
  actor?: { id: string; name: string; role: string } | null;
};

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: "SUPER_ADMIN" | "CONTENT_ADMIN" | "EDITOR";
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  _count?: { articles: number };
};

/** Fields every editable record shares, used to render a table row. */
export type ContentRecord = {
  id: string;
  title?: string | null;
  name?: string | null;
  slug?: string | null;
  status?: ContentStatus | null;
  updatedAt?: string | null;
  createdAt?: string | null;
  publishedAt?: string | null;
  [key: string]: unknown;
};

/**
 * An error from the CMS API. `field` is populated from validation failures so a
 * form can highlight the offending input rather than showing a generic banner.
 *
 * This is the base class for *both* client API layers, and that matters: the CMS
 * has two fetch helpers (`request` here, `apiFetch` in `panel-kit`) and each used
 * to raise its own error class. A panel's `catch` therefore only recognised
 * failures from its own layer, so a 401 raised by the other one fell through as a
 * generic error. `apiFetch` now extends this class, so `instanceof AdminApiError`
 * is the single check that covers every CMS request.
 */
export class AdminApiError extends Error {
  readonly status: number;
  readonly field?: string;

  constructor(message: string, status: number, field?: string) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.field = field;
  }
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token =
    typeof window === "undefined" ? null : localStorage.getItem(TOKEN_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function isUnauthorized(status: number): boolean {
  return status === 401;
}

/** True when a failure is a 401, so callers can force a re-login. */
export function sessionExpired(error: unknown): boolean {
  return error instanceof AdminApiError && isUnauthorized(error.status);
}

/**
 * Broadcast when the API rejects a request as unauthenticated.
 *
 * The panels are separate components from the shell that owns the session, so
 * they cannot call its `logout` directly. Clearing the token here and raising an
 * event lets the shell drop back to the login form; without this an expired
 * token would leave a panel showing a single "unauthorized" message with no way
 * to sign in again without a full page reload.
 */
export const SESSION_EXPIRED_EVENT = "kc:session-expired";

/**
 * Clears the stored session and tells the shell to show the login form.
 *
 * Exported because the second client API layer (`apiFetch` in
 * `@/components/admin/panel-kit`) has to raise the same event. It previously only
 * threw, which left a real failure mode: a token that expired mid-session, or an
 * account deactivated by another administrator, produced a fully rendered CMS
 * whose every button returned 401 with no login prompt and no way back except a
 * manual reload.
 */
export function notifySessionExpired(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem("kc_admin_user");
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

/** Unwraps a JSON error body into a throwable `AdminApiError`. */
async function toError(response: Response): Promise<AdminApiError> {
  let message = "Something went wrong. Please try again.";
  let field: string | undefined;
  try {
    const body = (await response.json()) as {
      message?: string;
      field?: string;
      error?: { field?: string; message?: string };
    };
    // Validation errors nest the field/message pair under `error`.
    message = body.error?.message ?? body.message ?? message;
    field = body.error?.field ?? body.field;
  } catch {
    // A non-JSON error body (proxy/gateway HTML) keeps the default message.
  }
  return new AdminApiError(message, response.status, field);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers ?? {}) },
    cache: "no-store",
  });
  if (!response.ok) {
    if (isUnauthorized(response.status)) notifySessionExpired();
    throw await toError(response);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function base(type: ContentType): string {
  return `/api/v1/admin/${type}`;
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

export type ListFilters = {
  status?: ContentStatus | "ALL";
  q?: string;
  page?: number;
  pageSize?: number;
};

function listQuery(filters: ListFilters): string {
  const params = new URLSearchParams();
  if (filters.status && filters.status !== "ALL") {
    params.set("status", filters.status);
  }
  if (filters.q?.trim()) params.set("q", filters.q.trim().slice(0, 120));
  if (filters.page && filters.page > 1)
    params.set("page", String(filters.page));
  if (filters.pageSize) params.set("pageSize", String(filters.pageSize));
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Loads one page of a content type. */
export async function listContent<T extends ContentRecord>(
  type: ContentType,
  filters: ListFilters = {},
): Promise<Paginated<T>> {
  return request<Paginated<T>>(`${base(type)}${listQuery(filters)}`);
}

export async function listAudit(limit = 100): Promise<AuditEntry[]> {
  return request<AuditEntry[]>(`/api/v1/admin/audit?limit=${limit}`);
}

export async function listUsers(): Promise<{
  items: AdminUser[];
  total: number;
}> {
  return request<{ items: AdminUser[]; total: number }>("/api/v1/admin/users");
}

// ---------------------------------------------------------------------------
// Site settings
// ---------------------------------------------------------------------------

export type SiteSettings = {
  mission: string | null;
  vision: string | null;
  taglines: string[];
  phoneNumbers: string[];
  officialEmail: string | null;
  address: string | null;
  logoUrl: string | null;
  socials: { id: string; platform: string; handle: string; url: string }[];
  updatedAt: string;
};

/**
 * The GET route can answer `{ error: "not_configured" }` with a 200 when no
 * settings row exists yet, so callers get `null` rather than a settings object
 * with undefined fields.
 */
export async function readSettings(): Promise<SiteSettings | null> {
  const body = await request<SiteSettings | { error: string }>(
    "/api/v1/admin/settings",
  );
  return "error" in body ? null : body;
}

/**
 * Saves the singleton settings row. `updatedAt` is sent as `baseUpdatedAt` so a
 * concurrent edit is rejected instead of silently overwriting.
 *
 * Socials are submitted as the editor's list of rows — `{ platform, url }` per
 * link, in display order, with blanks already removed. `url` is the text as
 * typed (a bare `@handle` is fine); the server resolves it and refuses anything
 * it cannot turn into a link. The read model is a list of stored profiles.
 */
export async function saveSettings(values: {
  mission?: string;
  vision?: string;
  taglines?: string[];
  phoneNumbers?: string[];
  officialEmail?: string;
  address?: string;
  logoUrl?: string;
  /**
   * Omit to leave the social links alone.
   *
   * Optional rather than merely nullable because the distinction matters: the
   * server reads a submitted array as the *complete* list and deletes anything
   * missing from it, so `undefined` (leave alone) and `[]` (remove every link)
   * are different instructions. The type has to be able to express both, and a
   * caller that always sends the array turns a failed load into silent deletion
   * of every social profile.
   */
  socials?: { platform?: string; url: string }[];
  baseUpdatedAt?: string;
}): Promise<SiteSettings> {
  return request<SiteSettings>("/api/v1/admin/settings", {
    method: "POST",
    body: JSON.stringify(values),
  });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Creates or updates a record.
 *
 * Omitting `id` creates; including it updates. `baseUpdatedAt` is the row's
 * `updatedAt` from the last read and lets the server reject the write if
 * someone else changed the record in the meantime.
 */
export async function saveContent(
  type: ContentType,
  values: Record<string, unknown>,
): Promise<ContentRecord> {
  return request<ContentRecord>(base(type), {
    method: "POST",
    body: JSON.stringify(values),
  });
}

/** Soft-deletes (archives) a record so it can be restored later. */
export async function archiveContent(
  type: ContentType,
  id: string,
): Promise<void> {
  await request<void>(`${base(type)}/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

/** Restores an archived record. Super Administrators only. */
export async function restoreContent(
  type: ContentType,
  id: string,
): Promise<void> {
  await request<void>(`${base(type)}/${encodeURIComponent(id)}`, {
    method: "PATCH",
  });
}

export async function createUser(values: {
  name: string;
  email: string;
  password: string;
  role: AdminUser["role"];
}): Promise<AdminUser> {
  return request<AdminUser>("/api/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ ...values, isActive: true }),
  });
}

export async function updateUser(
  id: string,
  values: { name?: string; role?: AdminUser["role"]; isActive?: boolean },
): Promise<AdminUser> {
  return request<AdminUser>(`/api/v1/admin/users/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(values),
  });
}

/** Super Administrator password reset for another account. */
export async function resetUserPassword(
  id: string,
  password: string,
): Promise<void> {
  await request<void>(`/api/v1/admin/users/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ password }),
  });
}

/**
 * A contact-form submission, trimmed to the fields the shell's notification
 * menu renders. Mirrors `model ContactInquiry` in the Prisma schema.
 */
export type AdminInquiry = {
  id: string;
  fullName: string;
  email: string;
  subject: string | null;
  status: "PENDING" | "REVIEWED" | "RESOLVED";
  createdAt: string;
};

/**
 * Submissions still awaiting a reply — the one thing in this system that
 * genuinely deserves to interrupt an administrator, so it backs both the
 * notification badge and the dashboard's "needs attention" list.
 *
 * The API has no count endpoint, so this fetches the filtered list and lets the
 * caller take `.length`. It is the same request the inquiries panel would make,
 * so a notification click can hand the administrator straight to the row.
 */
export async function listPendingInquiries(): Promise<AdminInquiry[]> {
  return request<AdminInquiry[]>("/api/v1/admin/inquiries?status=PENDING");
}
