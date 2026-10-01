/**
 * The admin navigation model.
 *
 * Every panel that `AdminClient` can render is registered here exactly once,
 * grouped the way an administrator thinks about the work rather than the way the
 * API routes happen to be shaped. The shell renders from this; `AdminClient`
 * resolves a selected id to a panel. Adding a panel means adding one entry, not
 * editing a switch statement in two places.
 *
 * Groups deliberately do not mirror the brief's sample menu, which lists things
 * this system does not have — traffic analytics, subscribers, video and document
 * media. Those would need new tables and tracking infrastructure, and inventing
 * placeholder data for them is worse than omitting them. `NewsArticle.viewCount`
 * is the one real usage signal in the schema.
 */
import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  CalendarDays,
  FileText,
  FolderOpen,
  Gauge,
  Images,
  LayoutTemplate,
  Mail,
  MapPin,
  Megaphone,
  Newspaper,
  Package,
  Quote,
  ScrollText,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import type { Permission } from "@/lib/permissions";

/** Every panel the admin can show. Kept in step with `Tab` in AdminClient. */
export type PanelId =
  | "overview"
  | "inquiries"
  | "home"
  | "about"
  | "services"
  | "products"
  | "stories"
  | "location"
  | "contact"
  | "news"
  | "events"
  | "projects"
  | "announcements"
  | "publications"
  | "pages"
  | "gallery-albums"
  | "gallery-images"
  | "users"
  | "activity"
  | "settings";

export type NavItem = {
  id: PanelId;
  label: string;
  /** Used for the breadcrumb and the collapsed-rail tooltip. */
  description: string;
  icon: LucideIcon;
  /** The server re-checks every action; this only decides whether to offer it. */
  permission: Permission;
};

export type NavGroup = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
};

const viewCms: Permission = "viewCms";

/** Standalone entries that sit above the collapsible groups. */
export const PRIMARY_NAV: NavItem[] = [
  {
    id: "overview",
    label: "Dashboard",
    description: "Overview of published content and recent activity",
    icon: Gauge,
    permission: viewCms,
  },
];

/**
 * Collapsible feature groups. Order is deliberate: the content an editor touches
 * daily comes first, site configuration next, then people and system concerns,
 * which only a Super Administrator can reach.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "content",
    label: "Content",
    icon: FileText,
    items: [
      {
        id: "pages",
        label: "Pages",
        description: "Free-form pages such as About, Membership and Privacy",
        icon: BookOpen,
        permission: viewCms,
      },
      {
        id: "news",
        label: "News",
        description: "News articles with categories, tags and SEO fields",
        icon: Newspaper,
        permission: viewCms,
      },
      {
        id: "events",
        label: "Events",
        description: "Upcoming and past cooperative events",
        icon: CalendarDays,
        permission: viewCms,
      },
      {
        id: "projects",
        label: "Projects",
        description: "Cooperative projects and their current stage",
        icon: FolderOpen,
        permission: viewCms,
      },
      {
        id: "announcements",
        label: "Announcements",
        description: "Short notices pinned to the top of the public site",
        icon: Megaphone,
        permission: viewCms,
      },
      {
        id: "publications",
        label: "Publications",
        description: "Downloadable reports, brochures, forms and policies",
        icon: ScrollText,
        permission: viewCms,
      },
      {
        id: "services",
        label: "Programs",
        description: "Services and programs shown on the home page",
        icon: Sparkles,
        permission: viewCms,
      },
    ],
  },
  {
    id: "media",
    label: "Media",
    icon: Images,
    items: [
      {
        id: "gallery-images",
        label: "Gallery Images",
        description: "Photographs, with alt text and captions",
        icon: Images,
        permission: viewCms,
      },
      {
        id: "gallery-albums",
        label: "Gallery Albums",
        description: "Albums that group gallery images",
        icon: LayoutTemplate,
        permission: viewCms,
      },
    ],
  },
  {
    id: "site",
    label: "Site Sections",
    icon: LayoutTemplate,
    items: [
      {
        id: "home",
        label: "Home Page",
        description: "Hero headline, badges and today's items",
        icon: LayoutTemplate,
        permission: viewCms,
      },
      {
        id: "about",
        label: "About & Leadership",
        description: "Mission, vision, taglines, logo and board members",
        icon: Quote,
        permission: viewCms,
      },
      {
        id: "products",
        label: "Products",
        description: "Products and inputs offered to members",
        icon: Package,
        permission: viewCms,
      },
      {
        id: "stories",
        label: "Success Stories",
        description: "Member testimonials and impact highlights",
        icon: Quote,
        permission: viewCms,
      },
      {
        id: "location",
        label: "Locations",
        description: "Collection points and the main branch",
        icon: MapPin,
        permission: viewCms,
      },
      {
        id: "contact",
        label: "Contact & FAQ",
        description: "Contact details, social links and FAQs",
        icon: Mail,
        permission: viewCms,
      },
    ],
  },
  {
    id: "communication",
    label: "Communication",
    icon: Mail,
    items: [
      {
        id: "inquiries",
        label: "Contact Messages",
        description: "Enquiries submitted through the public contact form",
        icon: Mail,
        permission: viewCms,
      },
    ],
  },
  {
    id: "users",
    label: "Users",
    icon: Users,
    items: [
      {
        id: "users",
        label: "All Users",
        description: "Accounts, roles and password resets",
        icon: Users,
        permission: "manageUsers",
      },
      {
        id: "activity",
        label: "Activity Log",
        description: "Immutable record of every change made in the CMS",
        icon: ShieldCheck,
        permission: "manageSystem",
      },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    icon: SettingsIcon,
    items: [
      {
        id: "settings",
        label: "General Settings",
        description: "Cooperative details, contact information and social profiles",
        icon: SettingsIcon,
        permission: "manageSettings",
      },
    ],
  },
];

const ALL_ITEMS: NavItem[] = [
  ...PRIMARY_NAV,
  ...NAV_GROUPS.flatMap((group) => group.items),
];

const BY_ID = new Map(ALL_ITEMS.map((item) => [item.id, item]));

export const PANEL_IDS: readonly PanelId[] = ALL_ITEMS.map((item) => item.id);

/** Narrowing guard so a URL can never select a panel that does not exist. */
export function isPanelId(value: string | null | undefined): value is PanelId {
  return typeof value === "string" && BY_ID.has(value as PanelId);
}

export function navItemFor(id: PanelId): NavItem | undefined {
  return BY_ID.get(id);
}

export function navGroupFor(id: PanelId): NavGroup | undefined {
  return NAV_GROUPS.find((group) => group.items.some((item) => item.id === id));
}

/** Flat list in visual order — used by the shell's search filter. */
export function allNavItems(): NavItem[] {
  return ALL_ITEMS;
}
