/**
 * User management screen. Super Administrators only — the API enforces this as
 * well, and a 403 is surfaced as a message rather than a broken screen.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AdminApiError,
  createUser,
  deleteUser,
  listUsers,
  resetUserPassword,
  updateUser,
  type AdminUser,
} from "@/shared/admin-api";
import { useConfirm } from "@/frontend/components/admin/ui";

const ROLES: readonly { value: AdminUser["role"]; label: string }[] = [
  { value: "SUPER_ADMIN", label: "Super Administrator" },
  { value: "CONTENT_ADMIN", label: "Content Administrator" },
  { value: "EDITOR", label: "Editor" },
];

const ROLE_NOTES: Record<AdminUser["role"], string> = {
  SUPER_ADMIN:
    "Full control, including user accounts and restoring archived content.",
  CONTENT_ADMIN:
    "Manages all content and settings. Cannot manage user accounts.",
  EDITOR:
    "Drafts and edits content. Cannot publish, archive or change settings.",
};

export function UsersPanel({ currentUserId }: { currentUserId?: string }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<AdminUser | null>(null);
  /**
   * Which account has a write in flight.
   *
   * Without this the role `<select>` stayed live during the round trip, so
   * picking a second role before the first landed raced two PATCHes and the
   * panel ended up showing whichever response arrived last — not necessarily the
   * last choice.
   */
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listUsers();
      setUsers(result.items);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load users.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 4000);
  }

  const { confirm, dialog: confirmDialog } = useConfirm();

  async function changeRole(user: AdminUser, role: AdminUser["role"]) {
    // The select is controlled off `user.role`, so the DOM has already moved to
    // the new value by the time this runs. Bail out on a no-op so a stray event
    // cannot issue a pointless write.
    if (role === user.role) return;

    setPendingId(user.id);
    try {
      await updateUser(user.id, { role });
      flash(
        `${user.name} is now a ${ROLES.find((r) => r.value === role)?.label}.`,
      );
      await load();
    } catch (caught) {
      // `user.role` never changed, so the controlled select snaps back to the
      // real role on this render. No manual revert needed.
      setError(
        caught instanceof Error ? caught.message : "Could not change role.",
      );
    } finally {
      setPendingId(null);
    }
  }

  async function toggleActive(user: AdminUser) {
    const next = !user.isActive;
    const ok = await confirm({
      title: next ? `Re-enable ${user.name}?` : `Deactivate ${user.name}?`,
      body: next
        ? "They will be able to sign in to the CMS again immediately."
        : "Their current session is revoked immediately. Their authored content is kept.",
      confirmLabel: next ? "Re-enable" : "Deactivate",
      destructive: !next,
    });
    if (!ok) return;

    try {
      await updateUser(user.id, { isActive: next });
      flash(`${user.name} ${next ? "reactivated" : "deactivated"}.`);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not update account.",
      );
    }
  }

  /**
   * Removes an account outright, as distinct from deactivating it.
   *
   * Both are offered, and they are not near-substitutes. Deactivation keeps the
   * account and its authored content: the person can sign in again, and history
   * stays attributed to a real account. Deletion destroys the row, so anything
   * the user wrote becomes unattributable. The prompt says so, because
   * "Delete" next to "Deactivate" on the same row is otherwise a coin toss.
   */
  async function deleteAccount(user: AdminUser) {
    const authored = user._count?.articles ?? 0;
    const ok = await confirm({
      title: `Delete ${user.name}?`,
      body:
        `This permanently removes the CMS account. The user will lose access immediately and ` +
        `this cannot be undone.` +
        (authored
          ? ` Their ${authored} article${authored === 1 ? "" : "s"} will stay online but no longer be attributed to a user account.`
          : ` To keep the person's history attributed to a real account, deactivate them instead.`),
      confirmLabel: "Delete account",
      destructive: true,
    });
    if (!ok) return;

    setPendingId(user.id);
    try {
      await deleteUser(user.id);
      flash(`${user.name}'s account has been deleted.`);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not delete the account.",
      );
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {confirmDialog}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-cream">User accounts</h2>
          <p className="mt-1 max-w-2xl text-sm text-mist">
            Create CMS accounts and control what each role can do. Deactivating an
            account signs it out immediately without waiting for its token to
            expire, and keeps their authored content attributed to them. Deleting
            removes the account permanently. Your own account cannot be deleted —
            another Super Administrator must do it.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-coffee transition-colors hover:bg-gold-light"
        >
          New user
        </button>
      </header>

      {notice && (
        // Same contrast bug as `ContentPanel`: `bg-emerald-50` is a near-white
        // background and `text-action-light` is a light green, so the saved
        // confirmation was invisible against the dark panel. `role="status"`
        // announces it politely.
        <p
          role="status"
          className="rounded-lg bg-action/15 px-4 py-2 text-sm text-action-light ring-1 ring-brand/25"
        >
          {notice}
        </p>
      )}
      {error && (
        <p
          className="rounded-lg bg-cherry/10 px-4 py-2 text-sm text-cherry-light ring-1 ring-cherry/20"
          role="alert"
        >
          {error}
        </p>
      )}

      {creating && (
        <UserForm
          onCancel={() => setCreating(false)}
          onSaved={async (message) => {
            setCreating(false);
            flash(message);
            await load();
          }}
        />
      )}

      {resetting && (
        <PasswordForm
          user={resetting}
          onCancel={() => setResetting(null)}
          onSaved={async (message) => {
            setResetting(null);
            flash(message);
          }}
        />
      )}

      {loading ? (
        <p className="text-sm text-mist">Loading…</p>
      ) : (
        <ul className="space-y-3">
          {users.map((user) => {
            const isSelf = user.id === currentUserId;
            return (
              <li
                key={user.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-white/10 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-cream">
                    {user.name}
                    {isSelf && (
                      <span className="ml-2 text-xs text-mist">(you)</span>
                    )}
                    {!user.isActive && (
                      <span className="ml-2 rounded bg-white/[0.08] px-1.5 py-0.5 text-xs text-mist">
                        Deactivated
                      </span>
                    )}
                  </p>
                  <p className="truncate text-sm text-mist">{user.email}</p>
                  <p className="text-xs text-mist">
                    {user.lastLoginAt
                      ? `Last signed in ${new Date(user.lastLoginAt).toLocaleDateString("en-GB")}`
                      : "Never signed in"}
                    {user._count ? ` · ${user._count.articles} articles` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor={`role-${user.id}`}>
                    Role for {user.name}
                  </label>
                  <select
                    id={`role-${user.id}`}
                    value={user.role}
                    title={
                      isSelf
                        ? "You cannot change your own role. Ask another Super Administrator to do it."
                        : ROLE_NOTES[user.role]
                    }
                    disabled={isSelf || pendingId === user.id}
                    onChange={(event) =>
                      changeRole(user, event.target.value as AdminUser["role"])
                    }
                    className="rounded-lg border border-white/20 px-2 py-1 text-sm bg-white/[0.05] text-cream placeholder:text-mist transition-colors focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/20 disabled:cursor-not-allowed disabled:opacity-50 [&_option]:bg-forest [&_option]:text-cream"
                  >
                    {ROLES.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                  {isSelf && (
                    // The selector is disabled because the server rejects this
                    // exact change with 403 ("You cannot remove your own Super
                    // Administrator access"). Offering it as a live option could
                    // only ever produce a guaranteed error, and a `title` tooltip
                    // is not discoverable on touch — so the reason is stated in
                    // text next to the control.
                    <span className="text-xs text-mist">
                      Another Super Administrator must change your role
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setResetting(user)}
                    className="rounded-md border border-white/20 px-2 py-1 text-xs text-cream bg-white/[0.05] text-cream placeholder:text-mist transition-colors focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/20 hover:bg-white/[0.08]"
                  >
                    Reset password
                  </button>
                  {!isSelf && (
                    <button
                      type="button"
                      onClick={() => toggleActive(user)}
                      disabled={pendingId === user.id}
                      className={`rounded-md border px-2 py-1 text-xs disabled:opacity-50 ${
                        user.isActive
                          ? "border-cherry/50/30 text-cherry-light hover:bg-cherry/15"
                          : "border-brand/30 text-action-light hover:bg-action/15"
                      }`}
                    >
                      {user.isActive ? "Deactivate" : "Reactivate"}
                    </button>
                  )}
                  {!isSelf && (
                    <button
                      type="button"
                      onClick={() => deleteAccount(user)}
                      disabled={pendingId === user.id}
                      className="rounded-md border border-cherry/50/30 px-2 py-1 text-xs text-cherry-light transition-colors hover:bg-cherry/15 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function UserForm({
  onCancel,
  onSaved,
}: {
  onCancel: () => void;
  onSaved: (message: string) => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AdminUser["role"]>("EDITOR");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createUser({ name, email, password, role });
      await onSaved(`${name} can now sign in.`);
    } catch (caught) {
      setError(
        caught instanceof AdminApiError
          ? caught.message
          : "Could not create the account.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-lg border border-white/10 bg-white/[0.04] p-5"
    >
      <h3 className="text-lg font-semibold text-cream">New user</h3>
      {error && (
        <p
          className="rounded-lg bg-cherry/10 px-4 py-2 text-sm text-cherry-light ring-1 ring-cherry/20"
          role="alert"
        >
          {error}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-cream/80">
            Full name
          </span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            className="w-full rounded-lg border border-white/20 px-3 py-2 bg-white/[0.05] text-cream placeholder:text-mist transition-colors focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/20 [&_option]:bg-forest [&_option]:text-cream"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-cream/80">Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className="w-full rounded-lg border border-white/20 px-3 py-2 bg-white/[0.05] text-cream placeholder:text-mist transition-colors focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/20 [&_option]:bg-forest [&_option]:text-cream"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-cream/80">
            Temporary password
          </span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={12}
            autoComplete="new-password"
            className="w-full rounded-lg border border-white/20 px-3 py-2 bg-white/[0.05] text-cream placeholder:text-mist transition-colors focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/20 [&_option]:bg-forest [&_option]:text-cream"
          />
          <span className="mt-1 block text-xs text-mist">
            At least 12 characters, including upper case, lower case and a
            number.
          </span>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-cream/80">Role</span>
          <select
            value={role}
            onChange={(event) =>
              setRole(event.target.value as AdminUser["role"])
            }
            className="w-full rounded-lg border border-white/20 px-3 py-2 bg-white/[0.05] text-cream placeholder:text-mist transition-colors focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/20 [&_option]:bg-forest [&_option]:text-cream"
          >
            {ROLES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-mist">
            {ROLE_NOTES[role]}
          </span>
        </label>
      </div>
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-coffee transition-colors hover:bg-gold-light disabled:opacity-50"
        >
          {saving ? "Creating…" : "Create user"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-white/20 px-4 py-2 text-sm font-medium hover:bg-white/[0.04]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function PasswordForm({
  user,
  onCancel,
  onSaved,
}: {
  user: AdminUser;
  onCancel: () => void;
  onSaved: (message: string) => void | Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mismatch = confirm.length > 0 && password !== confirm;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (mismatch) return;
    setSaving(true);
    setError(null);
    try {
      await resetUserPassword(user.id, password);
      // The password is never stored or logged; the audit trail records only
      // that a reset happened.
      await onSaved(`Password reset for ${user.name}.`);
    } catch (caught) {
      setError(
        caught instanceof AdminApiError
          ? caught.message
          : "Could not reset the password.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-lg border border-white/10 bg-white/[0.04] p-5"
    >
      <h3 className="text-lg font-semibold text-cream">
        Reset password for {user.name}
      </h3>
      {error && (
        <p
          className="rounded-lg bg-cherry/10 px-4 py-2 text-sm text-cherry-light ring-1 ring-cherry/20"
          role="alert"
        >
          {error}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-cream/80">
            New password
          </span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={12}
            autoComplete="new-password"
            className="w-full rounded-lg border border-white/20 px-3 py-2 bg-white/[0.05] text-cream placeholder:text-mist transition-colors focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/20 [&_option]:bg-forest [&_option]:text-cream"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-cream/80">
            Confirm password
          </span>
          <input
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            required
            minLength={12}
            autoComplete="new-password"
            className="inline-flex aria-invalid:border-cherry/50 w-full rounded-lg border border-white/20 px-3 py-2 bg-white/[0.05] text-cream placeholder:text-mist transition-colors focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/20 [&_option]:bg-forest [&_option]:text-cream"
          />
        </label>
      </div>
      {mismatch && (
        <p className="text-sm text-cherry-light">The two passwords do not match.</p>
      )}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving || mismatch}
          className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-coffee transition-colors hover:bg-gold-light disabled:opacity-50"
        >
          {saving ? "Saving…" : "Reset password"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-white/20 px-4 py-2 text-sm font-medium hover:bg-white/[0.04]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
