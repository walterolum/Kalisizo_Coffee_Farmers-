/**
 * Site settings screen: mission, vision, contact details and social links.
 *
 * These values appear across the whole site (footer, contact page, header), so
 * the form saves the entire settings row at once with an optimistic-concurrency
 * token. The server replaces the social list wholesale, so removing a row
 * genuinely removes that profile rather than leaving a stale link behind.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AdminApiError,
  readSettings,
  saveSettings,
  type SiteSettings,
} from "@/shared/admin-api";
import { SocialLinksFields } from "@/frontend/components/admin/SocialLinksFields";
import {
  entriesToPayload,
  socialsToEntries,
  type SocialEntry,
} from "@/shared/socials";

export function SettingsPanel() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [mission, setMission] = useState("");
  const [vision, setVision] = useState("");
  const [taglines, setTaglines] = useState("");
  const [phoneNumbers, setPhoneNumbers] = useState("");
  const [officialEmail, setOfficialEmail] = useState("");
  const [address, setAddress] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [socials, setSocials] = useState<SocialEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /**
   * Whether the editor deliberately changed the social list.
   *
   * The API treats a submitted `socials` array as the complete list and deletes
   * anything missing from it. If `load()` fails, `socials` is still `[]` and the
   * form becomes editable, so saving an unrelated mission change would delete
   * every social profile — with no undo in the CMS. The field is therefore sent
   * only when the list was actually touched, which is what "leave alone" has to
   * mean on a row three screens share.
   */
  const socialsEdited = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await readSettings();
      setSettings(data);
      if (data) {
        setMission(data.mission ?? "");
        setVision(data.vision ?? "");
        setTaglines(data.taglines.join("\n"));
        setPhoneNumbers(data.phoneNumbers.join("\n"));
        setOfficialEmail(data.officialEmail ?? "");
        setAddress(data.address ?? "");
        setLogoUrl(data.logoUrl ?? "");
        // The read model is a list of profiles; the form edits that list row by
        // row, so any platform in the CMS comes back as an editable row.
        setSocials(socialsToEntries(data.socials));
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load settings.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await saveSettings({
        mission,
        vision,
        taglines: splitLines(taglines),
        phoneNumbers: splitLines(phoneNumbers),
        officialEmail,
        address,
        logoUrl,
        // Omitted unless the list was edited — see `socialsEdited` above. Sending
        // the untouched list back (notably a `[]` left by a failed load) deletes
        // every published link.
        ...(socialsEdited.current
          ? { socials: entriesToPayload(socials) }
          : {}),
        baseUpdatedAt: settings?.updatedAt,
      });
      setSettings(saved);
      setNotice("Settings saved.");
      window.setTimeout(() => setNotice(null), 4000);
    } catch (caught) {
      setError(
        caught instanceof AdminApiError
          ? `${caught.message}${caught.field ? ` (${caught.field})` : ""}`
          : "Could not save settings.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return <p className="text-sm text-cream/50">Loading settings…</p>;

  return (
    <form onSubmit={onSubmit} className="max-w-3xl space-y-6">
      <header>
        <h2 className="text-2xl font-semibold text-cream">Site settings</h2>
        <p className="mt-1 text-sm text-cream/65">
          Contact details and social links shown in the footer, header and on
          the contact page. Remove a social row to take that link off the site.
        </p>
      </header>

      {notice && (
        // Same contrast bug as `ContentPanel`: `bg-emerald-50` is a near-white
        // background and `text-emerald-300` is a light green, so the saved
        // confirmation was invisible against the dark panel. `role="status"`
        // announces it politely.
        <p
          role="status"
          className="rounded-lg bg-emerald-500/15 px-4 py-2 text-sm text-emerald-300 ring-1 ring-emerald-400/25"
        >
          {notice}
        </p>
      )}
      {error && (
        <p
          className="rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-300 ring-1 ring-red-400/20"
          role="alert"
        >
          {error}
        </p>
      )}

      <fieldset className="space-y-4 rounded-lg border border-white/10 p-5">
        <legend className="px-1 text-sm font-medium text-cream/80">
          Mission and vision
        </legend>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-cream/80">Mission</span>
          <textarea
            rows={3}
            value={mission}
            onChange={(event) => setMission(event.target.value)}
            className="w-full rounded-lg border border-white/20 px-3 py-2 bg-white/[0.05] text-cream placeholder:text-cream/35 transition-colors focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/20 [&_option]:bg-forest [&_option]:text-cream"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-cream/80">Vision</span>
          <textarea
            rows={3}
            value={vision}
            onChange={(event) => setVision(event.target.value)}
            className="w-full rounded-lg border border-white/20 px-3 py-2 bg-white/[0.05] text-cream placeholder:text-cream/35 transition-colors focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/20 [&_option]:bg-forest [&_option]:text-cream"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-cream/80">Taglines</span>
          <textarea
            rows={4}
            value={taglines}
            onChange={(event) => setTaglines(event.target.value)}
            className="w-full rounded-lg border border-white/20 px-3 py-2 bg-white/[0.05] text-cream placeholder:text-cream/35 transition-colors focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/20 [&_option]:bg-forest [&_option]:text-cream"
            placeholder="One tagline per line"
          />
          <span className="mt-1 block text-xs text-cream/50">
            One per line.
          </span>
        </label>
      </fieldset>

      <fieldset className="space-y-4 rounded-lg border border-white/10 p-5">
        <legend className="px-1 text-sm font-medium text-cream/80">
          Contact
        </legend>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-cream/80">
            Phone numbers
          </span>
          <textarea
            rows={3}
            value={phoneNumbers}
            onChange={(event) => setPhoneNumbers(event.target.value)}
            className="w-full rounded-lg border border-white/20 px-3 py-2 bg-white/[0.05] text-cream placeholder:text-cream/35 transition-colors focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/20 [&_option]:bg-forest [&_option]:text-cream"
            placeholder="One number per line"
          />
          <span className="mt-1 block text-xs text-cream/50">
            One per line, in international format.
          </span>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-cream/80">
            Official email
          </span>
          <input
            type="email"
            value={officialEmail}
            onChange={(event) => setOfficialEmail(event.target.value)}
            className="w-full rounded-lg border border-white/20 px-3 py-2 bg-white/[0.05] text-cream placeholder:text-cream/35 transition-colors focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/20 [&_option]:bg-forest [&_option]:text-cream"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-cream/80">Address</span>
          <textarea
            rows={2}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            className="w-full rounded-lg border border-white/20 px-3 py-2 bg-white/[0.05] text-cream placeholder:text-cream/35 transition-colors focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/20 [&_option]:bg-forest [&_option]:text-cream"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-cream/80">Logo URL</span>
          <input
            value={logoUrl}
            onChange={(event) => setLogoUrl(event.target.value)}
            placeholder="https://..."
            className="w-full rounded-lg border border-white/20 px-3 py-2 bg-white/[0.05] text-cream placeholder:text-cream/35 transition-colors focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/20 [&_option]:bg-forest [&_option]:text-cream"
          />
        </label>
      </fieldset>

      <fieldset className="space-y-4 rounded-lg border border-white/10 p-5">
        <legend className="px-1 text-sm font-medium text-cream/80">
          Social links
        </legend>
        <SocialLinksFields
          entries={socials}
          onChange={(next) => {
            // Recorded here rather than inside the shared component so the
            // "was this list touched?" decision stays with the panel that decides
            // what to submit.
            socialsEdited.current = true;
            setSocials(next);
          }}
        />
      </fieldset>

      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-gold px-5 py-2 text-sm font-semibold text-forest-deep transition-colors hover:bg-gold-light disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}

/** Splits a textarea into a trimmed, non-empty list. */
function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
