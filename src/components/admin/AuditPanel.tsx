/**
 * Activity log screen. Shows the audit trail of CMS changes: who did what, when,
 * and with what outcome. Super Administrators only, because the trail records
 * account and permission changes.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { listAudit, type AuditEntry } from "@/lib/admin-api";

/** Distinctive colour per action so the log can be scanned quickly. */
const ACTION_STYLES: Record<string, string> = {
  CREATE: "bg-emerald-500/15 text-emerald-300",
  UPDATE: "bg-sky-500/15 text-sky-300",
  STATUS_CHANGE: "bg-amber-500/15 text-amber-300",
  DELETE: "bg-red-500/15 text-red-300",
  LOGIN: "bg-white/[0.06] text-cream/80",
  LOGIN_FAILED: "bg-red-500/15 text-red-300",
  DELETE_USER: "bg-red-500/15 text-red-300",
  UPDATE_USER: "bg-sky-500/15 text-sky-300",
  CREATE_USER: "bg-emerald-500/15 text-emerald-300",
  UPLOAD: "bg-violet-500/15 text-violet-300",
};

const ACTION_LABELS: Record<string, string> = {
  LOGIN_FAILED: "Failed sign-in",
  DELETE_USER: "User removed",
  UPDATE_USER: "User updated",
  CREATE_USER: "User created",
  STATUS_CHANGE: "Status changed",
};

export function AuditPanel() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState("ALL");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await listAudit(100));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the activity log.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const actions = Array.from(new Set(entries.map((entry) => entry.action))).sort();
  const visible = action === "ALL" ? entries : entries.filter((e) => e.action === action);

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold text-cream">Activity log</h2>
        <p className="mt-1 max-w-2xl text-sm text-cream/65">
          The 100 most recent CMS changes, newest first. Select an entry to see the
          record before and after the change.
        </p>
      </header>

      {error && (
        <p className="rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-300 ring-1 ring-red-400/20" role="alert">
          {error}
        </p>
      )}

      {entries.length > 0 && (
        <label className="flex max-w-xs flex-col text-sm">
          <span className="mb-1 font-medium text-cream/80">Filter by action</span>
          <select
            value={action}
            onChange={(event) => setAction(event.target.value)}
            className="rounded-lg border border-white/20 px-3 py-2"
          >
            <option value="ALL">All actions</option>
            {actions.map((value) => (
              <option key={value} value={value}>
                {ACTION_LABELS[value] ?? value.replace(/_/g, " ").toLowerCase()}
              </option>
            ))}
          </select>
        </label>
      )}

      {loading ? (
        <p className="text-sm text-cream/50">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-white/20 px-4 py-8 text-center text-sm text-cream/50">
          No activity recorded yet.
        </p>
      ) : (
        <ul className="divide-y divide-white/[0.07] overflow-hidden rounded-lg border border-white/10">
          {visible.map((entry) => {
            const open = expanded === entry.id;
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : entry.id)}
                  aria-expanded={open}
                  className="flex w-full flex-wrap items-start gap-3 px-4 py-3 text-left hover:bg-white/[0.04]"
                >
                  <span
                    className={`mt-0.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                      ACTION_STYLES[entry.action] ?? "bg-white/[0.06] text-cream/80"
                    }`}
                  >
                    {ACTION_LABELS[entry.action] ?? entry.action}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-cream">{entry.summary}</span>
                    <span className="block text-xs text-cream/50">
                      {entry.actor?.name ?? "System"} ·{" "}
                      {new Date(entry.createdAt).toLocaleString("en-GB")}
                    </span>
                  </span>
                </button>
                {open && (
                  <div className="grid gap-3 border-t border-white/[0.07] bg-white/[0.04] px-4 py-3 sm:grid-cols-2">
                    <JsonBlock label="Before" value={entry.before} />
                    <JsonBlock label="After" value={entry.after} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-cream/50">{label}</p>
      <pre className="max-h-56 overflow-auto rounded border border-white/10 bg-black/30 p-2 text-xs text-cream/80">
        {format(value)}
      </pre>
    </div>
  );
}

/** Renders a value as readable JSON, never throwing on circular structures. */
function format(value: unknown): string {
  if (value === null || value === undefined) return "—";
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}
