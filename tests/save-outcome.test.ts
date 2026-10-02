import { describe, expect, it } from "vitest";
import { saveOutcome } from "@/shared/save-outcome";

/**
 * The CMS used to report "Published successfully" for every save, whatever the
 * server had stored. That was not a cosmetic problem: `handleContentWrite`
 * defaults an omitted status to DRAFT, so a program created through the Programs
 * panel was saved, announced as published, and never appeared on the public site
 * (which filters on PUBLISHED) — and never reappeared in the editor either,
 * because the panel was reading that same public list.
 *
 * These tests pin the one property that prevents a repeat: the message is derived
 * from the stored status, so a draft can never be described as published.
 */
describe("saveOutcome", () => {
  it("never describes a draft as published", () => {
    const { message } = saveOutcome({ status: "DRAFT" });
    expect(message.toLowerCase()).not.toContain("published");
    expect(message).toContain("draft");
  });

  it("says a draft is not visible on the site", () => {
    expect(saveOutcome({ status: "DRAFT" }).message).toContain("not visible on the site");
  });

  it("describes every non-published status without claiming it is live", () => {
    for (const status of ["DRAFT", "IN_REVIEW", "ARCHIVED"]) {
      const { message } = saveOutcome({ status });
      expect(message.toLowerCase(), `${status} claims it is live`).not.toContain("live on the site");
    }
  });

  it("credits the person who actually published", () => {
    const { message } = saveOutcome({
      status: "PUBLISHED",
      publishedAt: "2026-01-02T03:04:05.000Z",
      publishedBy: "Grace N.",
    });
    expect(message).toContain("Published");
    expect(message).toContain("by Grace N.");
    expect(message).toContain("live on the site");
  });

  it("falls back to 'you' rather than printing undefined", () => {
    expect(saveOutcome({ status: "PUBLISHED" }).message).toContain("by you");
  });

  it("omits the timestamp when the server sent none", () => {
    const { message } = saveOutcome({ status: "PUBLISHED", publishedBy: "Grace N." });
    expect(message).toContain("by Grace N.");
    expect(message).not.toContain("just now");
  });

  it("treats a record with no status column as live, not as a draft", () => {
    // Leadership, locations, FAQs, success stories and products have no status
    // column: they are on the public site the moment they are saved. Describing
    // them as drafts would be the opposite inaccuracy.
    for (const status of [undefined, null]) {
      const { message } = saveOutcome({ status });
      expect(message).toContain("Saved");
      expect(message).toContain("live on the site");
    }
  });

  it("does not invent a status it does not recognise", () => {
    const { message } = saveOutcome({ status: "SOMETHING_NEW" });
    expect(message).toContain("live on the site");
    expect(message).not.toContain("SOMETHING_NEW");
  });

  it("reports a successful save as a success in every case", () => {
    for (const status of ["DRAFT", "IN_REVIEW", "PUBLISHED", "ARCHIVED", undefined, null]) {
      expect(saveOutcome({ status }).kind, `${status} was reported as an error`).toBe("success");
    }
  });
});
