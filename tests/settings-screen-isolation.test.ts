import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { settingsSchema } from "@/shared/validators";

/**
 * Three CMS screens write to the single `CooperativeInfo` row:
 *
 *   About   — mission, vision, taglines
 *   Contact — phoneNumbers, officialEmail, address, socials
 *   Logo    — logoUrl
 *
 * Because they share one row, a screen that submits fields it does not display
 * is writing over another screen's work with whatever it happened to have
 * loaded. That is not hypothetical: About and Logo both sent the full record,
 * so the actual bug in the codebase was that saving the logo could blank the
 * cooperative's phone numbers, and saving the about text could delete the
 * social links.
 *
 * These assertions read the panels' own source and check the rule that prevents
 * it: each screen submits only its own fields.
 */

const ADMIN_DIR = "src/frontend/components/admin";
const CLIENT = "src/app/admin/AdminClient.tsx";

/**
 * The platforms the form used to edit as three named fields. Nothing may read
 * them off the socials list: it is an array of rows, so `socials.youtube` is
 * `undefined`, which renders blank and saves the blank over the real link.
 */
const LEGACY_KEYS = ["youtube", "instagram", "tiktok"] as const;

function sourceOf(name: string): string {
  return readFileSync(join(ADMIN_DIR, name), "utf8");
}

/** The keys a `settingsSchema` payload may carry, excluding the non-column ones. */
const SUBMITTABLE = [
  "mission",
  "vision",
  "taglines",
  "phoneNumbers",
  "officialEmail",
  "address",
  "logoUrl",
  "socials",
] as const;

describe("shared settings row", () => {
  it("About submits only the fields it displays", () => {
    const source = readFileSync(CLIENT, "utf8");
    const at = source.indexOf("mission: form.mission");
    expect(at, "About should submit mission").toBeGreaterThan(-1);

    const body = source.slice(at - 200, at + 400);
    expect(body).toContain("taglines:");
    expect(body).not.toContain("phoneNumbers:");
    expect(body).not.toContain("officialEmail:");
    expect(body).not.toContain("socials:");
    expect(body).not.toContain("logoUrl:");
  });

  it("Logo submits only the logo", () => {
    const source = readFileSync(CLIENT, "utf8");
    const at = source.indexOf("logoUrl: logoUrl.trim()");
    expect(at, "Logo should submit logoUrl").toBeGreaterThan(-1);

    const body = source.slice(at - 300, at + 200);
    expect(body).not.toContain("phoneNumbers:");
    expect(body).not.toContain("mission:");
    expect(body).not.toContain("socials:");
  });

  it("Contact submits the contact fields and nothing from About or Logo", () => {
    const source = sourceOf("ContactPanel.tsx");
    const at = source.indexOf('"/api/v1/admin/settings"');
    expect(at).toBeGreaterThan(-1);

    const body = source.slice(at, at + 1200);
    expect(body).toContain("phoneNumbers:");
    expect(body).toContain("officialEmail:");
    expect(body).not.toContain("mission:");
    expect(body).not.toContain("vision:");
    expect(body).not.toContain("logoUrl:");
  });
});

describe("social links are only sent when the editor changes them", () => {
  /**
   * The data-loss path this covers.
   *
   * The route reads a submitted `socials` array as the *complete* list and
   * deletes any link missing from it. Both social-editing panels used to send
   * that array unconditionally, so if `load()` failed — or had not finished —
   * `socials` was still `[]`, and saving an unrelated phone number deleted every
   * social profile. There is no undo and no restore path in the CMS.
   *
   * The fix is to treat "I did not touch the links" as "leave the links alone",
   * which means the field must be absent from the payload, not empty.
   */
  const PANELS = ["ContactPanel.tsx", "SettingsPanel.tsx"];

  it.each(PANELS)("%s gates socials behind an edit flag", (file) => {
    const source = sourceOf(file);

    expect(
      source,
      `${file} must track whether the social list was edited`,
    ).toMatch(/socialsEdited\s*=\s*useRef\(false\)/);

    expect(
      source,
      `${file} must set the flag when the list changes, or the payload is never sent`,
    ).toMatch(/socialsEdited\.current\s*=\s*true/);

    expect(
      source,
      `${file} must not send socials unconditionally — the route deletes anything ` +
        `missing from a submitted array`,
    ).toMatch(
      /\.\.\.\(\s*socialsEdited\.current\s*\?\s*\{\s*socials:\s*entriesToPayload\(/,
    );
  });

  it.each(PANELS)("%s never sends a bare socials key", (file) => {
    // A plain `socials: entriesToPayload(socials),` line is the unconditional
    // send that caused the deletion.
    const source = sourceOf(file);
    expect(source).not.toMatch(/^\s*socials:\s*entriesToPayload\(/m);
  });
});

describe("omitted fields never reach the database", () => {
  /**
   * The mechanism that actually protects the row. Whatever a screen submits,
   * a key it left out has to arrive at the route as `undefined` so the route
   * skips it. If the schema ever regains a `.default()`, every screen above
   * stops being safe and this fails.
   */
  it("a screen submitting one field cannot clear the others", () => {
    const aboutSave = settingsSchema.parse({
      mission: "A mission.",
      vision: "A vision.",
      taglines: ["One"],
      baseUpdatedAt: "2026-09-30T00:00:00.000Z",
    });

    for (const key of [
      "phoneNumbers",
      "officialEmail",
      "address",
      "logoUrl",
    ] as const) {
      expect(
        aboutSave[key],
        `${key} must be undefined after an About save`,
      ).toBeUndefined();
    }
    expect(aboutSave.socials).toBeUndefined();
  });

  it("a logo save cannot clear the about or contact fields", () => {
    const logoSave = settingsSchema.parse({
      logoUrl: "/uploads/1.png",
      baseUpdatedAt: "2026-09-30T00:00:00.000Z",
    });

    for (const key of SUBMITTABLE) {
      if (key === "logoUrl") continue;
      expect(
        logoSave[key],
        `${key} must be undefined after a Logo save`,
      ).toBeUndefined();
    }
  });

  it("a contact save cannot clear the about fields", () => {
    const contactSave = settingsSchema.parse({
      phoneNumbers: ["0774740871"],
      officialEmail: "kalisizocoop@gmail.com",
      address: "Kalisizo Town",
      socials: [],
      baseUpdatedAt: "2026-09-30T00:00:00.000Z",
    });

    expect(contactSave.mission).toBeUndefined();
    expect(contactSave.vision).toBeUndefined();
    expect(contactSave.taglines).toBeUndefined();
    expect(contactSave.logoUrl).toBeUndefined();
  });
});

describe("social profiles survive a settings save", () => {
  /**
   * The specific data loss that prompted all of this: `socials` came back from
   * the API as an array, the panels read `.youtube` off it, got `undefined`,
   * and saved `""` — which the route treats as "remove this link".
   */
  it("no admin panel reads a platform key off the socials list", () => {
    const files = [
      "ContactPanel.tsx",
      "ProgramsPanel.tsx",
      "SettingsPanel.tsx",
      "AdminShell.tsx",
      "SocialLinksFields.tsx",
    ];
    for (const file of files) {
      const source = sourceOf(file);
      for (const key of LEGACY_KEYS) {
        expect(
          source.includes(`socials?.${key}`) ||
            source.includes(`socials.${key}`),
          `${file} must not read socials.${key} directly; use socialsToEntries()`,
        ).toBe(false);
      }
    }
  });

  it("only the Contact screen ships social fields, and it sends a list", () => {
    const client = readFileSync(CLIENT, "utf8");
    // Two sends in Client would be About or Logo rewriting the links.
    const sends = client.split('"/api/v1/admin/settings"').length - 1;
    expect(sends).toBe(2); // About and Logo; neither may carry socials
    // A `socials: { … }` object is the old fixed-field shape the route no longer
    // accepts; the panels submit `socials: entriesToPayload(rows)`.
    expect(client).not.toMatch(/socials:\s*\{/);

    const contact = sourceOf("ContactPanel.tsx");
    expect(contact).toContain("socials: entriesToPayload(");
    expect(contact).not.toMatch(/socials:\s*\{/);
  });
});
