import { describe, expect, it } from "vitest";
import { settingsSchema } from "@/shared/validators";

/**
 * The settings route destructures the keys it handles itself and hands the rest
 * to `prisma.cooperativeInfo.update({ data })`. Prisma rejects the whole call if
 * `data` contains a key that is not a column, which surfaced to editors as
 * "Could not save cooperative settings" (HTTP 503) on every single save.
 *
 * These assertions keep the schema, the route's destructuring and the Prisma
 * model in agreement, so adding a field that is not a column fails here instead
 * of breaking the CMS.
 */

/** Writable columns on `CooperativeInfo` in prisma/schema.prisma. */
const COLUMNS = [
  "mission",
  "vision",
  "taglines",
  "phoneNumbers",
  "officialEmail",
  "address",
  "logoUrl",
];

/**
 * Declared by the schema but not columns: the route must destructure these out
 * before the update. `baseUpdatedAt` is a concurrency token read by
 * `assertFresh`; `socials` is written to `SocialLink` rows instead.
 */
const ROUTE_CONSUMED = ["baseUpdatedAt", "socials"];

const validPayload = {
  mission: "Empowering farmers through cooperative coffee.",
  vision: "A thriving coffee value chain.",
  taglines: ["Farmers first"],
  phoneNumbers: ["+256700000000"],
  officialEmail: "info@kalisizo.coop",
  address: "Kampala, Uganda",
  logoUrl: "/uploads/1757000000000-deadbeef.png",
  baseUpdatedAt: "2026-09-30T00:00:00.000Z",
  socials: [
    { platform: "YouTube", url: "https://youtube.com/@kalisizo" },
    { platform: "Instagram", url: "@nakafeero" },
    { platform: "WhatsApp", url: "0774740871" },
  ],
};

describe("settingsSchema", () => {
  it("accepts a full payload from the CMS", () => {
    const parsed = settingsSchema.safeParse(validPayload);
    expect(parsed.success).toBe(true);
  });

  it("accepts any platform, not a fixed set of three", () => {
    // The form edits a list; the table accepts any platform. A schema that
    // enumerates YouTube/Instagram/TikTok turns every new platform into a 400.
    const parsed = settingsSchema.parse({
      socials: [
        { platform: "Facebook", url: "https://facebook.com/kalisizo" },
        { platform: "SomeNewApp", url: "https://new.example/kalisizo" },
        { url: "https://www.linkedin.com/company/kalisizo" },
      ],
    });

    expect(parsed.socials).toHaveLength(3);
    expect(parsed.socials?.[2].platform).toBeUndefined();
  });

  it("accepts the pasted forms an editor actually uses", () => {
    // `.url()` on the field would reject `@handle` and a bare number before
    // `planSocialWrites` could resolve them, which is the bug this guards.
    const parsed = settingsSchema.safeParse({
      socials: [
        { platform: "Instagram", url: "@nakafeero" },
        { platform: "Instagram", url: "instagram.com/nakafeero" },
        { platform: "WhatsApp", url: "0774740871" },
      ],
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects a social row with no value at all", () => {
    expect(settingsSchema.safeParse({ socials: [{ platform: "Instagram", url: "" }] }).success).toBe(
      false
    );
  });

  it("keeps baseUpdatedAt, which is why the route must destructure it out", () => {
    const parsed = settingsSchema.parse(validPayload);
    // If this ever stops being true the destructure is no longer load-bearing,
    // and the comment explaining it should go with it.
    expect(parsed.baseUpdatedAt).toBe("2026-09-30T00:00:00.000Z");
    expect("baseUpdatedAt" in parsed).toBe(true);
  });

  it("has no key that would reach prisma.cooperativeInfo.update unrecognised", () => {
    const parsed = settingsSchema.parse(validPayload);
    const forwarded = Object.keys(parsed).filter(
      (key) => !ROUTE_CONSUMED.includes(key)
    );
    // Anything not in COLUMNS here is passed straight to Prisma and will throw
    // "Unknown arg" at runtime.
    expect(forwarded.sort()).toEqual([...COLUMNS].sort());
  });
});

/**
 * Three CMS screens share the settings row and each submits only the fields it
 * displays. That only works if an omitted field survives validation as
 * `undefined` — i.e. the schema has no `.default()` on them.
 *
 * The failure this guards against is silent and destructive. With
 * `phoneNumbers: z.array(phoneValue).default([])`, saving the About section
 * submitted no phone numbers, zod materialised `[]`, and the route wrote that
 * through: the cooperative's real contact details were erased by pressing
 * "Save about section". The `.default()` looked like a convenience and was the
 * bug.
 */
describe("settingsSchema partial payloads", () => {
  it("leaves an omitted list field undefined rather than defaulting it to []", () => {
    const parsed = settingsSchema.parse({ mission: "Only the mission changed." });

    expect(parsed.phoneNumbers).toBeUndefined();
    expect(parsed.taglines).toBeUndefined();
    expect(parsed.socials).toBeUndefined();
  });

  it("leaves an omitted scalar field undefined", () => {
    const parsed = settingsSchema.parse({ taglines: ["Farmers first"] });

    expect(parsed.mission).toBeUndefined();
    expect(parsed.officialEmail).toBeUndefined();
    expect(parsed.address).toBeUndefined();
    expect(parsed.logoUrl).toBeUndefined();
  });

  it("still allows a field to be cleared explicitly", () => {
    const parsed = settingsSchema.parse({ phoneNumbers: [], logoUrl: "" });

    expect(parsed.phoneNumbers).toEqual([]);
    expect(parsed.logoUrl).toBe("");
  });

  it("round-trips every About-screen payload without touching the contact fields", () => {
    // What AboutPanel submits: mission, vision, taglines and the concurrency
    // token. Nothing else.
    const parsed = settingsSchema.parse({
      mission: "A mission.",
      vision: "A vision.",
      taglines: ["One", "Two"],
      baseUpdatedAt: "2026-09-30T00:00:00.000Z",
    });

    const forwarded = Object.keys(parsed).filter(
      (key) => !ROUTE_CONSUMED.includes(key) && parsed[key as keyof typeof parsed] !== undefined
    );

    expect(forwarded.sort()).toEqual(["mission", "taglines", "vision"]);
  });

  it("round-trips every Logo-screen payload without touching anything else", () => {
    const parsed = settingsSchema.parse({
      logoUrl: "/uploads/1757000000000-deadbeef.png",
      baseUpdatedAt: "2026-09-30T00:00:00.000Z",
    });

    const forwarded = Object.keys(parsed).filter(
      (key) => !ROUTE_CONSUMED.includes(key) && parsed[key as keyof typeof parsed] !== undefined
    );

    expect(forwarded).toEqual(["logoUrl"]);
  });
});
