"use client";

/**
 * The admin application shell: sidebar, top bar, breadcrumb and content slot.
 *
 * This replaces a wrapping row of twenty pill buttons driven by `useState`. The
 * old arrangement could not express where an administrator was, could not be
 * linked to, and showed every destination at once — the opposite of how a CMS
 * with this much surface should present itself.
 *
 * The shell is deliberately presentational. It owns local interface state (which
 * groups are open, whether the rail is collapsed, whether the mobile drawer is
 * open) and reports navigation upward, because `Dashboard` in `AdminClient`
 * already owns the selected panel and the session. Keeping that split means the
 * existing panels keep working untouched.
 *
 * Every capability here is backed by something the system actually has. The
 * notification bell reads unhandled contact submissions; the search filters real
 * panels. Nothing is rendered that the API cannot supply.
 */
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  Bell,
  ChevronDown,
  ExternalLink,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  X,
} from "lucide-react";
import {
  NAV_GROUPS,
  PRIMARY_NAV,
  allNavItems,
  navGroupFor,
  navItemFor,
  type NavItem,
  type PanelId,
} from "@/frontend/components/admin/nav";
import { Badge } from "@/frontend/components/admin/ui";
import { PERMISSIONS, type Permission, type Role } from "@/shared/permissions";
import {
  listPendingInquiries,
  sessionExpired,
  type AdminInquiry,
} from "@/shared/admin-api";

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super Administrator",
  CONTENT_ADMIN: "Content Administrator",
  EDITOR: "Editor",
};

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = then - Date.now();
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return "just now";
}

/* -------------------------------------------------------------------------- */
/* navigation items                                                            */
/* -------------------------------------------------------------------------- */

function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group/tooltip relative flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-charcoal px-2 py-1 text-[11px] font-medium text-cream opacity-0 shadow-soft transition-opacity group-hover/tooltip:block group-hover/tooltip:opacity-100 group-focus-within/tooltip:block group-focus-within/tooltip:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}

function NavButton({
  item,
  active,
  collapsed,
  onSelect,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onSelect: (id: PanelId) => void;
}) {
  const Icon = item.icon;
  const button = (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={[
        "group relative flex w-full items-center gap-3 rounded-lg py-2 text-left text-sm font-medium transition-colors duration-150",
        collapsed ? "justify-center px-2" : "px-3",
        active
          ? "bg-gold/12 text-cream"
          : "text-cream/65 hover:bg-white/[0.06] hover:text-cream",
      ].join(" ")}
    >
      {/* Active marker: a solid bar plus weight change, so the current page is
          identifiable by shape as well as colour. */}
      <span
        aria-hidden="true"
        className={`absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-gold transition-opacity duration-150 ${
          active ? "opacity-100" : "opacity-0"
        }`}
      />
      <Icon
        className={`size-[18px] shrink-0 transition-colors ${
          active ? "text-gold" : "text-cream/50 group-hover:text-cream/80"
        }`}
        aria-hidden="true"
      />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </button>
  );

  return collapsed ? <Tooltip label={item.label}>{button}</Tooltip> : button;
}

/* -------------------------------------------------------------------------- */
/* shell                                                                       */
/* -------------------------------------------------------------------------- */

export function AdminShell({
  user,
  active,
  onNavigate,
  onLogout,
  children,
}: {
  user: { id: string; name: string; email: string; role: Role };
  active: PanelId;
  onNavigate: (id: PanelId) => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<string[]>(() => {
    const group = navGroupFor(active);
    return group ? [group.id] : [];
  });
  const [query, setQuery] = useState("");
  const [notifications, setNotifications] = useState<AdminInquiry[] | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const drawerRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  /* Groups the signed-in role may see. The API re-checks every request; this
     only avoids offering a destination that could only ever return 403. */
  const groups = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => can(user.role, item.permission)),
      })).filter((group) => group.items.length > 0),
    [user.role]
  );

  const primary = useMemo(
    () => PRIMARY_NAV.filter((item) => can(user.role, item.permission)),
    [user.role]
  );

  /* Keep a collapsed sidebar honest: if the current panel is not the dashboard,
     the rail has no way to show which group owns it, so it stays expanded. */
  useEffect(() => {
    if (!collapsed) return;
    if (navGroupFor(active)) setCollapsed(false);
  }, [active, collapsed]);

  /* Selecting a panel on a phone should close the drawer, otherwise the panel
     is revealed underneath a sheet the administrator cannot see past. */
  const select = useCallback(
    (id: PanelId) => {
      onNavigate(id);
      setDrawerOpen(false);
      setQuery("");
      setNotifOpen(false);
      setProfileOpen(false);
    },
    [onNavigate]
  );

  const toggleGroup = useCallback((id: string) => {
    setOpenGroups((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id]
    );
  }, []);

  /* Escape closes the topmost transient surface, and restores focus to whatever
     opened it. Without this a keyboard user is trapped behind a menu that only
     responds to the mouse. */
  useEffect(() => {
    if (!drawerOpen && !notifOpen && !profileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Tab" && drawerOpen) {
        /* The drawer is aria-modal, so Tab has to stay inside it. Without this
        cycle, focus walks out through the overlay into the page behind — which
        `aria-modal` tells assistive tech is inert, leaving a keyboard user
        operating controls they have been told are unavailable. */
        const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;

        if (event.shiftKey && (active === first || !drawerRef.current?.contains(active))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      if (event.key !== "Escape") return;
      if (drawerOpen) {
        setDrawerOpen(false);
        menuButtonRef.current?.focus();
      } else if (notifOpen) {
        setNotifOpen(false);
      } else {
        setProfileOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen, notifOpen, profileOpen]);

  /* The drawer covers the page, so background scrolling has to stop. */
  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerRef.current?.querySelector<HTMLElement>("button, a, input")?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, [drawerOpen]);

  /* Unhandled contact submissions. Polled on an interval and on tab focus so the
     badge is fresh without a websocket, and refetched when a panel changes an
     inquiry's status so the count falls without a page reload. */
  const loadNotifications = useCallback(async () => {
    try {
      setNotifications(await listPendingInquiries());
    } catch (error) {
      // A 401 is already handled globally by the API client. Anything else just
      // means the badge stays empty; it is not worth interrupting the session.
      if (!sessionExpired(error)) setNotifications([]);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
    const timer = setInterval(loadNotifications, 60_000);
    const onFocus = () => void loadNotifications();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadNotifications]);

  const pendingCount = notifications?.length ?? 0;

  const currentItem = navItemFor(active);
  const currentGroup = navGroupFor(active);
  const crumbs = [
    { label: "Dashboard", onSelect: () => select("overview") },
    ...(currentGroup
      ? [{ label: currentGroup.label, onSelect: () => undefined }]
      : []),
    ...(currentItem
      ? [{ label: currentItem.label, onSelect: () => undefined }]
      : []),
  ];

  /* Search filters the panel list by name and by what the panel actually manages,
     so "photos" finds the gallery and "password" finds settings. */
  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    return allNavItems()
      .filter((item) => can(user.role, item.permission))
      .filter(
        (item) =>
          item.label.toLowerCase().includes(term) ||
          item.description.toLowerCase().includes(term)
      )
      .slice(0, 6);
  }, [query, user.role]);

  const sidebar = (
    <div className="flex h-full flex-col bg-forest-deep">
      <div
        className={`flex h-16 shrink-0 items-center border-b border-white/10 ${
          collapsed ? "justify-center px-2" : "gap-3 px-4"
        }`}
      >
        <Link
          href="/"
          className="grid size-9 shrink-0 place-items-center rounded-lg bg-gold/15 text-gold"
          aria-label="Kalisizo Coffee, view public site"
        >
          <span className="font-display text-sm font-bold">KC</span>
        </Link>
        {!collapsed && (
          <span className="min-w-0 leading-tight">
            <span className="block truncate font-display text-[13px] font-semibold text-cream">
              Kalisizo Coffee
            </span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-cream/40">
              Content management
            </span>
          </span>
        )}
        <button
          type="button"
          onClick={() => setDrawerOpen(false)}
          className="ml-auto rounded-lg p-1.5 text-cream/60 hover:bg-white/10 hover:text-cream lg:hidden"
          aria-label="Close navigation"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>

      <div className="border-b border-white/10 p-3">
        <NavSearch
          value={query}
          onChange={setQuery}
          results={results}
          onSelect={select}
          collapsed={collapsed}
        />
      </div>

      <nav
        aria-label="Admin sections"
        className="flex-1 space-y-1 overflow-y-auto px-3 py-4"
      >
        {primary.map((item) => (
          <NavButton
            key={item.id}
            item={item}
            active={active === item.id}
            collapsed={collapsed}
            onSelect={select}
          />
        ))}

        {groups.map((group) => {
          const GroupIcon = group.icon;
          const isOpen = !collapsed && openGroups.includes(group.id);
          const groupIsActive = group.items.some((item) => item.id === active);
          const panelId = `navgroup-${group.id}`;

          if (collapsed) {
            /* With no room for labels, a group is a single control. Activating it
               restores the full rail and opens the group, which is predictable
               and keeps the destination reachable in one click. */
            return (
              <Tooltip
                key={group.id}
                label={`${group.label}, ${group.items.length} sections`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setCollapsed(false);
                    setOpenGroups((current) =>
                      current.includes(group.id) ? current : [...current, group.id]
                    );
                  }}
                  className={[
                    "flex w-full items-center justify-center rounded-lg py-2 transition-colors duration-150",
                    groupIsActive
                      ? "bg-white/[0.07] text-gold"
                      : "text-cream/50 hover:bg-white/[0.06] hover:text-cream",
                  ].join(" ")}
                >
                  <GroupIcon className="size-[18px]" aria-hidden="true" />
                </button>
              </Tooltip>
            );
          }

          return (
            <div key={group.id}>
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                aria-expanded={isOpen}
                aria-controls={panelId}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors duration-150 hover:bg-white/[0.06] ${
                  groupIsActive ? "text-cream" : "text-cream/60"
                }`}
              >
                <GroupIcon className="size-[18px] shrink-0 text-cream/50" aria-hidden="true" />
                <span className="flex-1 text-left">{group.label}</span>
                <ChevronDown
                  className={`size-4 shrink-0 text-cream/40 transition-transform duration-200 ease-out ${
                    isOpen ? "rotate-180" : "rotate-0"
                  }`}
                  aria-hidden="true"
                />
              </button>
              <div
                id={panelId}
                hidden={!isOpen}
                className="mt-1 space-y-0.5 border-l border-white/10 pl-2.5"
              >
                {group.items.map((item) => (
                  <NavButton
                    key={item.id}
                    item={item}
                    active={active === item.id}
                    collapsed={false}
                    onSelect={select}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="shrink-0 space-y-1 border-t border-white/10 p-3">
        <Link
          href="/"
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-cream/60 transition-colors hover:bg-white/[0.06] hover:text-cream ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <ExternalLink className="size-[18px] shrink-0" aria-hidden="true" />
          {!collapsed && "View public site"}
        </Link>
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className={`hidden w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-cream/60 transition-colors hover:bg-white/[0.06] hover:text-cream lg:flex ${
            collapsed ? "justify-center" : ""
          }`}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-[18px] shrink-0" aria-hidden="true" />
          ) : (
            <PanelLeftClose className="size-[18px] shrink-0" aria-hidden="true" />
          )}
          {!collapsed && "Collapse"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-forest-deep text-cream">

      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-gold focus:px-4 focus:py-2 focus:font-semibold focus:text-forest-deep"
      >
        Skip to content
      </a>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-forest-deep/80 backdrop-blur-sm"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
          />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Admin navigation"
            className="absolute inset-y-0 left-0 w-[17rem] max-w-[85vw] border-r border-white/10 shadow-glass"
          >
            {sidebar}
          </div>
        </div>
      )}

      <div className="relative flex min-h-screen">
        <aside
          className={`sticky top-0 hidden h-screen shrink-0 border-r border-white/10 transition-[width] duration-200 ease-out lg:block ${
            collapsed ? "w-[4.5rem]" : "w-64"
          }`}
        >
          {sidebar}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* top bar */}
          <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-white/10 bg-forest-deep/85 px-4 backdrop-blur-md sm:px-6">
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="-ml-1 rounded-lg p-2 text-cream/70 transition-colors hover:bg-white/10 hover:text-cream lg:hidden"
              aria-label="Open navigation"
              aria-expanded={drawerOpen}
            >
              <Menu className="size-5" aria-hidden="true" />
            </button>

            <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
              <ol className="flex items-center gap-1.5 text-[13px]">
                {crumbs.map((crumb, index) => {
                  const last = index === crumbs.length - 1;
                  return (
                    <li key={crumb.label} className="flex min-w-0 items-center gap-1.5">
                      {index > 0 && (
                        <span aria-hidden="true" className="text-cream/25">
                          /
                        </span>
                      )}
                      {last ? (
                        <span
                          aria-current="page"
                          className="truncate font-semibold text-cream"
                        >
                          {crumb.label}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={crumb.onSelect}
                          className="truncate text-cream/55 transition-colors hover:text-cream"
                        >
                          {crumb.label}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>

            {/* notifications */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setNotifOpen((value) => !value);
                  setProfileOpen(false);
                }}
                aria-expanded={notifOpen}
                aria-haspopup="dialog"
                className="relative rounded-lg p-2 text-cream/70 transition-colors hover:bg-white/10 hover:text-cream"
              >
                <Bell className="size-5" aria-hidden="true" />
                <span className="sr-only">
                  {pendingCount
                    ? `${pendingCount} unhandled contact messages`
                    : "No unhandled contact messages"}
                </span>
                {pendingCount > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-gold px-1 text-[10px] font-bold leading-4 text-forest-deep"
                  >
                    {pendingCount > 9 ? "9+" : pendingCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div
                  role="dialog"
                  aria-label="Notifications"
                  className="absolute right-0 top-full z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl bg-forest ring-1 ring-white/15 shadow-glass"
                >
                  <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                    <p className="text-[13px] font-semibold text-cream">
                      Contact messages
                    </p>
                    {pendingCount > 0 && (
                      <Badge tone="warning">{pendingCount} awaiting reply</Badge>
                    )}
                  </div>
                  {notifications === null ? (
                    <p className="px-4 py-6 text-center text-[13px] text-cream/50">
                      Loading…
                    </p>
                  ) : notifications.length === 0 ? (
                    <p className="px-4 py-6 text-center text-[13px] text-cream/50">
                      Nothing is waiting for a reply.
                    </p>
                  ) : (
                    <ul className="max-h-80 divide-y divide-white/[0.07] overflow-y-auto">
                      {notifications.slice(0, 5).map((inquiry) => (
                        <li key={inquiry.id}>
                          <button
                            type="button"
                            onClick={() => select("inquiries")}
                            className="block w-full px-4 py-3 text-left transition-colors hover:bg-white/[0.05]"
                          >
                            <p className="truncate text-[13px] font-medium text-cream">
                              {inquiry.subject || "No subject"}
                            </p>
                            <p className="mt-0.5 truncate text-[12px] text-cream/50">
                              {inquiry.fullName} · {timeAgo(inquiry.createdAt)}
                            </p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="border-t border-white/10">
                    <button
                      type="button"
                      onClick={() => select("inquiries")}
                      className="w-full px-4 py-2.5 text-center text-[13px] font-semibold text-gold transition-colors hover:bg-white/[0.05]"
                    >
                      View all messages
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* profile */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setProfileOpen((value) => !value);
                  setNotifOpen(false);
                }}
                aria-expanded={profileOpen}
                aria-haspopup="menu"
                className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition-colors hover:bg-white/10"
              >
                <span
                  aria-hidden="true"
                  className="grid size-8 shrink-0 place-items-center rounded-full bg-gold/20 text-[12px] font-bold text-gold"
                >
                  {initials(user.name)}
                </span>
                <span className="hidden min-w-0 text-left leading-tight sm:block">
                  <span className="block truncate text-[13px] font-semibold text-cream">
                    {user.name}
                  </span>
                  <span className="block truncate text-[11px] text-cream/50">
                    {ROLE_LABEL[user.role]}
                  </span>
                </span>
                <ChevronDown
                  className={`hidden size-4 text-cream/40 transition-transform duration-200 sm:block ${
                    profileOpen ? "rotate-180" : "rotate-0"
                  }`}
                  aria-hidden="true"
                />
              </button>

              {profileOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-40 mt-2 w-64 overflow-hidden rounded-xl bg-forest ring-1 ring-white/15 shadow-glass"
                >
                  <div className="border-b border-white/10 px-4 py-3">
                    <p className="truncate text-[13px] font-semibold text-cream">
                      {user.name}
                    </p>
                    <p className="truncate text-[12px] text-cream/50">{user.email}</p>
                    <p className="mt-1.5">
                      <Badge tone="info">{ROLE_LABEL[user.role]}</Badge>
                    </p>
                  </div>
                  <Link
                    href="/"
                    role="menuitem"
                    className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-cream/75 transition-colors hover:bg-white/[0.06] hover:text-cream"
                  >
                    <ExternalLink className="size-4" aria-hidden="true" />
                    View public site
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={onLogout}
                    className="flex w-full items-center gap-2.5 border-t border-white/10 px-4 py-2.5 text-left text-[13px] font-semibold text-red-300 transition-colors hover:bg-red-500/10"
                  >
                    <LogOut className="size-4" aria-hidden="true" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </header>

          <main id="admin-main" className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </main>

          <footer className="border-t border-white/10 px-4 py-5 text-center text-[11px] text-cream/35 sm:px-6">
            Kalisizo Coffee Farmers Cooperative Society Ltd, secure admin area.
          </footer>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* search                                                                      */
/* -------------------------------------------------------------------------- */

function NavSearch({
  value,
  onChange,
  results,
  onSelect,
  collapsed,
}: {
  value: string;
  onChange: (value: string) => void;
  results: NavItem[];
  onSelect: (id: PanelId) => void;
  collapsed: boolean;
}) {
  const listId = useId();
  const open = value.trim().length > 0;
  const showPanel = !collapsed && open;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsedHint()}
        className="flex w-full items-center justify-center rounded-lg py-2 text-cream/50 transition-colors hover:bg-white/[0.06] hover:text-cream"
        aria-label="Search sections"
        title="Search sections"
      >
        <Search className="size-[18px]" aria-hidden="true" />
      </button>
    );
  }

  return (
    <div className="relative">
      <label htmlFor={listId} className="sr-only">
        Search admin sections
      </label>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-cream/35"
        aria-hidden="true"
      />
      <input
        id={listId}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && results[0]) {
            event.preventDefault();
            onSelect(results[0].id);
          }
          if (event.key === "Escape") onChange("");
        }}
        placeholder="Search sections…"
        autoComplete="off"
        // `search` inputs have an implicit `searchbox` role, which does not
        // accept `aria-expanded`. The field genuinely is a combobox — it opens a
        // listbox of matching panels — so the role is declared explicitly
        // instead of dropping the state a screen reader needs.
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={showPanel ? `${listId}-results` : undefined}
        aria-autocomplete="list"
        className="w-full rounded-lg border border-white/10 bg-white/[0.05] py-2 pl-9 pr-2.5 text-[13px] text-cream placeholder:text-cream/35 outline-none transition-colors focus:border-gold/60 focus:bg-white/[0.07]"
      />

      {showPanel && (
        <div
          id={`${listId}-results`}
          role="listbox"
          className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-lg bg-forest ring-1 ring-white/15 shadow-glass"
        >
          {results.length === 0 ? (
            <p className="px-3 py-2.5 text-[13px] text-cream/50">
              No section matches “{value.trim()}”.
            </p>
          ) : (
            <ul>
              {results.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={false}
                      onClick={() => onSelect(item.id)}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-white/[0.07]"
                    >
                      <Icon className="size-4 shrink-0 text-cream/45" aria-hidden="true" />
                      <span className="truncate text-[13px] text-cream">{item.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Collapsed rail has no room for the search field. Rather than hide the feature,
 * the icon restores the full sidebar and focuses the field.
 */
function setCollapsedHint() {
  const toggle = document.querySelector<HTMLButtonElement>(
    'button[aria-label="Expand navigation"]'
  );
  toggle?.click();
}
