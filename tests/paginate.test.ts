import { describe, expect, it } from "vitest";
import { MAX_PAGE_SIZE, PAGE_SIZE, parsePage, parsePageSize, likePattern } from "@/shared/paginate";

describe("parsePage", () => {
  it("defaults to the first page", () => {
    expect(parsePage(null)).toBe(1);
    expect(parsePage(undefined as unknown as string)).toBe(1);
    expect(parsePage("")).toBe(1);
  });

  it("parses a valid page number", () => {
    expect(parsePage("1")).toBe(1);
    expect(parsePage("7")).toBe(7);
  });

  it("falls back to page 1 for junk, zero and negative input", () => {
    // A hostile or buggy value must not produce a negative OFFSET, which would
    // be a database error rather than an empty page.
    for (const raw of ["abc", "0", "-5", "1.5abc", "NaN"]) {
      expect(parsePage(raw)).toBe(1);
    }
  });
});

describe("parsePageSize", () => {
  it("uses the fallback when no size is given", () => {
    expect(parsePageSize(null)).toBe(PAGE_SIZE);
    expect(parsePageSize(null, 25)).toBe(25);
  });

  it("caps the page size so a client cannot request the whole table", () => {
    expect(parsePageSize("100000")).toBe(MAX_PAGE_SIZE);
    expect(MAX_PAGE_SIZE).toBeLessThanOrEqual(100);
  });

  it("keeps valid sizes and rejects junk", () => {
    expect(parsePageSize("5")).toBe(5);
    expect(parsePageSize("0")).toBe(PAGE_SIZE);
    expect(parsePageSize("-3")).toBe(PAGE_SIZE);
    expect(parsePageSize("many")).toBe(PAGE_SIZE);
  });
});

describe("likePattern", () => {
  it("wraps the term so it matches literally", () => {
    expect(likePattern("coffee")).toBe("%coffee%");
  });

  it("neutralises wildcard characters the user typed", () => {
    // Without escaping, a search for "100%" would match everything.
    expect(likePattern("100%")).toBe("%100\\%%");
    expect(likePattern("a_b")).toBe("%a\\_b%");
  });
});
