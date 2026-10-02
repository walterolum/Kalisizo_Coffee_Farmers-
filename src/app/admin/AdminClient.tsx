"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRealtimePoll } from "@/lib/realtime";
import {
  AlertCircle,
  Award,
  BarChart3,
  CalendarDays,
  ChevronLeft,
  Crown,
  FileText,
  History,
  Home,
  Image as ImageIcon,
  Inbox,
  KeyRound,
  Loader2,
  Mail,
  MapPin,
  PackageCheck,
  Plus,
  ScrollText,
  Settings2,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { ContentPanel } from "@/components/admin/ContentPanel";
import { UsersPanel } from "@/components/admin/UsersPanel";
import { AuditPanel } from "@/components/admin/AuditPanel";
import { SettingsPanel } from "@/components/admin/SettingsPanel";
import { ServicesPanel } from "@/components/admin/ProgramsPanel";
import { LocationPanel } from "@/components/admin/LocationsPanel";
import { ContactPanel } from "@/components/admin/ContactPanel";
import { AdminShell } from "@/components/admin/AdminShell";
import { isPanelId, navItemFor, type PanelId } from "@/components/admin/nav";
import {
  ErrorState,
  LoadingState,
  StatusBadge,
  useConfirm,
} from "@/components/admin/ui";
import type { UserRole } from "@/lib/auth";
import { PERMISSIONS, type Permission } from "@/lib/permissions";
import type { ContentType, Paginated } from "@/lib/admin-api";
import { AdminApiError, SESSION_EXPIRED_EVENT } from "@/lib/admin-api";
import {
  formatSavedAt as fmtShortTime,
  type SaveResult as PublishResult,
} from "@/lib/save-outcome";
import {
  apiFetch,
  Field,
  GRADIENT_OPTIONS,
  HERO_TODAY_ICON_OPTIONS,
  inputBase,
  LEADER_ICON_OPTIONS,
  Panel,
  PRODUCT_CATEGORIES,
  PRODUCT_ICON_OPTIONS,
  publishAndFeedback,
  splitList,
  TOKEN_KEY,
  UploadButton,
  USER_KEY,
} from "@/components/admin/panel-kit";

type User = { id: string; name: string; email: string; role: UserRole };

type Inquiry = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string;
  subject: string | null;
  userType: "FARMER" | "BUYER" | "GENERAL";
  message: string;
  status: "PENDING" | "REVIEWED" | "RESOLVED";
  createdAt: string;
};

type Leader = {
  id: string;
  name: string;
  title: string;
  bio: string | null;
  photoUrl: string | null;
  icon: string | null;
  gradient: string | null;
  displayOrder: number;
  updatedAt?: string;
};

type Product = {
  id: string;
  title: string;
  category:
    "COFFEE_BEANS" | "FERTILIZER_INPUTS" | "EQUIPMENT" | "SACCO_PRODUCT";
  description: string | null;
  price: string | null;
  unit: string | null;
  badge: string | null;
  cta: string | null;
  tone: string | null;
  icon: string | null;
  imageUrl: string | null;
  isAvailable: boolean;
  updatedAt?: string;
};

/**
 * What the About screen needs from the shared settings row.
 *
 * The full read model also carries the contact fields and social profiles, but
 * this screen neither displays nor submits them — see the note on its save.
 */
/**
 * The About screen's slice of the shared settings row.
 *
 * The read model also carries the contact fields, social profiles and the logo,
 * but this screen neither displays nor submits them — see the note on its save.
 */
type AboutSettings = {
  mission: string | null;
  vision: string | null;
  taglines: string[];
  updatedAt?: string;
};

/** The Logo screen's slice. Same row, one field. */
type LogoSettings = {
  logoUrl: string | null;
  updatedAt?: string;
};

type TodayItemInput = { icon: string; title: string; sub: string };

type HeroContentItem = {
  id: string;
  headlinePrefix: string;
  headlineHighlight: string;
  headlineSuffix: string;
  subtitle: string;
  badges: string[];
  todayItems: TodayItemInput[];
  backgroundImage: string | null;
  updatedAt?: string;
};

type StoryItem = {
  id: string;
  title: string;
  quote: string | null;
  description: string;
  metric: string | null;
  imageUrl: string | null;
  displayOrder: number;
  updatedAt?: string;
};

type AuditEntry = {
  id: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string | null;
  summary: string;
  status: string;
  createdAt: string;
};

type Notice = { message: string; kind: "success" | "error" };

/**
 * The shape the overview needs from a news article or event. Deliberately narrow:
 * the dashboard lists titles and workflow states, and reading the full records
 * to do that would send megabytes of body text to render four rows.
 */
type TitleRef = {
  id: string;
  title: string;
  status?: string | null;
  /** `Event.startAt` in the Prisma schema. */
  startAt?: string | null;
};

export function AdminClient() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = localStorage.getItem(USER_KEY);
        if (raw && !cancelled) {
          setUser(JSON.parse(raw) as User);
        }
      } catch {
        /* ignore */
      }
      if (!cancelled) setAuthReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  // The editorial panels share this session but cannot call `logout` directly.
  // A rejected request in one of them raises this event so the shell returns
  // to the login form instead of leaving a dead panel on screen.
  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  const handleSessionError = useCallback(
    (error: unknown) => {
      // `AdminApiError`, not `ApiError`: the CMS has two client API layers and
      // each used to raise its own error class, so this check silently missed
      // every 401 from the other one. `ApiError` now extends it, so the base
      // class matches both. This is the fallback path — `apiFetch` also raises
      // `SESSION_EXPIRED_EVENT` directly.
      if (error instanceof AdminApiError && error.status === 401) {
        logout();
        return;
      }
      // Not a session problem, so logging out would be wrong — the panels own
      // their own error UI. Recorded here so a failure that the admin never
      // looked at is still visible in the browser console; without this a
      // database outage looked identical to an empty database.
      console.warn("[admin] request failed outside the session flow:", error);
    },
    [logout],
  );

  if (!authReady) {
    return (
      <div className="grid min-h-screen place-items-center bg-forest-deep text-cream">
        <Loader2 className="size-8 animate-spin text-gold-light" />
      </div>
    );
  }

  if (!user) {
    return <Login onAuthenticated={(u) => setUser(u)} logout={logout} />;
  }

  return (
    <Dashboard
      user={user}
      onLogout={logout}
      onSessionError={handleSessionError}
    />
  );
}

function Login({
  onAuthenticated,
  logout,
}: {
  onAuthenticated: (user: User) => void;
  logout: () => void;
}) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await apiFetch<{ token: string; user: User }>(
        "/api/v1/admin/login",
        { method: "POST", body: JSON.stringify({ identifier, password }) },
      );
      localStorage.setItem(TOKEN_KEY, result.token);
      localStorage.setItem(USER_KEY, JSON.stringify(result.user));
      onAuthenticated(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-forest-deep text-cream">
      <div
        className="absolute -top-24 right-0 h-72 w-72 rounded-full bg-gold/10 blur-3xl"
        aria-hidden="true"
      />
      <div className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-1.5 text-sm font-semibold text-cream/70 transition-colors hover:text-gold-light"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Back to website
        </Link>

        <div className="rounded-3xl bg-white/[0.05] p-7 shadow-card ring-1 ring-white/10 sm:p-9">
          <span className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-gold to-gold-deep text-forest shadow-card">
            <ShieldCheck className="size-7" aria-hidden="true" />
          </span>
          <h1 className="mt-5 font-display text-2xl font-semibold">
            Admin Login
          </h1>
          <p className="mt-2 text-sm text-cream/60">
            Authorized staff only. Secure access to inquiries, leadership and
            the product catalog.
          </p>

          <form onSubmit={onSubmit} className="mt-7 space-y-4">
            <Field label="Email or username">
              <input
                name="identifier"
                type="text"
                required
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className={inputBase}
              />
            </Field>
            <Field label="Password">
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={inputBase}
              />
            </Field>

            {error && (
              <p className="rounded-xl bg-red-500/10 px-3.5 py-2.5 text-sm font-semibold text-red-300 ring-1 ring-red-400/20">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary btn-lg w-full disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? (
                <Loader2 className="size-5 animate-spin" aria-hidden="true" />
              ) : (
                <KeyRound className="size-4" aria-hidden="true" />
              )}
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <button
            type="button"
            onClick={logout}
            className="mt-6 text-xs text-cream/70 transition-colors hover:text-cream/90"
          >
            Continue browsing without signing in
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Every panel id now lives in `src/components/admin/nav.ts`, registered once
 * alongside its group, icon and permission. The sidebar renders from that model,
 * so this module only maps a selected id to a component.
 */
type Tab = PanelId;

/**
 * The editorial tabs are all the same generic panel with a different content
 * type, so they render through one entry rather than eight near-identical ones.
 * The tab ids stay flat for the nav; this maps them to their API path.
 */
const CONTENT_TABS: Record<string, ContentType> = {
  news: "news",
  events: "events",
  projects: "projects",
  announcements: "announcements",
  publications: "publications",
  pages: "pages",
  "gallery-albums": "gallery/albums",
  "gallery-images": "gallery/images",
};

/** Mirrors the server permission matrix so the UI hides what the user cannot do. */
function can(user: User, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly UserRole[]).includes(user.role);
}

/**
 * Reads the selected panel from `?section=`.
 *
 * This is what turns the dashboard from an unsaveable tab state into something
 * linkable, bookmarkable and reachable with the browser's back button. The value
 * is validated against the nav model before it is used, so a hand-edited or stale
 * link cannot select a panel that does not exist or that this role cannot open.
 */
function usePanelParam(): [Tab, (next: Tab) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const raw = searchParams.get("section");
  const [tab, setTab] = useState<Tab>(() =>
    isPanelId(raw) ? raw : "overview",
  );

  // Adopt a link to another panel, including browser back/forward.
  useEffect(() => {
    const next = isPanelId(raw) ? raw : "overview";
    setTab((current) => (current === next ? current : next));
  }, [raw]);

  const select = useCallback(
    (next: Tab) => {
      setTab(next);
      const params = new URLSearchParams(searchParams.toString());
      params.set("section", next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return [tab, select];
}

function Dashboard({
  user,
  onLogout,
  onSessionError,
}: {
  user: User;
  onLogout: () => void;
  onSessionError: (error: unknown) => void;
}) {
  const [tab, setTab] = usePanelParam();
  const [notice, setNotice] = useState<Notice | null>(null);

  /**
   * The sidebar hides anything this role cannot open, but a panel can also be
   * reached by typing its id into the URL. Resolve the permission server-side
   * semantics on the client as a second line of defence, so an Editor who
   * follows `/admin?section=users` lands on the dashboard instead of a panel
   * that can only 403. The API remains the authority.
   */
  const allowed = useMemo(() => {
    const required: Partial<Record<Tab, Permission>> = {
      users: "manageUsers",
      activity: "manageSystem",
      settings: "manageSettings",
    };
    const permission = required[tab];
    return permission ? can(user, permission) : can(user, "viewCms");
  }, [tab, user]);

  // If a role change or a stale link points at a panel this user cannot open,
  // fall back to the dashboard rather than render content they may not see.
  useEffect(() => {
    if (!allowed) setTab("overview");
  }, [allowed, setTab]);

  /**
   * The tab actually rendered.
   *
   * The effect above is not enough on its own. It runs *after* the first paint,
   * so opening `/admin?section=users` as an Editor rendered `<UsersPanel>` and
   * fired `listUsers()` — a 403 request, an error set on a component that was
   * already unmounting, and a visible flash of a panel the role cannot use.
   * Deriving the effective tab and switching on it means the forbidden panel is
   * never mounted at all, so it never fetches.
   */
  const effectiveTab: Tab = allowed ? tab : "overview";

  const notify = useCallback(
    (message: string, kind: "success" | "error" = "success") =>
      setNotice({ message, kind }),
    [],
  );

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(
      () => setNotice(null),
      notice.kind === "error" ? 7000 : 3600,
    );
    return () => clearTimeout(t);
  }, [notice]);

  const currentItem = navItemFor(effectiveTab);

  return (
    <AdminShell
      user={user}
      active={tab}
      onNavigate={setTab}
      onLogout={onLogout}
    >
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-xl font-semibold text-cream sm:text-2xl">
            {currentItem?.label ?? "Dashboard"}
          </h1>
          <p className="mt-1 text-sm text-cream/55">
            {currentItem?.description ??
              "Overview of published content and recent activity"}
          </p>
        </div>

        {notice && (
          <p
            role={notice.kind === "error" ? "alert" : "status"}
            aria-live={notice.kind === "error" ? "assertive" : "polite"}
            aria-atomic="true"
            className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold ring-1 ${
              notice.kind === "error"
                ? "bg-red-500/10 text-red-300 ring-red-400/20"
                : "bg-emerald-brand/15 text-emerald-200 ring-emerald-400/20"
            }`}
          >
            {notice.kind === "error" ? (
              <AlertCircle className="size-4" aria-hidden="true" />
            ) : (
              <BarChart3 className="size-4" aria-hidden="true" />
            )}
            {notice.message}
          </p>
        )}

        {effectiveTab === "overview" && (
          <Overview
            user={user}
            onSessionError={onSessionError}
            onNavigate={setTab}
          />
        )}
        {effectiveTab === "inquiries" && (
          <InquiriesPanel notify={notify} onSessionError={onSessionError} />
        )}
        {effectiveTab === "home" && (
          <HomePanel notify={notify} onSessionError={onSessionError} />
        )}
        {effectiveTab === "about" && (
          <AboutPanel notify={notify} onSessionError={onSessionError} />
        )}
        {effectiveTab === "services" && (
          <ServicesPanel notify={notify} onSessionError={onSessionError} />
        )}
        {effectiveTab === "products" && (
          <ProductsPanel notify={notify} onSessionError={onSessionError} />
        )}
        {effectiveTab === "stories" && (
          <SuccessStoriesPanel
            notify={notify}
            onSessionError={onSessionError}
          />
        )}
        {effectiveTab === "location" && (
          <LocationPanel notify={notify} onSessionError={onSessionError} />
        )}
        {effectiveTab === "contact" && (
          <ContactPanel notify={notify} onSessionError={onSessionError} />
        )}
        {CONTENT_TABS[effectiveTab] && (
          <ContentPanel
            key={effectiveTab}
            type={CONTENT_TABS[effectiveTab]}
            canPublish={can(user, "publishContent")}
            canDelete={can(user, "deleteContent")}
            canRestore={can(user, "manageSystem")}
          />
        )}
        {effectiveTab === "users" && <UsersPanel currentUserId={user.id} />}
        {effectiveTab === "activity" && <AuditPanel />}
        {effectiveTab === "settings" && <SettingsPanel />}
      </div>
    </AdminShell>
  );
}

/**
 * Floor on how often the shared realtime timer may refresh the dashboard panel.
 *
 * The overview issues nine requests per run, three of which (`inquiries:list`,
 * `news:list`, `events:list`) are capped at 120 per 15 minutes. On the shared
 * 4-second tick that is ~135 requests a minute against an 8-per-minute budget,
 * so an administrator left on the dashboard exhausted their own quota in about
 * eight minutes and then got 429s from their own CMS for the rest of the
 * window. Sixty seconds keeps it comfortably inside the budget and is still
 * faster than a dashboard summary needs to be. See the `useRealtimePoll` call in
 * `Overview` for why event-driven refresh is deliberately left alone.
 */
const OVERVIEW_POLL_MIN_MS = 60_000;

function Overview({
  user,
  onSessionError,
  onNavigate,
}: {
  user: User;
  onSessionError: (error: unknown) => void;
  onNavigate: (tab: Tab) => void;
}) {
  /**
   * `null` per key means "we could not read this", which is rendered as an
   * em dash. It is deliberately not `0`: a rate-limited or timed-out count and
   * a genuinely empty collection look identical as a zero, and an administrator
   * reading "0 contact messages" would be told the site has no inquiries when it
   * simply could not be asked.
   */
  const [stats, setStats] = useState<Record<string, number | null> | null>(
    null,
  );
  const [activity, setActivity] = useState<AuditEntry[] | null>(null);
  const [pending, setPending] = useState<Inquiry[] | null>(null);
  const [latest, setLatest] = useState<{
    news: TitleRef[];
    events: TitleRef[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * The audit log requires `manageSystem`, so only a Super Administrator may
   * request it. Fetching it unconditionally used to reject with 403 for every
   * other role, which aborted the whole `Promise.all` and left the dashboard
   * stuck on "Loading activity…" with no cards at all.
   */
  const canAudit = can(user, "manageSystem");

  const load = useCallback(async () => {
    /**
     * `allSettled` rather than `all`.
     *
     * These nine endpoints are independent, but they were awaited together, so a
     * single rejection — one rate-limited scope, one timeout — discarded the
     * other eight successes and left the whole dashboard showing "Dashboard
     * unavailable". One unreachable panel read as the entire CMS being down.
     * Settling them independently means a partial outage degrades to partial
     * data with a banner explaining which numbers are missing.
     */
    const [
      inquiriesR,
      leadersR,
      productsR,
      locationsR,
      servicesR,
      storiesR,
      auditR,
      newsR,
      eventsR,
    ] = await Promise.allSettled([
      apiFetch<Inquiry[]>("/api/v1/admin/inquiries"),
      apiFetch<Leader[]>("/api/v1/leadership"),
      apiFetch<Product[]>("/api/v1/products"),
      apiFetch<unknown[]>("/api/v1/locations"),
      apiFetch<unknown[]>("/api/v1/services"),
      apiFetch<StoryItem[]>("/api/v1/stories"),
      canAudit
        ? apiFetch<AuditEntry[]>("/api/v1/admin/audit?limit=8")
        : Promise.resolve(null),
      // The admin list endpoints return drafts as well as published records,
      // and the overview's status column is the point of these two lists.
      apiFetch<Paginated<TitleRef>>("/api/v1/admin/news?pageSize=4"),
      apiFetch<Paginated<TitleRef>>("/api/v1/admin/events?pageSize=4"),
    ]);

    const settled = [
      inquiriesR,
      leadersR,
      productsR,
      locationsR,
      servicesR,
      storiesR,
      auditR,
      newsR,
      eventsR,
    ];

    /**
     * A 401 is the one failure that is not partial. The session is gone, so
     * nothing below can be trusted and nothing should be painted as a normal
     * dashboard with some dashes in it.
     */
    const unauthorized = settled.find(
      (r): r is PromiseRejectedResult =>
        r.status === "rejected" &&
        r.reason instanceof AdminApiError &&
        r.reason.status === 401,
    );
    if (unauthorized) {
      onSessionError(unauthorized.reason);
      return;
    }

    const read = <T,>(r: PromiseSettledResult<T>): T | null =>
      r.status === "fulfilled" ? r.value : null;
    const count = (r: PromiseSettledResult<unknown[]>): number | null =>
      r.status === "fulfilled" ? r.value.length : null;

    const inquiries = read<Inquiry[]>(inquiriesR);
    const news = read<Paginated<TitleRef>>(newsR);
    const events = read<Paginated<TitleRef>>(eventsR);

    const pendingInquiries = inquiries
      ? inquiries.filter((i) => i.status === "PENDING")
      : null;

    setStats({
      inquiries: count(inquiriesR),
      pending: pendingInquiries ? pendingInquiries.length : null,
      leaders: count(leadersR),
      products: count(productsR),
      locations: count(locationsR),
      services: count(servicesR),
      stories: count(storiesR),
    });
    setPending(pendingInquiries);
    setActivity(read<AuditEntry[] | null>(auditR));
    setLatest(
      news && events ? { news: news.items, events: events.items } : null,
    );

    const failures = settled.filter((r) => r.status === "rejected");
    if (failures.length === 0) {
      setError(null);
      return;
    }

    // Name the cause rather than surfacing a raw server string, but keep the
    // first real message when there is only one failure — it is the most
    // actionable thing we have.
    const reason = failures[0].reason;
    const detail =
      reason instanceof Error && reason.message
        ? reason.message
        : "Unknown error";
    setError(
      failures.length === 1
        ? detail
        : `${failures.length} of the dashboard's data sources could not be read (${detail}). Figures shown as — are unknown, not zero.`,
    );
  }, [canAudit, onSessionError]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * A 60-second floor on *timer*-triggered refreshes.
   *
   * This panel issues nine requests per run, three of which (`inquiries:list`,
   * `news:list`, `events:list`) are capped at 120 per 15 minutes. On the shared
   * 4-second tick that is ~135 requests a minute against an 8-per-minute budget,
   * so an administrator left on this screen exhausted their own quota in about
   * eight minutes and the dashboard 429'd itself for the rest of the window.
   *
   * Event-driven refresh is untouched: an SSE push, a window focus, another tab's
   * edit or the explicit Retry button all still run immediately, so content
   * changes appear at once. Only the idle background tick is slowed down, which
   * is where the budget was actually being spent.
   */
  useRealtimePoll(load, undefined, undefined, {
    minIntervalMs: OVERVIEW_POLL_MIN_MS,
  });

  if (error && !stats) {
    return (
      <ErrorState
        title="Dashboard unavailable"
        message={error}
        onRetry={load}
      />
    );
  }

  const cards = stats
    ? [
        {
          label: "Contact messages",
          value: stats.inquiries,
          icon: <Inbox className="size-5" />,
        },
        {
          label: "Awaiting reply",
          value: stats.pending,
          icon: <BarChart3 className="size-5" />,
        },
        {
          label: "Leadership members",
          value: stats.leaders,
          icon: <Users className="size-5" />,
        },
        {
          label: "Products",
          value: stats.products,
          icon: <PackageCheck className="size-5" />,
        },
        {
          label: "Programs",
          value: stats.services,
          icon: <FileText className="size-5" />,
        },
        {
          label: "Store locations",
          value: stats.locations,
          icon: <MapPin className="size-5" />,
        },
        {
          label: "Success stories",
          value: stats.stories,
          icon: <Award className="size-5" />,
        },
      ]
    : [];

  const needsAttention = [
    ...(stats && stats.pending !== null && stats.pending > 0
      ? [
          {
            id: "inquiries",
            panel: "inquiries" as Tab,
            title: `${stats.pending} contact ${
              stats.pending === 1 ? "message is" : "messages are"
            } awaiting a reply`,
            detail: "The public contact form feeds these directly to the CMS.",
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      {error && (
        <ErrorState
          title="Some data could not be refreshed"
          message={error}
          onRetry={load}
        />
      )}

      <section aria-labelledby="overview-title">
        <h2
          id="overview-title"
          className="font-display text-[15px] font-semibold text-cream"
        >
          Website overview
        </h2>
        {!stats ? (
          <div className="mt-4">
            <LoadingState label="Loading overview…" />
          </div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((card) => (
              <div
                key={card.label}
                className="rounded-2xl bg-white/[0.04] p-5 ring-1 ring-white/10"
              >
                <span className="text-gold-light">{card.icon}</span>
                <p className="mt-3 font-display text-2xl font-semibold tabular-nums">
                  {/* An em dash, not a zero: this figure could not be read. A
                      `0` would assert "there are none", which is a different and
                      potentially alarming claim. */}
                  {card.value ?? "\u2014"}
                </p>
                <p className="mt-0.5 text-[13px] text-cream/60">{card.label}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {needsAttention.length > 0 && (
        <section aria-labelledby="attention-title">
          <h2
            id="attention-title"
            className="font-display text-[15px] font-semibold text-cream"
          >
            Needs attention
          </h2>
          <ul className="mt-4 space-y-2">
            {needsAttention.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onNavigate(item.panel)}
                  className="flex w-full items-center gap-3 rounded-xl bg-amber-500/10 px-4 py-3 text-left ring-1 ring-amber-400/20 transition-colors hover:bg-amber-500/15"
                >
                  <AlertCircle
                    className="size-5 shrink-0 text-amber-300"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-cream">
                      {item.title}
                    </span>
                    <span className="block text-[13px] text-cream/60">
                      {item.detail}
                    </span>
                  </span>
                  <span className="shrink-0 text-[13px] font-semibold text-amber-200">
                    Review
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section
          aria-labelledby="recent-news-title"
          className="rounded-2xl bg-white/[0.04] p-5 ring-1 ring-white/10"
        >
          <div className="flex items-center justify-between gap-3">
            <h3
              id="recent-news-title"
              className="flex items-center gap-2.5 font-display text-[15px] font-semibold text-cream"
            >
              <span className="text-gold-light">
                <ScrollText className="size-4" aria-hidden="true" />
              </span>
              Recent news
            </h3>
            <button
              type="button"
              onClick={() => onNavigate("news")}
              className="text-[13px] font-semibold text-gold transition-colors hover:text-gold-light"
            >
              Manage
            </button>
          </div>
          {!latest ? (
            <p className="mt-4 text-sm text-cream/45">Loading…</p>
          ) : latest.news.length === 0 ? (
            <p className="mt-4 text-sm text-cream/45">No news articles yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-white/[0.06]">
              {latest.news.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <span className="min-w-0 truncate text-sm text-cream">
                    {item.title}
                  </span>
                  <StatusBadge status={item.status ?? "DRAFT"} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          aria-labelledby="upcoming-events-title"
          className="rounded-2xl bg-white/[0.04] p-5 ring-1 ring-white/10"
        >
          <div className="flex items-center justify-between gap-3">
            <h3
              id="upcoming-events-title"
              className="flex items-center gap-2.5 font-display text-[15px] font-semibold text-cream"
            >
              <span className="text-gold-light">
                <CalendarDays className="size-4" aria-hidden="true" />
              </span>
              Upcoming events
            </h3>
            <button
              type="button"
              onClick={() => onNavigate("events")}
              className="text-[13px] font-semibold text-gold transition-colors hover:text-gold-light"
            >
              Manage
            </button>
          </div>
          {!latest ? (
            <p className="mt-4 text-sm text-cream/45">Loading…</p>
          ) : latest.events.length === 0 ? (
            <p className="mt-4 text-sm text-cream/45">No events scheduled.</p>
          ) : (
            <ul className="mt-4 divide-y divide-white/[0.06]">
              {latest.events.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-cream">
                      {item.title}
                    </span>
                    {item.startAt && (
                      <time
                        dateTime={item.startAt}
                        className="block text-[12px] text-cream/45"
                      >
                        {new Date(item.startAt).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </time>
                    )}
                  </span>
                  <StatusBadge status={item.status ?? "DRAFT"} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {pending && pending.length > 0 && (
        <section
          aria-labelledby="recent-messages-title"
          className="rounded-2xl bg-white/[0.04] p-5 ring-1 ring-white/10"
        >
          <div className="flex items-center justify-between gap-3">
            <h3
              id="recent-messages-title"
              className="flex items-center gap-2.5 font-display text-[15px] font-semibold text-cream"
            >
              <span className="text-gold-light">
                <Inbox className="size-4" aria-hidden="true" />
              </span>
              Recent messages
            </h3>
            <button
              type="button"
              onClick={() => onNavigate("inquiries")}
              className="text-[13px] font-semibold text-gold transition-colors hover:text-gold-light"
            >
              View all
            </button>
          </div>
          <ul className="mt-4 divide-y divide-white/[0.06]">
            {pending.slice(0, 4).map((inquiry) => (
              <li key={inquiry.id} className="py-2.5">
                <p className="truncate text-sm text-cream">
                  {inquiry.subject || "No subject"}
                </p>
                <p className="mt-0.5 text-xs text-cream/45">
                  {inquiry.fullName} · {fmtShortTime(inquiry.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section
        aria-labelledby="recent-activity-title"
        className="rounded-2xl bg-white/[0.04] p-5 ring-1 ring-white/10"
      >
        <div className="flex items-center justify-between gap-3">
          <h3
            id="recent-activity-title"
            className="flex items-center gap-2.5 font-display text-[15px] font-semibold text-cream"
          >
            <span className="text-gold-light">
              <History className="size-4" aria-hidden="true" />
            </span>
            Recent activity
          </h3>
          {canAudit && (
            <button
              type="button"
              onClick={() => onNavigate("activity")}
              className="text-[13px] font-semibold text-gold transition-colors hover:text-gold-light"
            >
              Full log
            </button>
          )}
        </div>
        {!canAudit ? (
          <p className="mt-4 text-sm text-cream/45">
            The activity log records every change to the CMS and is restricted
            to Super Administrators.
          </p>
        ) : !activity ? (
          <LoadingState label="Loading activity…" />
        ) : activity.length === 0 ? (
          <p className="mt-4 text-sm text-cream/45">
            No changes have been made yet. Publish your first content update to
            see it here.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-white/[0.06]">
            {activity.map((entry) => (
              <li
                key={entry.id}
                className="flex items-start justify-between gap-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-cream">
                    <span className="font-semibold text-gold-light">
                      {entry.actorName}
                    </span>{" "}
                    {entry.summary}
                  </p>
                  <p className="mt-0.5 text-xs text-cream/45">
                    {entry.action} · {entry.targetType}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      entry.status === "ERROR"
                        ? "bg-red-500/15 text-red-300"
                        : "bg-emerald-brand/15 text-emerald-200"
                    }`}
                  >
                    {entry.status}
                  </span>
                  <time
                    className="text-[11px] text-cream/40"
                    dateTime={entry.createdAt}
                  >
                    {fmtShortTime(entry.createdAt)}
                  </time>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function InquiriesPanel({
  notify,
  onSessionError,
}: {
  notify: (message: string, kind?: "success" | "error") => void;
  onSessionError: (error: unknown) => void;
}) {
  const [inquiries, setInquiries] = useState<Inquiry[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<string>("ALL");
  const [openId, setOpenId] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(async () => {
    const query = filter === "ALL" ? "" : `?status=${filter}`;
    try {
      const data = await apiFetch<Inquiry[]>(`/api/v1/admin/inquiries${query}`);
      setInquiries(data);
      setLoadError(false);
    } catch (error) {
      onSessionError(error);
      // Distinct from "no inquiries". Without this the panel holds `null` and
      // spins forever, which reads as a hung request rather than a failed one —
      // and an admin whose database is briefly unreachable cannot tell that from
      // every inquiry having been deleted.
      setLoadError(true);
    }
  }, [filter, onSessionError]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  useRealtimePoll(load, undefined, "inquiries");

  const changeStatus = async (id: string, status: Inquiry["status"]) => {
    setUpdating(id);
    try {
      await apiFetch(`/api/v1/admin/inquiries/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      notify(`Inquiry marked ${status}.`);
      await load();
    } catch (error) {
      onSessionError(error);
      notify("Could not update inquiry.");
    } finally {
      setUpdating(null);
    }
  };

  const filters = ["ALL", "PENDING", "REVIEWED", "RESOLVED"] as const;

  return (
    <Panel
      title="Customer & Farmer Inquiries"
      icon={<Inbox className="size-5" />}
    >
      <div className="flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
              filter === f
                ? "bg-gold text-forest"
                : "bg-white/5 text-cream/70 ring-1 ring-white/10 hover:text-cream"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loadError ? (
        <ErrorState
          title="Could not load inquiries"
          message="The server did not respond. Nothing has been deleted — this is a connection problem. Try again."
          onRetry={() => void load()}
        />
      ) : !inquiries ? (
        <div className="mt-6 grid place-items-center py-14 text-cream/50">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : inquiries.length === 0 ? (
        <p className="mt-6 rounded-xl bg-white/5 px-4 py-10 text-center text-sm text-cream/50">
          No inquiries match this filter.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {inquiries.map((inquiry) => {
            const open = openId === inquiry.id;
            return (
              <li
                key={inquiry.id}
                className="rounded-2xl bg-white/[0.05] ring-1 ring-white/10"
              >
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : inquiry.id)}
                  className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3.5 text-left"
                >
                  <span className="flex flex-col">
                    <span className="font-semibold text-cream">
                      {inquiry.fullName}
                    </span>
                    <span className="text-[12px] text-cream/55">
                      {inquiry.email}
                      {inquiry.phone ? ` · ${inquiry.phone}` : ""}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="rounded-full bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-cream/70 ring-1 ring-white/10">
                      {inquiry.userType}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                        inquiry.status === "RESOLVED"
                          ? "bg-emerald-500/15 text-emerald-300"
                          : inquiry.status === "REVIEWED"
                            ? "bg-gold/15 text-gold-light"
                            : "bg-amber-500/15 text-amber-300"
                      }`}
                    >
                      {inquiry.status}
                    </span>
                  </span>
                </button>

                {open && (
                  <div className="border-t border-white/10 px-4 py-4">
                    {inquiry.subject && (
                      <p className="text-sm font-semibold text-gold-light">
                        {inquiry.subject}
                      </p>
                    )}
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-cream/80">
                      {inquiry.message}
                    </p>
                    <p className="mt-3 text-[12px] text-cream/45">
                      Received {new Date(inquiry.createdAt).toLocaleString()}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <a
                        href={`mailto:${inquiry.email}?subject=Re: ${encodeURIComponent(
                          inquiry.subject ?? "Your inquiry",
                        )}`}
                        className="btn btn-ghost-soft btn-sm"
                      >
                        <Mail className="size-3.5" aria-hidden="true" />
                        Reply by email
                      </a>
                      <label className="flex items-center gap-2 text-xs font-semibold text-cream/60">
                        Status
                        <select
                          value={inquiry.status}
                          disabled={updating === inquiry.id}
                          onChange={(e) =>
                            changeStatus(
                              inquiry.id,
                              e.target.value as Inquiry["status"],
                            )
                          }
                          className="rounded-lg border border-white/15 bg-forest px-2 py-1.5 text-xs text-cream outline-none focus:border-gold"
                        >
                          <option value="PENDING">PENDING</option>
                          <option value="REVIEWED">REVIEWED</option>
                          <option value="RESOLVED">RESOLVED</option>
                        </select>
                      </label>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function LeadershipPanel({
  notify,
  onSessionError,
}: {
  notify: (message: string, kind?: "success" | "error") => void;
  onSessionError: (error: unknown) => void;
}) {
  const [leaders, setLeaders] = useState<Leader[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [form, setForm] = useState({
    name: "",
    title: "",
    bio: "",
    photoUrl: "",
    icon: "users",
    gradient: GRADIENT_OPTIONS[0],
    displayOrder: 1,
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<Leader[]>("/api/v1/leadership");
      setLeaders(data.sort((a, b) => a.displayOrder - b.displayOrder));
      setLoadError(false);
    } catch (error) {
      onSessionError(error);
      setLoadError(true);
    }
  }, [onSessionError]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  useRealtimePoll(load, undefined, "leadership");

  const resetForm = () => {
    setEditingId(undefined);
    setForm({
      name: "",
      title: "",
      bio: "",
      photoUrl: "",
      icon: "users",
      gradient: GRADIENT_OPTIONS[0],
      displayOrder: (leaders?.length ?? 0) + 1,
    });
  };

  const startEdit = (leader: Leader) => {
    setEditingId(leader.id);
    setForm({
      name: leader.name,
      title: leader.title,
      bio: leader.bio ?? "",
      photoUrl: leader.photoUrl ?? "",
      icon: leader.icon ?? "users",
      gradient: leader.gradient ?? GRADIENT_OPTIONS[0],
      displayOrder: leader.displayOrder,
    });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const base = leaders?.find((l) => l.id === editingId)?.updatedAt;
      const ok = await publishAndFeedback(notify, onSessionError, () =>
        apiFetch<PublishResult>("/api/v1/admin/leadership", {
          method: "POST",
          body: JSON.stringify({
            id: editingId,
            name: form.name,
            title: form.title,
            bio: form.bio,
            photoUrl: form.photoUrl,
            icon: form.icon,
            gradient: form.gradient,
            displayOrder: Number(form.displayOrder) || 1,
            baseUpdatedAt: base,
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

  return (
    <Panel title="Leadership" icon={<Users className="size-5" />}>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-cream/50">
            {editingId ? "Edit member" : "Add a member"}
          </h3>
          <form onSubmit={submit} className="mt-4 space-y-4">
            <Field label="Full Name">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                className={inputBase}
                placeholder="e.g. Nakayiki Rose"
              />
            </Field>
            <Field label="Title / Role">
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
                className={inputBase}
                placeholder="e.g. Treasurer"
              />
            </Field>
            <Field label="Bio">
              <textarea
                rows={3}
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                className={`${inputBase} resize-none`}
              />
            </Field>
            <Field label="Photo URL">
              <div className="flex gap-2">
                <input
                  value={form.photoUrl}
                  onChange={(e) =>
                    setForm({ ...form, photoUrl: e.target.value })
                  }
                  className={inputBase}
                  placeholder="/uploads/….jpg or https://…"
                />
              </div>
              <UploadButton
                onUploaded={(url) => setForm({ ...form, photoUrl: url })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Icon">
                <select
                  value={form.icon}
                  onChange={(e) => setForm({ ...form, icon: e.target.value })}
                  className={inputBase}
                >
                  {LEADER_ICON_OPTIONS.map((i) => (
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
            <Field label="Gradient">
              <select
                value={form.gradient}
                onChange={(e) => setForm({ ...form, gradient: e.target.value })}
                className={inputBase}
              >
                {GRADIENT_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}
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
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : editingId ? (
                  <FileText className="size-4" aria-hidden="true" />
                ) : (
                  <Plus className="size-4" aria-hidden="true" />
                )}
                {editingId ? "Save changes" : "Add member"}
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

        <ul className="space-y-3">
          {loadError ? (
            <li className="list-none">
              <ErrorState
                title="Could not load leadership"
                message="The server did not respond. Nothing has been deleted — try again."
                onRetry={() => void load()}
              />
            </li>
          ) : !leaders ? (
            <li className="grid place-items-center py-12 text-cream/50">
              <Loader2 className="size-6 animate-spin" />
            </li>
          ) : (
            leaders.map((leader) => (
              <li
                key={leader.id}
                className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.05] px-4 py-3 ring-1 ring-white/10"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {leader.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={leader.photoUrl}
                      alt={leader.name}
                      className="size-11 rounded-xl object-cover ring-1 ring-white/15"
                    />
                  ) : (
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-gold/20 text-gold-light">
                      <Crown className="size-5" aria-hidden="true" />
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {leader.name}
                    </p>
                    <p className="text-[12px] text-cream/55">
                      {leader.title} · order {leader.displayOrder}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => startEdit(leader)}
                  className="btn btn-ghost-soft btn-sm"
                >
                  Edit
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </Panel>
  );
}

function LogoPanel({
  notify,
  onSessionError,
}: {
  notify: (message: string, kind?: "success" | "error") => void;
  onSessionError: (error: unknown) => void;
}) {
  const [info, setInfo] = useState<LogoSettings | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [logoUrl, setLogoUrl] = useState("");
  const [saving, setSaving] = useState(false);

  // `useRealtimePoll` re-runs `load` every 4 seconds and again on window focus,
  // so an unguarded `setLogoUrl` here silently discarded an upload or a typed
  // URL before the user could reach Save. That is why a successful upload
  // appeared to do nothing: the poll restored the stored value, and the next
  // save wrote that value back.
  //
  // A ref, not state, because `load` is memoised on `[onSessionError]` and must
  // not re-subscribe to the poll when this flag changes.
  const edited = useRef(false);

  const load = useCallback(async () => {
    try {
      const settings = await apiFetch<LogoSettings>("/api/v1/settings");
      setInfo(settings);
      // `info` always refreshes, so the concurrency token the save sends stays
      // current even while a local edit is in progress. Only the editable field
      // is protected.
      if (!edited.current) setLogoUrl(settings.logoUrl ?? "");
      setLoadError(false);
    } catch (error) {
      onSessionError(error);
      setLoadError(true);
    }
  }, [onSessionError]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  useRealtimePoll(load, undefined, "settings");

  const preview = logoUrl.trim() || "/images/logo-light.png";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!info) return;
    setSaving(true);
    try {
      const ok = await publishAndFeedback(notify, onSessionError, () =>
        apiFetch<PublishResult>("/api/v1/admin/settings", {
          method: "POST",
          body: JSON.stringify({
            // Only the logo. The settings row is shared with the About and
            // Contact screens, and the API treats an omitted field as "leave
            // alone" — so this screen must not round-trip fields it does not
            // display. It previously did, which is how saving a logo could
            // blank the cooperative's contact details.
            logoUrl: logoUrl.trim(),
            baseUpdatedAt: info.updatedAt,
          }),
        }),
      );
      if (ok) {
        // Clear the guard before reloading, so the response confirming the save
        // is what repopulates the field. Leaving it set would freeze the form
        // on a value that is right now but stale after the next edit elsewhere.
        edited.current = false;
        await load();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title="Business Logo" icon={<ImageIcon className="size-5" />}>
      <form onSubmit={submit} className="grid gap-4 lg:grid-cols-2">
        <div>
          <div className="flex items-center gap-4">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt="Current logo preview"
                className="grid size-24 shrink-0 place-items-center rounded-2xl bg-forest-deep p-2.5 object-contain shadow-card ring-1 ring-white/20"
              />
            ) : (
              <span className="grid size-24 shrink-0 place-items-center rounded-2xl bg-white/5 ring-1 ring-white/10">
                <ImageIcon
                  className="size-8 text-cream/40"
                  aria-hidden="true"
                />
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                edited.current = true;
                setLogoUrl("");
              }}
              className="btn btn-ghost-soft btn-sm"
            >
              Reset to default
            </button>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-cream/50">
            The logo appears on the dark site header and footer below the
            wordmark. It renders on a transparent background, so use a logo with
            a light/white design to stay clearly visible.
          </p>
        </div>

        <div className="space-y-4">
          <Field label="Logo URL">
            <input
              value={logoUrl}
              onChange={(e) => {
                edited.current = true;
                setLogoUrl(e.target.value);
              }}
              className={inputBase}
              placeholder="/images/logo-light.png or https://…"
            />
          </Field>
          <UploadButton
            label="Upload new logo"
            onUploaded={(url) => {
              // An upload is an unsaved edit like any other, and is exactly the
              // case the poll used to erase.
              edited.current = true;
              setLogoUrl(url);
            }}
          />
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
              Save logo
            </button>
          </div>
        </div>
      </form>
      {loadError ? (
        <ErrorState
          title="Could not load cooperative settings"
          message="The server did not respond, so this panel cannot tell whether settings exist. Nothing has been deleted — try again."
          onRetry={() => void load()}
        />
      ) : !info ? (
        <p className="mt-4 text-sm text-cream/45">
          No cooperative settings found. Save the About section first.
        </p>
      ) : null}
    </Panel>
  );
}

function SuccessStoriesPanel({
  notify,
  onSessionError,
}: {
  notify: (message: string, kind?: "success" | "error") => void;
  onSessionError: (error: unknown) => void;
}) {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [stories, setStories] = useState<StoryItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [form, setForm] = useState({
    title: "",
    quote: "",
    description: "",
    metric: "",
    imageUrl: "",
    displayOrder: 1,
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<StoryItem[]>("/api/v1/stories");
      setStories(data.sort((a, b) => a.displayOrder - b.displayOrder));
      setLoadError(false);
    } catch (error) {
      onSessionError(error);
      setLoadError(true);
    }
  }, [onSessionError]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  useRealtimePoll(load, undefined, "stories");

  const resetForm = () => {
    setEditingId(undefined);
    setForm({
      title: "",
      quote: "",
      description: "",
      metric: "",
      imageUrl: "",
      displayOrder: (stories?.length ?? 0) + 1,
    });
  };

  const startEdit = (story: StoryItem) => {
    setEditingId(story.id);
    setForm({
      title: story.title,
      quote: story.quote ?? "",
      description: story.description,
      metric: story.metric ?? "",
      imageUrl: story.imageUrl ?? "",
      displayOrder: story.displayOrder,
    });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const base = stories?.find((s) => s.id === editingId)?.updatedAt;
      const ok = await publishAndFeedback(notify, onSessionError, () =>
        apiFetch<PublishResult>("/api/v1/admin/stories", {
          method: "POST",
          body: JSON.stringify({
            id: editingId,
            title: form.title,
            quote: form.quote,
            description: form.description,
            metric: form.metric,
            imageUrl: form.imageUrl,
            displayOrder: Number(form.displayOrder) || 1,
            baseUpdatedAt: base,
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

  const remove = async (story: StoryItem) => {
    const ok = await confirm({
      title: `Delete “${story.title}”?`,
      body: "This success story will be removed from the public site. This action cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/v1/admin/stories/${story.id}`, { method: "DELETE" });
      notify("Success story deleted.");
      await load();
    } catch (error) {
      onSessionError(error);
      notify("Could not delete success story.");
    }
  };

  return (
    <>
      {confirmDialog}
      <Panel title="Success Stories" icon={<Award className="size-5" />}>
        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-cream/50">
              {editingId ? "Edit story" : "Add a success story"}
            </h3>
            <form onSubmit={submit} className="mt-4 space-y-4">
              <Field label="Title">
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                  className={inputBase}
                  placeholder="e.g. 300 Farmers Paid Within Days"
                />
              </Field>
              <Field label="Highlight metric (optional)">
                <input
                  value={form.metric}
                  onChange={(e) => setForm({ ...form, metric: e.target.value })}
                  className={inputBase}
                  placeholder="e.g. UGX 120M paid for the 2025 season"
                />
              </Field>
              <Field label="Short quote (optional)">
                <input
                  value={form.quote}
                  onChange={(e) => setForm({ ...form, quote: e.target.value })}
                  className={inputBase}
                  placeholder="e.g. “Members saw a 20% rise in income.”"
                />
              </Field>
              <Field label="Description">
                <textarea
                  rows={4}
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  required
                  className={`${inputBase} resize-none`}
                />
              </Field>
              <Field label="Image URL">
                <div className="flex gap-2">
                  <input
                    value={form.imageUrl}
                    onChange={(e) =>
                      setForm({ ...form, imageUrl: e.target.value })
                    }
                    className={inputBase}
                    placeholder="/uploads/….jpg or https://…"
                  />
                </div>
                <UploadButton
                  onUploaded={(url) => setForm({ ...form, imageUrl: url })}
                />
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
                  {editingId ? "Save changes" : "Add story"}
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

          <ul className="space-y-3">
            {loadError ? (
              <li className="list-none">
                <ErrorState
                  title="Could not load success stories"
                  message="The server did not respond. Nothing has been deleted — try again."
                  onRetry={() => void load()}
                />
              </li>
            ) : !stories ? (
              <li className="grid place-items-center py-12 text-cream/50">
                <Loader2 className="size-6 animate-spin" />
              </li>
            ) : stories.length === 0 ? (
              <li className="rounded-2xl bg-white/5 px-4 py-10 text-center text-sm text-cream/50">
                No success stories yet.
              </li>
            ) : (
              stories.map((story) => (
                <li
                  key={story.id}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.05] px-4 py-3 ring-1 ring-white/10"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {story.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={story.imageUrl}
                        alt={story.title}
                        className="size-11 rounded-xl object-cover ring-1 ring-white/15"
                      />
                    ) : (
                      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-gold/20 text-gold-light">
                        <Award className="size-5" aria-hidden="true" />
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {story.title}
                      </p>
                      <p className="text-[12px] text-cream/55">
                        order {story.displayOrder}
                        {story.metric ? ` · ${story.metric}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(story)}
                      className="btn btn-ghost-soft btn-sm"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(story)}
                      aria-label="Delete success story"
                      className="grid size-8 place-items-center rounded-lg bg-red-500/10 text-red-300 ring-1 ring-red-400/20 transition-colors hover:bg-red-500/20"
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      </Panel>
    </>
  );
}

function ProductsPanel({
  notify,
  onSessionError,
}: {
  notify: (message: string, kind?: "success" | "error") => void;
  onSessionError: (error: unknown) => void;
}) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [form, setForm] = useState<{
    title: string;
    category: Product["category"];
    description: string;
    price: string;
    unit: string;
    badge: string;
    cta: string;
    tone: string;
    icon: string;
    imageUrl: string;
    isAvailable: boolean;
  }>({
    title: "",
    category: "COFFEE_BEANS",
    description: "",
    price: "",
    unit: "",
    badge: "",
    cta: "Enquire about availability",
    tone: GRADIENT_OPTIONS[0],
    icon: "coffee",
    imageUrl: "",
    isAvailable: true,
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<Product[]>("/api/v1/products");
      setProducts(data);
      setLoadError(false);
    } catch (error) {
      onSessionError(error);
      setLoadError(true);
    }
  }, [onSessionError]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  useRealtimePoll(load, undefined, "products");

  const resetForm = () => {
    setEditingId(undefined);
    setForm({
      title: "",
      category: "COFFEE_BEANS",
      description: "",
      price: "",
      unit: "",
      badge: "",
      cta: "Enquire about availability",
      tone: GRADIENT_OPTIONS[0],
      icon: "coffee",
      imageUrl: "",
      isAvailable: true,
    });
  };

  const startEdit = (product: Product) => {
    setEditingId(product.id);
    setForm({
      title: product.title,
      category: product.category,
      description: product.description ?? "",
      price: product.price ?? "",
      unit: product.unit ?? "",
      badge: product.badge ?? "",
      cta: product.cta ?? "",
      tone: product.tone ?? GRADIENT_OPTIONS[0],
      icon: product.icon ?? "coffee",
      imageUrl: product.imageUrl ?? "",
      isAvailable: product.isAvailable,
    });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const base = products?.find((p) => p.id === editingId)?.updatedAt;
      const ok = await publishAndFeedback(notify, onSessionError, () =>
        apiFetch<PublishResult>("/api/v1/admin/products", {
          method: "POST",
          body: JSON.stringify({ id: editingId, ...form, baseUpdatedAt: base }),
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

  return (
    <Panel
      title="Product & Input Catalog"
      icon={<PackageCheck className="size-5" />}
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-cream/50">
            {editingId ? "Edit product" : "Add a product"}
          </h3>
          <form onSubmit={submit} className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Title">
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                  className={inputBase}
                  placeholder="e.g. DAP 18-46-0"
                />
              </Field>
              <Field label="Category">
                <select
                  value={form.category}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      category: e.target.value as Product["category"],
                    })
                  }
                  className={inputBase}
                >
                  {PRODUCT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Description">
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                className={`${inputBase} resize-none`}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Price">
                <input
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  className={inputBase}
                  placeholder="Request quote"
                />
              </Field>
              <Field label="Unit">
                <input
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  className={inputBase}
                  placeholder="50kg bag"
                />
              </Field>
              <Field label="Badge">
                <input
                  value={form.badge}
                  onChange={(e) => setForm({ ...form, badge: e.target.value })}
                  className={inputBase}
                  placeholder="e.g. Specialty Grade"
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="CTA text">
                <input
                  value={form.cta}
                  onChange={(e) => setForm({ ...form, cta: e.target.value })}
                  className={inputBase}
                />
              </Field>
              <Field label="Icon">
                <select
                  value={form.icon}
                  onChange={(e) => setForm({ ...form, icon: e.target.value })}
                  className={inputBase}
                >
                  {PRODUCT_ICON_OPTIONS.map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Image URL">
              <div className="flex gap-2">
                <input
                  value={form.imageUrl}
                  onChange={(e) =>
                    setForm({ ...form, imageUrl: e.target.value })
                  }
                  className={inputBase}
                  placeholder="/uploads/….jpg or https://…"
                />
              </div>
              <UploadButton
                onUploaded={(url) => setForm({ ...form, imageUrl: url })}
              />
            </Field>
            <label className="flex items-center gap-2.5 text-sm font-semibold text-cream/80">
              <input
                type="checkbox"
                checked={form.isAvailable}
                onChange={(e) =>
                  setForm({ ...form, isAvailable: e.target.checked })
                }
                className="size-4 accent-[#d5a83d]"
              />
              Available to the public
            </label>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="btn btn-primary flex-1"
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : editingId ? (
                  <FileText className="size-4" aria-hidden="true" />
                ) : (
                  <Plus className="size-4" aria-hidden="true" />
                )}
                {editingId ? "Save changes" : "Add product"}
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

        <ul className="space-y-3">
          {loadError ? (
            <li className="list-none">
              <ErrorState
                title="Could not load products"
                message="The server did not respond. Nothing has been deleted — try again."
                onRetry={() => void load()}
              />
            </li>
          ) : !products ? (
            <li className="grid place-items-center py-12 text-cream/50">
              <Loader2 className="size-6 animate-spin" />
            </li>
          ) : (
            products.map((product) => (
              <li
                key={product.id}
                className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.05] px-4 py-3 ring-1 ring-white/10"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {product.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.imageUrl}
                      alt={product.title}
                      className="size-11 rounded-xl object-cover ring-1 ring-white/15"
                    />
                  ) : (
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-gold/20 text-gold-light">
                      <PackageCheck className="size-5" aria-hidden="true" />
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {product.title}
                    </p>
                    <p className="text-[12px] text-cream/55">
                      {product.category.replaceAll("_", " ")}
                      {product.price ? ` · ${product.price}` : ""}
                      <span
                        className={`ml-2 ${
                          product.isAvailable
                            ? "text-emerald-300"
                            : "text-red-300"
                        }`}
                      >
                        {product.isAvailable ? "available" : "unavailable"}
                      </span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => startEdit(product)}
                  className="btn btn-ghost-soft btn-sm"
                >
                  Edit
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </Panel>
  );
}

function HomePanel({
  notify,
  onSessionError,
}: {
  notify: (message: string, kind?: "success" | "error") => void;
  onSessionError: (error: unknown) => void;
}) {
  const [hero, setHero] = useState<HeroContentItem | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    headlinePrefix: "",
    headlineHighlight: "",
    headlineSuffix: "",
    subtitle: "",
    badges: "",
    backgroundImage: "",
    todayItems: [{ icon: "coffee", title: "", sub: "" }] as TodayItemInput[],
  });

  // Same guard as `LogoPanel` and `AboutPanel`: `useRealtimePoll` re-runs `load`
  // every 4 seconds, and an unguarded `setForm` here discarded in-progress hero
  // edits before the user could save them.
  const edited = useRef(false);

  const update = (patch: Partial<typeof form>) => {
    edited.current = true;
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<HeroContentItem>("/api/v1/hero");
      setHero(data);
      setLoadError(false);
      if (!edited.current) {
        setForm({
          headlinePrefix: data.headlinePrefix,
          headlineHighlight: data.headlineHighlight,
          headlineSuffix: data.headlineSuffix,
          subtitle: data.subtitle,
          badges: (data.badges ?? []).join(", "),
          backgroundImage: data.backgroundImage ?? "",
          todayItems:
            data.todayItems.length > 0
              ? data.todayItems
              : [{ icon: "coffee", title: "", sub: "" }],
        });
      }
    } catch (error) {
      onSessionError(error);
      setLoadError(true);
    }
  }, [onSessionError]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  useRealtimePoll(load, undefined, "hero");

  const updateTodayItem = (index: number, patch: Partial<TodayItemInput>) => {
    update({
      todayItems: form.todayItems.map((item, i) =>
        i === index ? { ...item, ...patch } : item,
      ),
    });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const ok = await publishAndFeedback(notify, onSessionError, () =>
        apiFetch<PublishResult>("/api/v1/admin/hero", {
          method: "POST",
          body: JSON.stringify({
            headlinePrefix: form.headlinePrefix,
            headlineHighlight: form.headlineHighlight,
            headlineSuffix: form.headlineSuffix,
            subtitle: form.subtitle,
            badges: splitList(form.badges),
            todayItems: form.todayItems.filter(
              (item) => item.title.trim() !== "",
            ),
            backgroundImage: form.backgroundImage,
            baseUpdatedAt: hero?.updatedAt,
          }),
        }),
      );
      if (ok) {
        edited.current = false;
        await load();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title="Home | Hero Section" icon={<Home className="size-5" />}>
      <form onSubmit={submit} className="grid gap-4 lg:grid-cols-2">
        <Field label="Headline prefix">
          <input
            value={form.headlinePrefix}
            onChange={(e) => update({ headlinePrefix: e.target.value })}
            required
            className={inputBase}
            placeholder="Empowering Local Farmers through"
          />
        </Field>
        <Field label="Headline highlight (gold)">
          <input
            value={form.headlineHighlight}
            onChange={(e) => update({ headlineHighlight: e.target.value })}
            required
            className={inputBase}
            placeholder="Quality Coffee"
          />
        </Field>
        <Field label="Headline suffix">
          <input
            value={form.headlineSuffix}
            onChange={(e) => update({ headlineSuffix: e.target.value })}
            required
            className={inputBase}
            placeholder="& Sustainable Agriculture"
          />
        </Field>
        <Field label="Badges (comma separated)">
          <input
            value={form.badges}
            onChange={(e) => update({ badges: e.target.value })}
            className={inputBase}
            placeholder="Member Focused, Integrity & Transparency, …"
          />
        </Field>
        <Field label="Subtitle">
          <textarea
            rows={3}
            value={form.subtitle}
            onChange={(e) => update({ subtitle: e.target.value })}
            required
            className={`${inputBase} resize-none`}
          />
        </Field>
        <Field label="Background image URL">
          <div className="flex gap-2">
            <input
              value={form.backgroundImage}
              onChange={(e) => update({ backgroundImage: e.target.value })}
              className={inputBase}
              placeholder="/images/farmers.jpg or https://…"
            />
          </div>
          <UploadButton
            onUploaded={(url) => update({ backgroundImage: url })}
          />
        </Field>

        <div className="lg:col-span-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-cream/50">
            Today at the Cooperative
          </h3>
          <div className="mt-3 space-y-3">
            {form.todayItems.map((item, index) => (
              <div
                key={index}
                className="flex flex-wrap items-end gap-3 rounded-2xl bg-white/[0.05] p-3 ring-1 ring-white/10"
              >
                <Field label="Icon">
                  <select
                    value={item.icon}
                    onChange={(e) =>
                      updateTodayItem(index, { icon: e.target.value })
                    }
                    className={inputBase}
                  >
                    {HERO_TODAY_ICON_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Title">
                  <input
                    value={item.title}
                    onChange={(e) =>
                      updateTodayItem(index, { title: e.target.value })
                    }
                    className={`${inputBase} min-w-44`}
                    placeholder="Quality Coffee Collection"
                  />
                </Field>
                <Field label="Sub line">
                  <input
                    value={item.sub}
                    onChange={(e) =>
                      updateTodayItem(index, { sub: e.target.value })
                    }
                    className={`${inputBase} min-w-56`}
                    placeholder="Verified lots, openly weighed & graded"
                  />
                </Field>
                <button
                  type="button"
                  onClick={() =>
                    update({
                      todayItems: form.todayItems.filter((_, i) => i !== index),
                    })
                  }
                  aria-label="Remove item"
                  className="grid size-9 place-items-center rounded-lg bg-red-500/10 text-red-300 ring-1 ring-red-400/20 transition-colors hover:bg-red-500/20"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              update({
                todayItems: [
                  ...form.todayItems,
                  { icon: "coffee", title: "", sub: "" },
                ],
              })
            }
            className="mt-3 btn btn-ghost-soft btn-sm"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Add item
          </button>
        </div>

        <div className="flex items-end">
          <button
            type="submit"
            disabled={saving}
            className="btn btn-primary btn-md disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Settings2 className="size-4" aria-hidden="true" />
            )}
            Save home content
          </button>
        </div>
      </form>
      {loadError ? (
        <ErrorState
          title="Could not load hero content"
          message="The server did not respond, so this panel cannot tell whether hero content exists. Nothing has been deleted — try again."
          onRetry={() => void load()}
        />
      ) : !hero ? (
        <p className="mt-4 text-sm text-cream/45">
          No hero content found in the database yet. Submit to create it.
        </p>
      ) : null}
    </Panel>
  );
}

function AboutPanel({
  notify,
  onSessionError,
}: {
  notify: (message: string, kind?: "success" | "error") => void;
  onSessionError: (error: unknown) => void;
}) {
  const [info, setInfo] = useState<AboutSettings | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    mission: "",
    vision: "",
    taglines: "",
  });

  // Same guard as `LogoPanel`: `useRealtimePoll` re-runs `load` every 4 seconds,
  // and an unguarded `setForm` here discarded in-progress edits to the mission,
  // vision and taglines before the user could save. See that panel for the full
  // explanation of why this is a ref rather than state.
  const edited = useRef(false);

  const update = (patch: Partial<typeof form>) => {
    edited.current = true;
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const load = useCallback(async () => {
    try {
      const settings = await apiFetch<AboutSettings>("/api/v1/settings");
      // `info` carries the concurrency token the save sends, so it always
      // refreshes; only the editable fields are protected.
      setInfo(settings);
      if (!edited.current) {
        setForm({
          mission: settings.mission ?? "",
          vision: settings.vision ?? "",
          taglines: settings.taglines.join(", "),
        });
      }
      setLoadError(false);
    } catch (error) {
      onSessionError(error);
      setLoadError(true);
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
            // with the Contact and Logo screens, and the API treats an omitted
            // field as "leave alone" — sending them all would round-trip
            // whatever was loaded, which is what turns one screen's save into
            // another screen's silent overwrite.
            mission: form.mission,
            vision: form.vision,
            taglines: splitList(form.taglines),
            baseUpdatedAt: info?.updatedAt,
          }),
        }),
      );
      if (ok) {
        edited.current = false;
        await load();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6">
      <Panel
        title="About | Mission, Vision & Taglines"
        icon={<FileText className="size-5" />}
      >
        <form onSubmit={submit} className="grid gap-4 lg:grid-cols-2">
          <Field label="Mission">
            <textarea
              rows={3}
              value={form.mission}
              onChange={(e) => update({ mission: e.target.value })}
              className={`${inputBase} resize-none`}
            />
          </Field>
          <Field label="Vision">
            <textarea
              rows={3}
              value={form.vision}
              onChange={(e) => update({ vision: e.target.value })}
              className={`${inputBase} resize-none`}
            />
          </Field>
          <Field label="Taglines / motto (comma separated)">
            <input
              value={form.taglines}
              onChange={(e) => update({ taglines: e.target.value })}
              className={inputBase}
              placeholder="Working Together with Transparency & Respect, Together for Quality…"
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
              Save about section
            </button>
          </div>
        </form>
        {loadError ? (
          <ErrorState
            title="Could not load cooperative settings"
            message="The server did not respond, so this panel cannot tell whether settings exist. Nothing has been deleted — try again."
            onRetry={() => void load()}
          />
        ) : !info ? (
          <p className="mt-4 text-sm text-cream/45">
            No cooperative settings found. Submit to create the initial record.
          </p>
        ) : null}
      </Panel>

      <LogoPanel notify={notify} onSessionError={onSessionError} />

      <LeadershipPanel notify={notify} onSessionError={onSessionError} />
    </div>
  );
}
