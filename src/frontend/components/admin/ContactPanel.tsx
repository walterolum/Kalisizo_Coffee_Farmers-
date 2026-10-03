"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Loader2, Mail, Settings2 } from "lucide-react";
import {
  apiFetch,
  Field,
  inputBase,
  Panel,
  publishAndFeedback,
  splitList,
} from "@/frontend/components/admin/panel-kit";
import { useRealtimePoll } from "@/shared/realtime";
import { sessionExpired } from "@/shared/admin-api";
import { ErrorState } from "@/frontend/components/admin/ui";
import type { SaveResult as PublishResult } from "@/shared/save-outcome";
import {
  entriesToPayload,
  socialsToEntries,
  type SocialEntry,
  type SocialProfile,
} from "@/shared/socials";
import { FaqPanel } from "@/frontend/components/admin/FaqPanel";
import { SocialLinksFields } from "@/frontend/components/admin/SocialLinksFields";

/**
 * Contact details panel.
 *
 * Extracted from `AdminClient.tsx`.
 *
 * This panel renders the FAQs panel beneath the contact fields, which is why the
 * two used to be one function: "Contact" is where visitors look for the details
 * and the questions together. The composition is now explicit, and each half can
 * be moved to its own screen later without untangling them first.
 *
 * These fields live on the singleton settings row, so this panel is one of three
 * that edit the same record: About, Contact and the Site Settings screen. They
 * use optimistic concurrency (`baseUpdatedAt`), so two administrators editing
 * different groups of fields on the same row cannot silently overwrite each
 * other — the second save is rejected with a conflict.
 *
 * Note the difference between the two save flows. `saveSettings` in
 * `@/shared/admin-api` is the newer, typed one; this panel uses the older
 * `publishAndFeedback` from the panel kit.
 */

type SettingsInfo = {
  phoneNumbers: string[];
  officialEmail: string | null;
  address: string | null;
  socials: SocialProfile[];
  updatedAt?: string;
};

export function ContactPanel({
  notify,
  onSessionError,
}: {
  notify: (message: string, kind?: "success" | "error") => void;
  onSessionError: (error: unknown) => void;
}) {
  const [info, setInfo] = useState<SettingsInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    phoneNumbers: "",
    officialEmail: "",
    address: "",
  });
  const [socials, setSocials] = useState<SocialEntry[]>([]);
  /**
   * Whether the editor has deliberately changed the social list.
   *
   * The API reads a submitted `socials` array as the *complete* list and deletes
   * any link missing from it, so an unconditional send turns two ordinary events
   * into data loss: if `load()` fails or is still in flight, `socials` is still
   * `[]`, and saving an unrelated phone number deletes every social profile. The
   * CMS offers no undo and no restore path for a deleted `SocialLink`.
   *
   * Gating the field on an explicit edit is what makes "I did not touch the
   * links" mean "leave the links alone", which is the same rule the other
   * fields on this shared row already follow.
   */
  const socialsEdited = useRef(false);

  /**
   * Why the last load failed, if it did.
   *
   * `load` used to hand every failure to `onSessionError`, which only acts on a
   * 401. A 500, a 503 or a dropped connection therefore vanished: `info` stayed
   * `null` and the panel showed its spinner forever, with no message and no way
   * to retry.
   */
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const settings = await apiFetch<SettingsInfo>("/api/v1/settings");
      setInfo(settings);
      // `socials` arrives as a list of profiles; the form edits a list of rows.
      // Folding it through the shared helper is what keeps the inputs populated —
      // reading platform keys off the array yields undefined, which renders blank
      // and then saves the blanks back over the real links.
      setSocials(socialsToEntries(settings.socials));

      setForm({
        phoneNumbers: settings.phoneNumbers.join(", "),
        officialEmail: settings.officialEmail ?? "",
        address: settings.address ?? "",
      });
      setLoadError(null);
    } catch (error) {
      // A 401 means the session is gone, which is the shell's business. Anything
      // else is this panel's to report.
      if (sessionExpired(error)) {
        onSessionError(error);
        return;
      }
      setLoadError(
        error instanceof Error && error.message
          ? error.message
          : "Could not load the contact settings.",
      );
    }
  }, [onSessionError]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  useRealtimePoll(load, undefined, "settings");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const ok = await publishAndFeedback(notify, onSessionError, () =>
        apiFetch<PublishResult>("/api/v1/admin/settings", {
          method: "POST",
          body: JSON.stringify({
            // Only the fields this form displays. The settings row is shared
            // with the About and Logo screens, and the API treats an omitted
            // field as "leave alone" — sending them all would round-trip
            // whatever was loaded, which is what turns one screen's save into
            // another screen's silent overwrite.
            phoneNumbers: splitList(form.phoneNumbers),
            officialEmail: form.officialEmail,
            address: form.address,
            // Omitted unless the editor changed the list. The API deletes every
            // link not present in a submitted array, so sending the untouched
            // list back — especially a `[]` from a failed load — would wipe the
            // published social profiles. See `socialsEdited` above.
            ...(socialsEdited.current
              ? { socials: entriesToPayload(socials) }
              : {}),
            baseUpdatedAt: info?.updatedAt,
          }),
        }),
      );
      if (ok) await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6">
      <Panel
        title="Contact | Phones, Email, Address & Socials"
        icon={<Mail className="size-5" />}
      >
        <form onSubmit={submit} className="grid gap-4 lg:grid-cols-2">
          <Field label="Phone numbers (comma separated)">
            <input
              value={form.phoneNumbers}
              onChange={(e) =>
                setForm({ ...form, phoneNumbers: e.target.value })
              }
              className={inputBase}
              placeholder="0774740871, 0701740871, 0705487223"
            />
          </Field>
          <Field label="Official email">
            <input
              type="email"
              value={form.officialEmail}
              onChange={(e) =>
                setForm({ ...form, officialEmail: e.target.value })
              }
              className={inputBase}
              placeholder="kalisizocoop@gmail.com"
            />
          </Field>
          <Field label="Address">
            <input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className={inputBase}
              placeholder="Kalisizo Sub County, Kyotera District"
            />
          </Field>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={saving || !info}
              className="btn btn-primary btn-md disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Settings2 className="size-4" aria-hidden="true" />
              )}
              Save contact info
            </button>
          </div>
          <div className="mt-2 border-t border-white/10 pt-5 lg:col-span-2">
            <SocialLinksFields
              entries={socials}
              onChange={(next) => {
                // Recorded here rather than inside the shared component so the
                // "was this list touched?" decision stays with the panel that
                // decides what to submit.
                socialsEdited.current = true;
                setSocials(next);
              }}
            />
          </div>
        </form>
        {/* The form above is already gated on `info`, so a failed load used to render an
            empty, permanently-disabled form with no explanation. `info` still
            being null also legitimately means "no settings row yet", so the two
            states are distinguished by whether a load actually failed. */}
        {loadError && (
          <div className="mt-4">
            <ErrorState
              title="Could not load the contact settings"
              message={loadError}
              onRetry={() => void load()}
            />
          </div>
        )}
        {!info && !loadError && (
          <p className="mt-4 text-sm text-mist">
            No cooperative settings found. Submit to create the initial record.
          </p>
        )}
      </Panel>

      <FaqPanel notify={notify} onSessionError={onSessionError} />
    </div>
  );
}
