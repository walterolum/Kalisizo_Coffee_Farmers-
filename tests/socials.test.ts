import { describe, expect, it } from "vitest";
import {
  PLATFORM_RULES,
  emptySocialEntry,
  entriesAreEmpty,
  entriesToPayload,
  handleFromUrl,
  isSafeSocialUrl,
  matchExistingSocialIds,
  normalizePlatformName,
  platformFromUrl,
  planSocialWrites,
  resolveSocialUrl,
  socialsToEntries,
  type SocialEntry,
  type SocialProfile,
} from "@/lib/socials";

/**
 * Social links are CMS-managed rows keyed by platform, and the CMS may now hold
 * any platform — not the fixed YouTube/Instagram/TikTok triple the form used to
 * be locked to.
 *
 * The failure this file guards against is the one that made every other handle
 * dead on arrival: an editor pastes what they have (`@kalisizocoffee`, a bare
 * domain, a WhatsApp number), it is stored verbatim, and the published link goes
 * nowhere. Resolving that paste is deliberately done in one place, on the server,
 * so the CMS and the site cannot disagree about what a handle means.
 */
describe("resolveSocialUrl", () => {
  it("passes a full link through untouched", () => {
    const url = "https://www.instagram.com/nakafeero/";
    expect(resolveSocialUrl("Instagram", url)).toBe(url);
  });

  it("expands a bare handle with the platform's base", () => {
    expect(resolveSocialUrl("Instagram", "nakafeero")).toBe(
      "https://www.instagram.com/nakafeero"
    );
    expect(resolveSocialUrl("YouTube", "@kalisizocoffee")).toBe(
      "https://www.youtube.com/@kalisizocoffee"
    );
    expect(resolveSocialUrl("TikTok", "@kalisizocoffee")).toBe(
      "https://www.tiktok.com/@kalisizocoffee"
    );
    expect(resolveSocialUrl("Facebook", "kalisizocoffee")).toBe(
      "https://www.facebook.com/kalisizocoffee"
    );
  });

  it("adds the scheme to a pasted domain with no scheme", () => {
    expect(resolveSocialUrl("Instagram", "instagram.com/nakafeero")).toBe(
      "https://instagram.com/nakafeero"
    );
    expect(resolveSocialUrl("", "wa.me/256774740871")).toBe(
      "https://wa.me/256774740871"
    );
  });

  it("trusts a pasted domain over the platform field", () => {
    // The pasted link says where it goes; the platform only names it.
    expect(resolveSocialUrl("Facebook", "instagram.com/nakafeero")).toBe(
      "https://instagram.com/nakafeero"
    );
  });

  it("turns a local phone number into a WhatsApp link with a country code", () => {
    // 0774740871 is the number printed on the office wall; wa.me rejects it.
    expect(resolveSocialUrl("WhatsApp", "0774740871")).toBe(
      "https://wa.me/256774740871"
    );
    expect(resolveSocialUrl("WhatsApp", "+256 774 740 871")).toBe(
      "https://wa.me/256774740871"
    );
  });

  it("makes any other phone number dialable", () => {
    expect(resolveSocialUrl("Phone", "0774740871")).toBe("tel:0774740871");
  });

  it("builds a mailto link for an email platform", () => {
    expect(resolveSocialUrl("Email", "info@kalisizo.coop")).toBe(
      "mailto:info@kalisizo.coop"
    );
    expect(resolveSocialUrl("Email", "mailto:info@kalisizo.coop")).toBe(
      "mailto:info@kalisizo.coop"
    );
  });

  it("refuses to guess a URL for an unknown platform", () => {
    // An empty string is the signal: the caller must refuse the save, not store
    // `https://kalisizo`, which is not a link to anything.
    expect(resolveSocialUrl("SomeNewApp", "@kalisizo")).toBe("");
    expect(resolveSocialUrl("", "kalisizo")).toBe("");
  });

  it("returns nothing for empty input", () => {
    expect(resolveSocialUrl("Instagram", "")).toBe("");
    expect(resolveSocialUrl("Instagram", "   ")).toBe("");
  });
});

describe("platformFromUrl", () => {
  it("names the platform a pasted link belongs to", () => {
    expect(platformFromUrl("https://www.tiktok.com/@kalisizocoffee")).toBe("TikTok");
    expect(platformFromUrl("instagram.com/nakafeero")).toBe("Instagram");
    expect(platformFromUrl("https://wa.me/256774740871")).toBe("WhatsApp");
    expect(platformFromUrl("https://twitter.com/kalisizo")).toBe("X");
  });

  it("is null for something that is not a known platform", () => {
    expect(platformFromUrl("https://kalisizo.coop/news")).toBeNull();
    expect(platformFromUrl("mailto:info@kalisizo.coop")).toBeNull();
    expect(platformFromUrl("")).toBeNull();
  });
});

describe("normalizePlatformName", () => {
  it("canonicalises casing and alias spellings", () => {
    expect(normalizePlatformName("youtube")).toBe("YouTube");
    expect(normalizePlatformName("  instagram ")).toBe("Instagram");
    expect(normalizePlatformName("twitter")).toBe("X");
    expect(normalizePlatformName("wa")).toBe("WhatsApp");
  });

  it("keeps a platform it does not know", () => {
    // A new platform must still publish; it just does not get an icon.
    expect(normalizePlatformName("SomeNewApp")).toBe("SomeNewApp");
  });

  it("finds a platform inside a longer label", () => {
    // The seeded row is literally "TikTok & Official".
    expect(normalizePlatformName("TikTok & Official")).toBe("TikTok");
  });
});

describe("handleFromUrl", () => {
  it("renders a handle the way each platform writes it", () => {
    expect(handleFromUrl("https://www.instagram.com/nakafeero", "Instagram")).toBe(
      "@nakafeero"
    );
    expect(handleFromUrl("https://www.facebook.com/kalisizocoffee", "Facebook")).toBe(
      "kalisizocoffee"
    );
    expect(handleFromUrl("https://wa.me/256774740871", "WhatsApp")).toBe(
      "256774740871"
    );
    expect(handleFromUrl("mailto:info@kalisizo.coop", "Email")).toBe(
      "info@kalisizo.coop"
    );
  });

  it("falls back to the host when a link has no path", () => {
    expect(handleFromUrl("https://www.instagram.com")).toBe("instagram.com");
  });
});

describe("isSafeSocialUrl", () => {
  it("allows only the schemes a social link can legitimately use", () => {
    expect(isSafeSocialUrl("https://instagram.com/x")).toBe(true);
    expect(isSafeSocialUrl("http://instagram.com/x")).toBe(true);
    expect(isSafeSocialUrl("mailto:info@kalisizo.coop")).toBe(true);
    expect(isSafeSocialUrl("tel:0774740871")).toBe(true);
  });

  it("rejects anything that would execute when the link is clicked", () => {
    // These end up in an `href`. A `javascript:` handle is stored XSS, and it
    // would pass every other check in the stack.
    expect(isSafeSocialUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeSocialUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeSocialUrl("not a url")).toBe(false);
    expect(isSafeSocialUrl("")).toBe(false);
  });
});

describe("socialsToEntries", () => {
  it("turns stored profiles into rows, in order", () => {
    const rows = socialsToEntries([
      { id: "social-youtube", platform: "YouTube", url: "https://youtube.com/@kalisizo" },
      { id: "social-facebook", platform: "Facebook", url: "https://facebook.com/kalisizo" },
    ]);

    expect(rows.map((row) => row.platform)).toEqual(["YouTube", "Facebook"]);
    expect(rows[0].value).toBe("https://youtube.com/@kalisizo");
  });

  it("round-trips a stored URL without rewriting it", () => {
    // The value in the form is already resolvable input, so re-saving an
    // untouched form must be a no-op rather than a rewrite of every link.
    const stored = "https://wa.me/256774740871";
    const rows = socialsToEntries([{ id: "social-whatsapp", platform: "WhatsApp", url: stored }]);

    expect(entriesToPayload(rows)[0].url).toBe(stored);
  });

  it("keeps platforms the form has never heard of", () => {
    const rows = socialsToEntries([
      { id: "social-somenewapp", platform: "SomeNewApp", url: "https://new.example/k" },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].platform).toBe("SomeNewApp");
  });

  it("handles a missing list and a malformed row", () => {
    expect(socialsToEntries(null)).toEqual([]);
    expect(socialsToEntries(undefined)).toEqual([]);

    const malformed = [{ platform: "YouTube" }] as unknown as SocialProfile[];
    expect(() => socialsToEntries(malformed)).not.toThrow();
    expect(socialsToEntries(malformed)).toEqual([]);
  });
});

describe("entriesToPayload", () => {
  it("drops blank rows and keeps the editor's order", () => {
    const rows: SocialEntry[] = [
      { key: "a", platform: "Facebook", value: "kalisizo" },
      { key: "b", platform: "", value: "  " },
      { key: "c", platform: "Instagram", value: "nakafeero" },
    ];

    expect(entriesToPayload(rows)).toEqual([
      { platform: "Facebook", url: "kalisizo" },
      { platform: "Instagram", url: "nakafeero" },
    ]);
  });

  it("sends the text as typed, unresolved", () => {
    // The server is the only place that resolves a handle. If the client
    // resolved it too, a preview would be a second, diverging implementation.
    expect(entriesToPayload([{ key: "a", platform: "YouTube", value: "@kalisizo" }])).toEqual([
      { platform: "YouTube", url: "@kalisizo" },
    ]);
  });
});

describe("entriesAreEmpty", () => {
  it("is true when there is nothing to save", () => {
    expect(entriesAreEmpty([])).toBe(true);
    expect(entriesAreEmpty(null)).toBe(true);
    expect(entriesAreEmpty([emptySocialEntry()])).toBe(true);
    expect(entriesAreEmpty([{ key: "a", platform: "Facebook", value: "  " }])).toBe(true);
  });

  it("is false as soon as one row is filled in", () => {
    expect(
      entriesAreEmpty([
        { key: "a", platform: "Facebook", value: "  " },
        { key: "b", platform: "Instagram", value: "nakafeero" },
      ])
    ).toBe(false);
  });
});

describe("planSocialWrites", () => {
  it("resolves handles into rows keyed by platform", () => {
    const plan = planSocialWrites([
      { platform: "Instagram", url: "@nakafeero" },
      { platform: "whatsapp", url: "0774740871" },
    ]);

    expect(plan.problems).toEqual([]);
    expect(plan.writes).toEqual([
      {
        id: "social-instagram",
        platform: "Instagram",
        handle: "@nakafeero",
        url: "https://www.instagram.com/nakafeero",
        displayOrder: 0,
      },
      {
        id: "social-whatsapp",
        platform: "WhatsApp",
        handle: "256774740871",
        url: "https://wa.me/256774740871",
        displayOrder: 1,
      },
    ]);
  });

  it("keeps the ids the seed data and the old fixed-field route wrote", () => {
    // The first save after this change must update the existing links, not
    // create a second set of rows beside them.
    const plan = planSocialWrites([
      { platform: "YouTube", url: "https://youtube.com/@muwongedeo2017" },
      { platform: "Instagram", url: "https://instagram.com/nakafeero" },
      { platform: "TikTok", url: "https://www.tiktok.com/@kalisizocoffee" },
    ]);

    expect(plan.writes.map((write) => write.id)).toEqual([
      "social-youtube",
      "social-instagram",
      "social-tiktok",
    ]);
  });

  it("gives a repeated platform its own row rather than overwriting the first", () => {
    const plan = planSocialWrites([
      { platform: "Instagram", url: "nakafeero" },
      { platform: "Instagram", url: "kalisizocoffee" },
    ]);

    expect(plan.writes.map((write) => write.id)).toEqual([
      "social-instagram",
      "social-instagram-2",
    ]);
    expect(plan.writes[1].url).toBe("https://www.instagram.com/kalisizocoffee");
  });

  it("names the platform from the link when the field is blank", () => {
    const plan = planSocialWrites([{ url: "https://www.linkedin.com/company/kalisizo" }]);

    expect(plan.writes[0].platform).toBe("LinkedIn");
    expect(plan.writes[0].id).toBe("social-linkedin");
  });

  it("publishes a platform nothing is written for", () => {
    // No whitelist: the table has always accepted any platform.
    const plan = planSocialWrites([
      { platform: "SomeNewApp", url: "https://new.example/kalisizo" },
    ]);

    expect(plan.problems).toEqual([]);
    expect(plan.writes[0]).toMatchObject({
      platform: "SomeNewApp",
      url: "https://new.example/kalisizo",
      displayOrder: 0,
    });
  });

  it("reports an unresolvable handle instead of dropping it", () => {
    // A silent drop is indistinguishable from a successful save, so the save is
    // refused with a message naming the row.
    const plan = planSocialWrites([
      { platform: "Instagram", url: "nakafeero" },
      { platform: "SomeNewApp", url: "@kalisizo" },
    ]);

    expect(plan.writes).toHaveLength(1);
    expect(plan.problems).toHaveLength(1);
    expect(plan.problems[0].index).toBe(1);
    expect(plan.problems[0].message).toContain("full link");
  });

  it("refuses a scheme that would execute on click", () => {
    const plan = planSocialWrites([{ platform: "Instagram", url: "javascript:alert(1)" }]);

    expect(plan.writes).toEqual([]);
    expect(plan.problems).toHaveLength(1);
  });

  it("keeps display order dense when a row is rejected", () => {
    const plan = planSocialWrites([
      { platform: "SomeNewApp", url: "@kalisizo" },
      { platform: "Instagram", url: "nakafeero" },
    ]);

    expect(plan.writes[0].displayOrder).toBe(0);
  });

  it("treats an empty list as 'remove every link', not an error", () => {
    const plan = planSocialWrites([]);

    expect(plan).toEqual({ writes: [], problems: [] });
    expect(planSocialWrites(null)).toEqual({ writes: [], problems: [] });
  });
});

describe("matchExistingSocialIds", () => {
  it("keeps a seeded row instead of recreating it under a new id", () => {
    // Seeds get generated ids. Without this match the first save would delete
    // the seeded link and create a second row with the same URL beside it.
    const plan = planSocialWrites([{ platform: "YouTube", url: "https://youtube.com/@kalisizo" }]);
    const matched = matchExistingSocialIds(plan.writes, [
      { id: "clxseed0001", platform: "YouTube" },
    ]);

    expect(matched[0].id).toBe("clxseed0001");
  });

  it("reuses the stable id the old fixed-field route wrote", () => {
    const plan = planSocialWrites([{ platform: "Instagram", url: "@nakafeero" }]);
    const matched = matchExistingSocialIds(plan.writes, [
      { id: "social-instagram", platform: "Instagram" },
    ]);

    expect(matched[0].id).toBe("social-instagram");
  });

  it("claims each existing row once, so a repeated platform keeps two rows", () => {
    const plan = planSocialWrites([
      { platform: "Instagram", url: "nakafeero" },
      { platform: "Instagram", url: "kalisizocoffee" },
    ]);
    const matched = matchExistingSocialIds(plan.writes, [
      { id: "clxseed0001", platform: "Instagram" },
    ]);

    expect(matched.map((write) => write.id)).toEqual(["clxseed0001", "social-instagram-2"]);
  });

  it("leaves a platform with no existing row on its generated id", () => {
    const plan = planSocialWrites([{ platform: "Facebook", url: "kalisizo" }]);
    const matched = matchExistingSocialIds(plan.writes, [
      { id: "clxseed0001", platform: "YouTube" },
    ]);

    expect(matched[0].id).toBe("social-facebook");
  });

  it("matches legacy display-cased platforms the database stores", () => {
    // The seed writes "TikTok"; a case-sensitive match would miss it.
    const plan = planSocialWrites([{ platform: "tiktok", url: "@kalisizocoffee" }]);
    const matched = matchExistingSocialIds(plan.writes, [
      { id: "clxseed0003", platform: "TikTok" },
    ]);

    expect(matched[0].id).toBe("clxseed0003");
  });
});

describe("PLATFORM_RULES", () => {
  it("has a usable base URL and unique canonical names", () => {
    const names = PLATFORM_RULES.map((rule) => rule.name);

    expect(new Set(names).size).toBe(names.length);
    for (const rule of PLATFORM_RULES) {
      expect(rule.base, `${rule.name} needs a base URL`).toMatch(/^(https:\/\/|mailto:)/);
      expect(rule.aliases.length).toBeGreaterThan(0);
    }
  });
});