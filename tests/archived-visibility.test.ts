import { describe, expect, it } from "vitest";
import { CONTENT_STATUSES, STATUS_TRANSITIONS } from "@/lib/admin-api";
import { TYPE_CONFIGS } from "@/lib/admin-fields";
import { includesSoftDeleted } from "@/lib/admin-content";

/**
 * Archiving sets `deletedAt`, and every admin list route starts from
 * `deletedAt: null` so deleted content stays out of normal views. These tests
 * pin the rule that keeps the Archived view usable, because the failure is
 * silent: a Super Admin can archive a record, watch it vanish from every list,
 * and have no way to restore it.
 */
describe("includesSoftDeleted", () => {
  it("lifts the soft-delete filter for the Archived view", () => {
    expect(includesSoftDeleted("ARCHIVED")).toBe(true);
  });

  it("keeps soft-deleted rows hidden for every other status", () => {
    for (const status of CONTENT_STATUSES) {
      if (status === "ARCHIVED") continue;
      expect(includesSoftDeleted(status)).toBe(false);
    }
  });

  it("keeps soft-deleted rows hidden when no status filter is applied", () => {
    expect(includesSoftDeleted(null)).toBe(false);
  });

  it("makes ARCHIVED the only status that can see soft-deleted rows", () => {
    // If a status is ever added that is also soft-deleted, it needs the same
    // opt-in, and this assertion is what forces that to be a deliberate change.
    const optIn = CONTENT_STATUSES.filter((s) => includesSoftDeleted(s));
    expect(optIn).toEqual(["ARCHIVED"]);
  });

  it("is reachable through the status picker, so every content type can archive", () => {
    for (const from of CONTENT_STATUSES) {
      expect(STATUS_TRANSITIONS[from]).toContain("ARCHIVED");
    }
  });
});

describe("archived view coverage", () => {
  it("is offered for every content type the admin panel can manage", () => {
    // Each of these has a list route carrying the same guard. If a new type is
    // added to the panel it must get one too, so the count is asserted instead
    // of hand-maintained in a comment.
    expect(Object.keys(TYPE_CONFIGS)).toHaveLength(8);
  });

  it("requires a status field so the Archived filter is available per type", () => {
    for (const [type, config] of Object.entries(TYPE_CONFIGS)) {
      const hasStatus = config.fields.some((field) => field.name === "status");
      expect(hasStatus, `${type} has no status field`).toBe(true);
    }
  });
});
