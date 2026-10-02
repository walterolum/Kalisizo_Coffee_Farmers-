import { prisma } from "@/backend/prisma";

/**
 * Site-wide settings read model.
 *
 * Social profiles live in their own table (`SocialLink`) rather than as columns
 * on `CooperativeInfo`, so the CMS can manage any number of platforms. Both the
 * public and admin routes read them through these helpers so the shape they
 * return cannot drift apart.
 */

export type SiteSettings = {
  mission: string | null;
  vision: string | null;
  taglines: string[];
  phoneNumbers: string[];
  officialEmail: string | null;
  address: string | null;
  logoUrl: string | null;
  socials: SocialProfile[];
  updatedAt: string;
};

export type SocialProfile = {
  id: string;
  platform: string;
  handle: string;
  url: string;
  description: string | null;
  displayOrder: number;
};

export async function readSiteSettings(): Promise<SiteSettings | null> {
  const [info, socials] = await Promise.all([
    prisma.cooperativeInfo.findFirst({ orderBy: { createdAt: "asc" } }),
    prisma.socialLink.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: "asc" },
    }),
  ]);

  if (!info) return null;

  return {
    mission: info.mission,
    vision: info.vision,
    taglines: info.taglines,
    phoneNumbers: info.phoneNumbers,
    officialEmail: info.officialEmail,
    address: info.address,
    logoUrl: info.logoUrl,
    socials: socials.map((s) => ({
      id: s.id,
      platform: s.platform,
      handle: s.handle,
      url: s.url,
      description: s.description,
      displayOrder: s.displayOrder,
    })),
    updatedAt: info.updatedAt.toISOString(),
  };
}

/** The singleton settings row, creating it on first write if absent. */
export async function ensureCooperativeInfo() {
  const existing = await prisma.cooperativeInfo.findFirst({
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;
  return prisma.cooperativeInfo.create({
    data: { taglines: [], phoneNumbers: [] },
  });
}
