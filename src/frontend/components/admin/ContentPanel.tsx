/**
 * Generic editorial panel: list, filter, create, edit, transition and archive.
 *
 * One component serves every content type in `TYPE_CONFIGS`, so adding a new
 * type is a config change rather than a new screen. All mutations go through the
 * CMS API, which re-checks permissions, legal status transitions and optimistic
 * concurrency regardless of what this UI allows.
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AdminApiError,
  archiveContent,
  listContent,
  restoreContent,
  saveContent,
  CONTENT_STATUSES,
  STATUS_TRANSITIONS,
  type ContentRecord,
  type ContentStatus,
  type ContentType,
  type Paginated,
} from "@/shared/admin-api";
import { useConfirm } from "@/frontend/components/admin/ui";
import {
  FIELD_GROUPS,
  toFormValues,
  toPayload,
  TYPE_CONFIGS,
  type FieldDef,
  type RelationSource,
  type TypeConfig,
} from "@/shared/admin-fields";

type Props = {
  type: ContentType;
  /** Set when the signed-in user may change publication status. */
  canPublish: boolean;
  /** Set when the signed-in user may archive content. */
  canDelete: boolean;
  /** Set for Super Administrators, who may restore archived records. */
  canRestore: boolean;
};

const STATUS_STYLES: Record<ContentStatus, string> = {
  DRAFT: "bg-white/[0.06] text-cream/80",
  IN_REVIEW: "bg-amber-500/15 text-amber-300",
  PUBLISHED: "bg-emerald-500/15 text-emerald-300",
  ARCHIVED: "bg-white/[0.08] text-cream/50",
};

const STATUS_LABELS: Record<ContentStatus, string> = {
  DRAFT: "Draft",
  IN_REVIEW: "In review",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

/**
 * Statuses that put a record on the public site. The API treats creating one of
 * these as a publish action, so they are what a role without `publishContent`
 * must not be offered.
 */
const LIVE_STATUSES: readonly ContentStatus[] = ["PUBLISHED", "ARCHIVED"];

export function ContentPanel({
  type,
  canPublish,
  canDelete,
  canRestore,
}: Props) {
  const config = TYPE_CONFIGS[type];
  const [result, setResult] = useState<Paginated<ContentRecord> | null>(null);
  const [status, setStatus] = useState<ContentStatus | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ContentRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(
        await listContent<ContentRecord>(type, { status, q: search, page }),
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load content.",
      );
    } finally {
      setLoading(false);
    }
  }, [type, status, search, page]);

  useEffect(() => {
    void load();
  }, [load]);

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 4000);
  }

  const { confirm, dialog: confirmDialog } = useConfirm();

  async function onArchive(record: ContentRecord) {
    const title = String(record[config.titleField] ?? "this item");
    const ok = await confirm({
      // Was mojibake — `Archive ?${title}??` — where the intended double quotes had
      // been mangled. The quotation marks are now the ones the other panels use
      // (`Delete "${location.name}"?`).
      title: `Archive "${title}"?`,
      body: "It is removed from the public site. A Super Administrator can restore it afterwards.",
      confirmLabel: "Archive",
      destructive: true,
    });
    if (!ok) return;
    try {
      await archiveContent(type, record.id);
      flash("Archived.");
      setEditing(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not archive.");
    }
  }

  async function onRestore(record: ContentRecord) {
    try {
      await restoreContent(type, record.id);
      flash("Restored as a draft.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not restore.");
    }
  }

  const rows = result?.items ?? [];

  return (
    <div className="space-y-6">
      {confirmDialog}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-cream">{config.label}</h2>
          <p className="mt-1 max-w-2xl text-sm text-cream/65">
            {config.description}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreating(true);
            setEditing(null);
          }}
          className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-forest-deep transition-colors hover:bg-gold-light"
        >
          New {config.singular}
        </button>
      </header>

      {notice && (
        // Was `bg-emerald-50` — a near-white background — with `text-emerald-300`,
        // a light green. That is roughly 1.2:1 contrast, so the confirmation that
        // an edit was saved rendered as invisible text on the dark panel. The
        // tokens now match the dark theme, as the error notice below already did.
        // `role="status"` announces it politely instead of interrupting.
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

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setSearch(query.trim());
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <label className="flex flex-col text-sm">
          <span className="mb-1 font-medium text-cream/80">Status</span>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as ContentStatus | "ALL");
              setPage(1);
            }}
            className="rounded-lg border border-white/20 px-3 py-2"
          >
            <option value="ALL">All</option>
            {CONTENT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col text-sm">
          <span className="mb-1 font-medium text-cream/80">Search</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search titles…"
            className="rounded-lg border border-white/20 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg border border-white/20 px-4 py-2 text-sm font-medium hover:bg-white/[0.04]"
        >
          Apply
        </button>
      </form>

      {/* The `key` is load-bearing. `ContentForm` seeds its state from `record`
          once, in the `useState` initialiser, so without a key React reuses the
          same instance when the props change and the form keeps showing the
          previous record's values. Editing article A, cancelling, then editing
          article B would then write A's title and body onto B — because the save
          carries B's id but A's values. Keying by the record being edited forces a
          fresh instance, and covers the create/edit transition the same way. */}
      {creating && (
        <ContentForm
          key="create"
          config={config}
          canPublish={canPublish}
          onCancel={() => setCreating(false)}
          onSaved={async (message) => {
            setCreating(false);
            flash(message);
            await load();
          }}
        />
      )}

      {editing && (
        <ContentForm
          key={editing.id}
          config={config}
          record={editing}
          canPublish={canPublish}
          onCancel={() => setEditing(null)}
          onSaved={async (message) => {
            setEditing(null);
            flash(message);
            await load();
          }}
          onDelete={canDelete ? () => onArchive(editing) : undefined}
        />
      )}

      {loading ? (
        <p className="text-sm text-cream/50">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-white/20 px-4 py-8 text-center text-sm text-cream/50">
          No {config.label.toLowerCase()} yet. Create the first one.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[0.04] text-xs uppercase tracking-wide text-cream/50">
              <tr>
                <th className="px-4 py-3 font-medium">Title</th>
                {config.listMeta?.map((meta) => (
                  <th key={meta.field} className="px-4 py-3 font-medium">
                    {meta.label}
                  </th>
                ))}
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Updated</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.07]">
              {rows.map((record) => {
                const archived = record.status === "ARCHIVED";
                return (
                  <tr key={record.id} className="align-top">
                    <td className="px-4 py-3 font-medium text-cream">
                      {String(record[config.titleField] ?? "Untitled")}
                    </td>
                    {config.listMeta?.map((meta) => (
                      <td key={meta.field} className="px-4 py-3 text-cream/65">
                        {formatMeta(record, meta.field)}
                      </td>
                    ))}
                    <td className="px-4 py-3">
                      {record.status ? (
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                            STATUS_STYLES[record.status]
                          }`}
                        >
                          {STATUS_LABELS[record.status]}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-cream/65">
                      {formatDate(String(record.updatedAt ?? ""))}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {archived && canRestore ? (
                          <button
                            type="button"
                            onClick={() => onRestore(record)}
                            className="rounded-md border border-white/20 px-2 py-1 text-xs text-cream bg-white/[0.05] text-cream placeholder:text-cream/35 transition-colors focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/20 hover:bg-white/[0.08]"
                          >
                            Restore
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(record);
                            setCreating(false);
                          }}
                          className="rounded-md border border-white/20 px-2 py-1 text-xs text-cream bg-white/[0.05] text-cream placeholder:text-cream/35 transition-colors focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/20 hover:bg-white/[0.08]"
                        >
                          Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {result && result.totalPages > 1 && (
        <nav
          className="flex items-center justify-between text-sm"
          aria-label="Pagination"
        >
          <p className="text-cream/65">
            Page {result.page} of {result.totalPages} · {result.total} total
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!result.hasPrevious}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-md border border-white/20 px-3 py-1 bg-white/[0.05] text-cream placeholder:text-cream/35 transition-colors focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/20 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!result.hasNext}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-white/20 px-3 py-1 bg-white/[0.05] text-cream placeholder:text-cream/35 transition-colors focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/20 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}

/** Renders a list column that may be a plain value, date, or byte count. */
function formatMeta(record: ContentRecord, field: string): string {
  const value = record[field];
  if (value === undefined || value === null || value === "") return "—";
  if (field === "fileSizeBytes") return formatBytes(Number(value));
  if (field.endsWith("At") || field.endsWith("Date"))
    return formatDate(String(value));
  return String(value);
}

function formatDate(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

type FormProps = {
  config: TypeConfig;
  record?: ContentRecord | null;
  canPublish: boolean;
  onCancel: () => void;
  onSaved: (message: string) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
};

/**
 * Renders the create/edit form for a content type from its field config.
 * Grouped fields sit behind collapsible sections so the default view stays short.
 */
/**
 * Loads the options for relation selects, keyed by field name.
 *
 * A relation target set is data, not configuration — which photo belongs to
 * which album changes as the CMS is used — so these options are fetched when a
 * form opens rather than declared in `admin-fields.ts`. A failure is reported
 * inline instead of blocking the form, because the rest of the record is still
 * editable while the target list is unavailable.
 */
function useRelationOptions(config: TypeConfig): {
  options: Record<string, { value: string; label: string }[]>;
  failed: string[];
} {
  const sources = useMemo(() => {
    const found = new Map<string, RelationSource>();
    for (const field of config.fields) {
      if (field.optionsFrom) found.set(field.name, field.optionsFrom);
    }
    return [...found.entries()];
  }, [config.fields]);

  const [options, setOptions] = useState<
    Record<string, { value: string; label: string }[]>
  >({});
  const [failed, setFailed] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (sources.length === 0) {
      setOptions({});
      setFailed([]);
      return;
    }

    async function load() {
      const loaded: Record<string, { value: string; label: string }[]> = {};
      const broken: string[] = [];

      await Promise.all(
        sources.map(async ([fieldName, source]) => {
          try {
            const page = await listContent<ContentRecord>(source.type, {
              pageSize: 100,
            });
            // The list endpoints order by most recently updated, which is the
            // wrong order for a picker. Sort by the visible label instead so
            // editors find an album by name.
            const choices = page.items
              .map((item) => ({
                value: String(item[source.valueField] ?? ""),
                label: String(item[source.labelField] ?? item.id),
              }))
              .filter((choice) => choice.value)
              .sort((a, b) => a.label.localeCompare(b.label));
            loaded[fieldName] = source.nullable
              ? [{ value: "", label: "None" }, ...choices]
              : choices;
          } catch {
            broken.push(fieldName);
            loaded[fieldName] = [];
          }
        }),
      );

      if (cancelled) return;
      setOptions(loaded);
      setFailed(broken);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [sources]);

  return { options, failed };
}

function ContentForm({
  config,
  record,
  canPublish,
  onCancel,
  onSaved,
  onDelete,
}: FormProps) {
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    toFormValues(record ?? null, config),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const { options: relationOptions, failed: relationFailures } =
    useRelationOptions(config);

  const isEdit = Boolean(record);
  const currentStatus =
    (record?.status as ContentStatus | undefined) ?? "DRAFT";

  /**
   * Statuses the server will actually accept for this user on this record.
   *
   * Publishing is a separate permission from editing, and the API rejects a
   * status change from anyone without it. Offering the full list to an Editor
   * therefore produced a form that looked valid and then failed with a 403 on
   * save, so the picker is narrowed to match what the API permits:
   *   - creating: an Editor may file a draft or send it for review, but not
   *     create live content;
   *   - editing: an Editor cannot move a record at all, so the current value is
   *     the only option.
   */
  const allowedStatuses = useMemo(() => {
    const statusField = config.fields.find((f) => f.name === "status");
    const all =
      statusField?.options?.map((o) => o.value as ContentStatus) ??
      CONTENT_STATUSES;

    if (isEdit) {
      if (!canPublish) return all.filter((value) => value === currentStatus);
      return all.filter(
        (value) =>
          value === currentStatus ||
          STATUS_TRANSITIONS[currentStatus].includes(value),
      );
    }

    return canPublish
      ? all
      : all.filter((value) => !LIVE_STATUSES.includes(value));
  }, [canPublish, isEdit, currentStatus, config.fields]);

  const baseFields = config.fields.filter((f) => !f.group);
  const groupedFields = (group: FieldDef["group"]) =>
    config.fields.filter((f) => f.group === group);

  function set(name: string, value: unknown) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setFieldError(null);
    try {
      const payload = toPayload(values, config);
      if (record) {
        payload.id = record.id;
        // Optimistic concurrency: the server rejects the write if the record
        // changed since it was loaded.
        if (record.updatedAt)
          payload.baseUpdatedAt = new Date(
            String(record.updatedAt),
          ).toISOString();
      }
      await saveContent(config.type, payload);
      await onSaved(isEdit ? "Changes saved." : `${config.singular} created.`);
    } catch (caught) {
      if (caught instanceof AdminApiError) {
        setError(caught.message);
        setFieldError(caught.field ?? null);
      } else {
        setError("Could not save. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-6 rounded-lg border border-white/10 bg-white/[0.04] p-5"
    >
      <h3 className="text-lg font-semibold text-cream">
        {isEdit ? `Edit ${config.singular}` : `New ${config.singular}`}
      </h3>

      {error && (
        <p
          className="rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-300 ring-1 ring-red-400/20"
          role="alert"
        >
          {error}
          {fieldError ? ` (${fieldError})` : ""}
        </p>
      )}

      {relationFailures.length > 0 && (
        <p
          className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-300"
          role="status"
        >
          Could not load the list for{" "}
          {relationFailures
            .map(
              (name) =>
                config.fields.find((f) => f.name === name)?.label ?? name,
            )
            .join(", ")}
          . Leave it as none and ask an administrator to check the setting.
        </p>
      )}

      <fieldset className="space-y-4">
        <legend className="sr-only">Main fields</legend>
        {baseFields.map((field) => (
          <Field
            key={field.name}
            field={field}
            value={values[field.name]}
            invalid={fieldError === field.name}
            allowed={field.name === "status" ? allowedStatuses : undefined}
            options={relationOptions[field.name]}
            onChange={(value) => set(field.name, value)}
          />
        ))}
      </fieldset>

      {FIELD_GROUPS.map((group) => {
        const fields = groupedFields(group.id);
        if (fields.length === 0) return null;
        return (
          <details
            key={group.id}
            className="rounded-lg border border-white/10 bg-white/[0.03] p-4"
          >
            <summary className="cursor-pointer text-sm font-medium text-cream/90">
              {group.label}
            </summary>
            <div className="mt-4 space-y-4">
              {fields.map((field) => (
                <Field
                  key={field.name}
                  field={field}
                  value={values[field.name]}
                  invalid={fieldError === field.name}
                  allowed={
                    field.name === "status" ? allowedStatuses : undefined
                  }
                  options={relationOptions[field.name]}
                  onChange={(value) => set(field.name, value)}
                />
              ))}
            </div>
          </details>
        );
      })}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-forest-deep transition-colors hover:bg-gold-light disabled:opacity-50"
        >
          {saving
            ? "Saving…"
            : isEdit
              ? "Save changes"
              : `Create ${config.singular}`}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-white/20 px-4 py-2 text-sm font-medium hover:bg-white/[0.04]"
        >
          Cancel
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="ml-auto rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Archive
          </button>
        )}
        {!canPublish && (
          <p className="text-xs text-cream/50">
            Your role can edit drafts but not change publication status.
          </p>
        )}
      </div>
    </form>
  );
}

type FieldProps = {
  field: FieldDef;
  value: unknown;
  invalid: boolean;
  /** For a select: the values the server will currently accept. */
  allowed?: readonly string[];
  /** For a relation select: options loaded at runtime, overriding any static list. */
  options?: readonly { value: string; label: string }[];
  onChange: (value: unknown) => void;
};

/** Renders one control based on its declared kind. */
function Field({
  field,
  value,
  invalid,
  allowed,
  options: loaded,
  onChange,
}: FieldProps) {
  const id = `field-${field.name}`;
  const describedBy = field.help ? `${id}-help` : undefined;
  const invalidStyle = invalid ? "border-red-400" : "border-white/20";

  const label = (
    <label
      htmlFor={id}
      className="mb-1 block text-sm font-medium text-cream/80"
    >
      {field.label}
      {field.required && <span className="ml-1 text-red-400">*</span>}
    </label>
  );
  const help = field.help ? (
    <p id={describedBy} className="mt-1 text-xs text-cream/50">
      {field.help}
    </p>
  ) : null;

  switch (field.kind) {
    case "checkbox":
      return (
        <div className="flex flex-col gap-1">
          {/* A real `<label htmlFor>`: the visible text was a sibling `<span>`,
              which gives a checkbox no accessible name at all — a screen reader
              announces an unlabelled "checkbox, unchecked" with no indication of
              what it toggles. `help` is deliberately outside the label so the
              explanatory sentence does not become part of the field's name. */}
          <div className="flex items-center gap-2">
            <input
              id={id}
              type="checkbox"
              checked={Boolean(value)}
              onChange={(event) => onChange(event.target.checked)}
              className="size-4 rounded border-white/20"
            />
            <label htmlFor={id} className="text-sm text-cream/80">
              {field.label}
              {field.required && <span className="ml-1 text-red-400">*</span>}
            </label>
          </div>
          {help}
        </div>
      );

    case "select": {
      // Only offer transitions the server accepts from the record's current
      // state, so an editor is never able to submit a change that 400s. A
      // relation select takes its options from the loaded list instead, which is
      // not subject to that status filter.
      const source = loaded ?? field.options;
      const options = loaded
        ? loaded
        : source?.filter(
            (option) => !allowed || allowed.includes(option.value),
          );
      return (
        <div>
          {label}
          <select
            id={id}
            value={String(value ?? "")}
            aria-describedby={describedBy}
            onChange={(event) => onChange(event.target.value)}
            className={`w-full rounded-lg border px-3 py-2 text-sm ${invalidStyle}`}
          >
            {options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {help}
        </div>
      );
    }

    case "textarea":
    case "html":
      return (
        <div>
          {label}
          <textarea
            id={id}
            rows={field.rows ?? (field.kind === "html" ? 14 : 4)}
            aria-describedby={describedBy}
            placeholder={field.placeholder}
            value={String(value ?? "")}
            onChange={(event) => onChange(event.target.value)}
            className={`w-full rounded-lg border px-3 py-2 font-mono text-sm ${invalidStyle}`}
          />
          {help}
        </div>
      );

    case "tags":
    case "lines":
      return (
        <div>
          {label}
          <TagInput
            id={id}
            describedBy={describedBy}
            value={Array.isArray(value) ? value.map(String) : []}
            onChange={onChange}
            placeholder={field.placeholder}
          />
          {help}
        </div>
      );

    default:
      return (
        <div>
          {label}
          <input
            id={id}
            type={
              field.kind === "number"
                ? "number"
                : field.kind === "date"
                  ? "date"
                  : field.kind === "datetime"
                    ? "datetime-local"
                    : "text"
            }
            aria-describedby={describedBy}
            placeholder={field.placeholder}
            value={String(value ?? "")}
            onChange={(event) => onChange(event.target.value)}
            className={`w-full rounded-lg border px-3 py-2 text-sm ${invalidStyle}`}
          />
          {help}
        </div>
      );
  }
}

/**
 * Editable list of strings (tags, partners) stored as a comma-separated string
 * in the input so staff can type several values at once.
 */
function TagInput({
  id,
  describedBy,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  describedBy?: string;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState(value.join(", "));

  return (
    <input
      id={id}
      type="text"
      aria-describedby={describedBy}
      placeholder={placeholder ?? "Comma separated"}
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        onChange(
          event.target.value
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean),
        );
      }}
      className="w-full rounded-lg border border-white/20 px-3 py-2 text-sm bg-white/[0.05] text-cream placeholder:text-cream/35 transition-colors focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/20$select"
    />
  );
}
