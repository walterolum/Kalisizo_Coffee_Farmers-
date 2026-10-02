"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { FileText, Loader2, Plus, Trash2 } from "lucide-react";
import { ErrorState, StatusBadge, useConfirm } from "@/frontend/components/admin/ui";
import {
  apiFetch,
  Field,
  inputBase,
  Panel,
  publishAndFeedback,
  splitLines,
} from "@/frontend/components/admin/panel-kit";
import { useRealtimePoll } from "@/shared/realtime";
import { sessionExpired } from "@/shared/admin-api";
import type { SaveResult as PublishResult } from "@/shared/save-outcome";

/** Icon keys the public site's program cards know how to draw. */
const SERVICE_ICON_OPTIONS = [
  "coffee",
  "flask",
  "piggybank",
  "graduationcap",
  "landmark",
  "leaf",
  "users",
  "wheat",
  "recycle",
  "sprout",
  "handshake",
];

/** Accent gradient -> matching focus ring, so the two cannot drift apart. */
const ACCENT_RING: Record<string, string> = {
  "from-[#d5a83d] to-[#a87a1d]": "ring-[#d5a83d]/40",
  "from-[#1f7345] to-[#0e3d28]": "ring-[#1f7345]/40",
  "from-[#4a2c11] to-[#7a4a1f]": "ring-[#6b3f1a]/40",
  "from-[#1f7345] to-[#269558]": "ring-[#1f7345]/40",
};
const ACCENT_OPTIONS = Object.keys(ACCENT_RING);

type ServiceItem = {
  id: string;
  title: string;
  tagline: string;
  points: string[];
  details: string[];
  icon: string | null;
  accent: string | null;
  ring: string | null;
  displayOrder: number;
  /** `Service` is in the editorial workflow; absent on rows created before that. */
  status?: string | null;
};

export type ProgramsPanelProps = {
  notify: (message: string, kind?: "success" | "error") => void;
  onSessionError: (error: unknown) => void;
};

/**
 * Programs panel (`Service` in the Prisma schema).
 *
 * Extracted verbatim from `AdminClient.tsx`. The behaviour is unchanged; what moved
 * is the code. Two things about it are not obvious from the form:
 *
 * - It reads `/api/v1/admin/services`, not the public `/api/v1/services`. The public
 *   endpoint filters on PUBLISHED, so reading through it hid drafts from the editor and
 *   made newly saved programs appear to vanish from the list.
 * - It sends an explicit `status`. Programs are in the editorial workflow and
 *   `handleContentWrite` defaults an omitted status to DRAFT, which is how a program
 *   could be saved, announced as published, and never reach the site.
 */
export function ServicesPanel({
  notify,
  onSessionError,
}: {
  notify: (message: string, kind?: "success" | "error") => void;
  onSessionError: (error: unknown) => void;
}) {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [services, setServices] = useState<ServiceItem[] | null>(null);
  /**
   * Why the last load failed, if it did.
   *
   * `load` used to hand every failure to `onSessionError`, which only acts on a
   * 401. A 500, a 503 from the database or a dropped connection therefore
   * vanished: `services` stayed `null`, and the panel rendered its loading
   * spinner forever with no message and no way to retry. It looked like a slow
   * database rather than a failed request.
   */
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [form, setForm] = useState({
    title: "",
    tagline: "",
    points: "",
    details: "",
    icon: "coffee",
    accent: ACCENT_OPTIONS[0],
    ring: ACCENT_RING[ACCENT_OPTIONS[0]],
    displayOrder: 1,
    // Programs joined the editorial workflow, so the form has to offer the same
    // choice every other content type does. Leaving this out made every new
    // program a DRAFT: saved, reported as published, and invisible on the site.
    status: "DRAFT" as "DRAFT" | "PUBLISHED",
  });
  const [saving, setSaving] = useState(false);

  /**
   * Reads the CMS route, not the public one. The public `/api/v1/services`
   * endpoint only returns PUBLISHED rows, so using it here hid drafts from the
   * editor and made new programs appear to vanish after saving.
   */
  const load = useCallback(async () => {
    try {
      const data = await apiFetch<ServiceItem[]>("/api/v1/admin/services");
      setServices(data.sort((a, b) => a.displayOrder - b.displayOrder));
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
          : "Could not load programs.",
      );
    }
  }, [onSessionError]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  useRealtimePoll(load, undefined, "services");

  const resetForm = () => {
    setEditingId(undefined);
    setForm({
      title: "",
      tagline: "",
      points: "",
      details: "",
      icon: "coffee",
      accent: ACCENT_OPTIONS[0],
      ring: ACCENT_RING[ACCENT_OPTIONS[0]],
      displayOrder: (services?.length ?? 0) + 1,
      status: "DRAFT",
    });
  };

  const startEdit = (service: ServiceItem) => {
    setEditingId(service.id);
    setForm({
      title: service.title,
      tagline: service.tagline,
      points: service.points.join("\n"),
      details: service.details.join("\n"),
      icon: service.icon ?? "coffee",
      accent: service.accent ?? ACCENT_OPTIONS[0],
      ring: service.ring ?? ACCENT_RING[ACCENT_OPTIONS[0]],
      displayOrder: service.displayOrder,
      // Rows created before programs joined the workflow have no status; treat
      // them as live so editing one does not silently unpublish it.
      status: service.status === "DRAFT" ? "DRAFT" : "PUBLISHED",
    });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const ok = await publishAndFeedback(notify, onSessionError, () =>
        apiFetch<PublishResult>("/api/v1/admin/services", {
          method: "POST",
          body: JSON.stringify({
            id: editingId,
            title: form.title,
            tagline: form.tagline,
            points: splitLines(form.points),
            details: splitLines(form.details),
            icon: form.icon,
            accent: form.accent,
            ring: form.ring,
            displayOrder: Number(form.displayOrder) || 1,
            status: form.status,
          }),
        }),
      );
      if (ok) {
        resetForm();
        await load();
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async (service: ServiceItem) => {
    const ok = await confirm({
      title: `Delete “${service.title}”?`,
      body: "This program will be removed from the public site. This action cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/v1/admin/services/${service.id}`, {
        method: "DELETE",
      });
      notify("Service deleted.");
      await load();
    } catch (error) {
      onSessionError(error);
      notify("Could not delete service.");
    }
  };

  return (
    <>
      {confirmDialog}
      <Panel title="Core Services" icon={<FileText className="size-5" />}>
        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-cream/50">
              {editingId ? "Edit service" : "Add a service"}
            </h3>
            <form onSubmit={submit} className="mt-4 space-y-4">
              <Field label="Title">
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                  className={inputBase}
                  placeholder="e.g. Coffee Trade"
                />
              </Field>
              <Field label="Tagline">
                <input
                  value={form.tagline}
                  onChange={(e) =>
                    setForm({ ...form, tagline: e.target.value })
                  }
                  className={inputBase}
                  placeholder="Market linkage & transparent pricing for every member"
                />
              </Field>
              <Field label="Points (one per line)">
                <textarea
                  rows={4}
                  value={form.points}
                  onChange={(e) => setForm({ ...form, points: e.target.value })}
                  className={`${inputBase} resize-none`}
                  placeholder={
                    "Buying and marketing of quality coffee\nFair and transparent prices"
                  }
                />
              </Field>
              <Field label="Details / how it works (one per line)">
                <textarea
                  rows={5}
                  value={form.details}
                  onChange={(e) =>
                    setForm({ ...form, details: e.target.value })
                  }
                  className={`${inputBase} resize-none`}
                  placeholder={
                    "Green beans weighed, graded and moisture-checked\nPrices quoted openly"
                  }
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Icon">
                  <select
                    value={form.icon}
                    onChange={(e) => setForm({ ...form, icon: e.target.value })}
                    className={inputBase}
                  >
                    {SERVICE_ICON_OPTIONS.map((i) => (
                      <option key={i} value={i}>
                        {i}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Display order">
                  <input
                    type="number"
                    value={form.displayOrder}
                    onChange={(e) =>
                      setForm({ ...form, displayOrder: Number(e.target.value) })
                    }
                    className={inputBase}
                  />
                </Field>
              </div>
              <Field
                label="Visibility"
                hint="Drafts are saved here but stay off the public site until you publish them."
              >
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      status: e.target.value as "DRAFT" | "PUBLISHED",
                    })
                  }
                  className={inputBase}
                >
                  <option value="DRAFT">Draft - not visible on the site</option>
                  <option value="PUBLISHED">
                    Published - live on the site
                  </option>
                </select>
              </Field>
              <Field label="Accent / color">
                <select
                  value={form.accent}
                  onChange={(e) => {
                    const accent = e.target.value;
                    setForm({
                      ...form,
                      accent,
                      ring: ACCENT_RING[accent] ?? form.ring,
                    });
                  }}
                  className={inputBase}
                >
                  {ACCENT_OPTIONS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="btn btn-primary flex-1"
                >
                  {saving ? (
                    <Loader2
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : editingId ? (
                    <FileText className="size-4" aria-hidden="true" />
                  ) : (
                    <Plus className="size-4" aria-hidden="true" />
                  )}
                  {editingId ? "Save changes" : "Add service"}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="btn btn-ghost-soft"
                >
                  Reset
                </button>
              </div>
            </form>
          </div>

          {/* A first load that failed gets the full error treatment with a retry. A later
            poll that failed while we already have data keeps the list on screen
            and adds a banner, because replacing a working editor with an error
            page would be more disruptive than the failure itself. */}
          {loadError && !services && (
            <ErrorState
              title="Could not load programs"
              message={loadError}
              onRetry={() => void load()}
            />
          )}
          {loadError && services && (
            <p
              role="alert"
              className="rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-300 ring-1 ring-red-400/20"
            >
              Showing the last successful load. Could not refresh: {loadError}
            </p>
          )}

          {/* The list stays on screen whenever there is anything to list: either the
            load succeeded, or a refresh failed while we still hold earlier data. */}
          {(!loadError || services) && (
            <ul className="space-y-3">
              {!services ? (
                <li className="grid place-items-center py-12 text-cream/50">
                  <Loader2 className="size-6 animate-spin" />
                </li>
              ) : (
                services.map((service) => (
                  <li
                    key={service.id}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.05] px-4 py-3 ring-1 ring-white/10"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-gold/20 text-gold-light">
                        <FileText className="size-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {service.title}
                        </p>
                        <p className="text-[12px] text-cream/55">
                          order {service.displayOrder} · {service.points.length}{" "}
                          points
                        </p>
                      </div>
                      {/* Rows created before programs joined the workflow have no
                      status; those were always live, so show them as such. */}
                      <StatusBadge status={service.status ?? "PUBLISHED"} />
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(service)}
                        className="btn btn-ghost-soft btn-sm"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(service)}
                        aria-label={`Delete ${service.title}`}
                        className="grid size-8 place-items-center rounded-lg bg-red-500/10 text-red-300 ring-1 ring-red-400/20 transition-colors hover:bg-red-500/20"
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      </Panel>
    </>
  );
}
