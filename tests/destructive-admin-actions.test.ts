import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser, UserRole } from "@/backend/auth";

/**
 * Behavioural tests for the three irreversible actions a Super Administrator is
 * allowed to take: deleting another CMS account, deleting a contact message, and
 * the page create/delete pair the CMS already had.
 *
 * These exist because each of the four ways to get this wrong is silent.
 *
 *  1. **Missing the action entirely.** There was no `DELETE` on
 *     `/api/v1/admin/users/[id]` or `/api/v1/admin/inquiries/[id]` at all, so
 *     "remove this user" was not merely hidden — the endpoint did not exist.
 *
 *  2. **Locking the cooperative out.** `User` rows are the only way into the CMS.
 *     A DELETE that honoured "the last active Super Administrator" question
 *     *after* removing the row, or not at all, leaves a site nobody can edit —
 *     with no error, just a permanently 401 login form. The guard is asserted
 *     here against a real `requirePermission`, not a stubbed one, because a stub
 *     would have passed with the check deleted.
 *
 *  3. **Auditing after the fact.** The row is destroyed, so the only surviving
 *     record of who removed it is the audit entry written in the same request.
 *     An audit written *after* a failed delete, or with the target's identity
 *     omitted, is no record at all.
 *
 *  4. **Widening the blast radius.** Deleting a contact message is not the same
 *     act as archiving editorial content: a message is correspondence with a
 *     member of the public, so it is gated on `deleteMessages` (Super Admin
 *     only) rather than `deleteContent` (which a Content Administrator holds).
 *     There is an explicit test below that a Content Administrator can still
 *     *reorder* a message with PATCH while being refused the DELETE — the
 *     tightening is meant to apply to deletion alone.
 *
 * Nothing here is a text search over the source. Every assertion is on the
 * status code and on the data actually handed to Prisma, which is the property
 * that has to hold.
 */

/* -------------------------------------------------------------- fake session */

/** The authenticated caller, or `null` for an anonymous request. */
let session: AuthUser | null = null;

vi.mock("@/backend/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/backend/auth")>();
  return {
    ...actual,
    // Everything else in the module stays real — `hashPassword` in particular,
    // so a change there cannot quietly break the routes under test.
    getUserFromRequest: () => session,
  };
});

/**
 * The limiter is neutralised, not the guard.
 *
 * `adminRateLimit` wraps `rateLimit`, which is a real module-level bucket that
 * would carry state between tests and start returning 429 at a predictable
 * point. Stubbing it keeps every assertion about authorisation — but the bucket
 * key is still captured, because "which budget does this spend" is a property
 * worth pinning and a stub is the only place it can be read from.
 */
const buckets: string[] = [];

vi.mock("@/backend/rate-limit", () => ({
  rateLimit: (identifier: string) => {
    buckets.push(identifier);
    return { ok: true, retryAfterSeconds: 0 };
  },
  clientIp: () => "127.0.0.1",
  fingerprint: (value: string) => value,
}));

/* ----------------------------------------------------------------- fake data */

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
};

type InquiryRow = {
  id: string;
  fullName: string;
  email: string;
  subject: string | null;
  status: "PENDING" | "REVIEWED" | "RESOLVED";
};

let users: UserRow[] = [];
let inquiries: InquiryRow[] = [];

/** Ids actually removed, so "did it really delete" is observable. */
let removedUsers: string[] = [];
let removedInquiries: string[] = [];

/** Audit entries and realtime invalidations, captured rather than performed. */
type AuditCall = { action: string; targetType: string; targetId: string | null; summary: string };
let audits: AuditCall[] = [];
let published: string[][] = [];

vi.mock("@/backend/publish", () => ({
  recordAudit: async (entry: AuditCall) => {
    audits.push(entry);
  },
  publish: async (_user: unknown, collections: string[]) => {
    published.push(collections);
  },
  publishMeta: () => ({ publishedAt: null, publishedBy: null }),
  assertFresh: async () => null,
}));

vi.mock("@/backend/prisma", () => ({
  prisma: {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        users.find((u) => u.id === where.id) ?? null,
      count: async ({
        where,
      }: {
        where: { id: { not: string }; role: UserRole; isActive: boolean };
      }) =>
        users.filter(
          (u) =>
            u.id !== where.id.not &&
            u.role === where.role &&
            u.isActive === where.isActive
        ).length,
      delete: async ({ where }: { where: { id: string } }) => {
        const index = users.findIndex((u) => u.id === where.id);
        if (index === -1) throw new Error("record to delete does not exist");
        removedUsers.push(where.id);
        const [row] = users.splice(index, 1);
        return row;
      },
    },
    contactInquiry: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        inquiries.find((i) => i.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Partial<InquiryRow> }) => {
        const index = inquiries.findIndex((i) => i.id === where.id);
        if (index === -1) throw new Error("record to update does not exist");
        inquiries[index] = { ...inquiries[index], ...data };
        return inquiries[index];
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const index = inquiries.findIndex((i) => i.id === where.id);
        if (index === -1) throw new Error("record to delete does not exist");
        removedInquiries.push(where.id);
        const [row] = inquiries.splice(index, 1);
        return row;
      },
    },
  },
}));

/* ------------------------------------------------------------------- helpers */

function signIn(role: UserRole, sub = "admin-1"): void {
  session = { sub, email: "admin@kalisizocoop.coop", name: "Grace N.", role };
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

const req = () => new Request("https://example.test/api/v1/admin", { method: "DELETE" });

/** Two administrators: the caller and one other Super Admin who can be removed. */
const SUPER_1: UserRow = {
  id: "admin-1",
  name: "Grace N.",
  email: "admin@kalisizocoop.coop",
  role: "SUPER_ADMIN",
  isActive: true,
};

const SUPER_2: UserRow = {
  id: "admin-2",
  name: "Moses K.",
  email: "moses@kalisizocoop.coop",
  role: "SUPER_ADMIN",
  isActive: true,
};

const EDITOR: UserRow = {
  id: "editor-1",
  name: "Peter O.",
  email: "peter@kalisizocoop.coop",
  role: "EDITOR",
  isActive: true,
};

/**
 * The lesser roles have to exist as rows too.
 *
 * `requireUser` re-reads the account on every request and folds the database's
 * role in over the token's, so a session whose id is absent from `users` is a
 * 401 rather than a 403. That is the right behaviour — it is what makes a
 * deleted or deactivated account stop working immediately — and it is why
 * signing in as a Content Administrator here needs a real row behind them.
 */
const CONTENT_ADMIN: UserRow = {
  id: "ca-1",
  name: "Sarah N.",
  email: "sarah@kalisizocoop.coop",
  role: "CONTENT_ADMIN",
  isActive: true,
};

beforeEach(() => {
  session = null;
  users = [{ ...SUPER_1 }, { ...SUPER_2 }, { ...EDITOR }, { ...CONTENT_ADMIN }];
  inquiries = [
    {
      id: "inq-1",
      fullName: "Agnes T.",
      email: "agnes@example.test",
      subject: "Membership",
      status: "PENDING",
    },
  ];
  removedUsers = [];
  removedInquiries = [];
  audits = [];
  published = [];
  buckets.length = 0;
});

/* ------------------------------------------------------------- user deletion */

async function deleteUser(id: string) {
  const { DELETE } = await import("@/app/api/v1/admin/users/[id]/route");
  return DELETE(req(), ctx(id));
}

describe("DELETE /api/v1/admin/users/[id]", () => {
  it("refuses an unauthenticated caller before touching the database", async () => {
    const res = await deleteUser("editor-1");

    expect(res.status).toBe(401);
    // The important half: not merely refused, but not performed.
    expect(removedUsers).toEqual([]);
  });

  it("refuses a Content Administrator, who manages content but not accounts", async () => {
    signIn("CONTENT_ADMIN", "ca-1");

    const res = await deleteUser("editor-1");

    expect(res.status).toBe(403);
    expect(removedUsers).toEqual([]);
  });

  it("lets a Super Administrator delete another account", async () => {
    signIn("SUPER_ADMIN");

    const res = await deleteUser("editor-1");

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, deletedId: "editor-1" });
    expect(removedUsers).toEqual(["editor-1"]);
    expect(users.some((u) => u.id === "editor-1")).toBe(false);
  });

  it("names the removed account in the audit log", async () => {
    signIn("SUPER_ADMIN");

    await deleteUser("editor-1");

    // The row is gone, so this entry is the only surviving record of the act.
    // It must identify *who* was removed, not just that a deletion happened.
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: "USER_CHANGE",
      targetType: "user",
      targetId: "editor-1",
    });
    expect(audits[0].summary).toContain("peter@kalisizocoop.coop");
  });

  it("will not let an administrator delete their own account", async () => {
    signIn("SUPER_ADMIN");

    const res = await deleteUser("admin-1");

    expect(res.status).toBe(403);
    expect(removedUsers).toEqual([]);
    // Locking yourself out is the failure this prevents.
    expect(users.some((u) => u.id === "admin-1")).toBe(true);
  });  it("never leaves the cooperative without an active Super Administrator", async () => {
    /**
     * The property, asserted over every account that can be the target.
     *
     * An earlier version of this file asserted a specific 409 from a
     * "would this be the last Super Admin" precondition, and the mutation run
     * proved the assertion worthless: the precondition is unreachable, because
     * reaching this route at all means the caller *is* an active Super
     * Administrator (`requirePermission("manageUsers")`, and `requireUser` has
     * already confirmed `isActive`). So the count could never be zero, the guard
     * never fired, and deleting it changed no test outcome. A test that passes
     * with its guard deleted is not a test.
     *
     * What is worth asserting is the outcome rather than the mechanism: attempt
     * to delete every account in turn, as a Super Administrator, and after each
     * attempt the cooperative must still hold at least one active Super
     * Administrator. That holds if and only if the self-delete refusal works, so
     * removing the refusal now fails the test instead of passing quietly.
     */
    signIn("SUPER_ADMIN");

    for (const target of [...users]) {
      const res = await deleteUser(target.id);

      // Whatever the verdict, the CMS must remain reachable. `users` is read
      // fresh each iteration because a successful delete mutates it.
      const activeSupers = users.filter(
        (u) => u.role === "SUPER_ADMIN" && u.isActive
      );
      expect(
        activeSupers.length,
        `after attempting to delete ${target.email} (status ${res.status})`
      ).toBeGreaterThanOrEqual(1);
    }

    // And the loop actually exercised the dangerous case: the caller is in the
    // list, so its own deletion was attempted and refused.
    expect(removedUsers).not.toContain("admin-1");
    expect(users.some((u) => u.id === "admin-1")).toBe(true);
  });

  it("lets a Super Administrator delete the other Super Administrator", async () => {
    // The permitted half of the same pair. Two administrators must be able to
    // remove each other's redundant accounts, otherwise the refusal above
    // becomes a lock-in rather than a safeguard.
    signIn("SUPER_ADMIN");

    const res = await deleteUser("admin-2");

    expect(res.status).toBe(200);
    expect(removedUsers).toEqual(["admin-2"]);
    expect(users.filter((u) => u.role === "SUPER_ADMIN")).toHaveLength(1);
  });

  it("refuses to demote yourself out of Super Administrator", async () => {
    // `PATCH` is the softer path and carries the same hazard: demoting the last
    // Super Admin. If only the DELETE guard existed, this route would be a way
    // to lock everyone out that reads as harmless.
    signIn("SUPER_ADMIN");

    const { PATCH } = await import("@/app/api/v1/admin/users/[id]/route");
    const res = await PATCH(
      new Request("https://example.test/api/v1/admin/users/admin-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "EDITOR" }),
      }),
      ctx("admin-1")
    );

    expect(res.status).toBe(403);
  });

  it("404s for an account that does not exist", async () => {
    signIn("SUPER_ADMIN");

    const res = await deleteUser("ghost");

    expect(res.status).toBe(404);
    expect(removedUsers).toEqual([]);
  });

  it("rejects an id the route cannot address", async () => {
    signIn("SUPER_ADMIN");

    const res = await deleteUser("x".repeat(200));

    expect(res.status).toBe(400);
    expect(removedUsers).toEqual([]);
  });
});

/* ---------------------------------------------------------- message deletion */

async function deleteInquiry(id: string) {
  const { DELETE } = await import("@/app/api/v1/admin/inquiries/[id]/route");
  return DELETE(req(), ctx(id));
}

describe("DELETE /api/v1/admin/inquiries/[id]", () => {
  it("refuses an unauthenticated caller", async () => {
    const res = await deleteInquiry("inq-1");

    expect(res.status).toBe(401);
    expect(removedInquiries).toEqual([]);
  });

  it("refuses a Content Administrator even though they may delete content", async () => {
    // The distinction this pins: `deleteContent` covers editorial records, not
    // correspondence with the public. If a Content Administrator can archive a
    // news article, the obvious extension is "so they can remove a message too",
    // and that is exactly the widening this test refuses.
    signIn("CONTENT_ADMIN", "ca-1");

    const res = await deleteInquiry("inq-1");

    expect(res.status).toBe(403);
    expect(removedInquiries).toEqual([]);
    expect(inquiries).toHaveLength(1);
  });

  it("still lets a Content Administrator change a message's status", async () => {
    // The regression guard for the tightening above: `PATCH` is `editContent`,
    // and must keep working for the role that holds it.
    signIn("CONTENT_ADMIN", "ca-1");

    const { PATCH } = await import("@/app/api/v1/admin/inquiries/[id]/route");
    const res = await PATCH(
      new Request("https://example.test/api/v1/admin/inquiries/inq-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "RESOLVED" }),
      }),
      ctx("inq-1")
    );

    expect(res.status).toBe(200);
    expect(inquiries[0].status).toBe("RESOLVED");
    expect(removedInquiries).toEqual([]);
  });

  it("lets a Super Administrator delete a message", async () => {
    signIn("SUPER_ADMIN");

    const res = await deleteInquiry("inq-1");

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, deletedId: "inq-1" });
    expect(removedInquiries).toEqual(["inq-1"]);
    expect(inquiries).toHaveLength(0);
  });

  it("records who sent the message in the audit log before it is gone", async () => {
    signIn("SUPER_ADMIN");

    await deleteInquiry("inq-1");

    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: "DELETE",
      targetType: "inquiry",
      targetId: "inq-1",
    });
    expect(audits[0].summary).toContain("Agnes T.");
    expect(audits[0].summary).toContain("agnes@example.test");
  });

  it("invalidates the open inquiries list so other tabs refresh", async () => {
    // Without this the message stays on screen for every administrator watching
    // the panel until they reload, which for a deletion looks like a failure.
    signIn("SUPER_ADMIN");

    await deleteInquiry("inq-1");

    expect(published).toContainEqual(["inquiries"]);
  });

  it("404s for a message that does not exist", async () => {
    signIn("SUPER_ADMIN");

    const res = await deleteInquiry("ghost");

    expect(res.status).toBe(404);
    expect(removedInquiries).toEqual([]);
  });

  it("spends a deletion budget of its own, not the status-change one", async () => {
    /**
     * Separate buckets, deliberately.
     *
     * `PATCH` and `DELETE` share this file, so if both spent
     * `inquiries:update` then a busy inbox would exhaust the deletion budget
     * with routine status changes, and a Super Administrator would be told to
     * "try again later" about deleting a message they are legally allowed to
     * remove. Conversely a burst of deletions would lock an administrator out
     * of triaging their inbox. The keys must therefore differ.
     */
    signIn("SUPER_ADMIN");

    await deleteInquiry("inq-1");

    expect(buckets).toContain("admin:inquiries:delete:127.0.0.1");
    expect(buckets).not.toContain("admin:inquiries:update:127.0.0.1");
  });
});

/* --------------------------------------------------------------- page access */

describe("page creation and deletion remain available to Super Admmins", () => {
  it("offers both a create and a delete handler on the pages resource", async () => {
    // The user's request was "delete and add pages". These already existed via
    // the shared content handlers; this asserts the wiring rather than trusting
    // it, because a route file that lost its `export async function POST` would
    // fail silently in the CMS as a button that does nothing.
    const route = await import("@/app/api/v1/admin/pages/[id]/route");
    expect(typeof route.DELETE).toBe("function");

    const collection = await import("@/app/api/v1/admin/pages/route");
    expect(typeof collection.POST).toBe("function");
  });
});
