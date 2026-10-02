import {
  Coffee,
  FlaskConical,
  GraduationCap,
  Landmark,
  Leaf,
  PiggyBank,
  Recycle,
  Sprout,
  Users,
  Wheat,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import type { LucideIcon } from "lucide-react";
import {
  InstagramIcon,
  TikTokIcon,
  YoutubeIcon,
} from "@/frontend/components/BrandIcons";

export const BRAND = {
  name: "Kalisizo Coffee Farmers Cooperative Society Ltd",
  shortName: "Kalisizo Coffee Cooperative",
  motto: "Together for Quality, Together for Prosperity!",
  values: ["Working Together with Transparency & Respect"],
};

export const TAGLINES = [
  "Working Together with Transparency & Respect",
  "Together for Quality, Together for Prosperity!",
];

/**
 * Primary navigation.
 *
 * These are real routes now, not home-page anchors, so the header must render
 * them with `next/link` (see `src/frontend/components/Header.tsx`) for client-side
 * transitions.
 */
export const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  { label: "Programs", href: "/programs" },
  { label: "Products", href: "/products" },
  { label: "Projects", href: "/projects" },
  { label: "News", href: "/news" },
  { label: "Events", href: "/events" },
  { label: "Gallery", href: "/gallery" },
  { label: "Contact", href: "/contact" },
];

/** In-page sections on the home page that used to be navigation targets. */
export const HOME_SECTION_IDS = [
  "home",
  "about",
  "services",
  "products",
  "location",
  "contact",
] as const;

export const HERO_BADGES = [
  "Member Focused",
  "Integrity & Transparency",
  "Sustainable Development",
  "Shared Prosperity",
];

export type Service = {
  id: string;
  /**
   * URL segment for the program's own page, under `/programs/[slug]`.
   *
   * These match the slugs `prisma/seed.ts` creates, so the footer can link
   * straight to a program page instead of a home-page anchor that only exists
   * on `/`. The CMS keeps a program's slug stable across edits, so a link
   * written here does not rot when a title changes.
   */
  slug: string;
  icon: LucideIcon;
  title: string;
  tagline: string;
  points: string[];
  details: string[];
  accent: string;
  ring: string;
};

export const SERVICES: Service[] = [
  {
    id: "trade",
    slug: "coffee-trade",
    icon: Coffee,
    title: "Coffee Trade",
    tagline: "Market linkage & transparent pricing for every member",
    points: [
      "Buying and marketing of quality coffee",
      "Fair and transparent prices",
      "Market linkage for better returns",
    ],
    details: [
      "Coffee harvested, milled and delivered to our central buying point",
      "Green beans weighed, graded and moisture-checked on the spot",
      "Prices quoted openly and payments made on transparent schedules",
      "Domestic and export buyers linked for premium member returns",
    ],
    accent: "from-[#d5a83d] to-[#a87a1d]",
    ring: "ring-[#d5a83d]/40",
  },
  {
    id: "production",
    slug: "production-facility",
    icon: FlaskConical,
    title: "Production Facility",
    tagline: "Quality inputs, soil testing & agronomic advisory",
    points: [
      "Supply of quality inputs & fertilizers",
      "Soil testing & advisory services",
      "Improving productivity and quality",
    ],
    details: [
      "Agri-input store stocked with DAP 18-46-0, NPK 17-17-17, Urea 46% N and organic manure",
      "Soil testing guidance before every growing season",
      "Advisory on fertilizer rates and coffee nutrition",
      "Crop protection, mulching and shade management support",
    ],
    accent: "from-[#1f7345] to-[#0e3d28]",
    ring: "ring-[#1f7345]/40",
  },
  {
    id: "sacco",
    slug: "sacco-services",
    icon: PiggyBank,
    title: "SACCO Services",
    tagline: "Savings, deposits & affordable credit for members",
    points: [
      "Savings and deposit services",
      "Affordable loans",
      "Empowering members financially",
    ],
    details: [
      "Open an affordable member savings account",
      "Low-interest loans aligned with farm income cycles",
      "Safe, audited and transparent record keeping",
      "Group welfare and savings mobilisation drives",
    ],
    accent: "from-[#4a2c11] to-[#7a4a1f]",
    ring: "ring-[#6b3f1a]/40",
  },
  {
    id: "capacity",
    slug: "capacity-building-support",
    icon: GraduationCap,
    title: "Capacity Building & Support",
    tagline: "Training, extension & climate-smart farming",
    points: [
      "Training in good agricultural practices",
      "Climate smart farming",
      "Business and financial literacy",
    ],
    details: [
      "Good Agricultural Practices: pruning, mulching, intercropping and careful harvesting",
      "Climate-smart practices: shade trees, water harvesting and agroforestry",
      "Financial literacy and simple farm business records",
      "Farmer group mentorship and guided field visits",
    ],
    accent: "from-[#1f7345] to-[#269558]",
    ring: "ring-[#1f7345]/40",
  },
];

export type Leader = {
  name: string;
  role: string;
  description: string;
  photo: string;
  initials: string;
  icon: string;
  gradient: string;
};

export const LEADERS: Leader[] = [
  {
    name: "Muwonge Deo",
    role: "Chairman / CEO",
    description:
      "Guides the cooperative's strategic direction, upholds governance and champions member welfare.",
    photo: "/leadership/muwonge-deo.jpeg",
    initials: "MD",
    icon: "crown",
    gradient: "from-[#d5a83d] to-[#a87a1d]",
  },
  {
    name: "Kanyangira Fred",
    role: "Vice Chairperson",
    description:
      "Deputizes the Chairman, supports governance and strengthens member representation across the cooperative.",
    photo: "/leadership/kanyangira-fred.jpeg",
    initials: "KF",
    icon: "crown",
    gradient: "from-[#0e3d28] to-[#1f7345]",
  },
  {
    name: "Kasumba Denis Collins",
    role: "Manager",
    description:
      "Coordinates daily operations, coffee purchases, quality control and market linkages.",
    photo: "/leadership/kasumba-denis-collins.jpeg",
    initials: "DC",
    icon: "briefcase",
    gradient: "from-[#1f7345] to-[#0e3d28]",
  },
  {
    name: "Nakayiki Rose",
    role: "Treasurer",
    description:
      "Manages member savings, accounts and SACCO financial reporting with full transparency.",
    photo: "/leadership/nakayiki-rose.jpeg",
    initials: "NR",
    icon: "wallet",
    gradient: "from-[#4a2c11] to-[#6b3f1a]",
  },
  {
    name: "Kasule Richard",
    role: "Secretary",
    description:
      "Documents meetings, maintains accurate records and supports clear member communication.",
    photo: "/leadership/kasule-richard.jpeg",
    initials: "KR",
    icon: "file",
    gradient: "from-[#1f7345] to-[#2b9757]",
  },
  {
    name: "Nanyondo Berna",
    role: "Committee Member",
    description:
      "Represents grassroots members, champions women in farming and supports field activities.",
    photo: "/leadership/nanyondo-berna.jpeg",
    initials: "NB",
    icon: "users",
    gradient: "from-[#a87a1d] to-[#d5a83d]",
  },
];

export type ProductCategory =
  | "All"
  | "Fertilizers"
  | "Coffee Beans"
  | "SACCO Services"
  | "Equipment";

export const PRODUCT_CATEGORIES: ProductCategory[] = [
  "All",
  "Fertilizers",
  "Coffee Beans",
  "SACCO Services",
];

export type Product = {
  name: string;
  category: Exclude<ProductCategory, "All">;
  badge: string;
  description: string;
  icon: LucideIcon;
  cta: string;
  tone: string;
};

export const PRODUCTS: Product[] = [
  {
    name: "DAP 18-46-0",
    category: "Fertilizers",
    badge: "Phosphorus Booster",
    description:
      "Diammonium phosphate for vigorous root development, strong flowering and better fruit set.",
    icon: FlaskConical,
    cta: "Enquire about availability",
    tone: "bg-gradient-to-br from-[#0e3d28] to-[#1f7345]",
  },
  {
    name: "NPK 17-17-17",
    category: "Fertilizers",
    badge: "Balanced Blend",
    description:
      "A complete, balanced blend applied at establishment to support healthy overall growth.",
    icon: Sprout,
    cta: "Enquire about availability",
    tone: "bg-gradient-to-br from-[#d5a83d] to-[#a87a1d]",
  },
  {
    name: "Urea 46% N",
    category: "Fertilizers",
    badge: "Nitrogen Boost",
    description:
      "High-nitrogen fertiliser to fuel vegetative growth and canopy development after harvest.",
    icon: Leaf,
    cta: "Enquire about availability",
    tone: "bg-gradient-to-br from-[#1f7345] to-[#269558]",
  },
  {
    name: "Organic Manure",
    category: "Fertilizers",
    badge: "Soil Guardian",
    description:
      "Composted organic matter that restores soil structure, water retention and microbial life.",
    icon: Recycle,
    cta: "Enquire about availability",
    tone: "bg-gradient-to-br from-[#4a2c11] to-[#6b3f1a]",
  },
  {
    name: "Washed Arabica",
    category: "Coffee Beans",
    badge: "Specialty Grade",
    description:
      "High-altitude, carefully washed arabica with refined acidity and a clean cup profile.",
    icon: Coffee,
    cta: "Request sample for wholesale",
    tone: "bg-gradient-to-br from-[#d5a83d] to-[#9c7419]",
  },
  {
    name: "Natural Robusta",
    category: "Coffee Beans",
    badge: "Strong Body",
    description:
      "Sun-dried robusta with bold body and chocolate notes, ideal for blends and espresso.",
    icon: Coffee,
    cta: "Request sample for wholesale",
    tone: "bg-gradient-to-br from-[#4a2c11] to-[#2a1508]",
  },
  {
    name: "Export-Grade Green",
    category: "Coffee Beans",
    badge: "Bulk Lots",
    description:
      "Verified, moisture-checked green lots sourced transparently from member farms.",
    icon: Wheat,
    cta: "Request export quotation",
    tone: "bg-gradient-to-br from-[#0e3d28] to-[#0f6b40]",
  },
  {
    name: "Savings Deposit Account",
    category: "SACCO Services",
    badge: "Members Only",
    description:
      "Secure member savings accounts that grow your capital while building financial discipline.",
    icon: PiggyBank,
    cta: "Open an account",
    tone: "bg-gradient-to-br from-[#1f7345] to-[#0e3d28]",
  },
  {
    name: "Affordable Credit Loans",
    category: "SACCO Services",
    badge: "Farm-Cycle Aligned",
    description:
      "Low-interest loans designed around your farming calendar, from inputs to harvest.",
    icon: Landmark,
    cta: "Check loan terms",
    tone: "bg-gradient-to-br from-[#a87a1d] to-[#d5a83d]",
  },
  {
    name: "Seasonal & Group Loans",
    category: "SACCO Services",
    badge: "Flexible Options",
    description:
      "Group-backed and seasonal credit that keeps the cooperative's money working for members.",
    icon: Users,
    cta: "Check loan terms",
    tone: "bg-gradient-to-br from-[#4a2c11] to-[#7a4a1f]",
  },
];

export const FAQS = [
  {
    question: "How do I become a member of the cooperative?",
    answer:
      "Membership is open to farmers in and around Kalisizo Sub County, Kyotera District. Visit our office or contact us and the committee will guide you through registration, the modest joining process and the benefits that follow.",
  },
  {
    question: "What prices do farmers receive for their coffee?",
    answer:
      "We operate on fair and transparent pricing. Coffee is weighed and graded openly at the buying point, and prices are announced before sale so every member knows exactly what to expect.",
  },
  {
    question: "Which fertilizers and inputs are available?",
    answer:
      "Our production facility supplies DAP 18-46-0, NPK 17-17-17, Urea 46% N and organic manure, alongside soil testing and agronomic advisory to help you apply them correctly.",
  },
  {
    question: "How does the SACCO savings and loan scheme work?",
    answer:
      "Members open a savings account and build up deposits over time. Pledged savings unlock affordable, farm-cycle-aligned loans. All accounts are recorded transparently and reported to members.",
  },
  {
    question: "Do you buy coffee from non-members?",
    answer:
      "We prioritise member produce, but buyers and farmers around the community are welcome to contact us. Joining the cooperative offers the most favourable pricing and support.",
  },
  {
    question: "How can coffee buyers place a wholesale order?",
    answer:
      "Wholesale and export buyers can use the inquiry form or contact us directly with the quantity and grade required. We link verified lots and arrange quality documentation for serious buyers.",
  },
];

export const CONTACT = {
  phones: ["+256 774 740 871", "+256 701 740 871", "+256 705 487 223"],
  email: "kalisizocoop@gmail.com",
  // Official registered address — verified on Google Maps
  // Kalisizo Coffee Farmers Cooperative Society Ltd, Kalisizo Town, Kyotera District, Uganda
  // 0°29'39.8"S 31°37'56.4"E (−0.4943772, 31.6323331)
  address: "Kalisizo Coffee Farmers Cooperative Society Ltd, Kalisizo Town, Kyotera District, Uganda",
  shortAddress: "Kalisizo Sub County, Kyotera District",
  latitude: -0.4943772,
  longitude: 31.6323331,
  // Short share link provided by cooperative — this is the real location pin
  mapsUrl: "https://maps.app.goo.gl/f5Q3ezaYKhCCbGSe9",
  // Labelled embed ensures pin shows cooperative name at Kyotera, not generic district
  mapsEmbedUrl:
    "https://www.google.com/maps?q=-0.4943772,31.6323331+(Kalisizo+Coffee+Farmers+Cooperative+Society+Ltd)&z=17&hl=en&output=embed",
  mapsSearchUrl:
    "https://www.google.com/maps/search/?api=1&query=-0.4943772,31.6323331",
  mapsPlaceUrl:
    "https://www.google.com/maps/place/0%C2%B029'39.8%22S+31%C2%B037'56.4%22E/@-0.4943772,31.6323331,17z",
};

export const INQUIRY_TYPES = [
  "General Inquiry",
  "Farmer Support",
  "Coffee Buyer / Wholesale",
  "Membership Application",
  "SACCO & Loans",
];

export type Social = {
  platform: string;
  handle: string;
  description: string;
  url: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  tile: string;
  hover: string;
};

export const SOCIALS: Social[] = [
  {
    platform: "YouTube",
    handle: "@muwongedeo2017",
    description:
      "Harvest stories, field tours and cooperative updates in video.",
    url: "https://youtube.com/@muwongedeo2017",
    icon: YoutubeIcon,
    tile: "bg-[#ff0000]/10 text-[#ff0000]",
    hover: "hover:border-[#ff0000]/40",
  },
  {
    platform: "Instagram",
    handle: "@nakafeero",
    description:
      "Beautiful moments from our farms, farmers and the cooperative.",
    url: "https://instagram.com/nakafeero",
    icon: InstagramIcon,
    tile: "bg-[#e1306c]/10 text-[#e1306c]",
    hover: "hover:border-[#e1306c]/40",
  },
  {
    platform: "TikTok & Official",
    handle: "Kalisizo Coffee Farmers Cooperative Society Ltd",
    description:
      "Follow all official platforms for news, offers and farmer tips.",
    url: "https://www.tiktok.com/@kalisizocoffee",
    icon: TikTokIcon,
    tile: "bg-[#00f2ea]/10 text-[#00f2ea]",
    hover: "hover:border-[#00f2ea]/40",
  },
];

export const MISSION_POINTS = [
  "Increased & sustainable member incomes",
  "A sustainable coffee environment",
  "Member-driven decision making",
];

export const VISION_POINTS = [
  "Fair treatment of every member",
  "A thriving, self-reliant cooperative",
  "Transparency in all we do",
];