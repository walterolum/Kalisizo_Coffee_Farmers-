import { describe, expect, it } from "vitest";
import { can, PERMISSIONS, roleLabel, type Permission } from "@/backend/admin-guard";
import type { AuthUser, UserRole } from "@/backend/auth";

/**
 * These assertions encode the role model the cooperative agreed to. They are the
 * cheapest possible guard against a refactor quietly widening someone's access,
 * so the exact per-role grants are asserted rather than derived.
 */

const asUser = (role: UserRole): AuthUser => ({
  sub: "u1",
  email: "a@b.c",
  name: "Test User",
  role,
});

const ALL_ROLES: UserRole[] = ["SUPER_ADMIN", "CONTENT_ADMIN", "EDITOR"];
const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

describe("permission matrix", () => {
  it("grants everything to SUPER_ADMIN", () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(can(asUser("SUPER_ADMIN"), permission)).toBe(true);
    }
  });

  it("never grants an unauthenticated caller anything", () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(can(null, permission)).toBe(false);
    }
  });

  it("keeps EDITOR out of publishing, deleting, users and system settings", () => {
    const editor = asUser("EDITOR");
    expect(can(editor, "viewCms")).toBe(true);
    expect(can(editor, "editContent")).toBe(true);
    expect(can(editor, "manageMedia")).toBe(true);

    expect(can(editor, "publishContent")).toBe(false);
    expect(can(editor, "deleteContent")).toBe(false);
    expect(can(editor, "manageSettings")).toBe(false);
    expect(can(editor, "manageUsers")).toBe(false);
    expect(can(editor, "manageSystem")).toBe(false);
  });

  it("keeps CONTENT_ADMIN out of user and system management only", () => {
    const admin = asUser("CONTENT_ADMIN");
    expect(can(admin, "publishContent")).toBe(true);
    expect(can(admin, "deleteContent")).toBe(true);
    expect(can(admin, "manageSettings")).toBe(true);

    expect(can(admin, "manageUsers")).toBe(false);
    expect(can(admin, "manageSystem")).toBe(false);
  });

  it("reserves user management for SUPER_ADMIN alone", () => {
    expect(PERMISSIONS.manageUsers).toEqual(["SUPER_ADMIN"]);
    expect(PERMISSIONS.manageSystem).toEqual(["SUPER_ADMIN"]);
  });

  it("reserves destroying a public message for SUPER_ADMIN alone", () => {
    /**
     * Worth separating from the assertions above rather than folding into them.
     *
     * `deleteContent` is held by a Content Administrator, and archiving a news
     * article is a reasonable thing for that role to do. Deleting somebody's
     * contact-form message is not the same act and must not inherit the grant —
     * it destroys correspondence with a member of the public, with no archive and
     * no restore. The two permissions are deliberately distinct keys, so widening
     * one cannot silently widen the other.
     */
    expect(PERMISSIONS.deleteMessages).toEqual(["SUPER_ADMIN"]);
    expect(can(asUser("SUPER_ADMIN"), "deleteMessages")).toBe(true);
    expect(can(asUser("CONTENT_ADMIN"), "deleteMessages")).toBe(false);
    expect(can(asUser("EDITOR"), "deleteMessages")).toBe(false);
  });

  it("lets every signed-in role read the CMS", () => {
    expect(PERMISSIONS.viewCms).toEqual(ALL_ROLES);
  });

  it("only names roles that exist", () => {
    const valid: UserRole[] = ["SUPER_ADMIN", "CONTENT_ADMIN", "EDITOR"];
    for (const permission of ALL_PERMISSIONS) {
      for (const role of PERMISSIONS[permission]) {
        expect(valid).toContain(role);
      }
    }
  });

  it("has a human-readable label for every role", () => {
    for (const role of ALL_ROLES) {
      expect(roleLabel(role).length).toBeGreaterThan(0);
    }
  });
});
