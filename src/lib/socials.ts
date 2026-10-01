/**
 * Social profiles: the only place that turns a platform name, a pasted handle
 * and a storable URL into each other.
 *
 * Links live as `SocialLink` rows (platform, handle, url) and the read model
 * returns them as a list, but the CMS edits them as a *dynamic* list of rows —
 * the table has always accepted any platform, it was the form and the write
 * route that were hard-locked to YouTube/Instagram/TikTok. That lock meant a
 * Facebook, WhatsApp or LinkedIn link could not be published at all without a
 * code change, and anything the site did not know about was silently dropped on
 * the way to the page.
 *
 * Two rules live here because breaking either one is silent:
 *
 *  1. A platform is matched case-insensitively, by alias and by containment
 *     ("TikTok & Official" is still TikTok). Exact `===` matching drops links.
 *  2. What an admin pastes is not what a link needs. `@kalisizo`,
 *     `instagram.com/nakafeero`, `0774740871` and
 *     `https://instagram.com/nakafeero` are all the same intent, and storing the
 *     first three verbatim publishes a link that goes nowhere.
 */
import { slugify } from "@/lib/slug";

/**
 * The read shape, as returned by `readSiteSettings` and the public API.
 *
 * Only `platform` and `url` matter for editing; `handle` is derived on write and
 * `description` is presentation the CMS does not own.
 */
export type SocialProfile = {
  id?: string;
  platform: string;
  handle?: string | null;
  url: string;
};

/** One editable row in the admin form. `key` is a React key, never stored. */
export type SocialEntry = {
  key: string;
  platform: string;
  /** Whatever the admin typed: a full URL, a bare `@handle`, or a phone number. */
  value: string;
};

/** The write shape accepted by `settingsSchema`. */
export type SocialEntryInput = {
  platform?: string;
  /** The pasted text, unresolved. The server turns this into the stored URL. */
  url: string;
  /** Optional override for the displayed handle; derived when omitted. */
  handle?: string;
};

/** A row to write to `SocialLink`, with the id and order already decided. */
export type SocialWrite = {
  id: string;
  platform: string;
  handle: string;
  url: string;
  displayOrder: number;
};

export type SocialProblem = {
  index: number;
  platform: string;
  value: string;
  message: string;
};

export type SocialWritePlan = {
  writes: SocialWrite[];
  /** Rows that could not be turned into a link. Saving refuses rather than drops. */
  problems: SocialProblem[];
};

type PlatformRule = {
  /** Canonical name. This is what gets stored, whatever the admin typed. */
  name: string;
  /** Typed-name spellings that resolve to this platform. */
  aliases: string[];
  /** Hosts that identify this platform in a pasted link. */
  hosts: string[];
  /** Prefix a bare handle is expanded with. */
  base: string;
  /** Display handle for this platform reads `@name`, not `name`. */
  at: boolean;
};

/**
 * Known platforms.
 *
 * This is a *convenience*, not a whitelist: an unknown platform still saves and
 * still renders (with a generic icon). What this list buys is that a bare
 * `@handle` becomes a real URL for the platforms a cooperative actually uses,
 * and that a pasted link can name its own platform when the field is blank.
 */
export const PLATFORM_RULES: PlatformRule[] = [
  {
    name: "Facebook",
    aliases: ["facebook", "fb"],
    hosts: ["facebook.com", "fb.com", "fb.me"],
    base: "https://www.facebook.com/",
    at: false,
  },
  {
    name: "Instagram",
    aliases: ["instagram", "ig"],
    hosts: ["instagram.com", "instagr.am"],
    base: "https://www.instagram.com/",
    at: true,
  },
  {
    name: "TikTok",
    aliases: ["tiktok", "tik tok"],
    hosts: ["tiktok.com"],
    base: "https://www.tiktok.com/@",
    at: true,
  },
  {
    name: "YouTube",
    aliases: ["youtube", "yt"],
    hosts: ["youtube.com", "youtu.be"],
    base: "https://www.youtube.com/@",
    at: true,
  },
  {
    name: "X",
    aliases: ["x", "twitter"],
    hosts: ["x.com", "twitter.com", "t.co"],
    base: "https://x.com/",
    at: false,
  },
  {
    name: "LinkedIn",
    aliases: ["linkedin"],
    hosts: ["linkedin.com", "lnkd.in"],
    base: "https://www.linkedin.com/company/",
    at: false,
  },
  {
    name: "WhatsApp",
    aliases: ["whatsapp", "wa"],
    hosts: ["wa.me", "whatsapp.com", "chat.whatsapp.com"],
    base: "https://wa.me/",
    at: false,
  },
  {
    name: "Telegram",
    aliases: ["telegram", "tg"],
    hosts: ["t.me", "telegram.me", "telegram.org"],
    base: "https://t.me/",
    at: false,
  },
  {
    name: "Threads",
    aliases: ["threads"],
    hosts: ["threads.net", "threads.com"],
    base: "https://www.threads.net/@",
    at: true,
  },
  {
    name: "Pinterest",
    aliases: ["pinterest", "pin"],
    hosts: ["pinterest.com", "pin.it"],
    base: "https://www.pinterest.com/",
    at: false,
  },
  {
    name: "Google Business",
    aliases: ["google", "business", "gb"],
    hosts: ["g.page", "maps.google.com", "goo.gl"],
    base: "https://g.page/",
    at: false,
  },
  {
    name: "Email",
    aliases: ["email", "mail", "e-mail"],
    hosts: [],
    base: "mailto:",
    at: false,
  },
];

/** Suggestions for the platform field. Free text is still accepted. */
export const SOCIAL_PLATFORM_NAMES: string[] = PLATFORM_RULES.map((rule) => rule.name);

const HAS_SCHEME = /^(https?:\/\/|mailto:|tel:)/i;
const PHONE_NUMBER = /^\+?[\d\s().-]{7,}$/;
const SAFE_SCHEMES = new Set(["http:", "https:", "mailto:", "tel:"]);

export function ruleForPlatform(platform: string | null | undefined): PlatformRule | null {
  const needle = String(platform ?? "").trim().toLowerCase();
  if (!needle) return null;

  for (const rule of PLATFORM_RULES) {
    if (rule.aliases.includes(needle) || rule.name.toLowerCase() === needle) return rule;
  }

  // "TikTok & Official" is still TikTok. Short aliases are left out of this pass
  // so a platform named "X" is never found inside some other word.
  for (const rule of PLATFORM_RULES) {
    if (rule.aliases.some((alias) => alias.length >= 3 && needle.includes(alias))) return rule;
  }
  return null;
}

/** The host of a pasted value, or null when it is not host-shaped. */
export function hostOf(value: string): string | null {
  const first = String(value ?? "")
    .trim()
    .split("/")[0]
    ?.split(/[?#]/)[0]
    ?.toLowerCase();
  if (!first) return null;
  const host = first.replace(/^www\./, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
}

export function ruleForHost(host: string | null | undefined): PlatformRule | null {
  const needle = String(host ?? "").trim().toLowerCase().replace(/^www\./, "");
  if (!needle) return null;
  return (
    PLATFORM_RULES.find(
      (rule) =>
        rule.hosts.some((known) => needle === known || needle.endsWith(`.${known}`))
    ) ?? null
  );
}

/** The platform a pasted link belongs to, or null when it is not recognised. */
export function platformFromUrl(url: string): string | null {
  const raw = String(url ?? "").trim();
  return ruleForHost(hostOf(raw.replace(HAS_SCHEME, "")))?.name ?? null;
}

/** Canonical casing for a known platform; the admin's own wording otherwise. */
export function normalizePlatformName(platform: string | null | undefined): string {
  const raw = String(platform ?? "").trim().replace(/\s+/g, " ");
  if (!raw) return "";
  return ruleForPlatform(raw)?.name ?? raw;
}

/**
 * The stored platform for a row: what the admin chose, else what the pasted link
 * says it is, else a neutral label. Never empty, because the site renders the
 * name as the link's accessible label.
 */
export function resolvePlatform(
  platform: string | null | undefined,
  url: string
): string {
  return normalizePlatformName(platform) || platformFromUrl(url) || "Link";
}

/**
 * Turns anything an admin might paste into a URL that actually works.
 *
 * Returns "" when the input cannot be resolved at all — a bare handle with an
 * unknown platform, for instance. Callers must treat "" as an error rather than
 * storing it, or the site publishes a link with no destination.
 */
export function resolveSocialUrl(platform: string, input: string): string {
  const raw = String(input ?? "").trim();
  if (!raw) return "";
  if (hasUnsupportedScheme(raw)) return "";
  if (HAS_SCHEME.test(raw)) return raw;

  if (PHONE_NUMBER.test(raw)) {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return "";
    if (ruleForPlatform(platform)?.name === "WhatsApp") {
      // wa.me wants a country code, but the number on the office wall is local.
      // Ugandan mobiles are 07XXXXXXXX; anything else is used as typed.
      const international = /^0[7]\d{8}$/.test(digits)
        ? `256${digits.slice(1)}`
        : digits.replace(/^0+/, "");
      return `https://wa.me/${international}`;
    }
    return `tel:${digits}`;
  }

  const trimmed = raw.replace(/^@+/, "");
  const [first, ...rest] = trimmed.split("/");
  const host = hostOf(first);
  const path = rest.length ? `/${rest.join("/")}` : "";

  // A pasted domain is taken at its word: it already says where it goes, even
  // when the platform field says something else.
  if (host) return `https://${host}${path}`;

  const rule = ruleForPlatform(platform);
  if (!rule) return "";
  return `${rule.base}${trimmed}`;
}

/** The display handle for a resolved URL, e.g. `instagram.com/x` → `@x`. */
export function handleFromUrl(url: string, platform?: string): string {
  const raw = String(url ?? "").trim();
  if (!raw) return "";
  if (/^mailto:/i.test(raw)) return raw.slice(7).trim().slice(0, 120);
  if (/^tel:/i.test(raw)) return raw.slice(4).trim().slice(0, 40);

  let parsed: URL;
  try {
    parsed = new URL(HAS_SCHEME.test(raw) ? raw : `https://${raw}`);
  } catch {
    return "";
  }

  const segments = parsed.pathname.split("/").filter(Boolean);
  if (!segments.length) return parsed.hostname.replace(/^www\./, "").slice(0, 80);

  let last = segments[segments.length - 1];
  try {
    last = decodeURIComponent(last);
  } catch {
    /* keep the raw segment */
  }
  if (PHONE_NUMBER.test(last)) return last.trim().slice(0, 40);

  const rule = ruleForPlatform(platform) ?? ruleForHost(parsed.hostname);
  const prefix = rule?.at ? "@" : "";
  return `${prefix}${last}`.slice(0, 120);
}

/**
 * Only these four schemes are ever stored.
 *
 * A social link is rendered as an `href`, so a `javascript:` URL would be an
 * XSS hole that passes every other check in the stack.
 */
export function isSafeSocialUrl(url: string): boolean {
  try {
    return SAFE_SCHEMES.has(new URL(String(url ?? "").trim()).protocol.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * True when the value parses as a URL whose scheme a link cannot use.
 *
 * `javascript:alert(1)` and `data:text/html,…` parse perfectly well as URLs.
 * Without this check they would fall through to the bare-handle path and be
 * "helpfully" wrapped into `https://instagram.com/javascript:alert(1)` — safe to
 * click, but nonsense that looks like a successful save. Callers refuse these so
 * the editor is told instead.
 *
 * A value that is not a URL at all (`@handle`, `instagram.com/x`) is not
 * affected: `new URL` throws, and this returns false.
 */
export function hasUnsupportedScheme(value: string): boolean {
  try {
    return !SAFE_SCHEMES.has(new URL(String(value ?? "").trim()).protocol.toLowerCase());
  } catch {
    return false;
  }
}

/** Stored profiles as form rows, preserving platform order and duplicates. */
export function socialsToEntries(
  profiles: SocialProfile[] | null | undefined
): SocialEntry[] {
  if (!Array.isArray(profiles)) return [];

  return profiles
    .filter((profile) => profile && (profile.url || profile.handle))
    .map((profile, index) => ({
      key: profile.id || `${slugify(profile.platform ?? "") || "link"}-${index}`,
      platform: String(profile.platform ?? ""),
      // The stored URL is already resolvable input, so a round trip through this
      // form rewrites nothing — the editor has to touch a row to change it.
      value: String(profile.url ?? profile.handle ?? ""),
    }));
}

let entrySeq = 0;

/** A blank row. `platform` seeds the field from a quick-add button. */
export function emptySocialEntry(platform = ""): SocialEntry {
  entrySeq += 1;
  return { key: `new-${entrySeq}-${Math.random().toString(36).slice(2, 8)}`, platform, value: "" };
}

/** True when every row is blank, so a save can leave the stored links alone. */
export function entriesAreEmpty(entries: SocialEntry[] | null | undefined): boolean {
  if (!entries?.length) return true;
  return entries.every((entry) => !String(entry?.value ?? "").trim());
}

/** Rows worth sending: blank ones are rows the editor has not filled in yet. */
export function entriesToPayload(entries: SocialEntry[]): SocialEntryInput[] {
  return entries
    .filter((entry) => String(entry?.value ?? "").trim())
    .map((entry) => ({
      platform: String(entry.platform ?? "").trim(),
      url: String(entry.value ?? "").trim(),
    }));
}

/** Keeps ids stable per platform and unique when a platform is added twice. */
function uniqueId(base: string, taken: Set<string>): string {
  let candidate = base;
  for (let suffix = 2; taken.has(candidate); suffix += 1) {
    candidate = `${base}-${suffix}`;
  }
  taken.add(candidate);
  return candidate;
}

/**
 * Turns submitted rows into the exact set of `SocialLink` rows that should exist.
 *
 * Ids are `social-<platform-slug>`, matching what the old fixed-field route
 * wrote, so a re-save updates the same rows rather than creating a second set
 * beside them. Rows that predate that convention are matched by platform in
 * `matchExistingSocialIds`.
 *
 * Unresolvable input is reported rather than skipped: a save that quietly drops a
 * handle looks exactly like a save that worked.
 */
export function planSocialWrites(
  entries: SocialEntryInput[] | null | undefined
): SocialWritePlan {
  const writes: SocialWrite[] = [];
  const problems: SocialProblem[] = [];
  const taken = new Set<string>();

  for (const [index, entry] of (entries ?? []).entries()) {
    const value = String(entry?.url ?? "").trim();
    if (!value) continue;

    const typedPlatform = String(entry?.platform ?? "").trim();
    const url = resolveSocialUrl(typedPlatform, value);

    if (!url || !isSafeSocialUrl(url)) {
      const label = normalizePlatformName(typedPlatform) || value;
      const needsFullLink =
        !hasUnsupportedScheme(value) && !hostOf(value.replace(HAS_SCHEME, ""));
      problems.push({
        index,
        platform: typedPlatform,
        value,
        message: needsFullLink
          ? `${label} needs a full link — a handle alone cannot be resolved.`
          : `${value} is not a link this site can publish.`,
      });
      continue;
    }

    const platform = resolvePlatform(typedPlatform, url);
    const handle = String(entry?.handle ?? "").trim() || handleFromUrl(url, platform);
    writes.push({
      id: uniqueId(`social-${slugify(platform) || "link"}`, taken),
      platform,
      handle,
      url,
      // Dense and in submitted order, so displayOrder matches the form even when
      // a row above this one was rejected.
      displayOrder: writes.length,
    });
  }

  return { writes, problems };
}

/**
 * Re-points planned writes at the rows that already exist for their platform.
 *
 * `planSocialWrites` assigns ids like `social-youtube`, which is what the old
 * fixed-field route wrote. Rows created by the seed, however, have generated
 * ids — so on the first save after this change a naive upsert-by-id would delete
 * the seeded link and create a second row with the same URL. Matching on the
 * canonical platform name keeps the existing row, its description and its
 * creation date, and leaves the new save with nothing to delete.
 *
 * Each existing row is claimed at most once, so a platform added twice still
 * gets two rows.
 */
export function matchExistingSocialIds(
  writes: SocialWrite[],
  existing: { id: string; platform: string }[]
): SocialWrite[] {
  const byPlatform = new Map<string, string>();
  for (const link of existing) {
    const key = normalizePlatformName(link.platform);
    if (key && !byPlatform.has(key)) byPlatform.set(key, link.id);
  }

  const claimed = new Set<string>();
  return writes.map((write) => {
    const existingId = byPlatform.get(normalizePlatformName(write.platform));
    if (!existingId || claimed.has(existingId)) return write;
    claimed.add(existingId);
    return { ...write, id: existingId };
  });
}