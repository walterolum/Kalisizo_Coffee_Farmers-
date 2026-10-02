"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { FileText, Loader2, Plus, Trash2 } from "lucide-react";
import { useConfirm, ErrorState } from "@/frontend/components/admin/ui";
import {
  apiFetch,
  Field,
  inputBase,
  Panel,
  publishAndFeedback,
} from "@/frontend/components/admin/panel-kit";
import { useRealtimePoll } from "@/shared/realtime";
import { sessionExpired } from "@/shared/admin-api";
import type { SaveResult as PublishResult } from "@/shared/save-outcome";

/**
 * FAQs panel.
 *
 * Extracted verbatim from `AdminClient.tsx`; the behaviour is unchanged.
 *
 * `FaqItem` has no status column, so a saved question is public immediately and
 * the panel reads the public `/api/v1/faq` list. The write still goes through
 * `/api/v1/admin/faq`, which checks the permission server-side.
 */

type FaqItemType = {
  id: string;
  question: string;
  answer: string;
  displayOrder: number;
};

export function FaqPanel({
  notify,
  onSessionError,
}: {
  notify: (message: string, kind?: "success" | "error") => void;
  onSessionError: (error: unknown) => void;
}) {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [faqs, setFaqs] = useState<FaqItemType[] | null>(null);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [form, setForm] = useState({ question: "", answer: "" });
  const [saving, setSaving] = useState(false);

  /**
   * Why the last load failed, if it did.
   *
   * `load` used to hand every failure to `onSessionError`, which only acts on a
   * 401. A 500, a 503 or a dropped connection therefore vanished: `faqs` stayed
   * `null` and the panel showed its spinner forever, with no message and no way
   * to retry.
   */
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<FaqItemType[]>("/api/v1/faq");
      setFaqs(data.sort((a, b) => a.displayOrder - b.displayOrder));
      setLoadError(null);
    } catch (error) {
      if (sessionExpired(error)) {
        onSessionError(error);
        return;
      }
      setLoadError(
        error instanceof Error && error.message
          ? error.message
          : "Could not load FAQs.",
      );
    }
  }, [onSessionError]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  useRealtimePoll(load, undefined, "faq");

  const resetForm = () => {
    setEditingId(undefined);
    setForm({ question: "", answer: "" });
  };

  const startEdit = (faq: FaqItemType) => {
    setEditingId(faq.id);
    setForm({ question: faq.question, answer: faq.answer });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const ok = await publishAndFeedback(notify, onSessionError, () =>
        apiFetch<PublishResult>("/api/v1/admin/faq", {
          method: "POST",
          body: JSON.stringify({
            id: editingId,
            question: form.question,
            answer: form.answer,
            displayOrder: editingId ? undefined : (faqs?.length ?? 0) + 1,
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

  const remove = async (faq: FaqItemType) => {
    const ok = await confirm({
      title: "Delete this FAQ?",
      body: `“${faq.question}” will no longer appear in the contact section. This action cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/v1/admin/faq/${faq.id}`, { method: "DELETE" });
      notify("FAQ deleted.");
      await load();
    } catch (error) {
      onSessionError(error);
      notify("Could not delete FAQ.");
    }
  };

  return (
    <>
      {confirmDialog}
      <Panel
        title="Frequently Asked Questions"
        icon={<FileText className="size-5" />}
      >
        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-cream/50">
              {editingId ? "Edit FAQ" : "Add an FAQ"}
            </h3>
            <form onSubmit={submit} className="mt-4 space-y-4">
              <Field label="Question">
                <input
                  value={form.question}
                  onChange={(e) =>
                    setForm({ ...form, question: e.target.value })
                  }
                  required
                  className={inputBase}
                  placeholder="How do I become a member of the cooperative?"
                />
              </Field>
              <Field label="Answer">
                <textarea
                  rows={5}
                  value={form.answer}
                  onChange={(e) => setForm({ ...form, answer: e.target.value })}
                  required
                  className={`${inputBase} resize-none`}
                />
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
                  {editingId ? "Save changes" : "Add FAQ"}
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

          {/* A failed first load gets a retry. A failed refresh while we already hold
            data keeps the list and adds a banner. */}
          {loadError && !faqs && (
            <ErrorState
              title="Could not load FAQs"
              message={loadError}
              onRetry={() => void load()}
            />
          )}
          {loadError && faqs && (
            <p
              role="alert"
              className="rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-300 ring-1 ring-red-400/20"
            >
              Showing the last successful load. Could not refresh: {loadError}
            </p>
          )}

          {(!loadError || faqs) && (
            <ul className="space-y-3">
              {!faqs ? (
                <li className="grid place-items-center py-12 text-cream/50">
                  <Loader2 className="size-6 animate-spin" />
                </li>
              ) : faqs.length === 0 ? (
                <li className="rounded-2xl bg-white/5 px-4 py-10 text-center text-sm text-cream/50">
                  No FAQ items yet.
                </li>
              ) : (
                faqs.map((faq) => (
                  <li
                    key={faq.id}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.05] px-4 py-3 ring-1 ring-white/10"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {faq.question}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-[12px] text-cream/55">
                        {faq.answer}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(faq)}
                        className="btn btn-ghost-soft btn-sm"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(faq)}
                        aria-label="Delete FAQ"
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
