"use client";

/**
 * Shared admin UI primitives.
 *
 * These exist because the dashboard had drifted into two visual languages: the
 * bespoke panels in `AdminClient.tsx` were dark (`bg-white/[0.04]` over the forest
 * shell) while the extracted panels were light (`text-stone-900` on `stone-50`),
 * so eight of the twenty panels rendered near-invisible against the shell. Every
 * control below is defined once, against the brand tokens in `globals.css`, and
 * both halves of the dashboard use them.
 *
 * Restrained on purpose: one radius, one border treatment, no gradients and no
 * decorative shadows. A dense editing tool earns trust by being quiet.
 */
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  Ref,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Inbox, Loader2 } from "lucide-react";

/* ------------------------------------------------------------------ surfaces */

export function Panel({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl bg-white/[0.04] ring-1 ring-white/10 ${className}`}
    >
      {(title || action) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            {title && (
              <h2 className="font-display text-[15px] font-semibold text-cream">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-1 text-[13px] leading-relaxed text-cream/60">
                {description}
              </p>
            )}
          </div>
          {action && <div className="flex shrink-0 gap-2">{action}</div>}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------- buttons */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg font-semibold " +
  "transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-gold text-forest-deep hover:bg-gold-light",
  secondary:
    "bg-white/[0.06] text-cream ring-1 ring-white/15 hover:bg-white/[0.11]",
  ghost: "text-cream/75 hover:bg-white/[0.07] hover:text-cream",
  danger: "bg-red-600/90 text-white hover:bg-red-500",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-[13px]",
  md: "px-4 py-2.5 text-sm",
};

export function Button({
  variant = "secondary",
  size = "md",
  busy = false,
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  busy?: boolean;
  /** Forwarded to the underlying element — React 19 passes refs as props. */
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || busy}
      aria-busy={busy || undefined}
      className={`${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${
        BUTTON_SIZES[size]
      } ${className}`}
    >
      {busy && (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      )}
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------- fields */

const CONTROL =
  "w-full rounded-lg bg-white/[0.05] px-3 py-2.5 text-sm text-cream " +
  "ring-1 ring-white/15 transition-colors placeholder:text-cream/35 " +
  "hover:ring-white/25 focus:ring-2 focus:ring-gold focus:outline-none " +
  "disabled:opacity-50";

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  error?: string | null;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label
        htmlFor={htmlFor}
        className="text-[12px] font-semibold uppercase tracking-[0.08em] text-cream/60"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[12px] font-medium text-red-300">{error}</p>
      ) : hint ? (
        <p className="text-[12px] leading-relaxed text-cream/45">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={`${CONTROL} ${className}`} />;
}

export function Textarea({
  className = "",
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={`${CONTROL} min-h-24 ${className}`} />;
}

export function Select({
  className = "",
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={`${CONTROL} ${className}`}>
      {children}
    </select>
  );
}

/* -------------------------------------------------------------------- badges */

const BADGE_TONES = {
  neutral: "bg-white/[0.08] text-cream/70 ring-white/15",
  success: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/25",
  warning: "bg-amber-500/15 text-amber-300 ring-amber-400/25",
  danger: "bg-red-500/15 text-red-300 ring-red-400/25",
  info: "bg-sky-500/15 text-sky-300 ring-sky-400/25",
} as const;

export type BadgeTone = keyof typeof BADGE_TONES;

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] ring-1 ring-inset ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * One status vocabulary for the whole CMS. The brief asks for consistent
 * statuses; these four are the ones `ContentStatus` in the Prisma schema
 * actually defines, so nothing here can drift from what the API accepts.
 */
const STATUS_TONE: Record<string, BadgeTone> = {
  DRAFT: "neutral",
  IN_REVIEW: "warning",
  PUBLISHED: "success",
  ARCHIVED: "danger",
  PENDING: "warning",
  REVIEWED: "info",
  RESOLVED: "success",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  IN_REVIEW: "In review",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
  PENDING: "Pending",
  REVIEWED: "Reviewed",
  RESOLVED: "Resolved",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={STATUS_TONE[status] ?? "neutral"}>
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

/* ------------------------------------------------------------------- states */

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      className="flex items-center justify-center gap-3 px-5 py-12 text-sm text-cream/60"
      role="status"
    >
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      {label}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
      <span
        className="grid size-10 place-items-center rounded-full bg-white/[0.06] text-cream/50"
        aria-hidden="true"
      >
        <Inbox className="size-5" />
      </span>
      <div>
        <p className="text-sm font-semibold text-cream">{title}</p>
        {description && (
          <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-cream/55">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

/**
 * Panels previously reported every failure — 403, 404, 409, 503 — by rendering
 * the same "not found yet" empty state, so a permission problem looked identical
 * to an empty database. This makes the failure explicit and retryable.
 */
export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-xl bg-red-500/10 px-5 py-10 text-center ring-1 ring-red-400/25"
      role="alert"
    >
      <span className="text-red-300" aria-hidden="true">
        <AlertTriangle className="size-6" />
      </span>
      <div>
        <p className="text-sm font-semibold text-red-200">{title}</p>
        {message && (
          <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-red-200/80">
            {message}
          </p>
        )}
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- confirmation */

export type ConfirmOptions = {
  title: string;
  /** What will happen, and whether it can be undone. */
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red for anything that removes or hides content. */
  destructive?: boolean;
};

/**
 * Replaces the `window.confirm` calls the panels used previously.
 *
 * The native dialog was wrong in three ways: it is unstyled and breaks the
 * visual language, it cannot explain what is being affected, and it is not
 * announced reliably. This one is labelled, traps focus, closes on Escape or
 * backdrop click, and moves focus to Cancel so a stray Enter cannot destroy a
 * record.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmOptions & {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCancel();
        return;
      }
      if (event.key !== "Tab") return;
      // Keep Tab inside the dialog; only two controls, so this is a short cycle.
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>("button");
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4">
      <button
        type="button"
        aria-label={cancelLabel}
        tabIndex={-1}
        onClick={onCancel}
        className="absolute inset-0 bg-forest-deep/80 backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={body ? "confirm-body" : undefined}
        className="relative w-full max-w-md rounded-2xl bg-forest p-6 shadow-glass ring-1 ring-white/15"
      >
        <h2
          id="confirm-title"
          className="font-display text-base font-semibold text-cream"
        >
          {title}
        </h2>
        {body && (
          <p
            id="confirm-body"
            className="mt-2 text-sm leading-relaxed text-cream/65"
          >
            {body}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button ref={cancelRef} variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "danger" : "primary"}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Promise-based confirm, so an existing `if (!(await confirm(...))) return;`
 * guard is the only change a handler needs.
 *
 * Render the returned `dialog` once per component — it renders nothing until a
 * call is in flight.
 */
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const settle = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback(
    (next: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        settle.current = resolve;
        setOptions(next);
      }),
    []
  );

  const close = useCallback((result: boolean) => {
    settle.current?.(result);
    settle.current = null;
    setOptions(null);
  }, []);

  const dialog = (
    <ConfirmDialog
      open={options !== null}
      title={options?.title ?? ""}
      body={options?.body}
      confirmLabel={options?.confirmLabel}
      cancelLabel={options?.cancelLabel}
      destructive={options?.destructive}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  );

  return { confirm, dialog };
}

/* --------------------------------------------------------------------- misc */

export function Toolbar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-5 py-3">
      {children}
    </div>
  );
}

/** Small definition used in the collapsed sidebar and read-only detail rows. */
export function Meta({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-cream/45">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-sm text-cream/85">{value}</dd>
    </div>
  );
}
