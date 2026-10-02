import { z } from "zod";

const email = z.string().trim().toLowerCase().email().max(190);

const maybePhone = z
  .union([z.literal(""), z.string().trim().min(7).max(24).regex(/^\+?[0-9\s().-]+$/)])
  .optional();

const maybeEmpty = <T extends z.ZodTypeAny>(schema: T) =>
  z.union([z.literal(""), schema]).optional();

export const contactSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: maybePhone,
  email,
  subject: maybeEmpty(z.string().trim().min(2).max(180)),
  userType: z.enum(["FARMER", "BUYER", "GENERAL"]).default("GENERAL"),
  message: z.string().trim().min(5).max(4000),
});
export type ContactInput = z.infer<typeof contactSchema>;

/**
 * Sign-in accepts either the account's email address or its short username, so
 * this is deliberately looser than the `email` schema used for contact forms.
 * Both are stored lowercase, which is what makes a case-insensitive lookup
 * correct.
 */
const loginIdentifier = z.string().trim().toLowerCase().min(3).max(190);

export const loginSchema = z.object({
  identifier: loginIdentifier,
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const leadershipSchema = z.object({
  id: z.string().min(1).max(60).optional(),
  name: z.string().trim().min(2).max(120),
  title: z.string().trim().min(2).max(120),
  bio: maybeEmpty(z.string().trim().min(2).max(2000)),
  photoUrl: maybeEmpty(z.string().trim().min(1).max(500)),
  icon: maybeEmpty(z.string().trim().min(1).max(50)),
  gradient: maybeEmpty(z.string().trim().min(1).max(200)),
  displayOrder: z.number().int().min(0).max(9999).optional(),
});
export type LeadershipInput = z.infer<typeof leadershipSchema>;

export const productCategory = z.enum([
  "COFFEE_BEANS",
  "FERTILIZER_INPUTS",
  "EQUIPMENT",
  "SACCO_PRODUCT",
]);
export type ProductCategoryValue = z.infer<typeof productCategory>;

export const productCategoryQuery = z.string().transform((v) => v.toUpperCase()).pipe(productCategory);

export const productSchema = z.object({
  id: z.string().min(1).max(60).optional(),
  title: z.string().trim().min(2).max(160),
  category: productCategory,
  description: maybeEmpty(z.string().trim().min(2).max(4000)),
  price: maybeEmpty(z.string().trim().min(1).max(120)),
  unit: maybeEmpty(z.string().trim().min(1).max(60)),
  badge: maybeEmpty(z.string().trim().min(1).max(80)),
  cta: maybeEmpty(z.string().trim().min(1).max(160)),
  tone: maybeEmpty(z.string().trim().min(1).max(200)),
  icon: maybeEmpty(z.string().trim().min(1).max(50)),
  imageUrl: maybeEmpty(z.string().trim().min(1).max(500)),
  isAvailable: z.boolean().optional(),
});
export type ProductInput = z.infer<typeof productSchema>;

export const inquiryStatusSchema = z.object({
  status: z.enum(["PENDING", "REVIEWED", "RESOLVED"]),
});
export type InquiryStatusInput = z.infer<typeof inquiryStatusSchema>;

export const inquiryStatusQuery = z
  .string()
  .transform((v) => v.toUpperCase())
  .pipe(z.enum(["PENDING", "REVIEWED", "RESOLVED"]));

export const idParamSchema = z.string().min(1).max(60);

const phoneValue = z
  .string()
  .trim()
  .min(7)
  .max(24)
  .regex(/^\+?[0-9\s().-]+$/);

/**
 * The settings row is shared by three CMS screens — About, Contact and Logo —
 * and each submits only the fields it shows. Every field is therefore optional
 * with **no default**, so an omitted field means "leave this alone" rather than
 * "set it to empty".
 *
 * Adding a `.default()` here looks harmless and is not: it makes a partial save
 * destructive, because zod then materialises the missing field as an empty
 * value and the route writes that through. Clearing a field is still possible —
 * send `""` or `[]` explicitly.
 */
/**
 * One social link, as submitted by the CMS.
 *
 * `platform` is free text on purpose — the list of known platforms is a
 * convenience for the form, not a whitelist, and a blank one is filled in from
 * the pasted link. `url` is likewise *not* `.url()`: editors paste `@handle`,
 * `instagram.com/name` and `0774740871` as often as a full URL, and
 * `planSocialWrites` is what turns those into a link or refuses them. Validating
 * the shape here instead would reject the paste before it could be resolved.
 */
export const socialEntrySchema = z.object({
  platform: maybeEmpty(z.string().trim().max(40)),
  url: z.string().trim().min(1).max(300),
  handle: maybeEmpty(z.string().trim().max(120)),
});

export const settingsSchema = z.object({
  mission: maybeEmpty(z.string().trim().min(2).max(4000)),
  vision: maybeEmpty(z.string().trim().min(2).max(4000)),
  taglines: z.array(z.string().trim().min(1).max(160)).max(20).optional(),
  phoneNumbers: z.array(phoneValue).max(10).optional(),
  officialEmail: maybeEmpty(email),
  address: maybeEmpty(z.string().trim().min(2).max(300)),
  logoUrl: maybeEmpty(z.string().trim().min(1).max(500)),
  baseUpdatedAt: z.string().max(60).optional(),
  socials: z.array(socialEntrySchema).max(20).optional(),
});
export type SettingsInput = z.infer<typeof settingsSchema>;

export const locationSchema = z.object({
  id: z.string().min(1).max(60).optional(),
  name: z.string().trim().min(2).max(160),
  address: maybeEmpty(z.string().trim().min(2).max(300)),
  district: maybeEmpty(z.string().trim().min(2).max(120)),
  subCounty: maybeEmpty(z.string().trim().min(2).max(120)),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  phone: maybePhone,
  email: maybeEmpty(email),
  isMainBranch: z.boolean().default(false),
});
export type LocationInput = z.infer<typeof locationSchema>;

export const HERO_ICONS = [
  "coffee",
  "sprout",
  "piggybank",
  "graduationcap",
  "landmark",
  "leaf",
  "users",
  "handshake",
] as const;
export const heroIconSchema = z.enum(HERO_ICONS);

export const heroSchema = z.object({
  headlinePrefix: z.string().trim().min(2).max(200),
  headlineHighlight: z.string().trim().min(1).max(160),
  headlineSuffix: z.string().trim().min(1).max(160),
  subtitle: z.string().trim().min(2).max(700),
  badges: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  todayItems: z
    .array(
      z.object({
        icon: heroIconSchema,
        title: z.string().trim().min(1).max(120),
        sub: z.string().trim().min(1).max(200),
      })
    )
    .max(10)
    .default([]),
  backgroundImage: maybeEmpty(z.string().trim().min(1).max(500)),
});
export type HeroInput = z.infer<typeof heroSchema>;

export const serviceSchema = z.object({
  id: z.string().min(1).max(60).optional(),
  title: z.string().trim().min(2).max(160),
  tagline: z.string().trim().min(2).max(300),
  points: z.array(z.string().trim().min(1).max(300)).min(1).max(12).default([]),
  details: z.array(z.string().trim().min(1).max(600)).max(12).default([]),
  icon: maybeEmpty(z.string().trim().min(1).max(50)),
  accent: maybeEmpty(z.string().trim().min(1).max(300)),
  ring: maybeEmpty(z.string().trim().min(1).max(300)),
  displayOrder: z.number().int().min(0).max(9999).optional(),
});
export type ServiceInput = z.infer<typeof serviceSchema>;

export const faqItemSchema = z.object({
  id: z.string().min(1).max(60).optional(),
  question: z.string().trim().min(2).max(300),
  answer: z.string().trim().min(2).max(3000),
  displayOrder: z.number().int().min(0).max(9999).optional(),
});
export type FaqItemInput = z.infer<typeof faqItemSchema>;

export const successStorySchema = z.object({
  id: z.string().min(1).max(60).optional(),
  title: z.string().trim().min(2).max(160),
  quote: maybeEmpty(z.string().trim().min(2).max(600)),
  description: z.string().trim().min(2).max(4000),
  metric: maybeEmpty(z.string().trim().min(1).max(120)),
  imageUrl: maybeEmpty(z.string().trim().min(1).max(500)),
  displayOrder: z.number().int().min(0).max(9999).optional(),
});
export type SuccessStoryInput = z.infer<typeof successStorySchema>;

export type ValidationError = { field: string; message: string };

export function firstZodError(error: z.ZodError): ValidationError {
  const issue = error.issues[0];
  return {
    field: issue?.path.join(".") || "body",
    message: issue?.message ?? "Invalid value",
  };
}

// ---------------------------------------------------------------------------
// Editorial content
// ---------------------------------------------------------------------------

export const contentStatusSchema = z.enum([
  "DRAFT",
  "IN_REVIEW",
  "PUBLISHED",
  "ARCHIVED",
]);
export type ContentStatusInput = z.infer<typeof contentStatusSchema>;

export const contentStatusQuery = z
  .string()
  .transform((v) => v.toUpperCase())
  .pipe(contentStatusSchema);

/** `id` lets the CMS update in place; omit it to create. */
const idField = z.string().min(1).max(60).optional();

/**
 * An editor-supplied slug, for the models that expose one.
 *
 * Slugs become URL path segments, so the character set is constrained here
 * rather than trusted: lowercase alphanumerics separated by single hyphens.
 * That rules out `/`, `..`, uppercase and spaces, none of which should ever
 * reach a column that a route matches against.
 *
 * Every slug still passes through `slugify` + `uniqueSlug` in
 * `admin-content.ts` on create, which is what guarantees uniqueness and
 * normalisation. This schema is the first line, so a bad value is reported to
 * the editor as a field error instead of being silently rewritten.
 */
const slugField = z
  .string()
  .trim()
  .toLowerCase()
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase words separated by hyphens.")
  .optional()
  .or(z.literal("").optional());

/** Optional optimistic-concurrency token (the row's `updatedAt`). */
export const baseUpdatedAtField = z
  .string()
  .max(60)
  .optional()
  .nullable()
  .transform((v) => v || undefined);

/**
 * A honeypot field. Real visitors never see it, so any value means a bot
 * submitted the form. Accepting it silently avoids telling scrapers how they
 * were detected.
 */
export const honeypotField = z.string().max(0, "Invalid submission.").optional();

/**
 * An image or link field that may be left blank.
 *
 * Only the *shape* is enforced here — a blank string or a relative path, or an
 * absolute `http(s)` URL. Anything else (a `javascript:` or `data:` URL) is
 * refused, because these values are rendered as `href`/`src` attributes.
 */
const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .refine(
    (v) => v === "" || /^(https?:\/\/|\/)/.test(v),
    "Use a full URL starting with https://"
  )
  .optional();

export const newsArticleSchema = z.object({
  id: idField,
  baseUpdatedAt: baseUpdatedAtField,
  title: z.string().trim().min(3).max(200),
  excerpt: z.string().trim().min(10).max(500),
  content: z.string().trim().min(20).max(60000),
  featuredImageUrl: optionalUrl,
  imageAlt: z.string().trim().max(300).optional(),
  isFeatured: z.boolean().optional(),
  authorId: z.string().max(60).nullable().optional(),
  categoryId: z.string().max(60).nullable().optional(),
  tagNames: z.array(z.string().trim().min(1).max(50)).max(12).default([]),
  status: contentStatusSchema.optional(),
  seoTitle: z.string().trim().max(200).optional(),
  seoDescription: z.string().trim().max(320).optional(),
});
export type NewsArticleInput = z.infer<typeof newsArticleSchema>;

export const eventSchema = z.object({
  id: idField,
  baseUpdatedAt: baseUpdatedAtField,
  title: z.string().trim().min(3).max(200),
  summary: z.string().trim().min(10).max(400),
  description: z.string().trim().max(20000).optional(),
  startAt: z.coerce.date(),
  endAt: z.coerce.date().nullable().optional(),
  location: z.string().trim().max(200).optional(),
  organizer: z.string().trim().max(160).optional(),
  imageUrl: optionalUrl,
  imageAlt: z.string().trim().max(300).optional(),
  registrationInfo: z.string().trim().max(1000).optional(),
  status: contentStatusSchema.optional(),
});
export type EventInput = z.infer<typeof eventSchema>;

export const projectStageSchema = z.enum(["PLANNED", "ONGOING", "COMPLETED"]);

export const projectSchema = z
  .object({
    id: idField,
    baseUpdatedAt: baseUpdatedAtField,
    title: z.string().trim().min(3).max(200),
    summary: z.string().trim().min(10).max(400),
    description: z.string().trim().max(20000).optional(),
    location: z.string().trim().max(200).optional(),
    startDate: z.coerce.date().nullable().optional(),
    endDate: z.coerce.date().nullable().optional(),
    stage: projectStageSchema.optional(),
    imageUrl: optionalUrl,
    imageAlt: z.string().trim().max(300).optional(),
    partners: z.array(z.string().trim().min(1).max(120)).max(12).default([]),
    impact: z.string().trim().max(4000).optional(),
    categoryId: z.string().max(60).nullable().optional(),
    status: contentStatusSchema.optional(),
    seoTitle: z.string().trim().max(200).optional(),
    seoDescription: z.string().trim().max(320).optional(),
  })
  .refine(
    (v) => !v.startDate || !v.endDate || v.endDate >= v.startDate,
    { message: "End date cannot be before the start date.", path: ["endDate"] }
  );
export type ProjectInput = z.infer<typeof projectSchema>;

export const announcementSeveritySchema = z.enum(["INFO", "WARNING", "CRITICAL"]);

export const announcementSchema = z
  .object({
    id: idField,
    baseUpdatedAt: baseUpdatedAtField,
    title: z.string().trim().min(3).max(200),
    body: z.string().trim().min(5).max(4000),
    severity: announcementSeveritySchema.optional(),
    startsAt: z.coerce.date().nullable().optional(),
    endsAt: z.coerce.date().nullable().optional(),
    linkUrl: optionalUrl,
    linkLabel: z.string().trim().max(120).optional(),
    isPinned: z.boolean().optional(),
    status: contentStatusSchema.optional(),
  })
  .refine((v) => !v.startsAt || !v.endsAt || v.endsAt >= v.startsAt, {
    message: "End date cannot be before the start date.",
    path: ["endsAt"],
  });
export type AnnouncementInput = z.infer<typeof announcementSchema>;

export const publicationKindSchema = z.enum([
  "REPORT",
  "BROCHURE",
  "FORM",
  "POLICY",
  "OTHER",
]);

export const publicationSchema = z.object({
  id: idField,
  baseUpdatedAt: baseUpdatedAtField,
  title: z.string().trim().min(3).max(200),
  summary: z.string().trim().max(1000).optional(),
  fileUrl: z.string().trim().min(1).max(500),
  fileName: z.string().trim().min(1).max(260),
  fileSizeBytes: z.number().int().min(0).max(200 * 1024 * 1024),
  mimeType: z.string().trim().min(1).max(150),
  kind: publicationKindSchema.optional(),
  status: contentStatusSchema.optional(),
});
export type PublicationInput = z.infer<typeof publicationSchema>;

export const pageSchema = z.object({
  id: idField,
  baseUpdatedAt: baseUpdatedAtField,
  title: z.string().trim().min(3).max(200),
  /**
   * Pages own a stable URL segment (`/about`, `/privacy`, ...), so the slug is
   * editor-supplied rather than derived — renaming a title must not move the
   * page. Left blank it is derived from the title on create.
   */
  slug: slugField,
  excerpt: z.string().trim().max(400).optional(),
  content: z.string().trim().min(10).max(60000),
  imageUrl: optionalUrl,
  imageAlt: z.string().trim().max(300).optional(),
  showInFooter: z.boolean().optional(),
  displayOrder: z.number().int().min(0).max(9999).optional(),
  status: contentStatusSchema.optional(),
  seoTitle: z.string().trim().max(200).optional(),
  seoDescription: z.string().trim().max(320).optional(),
});
export type PageInput = z.infer<typeof pageSchema>;

export const serviceSchemaV2 = z.object({
  id: idField,
  baseUpdatedAt: baseUpdatedAtField,
  title: z.string().trim().min(2).max(160),
  slug: slugField,
  tagline: z.string().trim().min(2).max(300),
  summary: z.string().trim().max(500).optional(),
  content: z.string().trim().max(20000).optional(),
  points: z.array(z.string().trim().min(1).max(300)).min(1).max(12).default([]),
  details: z.array(z.string().trim().min(1).max(600)).max(12).default([]),
  icon: z.string().trim().max(50).optional(),
  accent: z.string().trim().max(300).optional(),
  ring: z.string().trim().max(300).optional(),
  imageUrl: optionalUrl,
  imageAlt: z.string().trim().max(300).optional(),
  category: z.string().trim().max(80).optional(),
  displayOrder: z.number().int().min(0).max(9999).optional(),
  status: contentStatusSchema.optional(),
});
export type ServiceInputV2 = z.infer<typeof serviceSchemaV2>;

export const galleryAlbumSchema = z.object({
  id: idField,
  baseUpdatedAt: baseUpdatedAtField,
  title: z.string().trim().min(2).max(160),
  slug: slugField,
  description: z.string().trim().max(2000).optional(),
  coverImageUrl: optionalUrl,
  displayOrder: z.number().int().min(0).max(9999).optional(),
  status: contentStatusSchema.optional(),
});
export type GalleryAlbumInput = z.infer<typeof galleryAlbumSchema>;

export const galleryImageSchema = z.object({
  id: idField,
  baseUpdatedAt: baseUpdatedAtField,
  url: z.string().trim().min(1).max(500),
  thumbnailUrl: optionalUrl,
  /** Required: an image without alternative text is not accessible. */
  alt: z.string().trim().min(3).max(300),
  caption: z.string().trim().max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  albumId: z.string().max(60).nullable().optional(),
  projectId: z.string().max(60).nullable().optional(),
  displayOrder: z.number().int().min(0).max(9999).optional(),
  status: contentStatusSchema.optional(),
});
export type GalleryImageInput = z.infer<typeof galleryImageSchema>;

export const categorySchema = z.object({
  id: idField,
  name: z.string().trim().min(2).max(80),
  slug: slugField,
  description: z.string().trim().max(400).optional(),
  displayOrder: z.number().int().min(0).max(9999).optional(),
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const siteSettingValueSchema = z.object({
  key: z.string().trim().min(1).max(60),
  value: z.string().max(4000).default(""),
  group: z.string().trim().min(1).max(60).default("general"),
  label: z.string().trim().min(1).max(120),
  description: z.string().trim().max(300).optional(),
});
export type SiteSettingInput = z.infer<typeof siteSettingValueSchema>;

// ---------------------------------------------------------------------------
// CMS user management
// ---------------------------------------------------------------------------

export const cmsUserRoleSchema = z.enum([
  "SUPER_ADMIN",
  "CONTENT_ADMIN",
  "EDITOR",
]);

export const cmsUserCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email,
  password: z.string().min(12).max(200),
  role: cmsUserRoleSchema,
  isActive: z.boolean().default(true),
});
export type CmsUserCreateInput = z.infer<typeof cmsUserCreateSchema>;

export const cmsUserUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  role: cmsUserRoleSchema.optional(),
  isActive: z.boolean().optional(),
});
export type CmsUserUpdateInput = z.infer<typeof cmsUserUpdateSchema>;

export const cmsPasswordResetSchema = z.object({
  password: z.string().min(12).max(200),
});
export type CmsPasswordResetInput = z.infer<typeof cmsPasswordResetSchema>;