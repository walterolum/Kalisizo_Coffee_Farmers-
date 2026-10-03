/**
 * Presentation for the social links the CMS publishes.
 *
 * Links and icons are deliberately separated. The `SocialLink` table and the
 * settings API accept any platform, so the list of links belongs to the CMS and
 * must never be filtered down to what this file happens to know about — a
 * Facebook or WhatsApp link saved today renders today, without a code change.
 * What lives here is only how a link looks: an icon, a colour and, for the
 * platforms the cooperative actually uses, some copy.
 *
 * `SOCIALS` remains the fallback for when the settings request fails or the
 * cooperative has not been configured yet. A *loaded* settings response is
 * authoritative even when its list is empty: that means every link was
 * deliberately removed, and falling back would resurrect them.
 */
import {
  AtSign,
  Bookmark,
  Briefcase,
  Globe,
  Mail,
  MapPin,
  MessageCircle,
  Send,
  Share2,
  Users,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { InstagramIcon, TikTokIcon, YoutubeIcon } from "@/frontend/components/BrandIcons";
import { SOCIALS } from "@/shared/data";
import { isSafeSocialUrl, normalizePlatformName, type SocialProfile } from "@/shared/socials";

type SocialIcon = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;

type SocialLook = {
  icon: SocialIcon;
  tile: string;
  hover: string;
  description: string;
};

export type RenderedSocial = {
  key: string;
  platform: string;
  handle: string;
  url: string;
  description: string;
  icon: SocialIcon;
  tile: string;
  hover: string;
};

/** Used for any platform with no design of its own, so nothing renders blank. */
const GENERIC: SocialLook = {
  icon: Globe,
  tile: "bg-gold/10 text-gold-light",
  hover: "hover:border-gold/40",
  description: "News, offers and updates from the cooperative.",
};

/** Keyed by canonical platform name, which `normalizePlatformName` produces. */
const LOOKS: Record<string, SocialLook> = {
  YouTube: {
    icon: YoutubeIcon,
    tile: "bg-[#ff0000]/10 text-[#ff0000]",
    hover: "hover:border-[#ff0000]/40",
    description: "Harvest stories, field tours and cooperative updates in video.",
  },
  Instagram: {
    icon: InstagramIcon,
    tile: "bg-[#e1306c]/10 text-[#e1306c]",
    hover: "hover:border-[#e1306c]/40",
    description: "Beautiful moments from our farms, farmers and the cooperative.",
  },
  TikTok: {
    icon: TikTokIcon,
    tile: "bg-[#00f2ea]/10 text-[#00f2ea]",
    hover: "hover:border-[#00f2ea]/40",
    description: "Follow all official platforms for news, offers and farmer tips.",
  },
  Facebook: {
    icon: Users,
    tile: "bg-[#1877f2]/10 text-[#6ea8ff]",
    hover: "hover:border-[#1877f2]/40",
    description: "Cooperative announcements and community updates.",
  },
  X: {
    icon: AtSign,
    tile: "bg-white/10 text-cream",
    hover: "hover:border-white/40",
    description: "Quick updates, news and farmer tips.",
  },
  LinkedIn: {
    icon: Briefcase,
    tile: "bg-[#0a66c2]/10 text-[#5aa7f0]",
    hover: "hover:border-[#0a66c2]/40",
    description: "The cooperative as a business: partners, tenders and reports.",
  },
  WhatsApp: {
    icon: MessageCircle,
    tile: "bg-[#25d366]/10 text-[#5ce08c]",
    hover: "hover:border-[#25d366]/40",
    description: "Message us directly on WhatsApp.",
  },
  Telegram: {
    icon: Send,
    tile: "bg-[#229ed9]/10 text-[#63c4f0]",
    hover: "hover:border-[#229ed9]/40",
    description: "Broadcasts and farmer tips on Telegram.",
  },
  Threads: {
    icon: Share2,
    tile: "bg-white/10 text-cream",
    hover: "hover:border-white/40",
    description: "Conversations with farmers and members.",
  },
  Pinterest: {
    icon: Bookmark,
    tile: "bg-[#e60023]/10 text-[#ff6b81]",
    hover: "hover:border-[#e60023]/40",
    description: "Coffee, recipes and inspiration.",
  },
  "Google Business": {
    icon: MapPin,
    tile: "bg-[#34a853]/10 text-[#7dd39a]",
    hover: "hover:border-[#34a853]/40",
    description: "Our location, opening hours and reviews.",
  },
  Email: {
    icon: Mail,
    tile: "bg-gold/10 text-gold-light",
    hover: "hover:border-gold/40",
    description: "Write to the cooperative.",
  },
};

function lookFor(platform: string): SocialLook {
  const canonical = normalizePlatformName(platform);
  return LOOKS[canonical] ?? LOOKS[platform.trim()] ?? GENERIC;
}

/**
 * Link attributes for a social URL.
 *
 * Web links open in a new tab and must not leak the opener. `mailto:` and `tel:`
 * links do neither: a new tab for a phone dialler is a dead end the visitor has
 * to close.
 */
export function socialTarget(url: string): {
  target?: "_blank";
  rel?: "noopener noreferrer";
} {
  return /^https?:/i.test(String(url ?? ""))
    ? { target: "_blank", rel: "noopener noreferrer" }
    : {};
}

/**
 * The links a page should render, in the order the CMS stores them.
 *
 * `null`/`undefined` means "settings could not be loaded", so the built-in
 * defaults stand in. An empty array is a real answer — every link was removed —
 * and renders nothing.
 */
export function resolveSocials(
  profiles: SocialProfile[] | null | undefined
): RenderedSocial[] {
  if (!Array.isArray(profiles)) {
    return SOCIALS.map((social) => ({
      key: social.platform,
      platform: social.platform,
      handle: social.handle,
      url: social.url,
      description: social.description,
      icon: social.icon,
      tile: social.tile,
      hover: social.hover,
    }));
  }

  return profiles
    .filter((profile) => profile && isSafeSocialUrl(String(profile.url ?? "")))
    .map((profile, index) => {
      const look = lookFor(profile.platform);
      return {
        key: profile.id || `${profile.platform}-${index}`,
        platform: profile.platform,
        // The handle is derived from the URL on write; this only covers rows that
        // predate that, where the handle is the only thing the editor supplied.
        handle: profile.handle || profile.url,
        url: profile.url,
        description: look.description,
        icon: look.icon,
        tile: look.tile,
        hover: look.hover,
      };
    });
}