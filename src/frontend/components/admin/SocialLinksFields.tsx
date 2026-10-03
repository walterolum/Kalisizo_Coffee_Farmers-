"use client";

/**
 * The social-links editor, shared by the two screens that publish links.
 *
 * Two rules this component exists to enforce:
 *
 *  1. It edits a **list of rows**, not three named fields. `SocialLink` has
 *     always accepted any platform, so the form being hard-coded to
 *     YouTube/Instagram/TikTok was the only thing stopping an editor from adding
 *     a Facebook or WhatsApp link.
 *  2. It submits what was typed and nothing more. `entriesToPayload` forwards the
 *     pasted text unresolved — `planSocialWrites` on the server is the single
 *     place that decides what a handle becomes — so this component can show a
 *     preview of the resolved link without being the authority on it.
 *
 * A blank row is a row the editor has not finished, not a link to delete: those
 * are dropped before saving. Deleting happens by removing the row and saving.
 */
import { Plus, Trash2 } from "lucide-react";
import { Field, inputBase } from "@/frontend/components/admin/panel-kit";
import {
  SOCIAL_PLATFORM_NAMES,
  emptySocialEntry,
  entriesAreEmpty,
  entriesToPayload,
  platformFromUrl,
  resolveSocialUrl,
  type SocialEntry,
} from "@/shared/socials";

export function SocialLinksFields({
  entries,
  onChange,
}: {
  entries: SocialEntry[];
  onChange: (next: SocialEntry[]) => void;
}) {
  const update = (key: string, patch: Partial<SocialEntry>) =>
    onChange(entries.map((entry) => (entry.key === key ? { ...entry, ...patch } : entry)));

  const add = (platform = "") => onChange([...entries, emptySocialEntry(platform)]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-[12px] leading-relaxed text-mist">
          Add any platform — a name and a handle, or a full link. Paste whatever you
          have: <code className="text-cream/70">@kalisizocoffee</code>,{" "}
          <code className="text-cream/70">instagram.com/nakafeero</code> and a WhatsApp
          number all become working links.
        </p>
        <button
          type="button"
          onClick={() => add()}
          className="inline-flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs font-semibold text-cream/80 ring-1 ring-white/10 transition-colors hover:bg-white/10"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          Add link
        </button>
      </div>

      <ul className="grid gap-3">
        {entries.map((entry, index) => {
          const resolved = resolveSocialUrl(entry.platform, entry.value);
          // A pasted link knows which platform it is; an empty platform field is
          // the only case where that is worth guessing for the editor.
          const suggest = entry.platform.trim() ? null : platformFromUrl(entry.value);

          return (
            <li
              key={entry.key}
              className="grid gap-3 rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/10 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto]"
            >
              <Field label={`Platform ${index + 1}`}>
                <input
                  list="social-platforms"
                  value={entry.platform}
                  onChange={(e) => update(entry.key, { platform: e.target.value })}
                  placeholder="Facebook"
                  className={inputBase}
                />
              </Field>

              <Field
                label="Handle or link"
                hint={
                  resolved && resolved !== entry.value.trim()
                    ? `Will publish as ${resolved}`
                    : suggest
                      ? `Looks like ${suggest}`
                      : undefined
                }
              >
                <input
                  value={entry.value}
                  onChange={(e) => update(entry.key, { value: e.target.value })}
                  placeholder="@kalisizocoffee or https://…"
                  className={inputBase}
                />
              </Field>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => onChange(entries.filter((row) => row.key !== entry.key))}
                  aria-label={`Remove ${entry.platform || "this"} link`}
                  className="inline-flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2.5 text-xs font-semibold text-cream/70 ring-1 ring-white/10 transition-colors hover:bg-cherry/15 hover:text-cherry-light"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  Remove
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {!entries.length && (
        <p className="text-sm text-mist">
          No links yet. The site falls back to its built-in links until one is added.
        </p>
      )}

      <datalist id="social-platforms">
        {SOCIAL_PLATFORM_NAMES.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {/* This line used to claim that saving an empty list "leaves the published
          links untouched", which was the opposite of what the API does: a
          submitted array is the complete list, so removing every row removes
          every link. It has to describe the real behaviour, because the CMS
          offers no undo for a deleted link. */}
      <p className="text-[12px] text-mist">
        {entriesAreEmpty(entries)
          ? "Saving with no rows removes every published social link."
          : `${entriesToPayload(entries).length} link(s) will be published, in this order. Any link not listed here is removed.`}
      </p>
    </div>
  );
}