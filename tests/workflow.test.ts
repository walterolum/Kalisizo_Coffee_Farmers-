import { describe, expect, it } from "vitest";
import {
  canTransition,
  PUBLIC_WHERE,
  resolvePublishedAt,
  statusHint,
  statusLabel,
  transitionError,
} from "@/lib/workflow";

describe("editorial workflow", () => {
  it("allows the normal forward path", () => {
    expect(canTransition("DRAFT", "IN_REVIEW")).toBe(true);
    expect(canTransition("IN_REVIEW", "PUBLISHED")).toBe(true);
    expect(canTransition("PUBLISHED", "ARCHIVED")).toBe(true);
  });

  it("allows a self-transition, which is how content is saved without changing state", () => {
    for (const status of ["DRAFT", "IN_REVIEW", "PUBLISHED", "ARCHIVED"] as const) {
      expect(canTransition(status, status)).toBe(true);
      expect(transitionError(status, status)).toBeNull();
    }
  });

  it("allows an editor to pull content back for revision", () => {
    expect(canTransition("IN_REVIEW", "DRAFT")).toBe(true);
    expect(canTransition("PUBLISHED", "DRAFT")).toBe(true);
    expect(canTransition("ARCHIVED", "PUBLISHED")).toBe(true);
  });

  it("labels every status for the CMS UI", () => {
    expect(statusLabel("DRAFT")).toBe("Draft");
    expect(statusLabel("IN_REVIEW")).toBe("In review");
    expect(statusLabel("PUBLISHED")).toBe("Published");
    expect(statusLabel("ARCHIVED")).toBe("Archived");
    // Every status needs a hint explaining its visibility, otherwise the CMS
    // cannot explain to staff why a page is or is not visible.
    for (const status of ["DRAFT", "IN_REVIEW", "PUBLISHED", "ARCHIVED"] as const) {
      expect(statusHint(status).length).toBeGreaterThan(0);
    }
  });

  describe("resolvePublishedAt", () => {
    it("stamps the current time when content is first published", () => {
      const before = Date.now();
      const result = resolvePublishedAt("PUBLISHED", null);
      expect(result).toBeInstanceOf(Date);
      expect(result!.getTime()).toBeGreaterThanOrEqual(before);
    });

    it("keeps the original publish date when already published, so dates stay stable", () => {
      const original = new Date("2024-03-01T00:00:00.000Z");
      expect(resolvePublishedAt("PUBLISHED", original)).toBe(original);
    });

    it("clears the timestamp when content leaves the published state", () => {
      const original = new Date("2024-03-01T00:00:00.000Z");
      // Leaving PUBLISHED must drop the date, otherwise archived items keep
      // appearing at the top of date-ordered public listings.
      expect(resolvePublishedAt("DRAFT", original)).toBeNull();
      expect(resolvePublishedAt("IN_REVIEW", original)).toBeNull();
      expect(resolvePublishedAt("ARCHIVED", original)).toBeNull();
    });
  });

  it("only exposes published, non-deleted content to the public", () => {
    expect(PUBLIC_WHERE.status).toBe("PUBLISHED");
    expect(PUBLIC_WHERE.deletedAt).toBeNull();
  });
});
