/**
 * Declarative field definitions for the generic CMS editor.
 *
 * The editorial screens (news, events, projects, announcements, publications,
 * pages, gallery) all follow the same create/edit shape, so rather than writing
 * a bespoke form per type, each type declares its fields here and
 * `ContentEditor` renders the form from them. Field names mirror the Zod
 * schemas in `src/lib/validators.ts` exactly — the server remains the authority
 * on what is valid; these definitions only describe how to lay the form out.
 */
import type { ContentType } from "@/lib/admin-api";

export type FieldKind =
  | "text"
  | "textarea"
  | "html"
  | "number"
  | "date"
  | "datetime"
  | "url"
  | "select"
  | "checkbox"
  | "tags"
  | "lines";

export type FieldDef = {
  name: string;
  label: string;
  kind: FieldKind;
  /** Rendered as a required marker and documented in the help text. */
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: readonly { value: string; label: string }[];
  /**
   * Loads a select's options from another content type instead of declaring
   * them statically, for relations whose target set changes as the CMS is used
   * (which photo belongs to which album cannot be a hard-coded list).
   */
  optionsFrom?: RelationSource;
  /** Rows for `textarea`. */
  rows?: number;
  /** Shown collapsed until the editor expands the section. */
  group?: "content" | "media" | "seo" | "meta";
};

/** Describes where a relation select gets its options. */
export type RelationSource = {
  /** Content type to list, e.g. `"gallery/albums"`. */
  type: ContentType;
  /** Column shown to the editor, e.g. `"title"`. */
  labelField: string;
  /** Column stored in the payload, e.g. `"id"`. */
  valueField: string;
  /** Adds a blank "None" choice that submits an empty value. */
  nullable?: boolean;
};

const STATUS_HELP =
  "Draft is private, In review is waiting for a Content Administrator, Published is live.";

/** A content type's editor configuration. */
export type TypeConfig = {
  type: ContentType;
  label: string;
  singular: string;
  /** Column used for the list row title. */
  titleField: string;
  description: string;
  fields: readonly FieldDef[];
  /** Defaults for a new record, so the form opens with sensible values. */
  defaults: Record<string, unknown>;
  /** Extra columns worth showing in the list, beyond title/status/updated. */
  listMeta?: readonly { label: string; field: string }[];
};

const SEO_FIELDS: readonly FieldDef[] = [
  {
    name: "seoTitle",
    label: "SEO title",
    kind: "text",
    group: "seo",
    help: "Shown in search results. Leave blank to use the page title.",
  },
  {
    name: "seoDescription",
    label: "Meta description",
    kind: "textarea",
    rows: 2,
    group: "seo",
    help: "Around 150–160 characters.",
  },
];

/**
 * Image URL and alt text for a record. Alt text is encouraged but not required
 * here, because a record may legitimately have no image at all and requiring the
 * description would block saving it. The API does require alt text for gallery
 * images, where every row is by definition a picture, and that type declares its
 * own field for it.
 */
const IMAGE_FIELDS = (urlName: string, altName: string): readonly FieldDef[] => [
  {
    name: urlName,
    label: "Image URL",
    kind: "url",
    group: "media",
    placeholder: "https://res.cloudinary.com/...",
    help: "Upload an image in the Media section, then paste the URL here.",
  },
  {
    name: altName,
    label: "Alt text",
    kind: "text",
    group: "media",
    help: "Describe the image for screen readers. Required whenever an image is set.",
  },
];

export const TYPE_CONFIGS: Record<ContentType, TypeConfig> = {
  news: {
    type: "news",
    label: "News",
    singular: "article",
    titleField: "title",
    description: "Stories, updates and cooperative news shown on /news.",
    listMeta: [
      { label: "Author", field: "authorName" },
      { label: "Category", field: "categoryName" },
    ],
    defaults: { status: "DRAFT", isFeatured: false, tagNames: [] },
    fields: [
      { name: "title", label: "Title", kind: "text", required: true },
      {
        name: "excerpt",
        label: "Summary",
        kind: "textarea",
        rows: 3,
        required: true,
        help: "Shown in listings and search results.",
      },
      { name: "content", label: "Full article", kind: "html", required: true, group: "content" },
      ...IMAGE_FIELDS("featuredImageUrl", "imageAlt"),
      {
        name: "tagNames",
        label: "Tags",
        kind: "tags",
        group: "meta",
        help: "Comma separated, e.g. harvest, training, coop-news",
      },
      {
        name: "isFeatured",
        label: "Feature on the home page",
        kind: "checkbox",
        group: "meta",
      },
      {
        name: "status",
        label: "Status",
        kind: "select",
        group: "meta",
        help: STATUS_HELP,
        options: [
          { value: "DRAFT", label: "Draft" },
          { value: "IN_REVIEW", label: "In review" },
          { value: "PUBLISHED", label: "Published" },
          { value: "ARCHIVED", label: "Archived" },
        ],
      },
      ...SEO_FIELDS,
    ],
  },

  events: {
    type: "events",
    label: "Events",
    singular: "event",
    titleField: "title",
    description: "Training sessions, field days and meetings shown on /events.",
    listMeta: [
      { label: "Starts", field: "startAt" },
      { label: "Location", field: "location" },
    ],
    defaults: { status: "DRAFT" },
    fields: [
      { name: "title", label: "Title", kind: "text", required: true },
      { name: "summary", label: "Summary", kind: "textarea", rows: 3, required: true },
      { name: "description", label: "Details", kind: "html", group: "content" },
      {
        name: "startAt",
        label: "Starts",
        kind: "datetime",
        required: true,
        group: "meta",
      },
      { name: "endAt", label: "Ends", kind: "datetime", group: "meta" },
      { name: "location", label: "Location", kind: "text", group: "meta" },
      { name: "organizer", label: "Organiser", kind: "text", group: "meta" },
      {
        name: "registrationInfo",
        label: "Registration info",
        kind: "textarea",
        rows: 2,
        group: "meta",
        help: "How to attend, e.g. Free entry, bring your own cup.",
      },
      ...IMAGE_FIELDS("imageUrl", "imageAlt"),
      {
        name: "status",
        label: "Status",
        kind: "select",
        group: "meta",
        help: STATUS_HELP,
        options: [
          { value: "DRAFT", label: "Draft" },
          { value: "IN_REVIEW", label: "In review" },
          { value: "PUBLISHED", label: "Published" },
          { value: "ARCHIVED", label: "Archived" },
        ],
      },
    ],
  },

  projects: {
    type: "projects",
    label: "Projects",
    singular: "project",
    titleField: "title",
    description: "Initiatives and programmes shown on /projects.",
    listMeta: [
      { label: "Stage", field: "stage" },
      { label: "Location", field: "location" },
    ],
    defaults: { status: "DRAFT", stage: "ONGOING", partners: [] },
    fields: [
      { name: "title", label: "Title", kind: "text", required: true },
      { name: "summary", label: "Summary", kind: "textarea", rows: 3, required: true },
      { name: "description", label: "Details", kind: "html", group: "content" },
      ...IMAGE_FIELDS("imageUrl", "imageAlt"),
      {
        name: "partners",
        label: "Partners",
        kind: "tags",
        group: "meta",
        help: "Comma separated partner names.",
      },
      { name: "impact", label: "Impact", kind: "textarea", rows: 3, group: "content" },
      {
        name: "stage",
        label: "Stage",
        kind: "select",
        group: "meta",
        options: [
          { value: "PLANNED", label: "Planned" },
          { value: "ONGOING", label: "Ongoing" },
          { value: "COMPLETED", label: "Completed" },
        ],
      },
      { name: "location", label: "Location", kind: "text", group: "meta" },
      { name: "startDate", label: "Start date", kind: "date", group: "meta" },
      { name: "endDate", label: "End date", kind: "date", group: "meta" },
      {
        name: "status",
        label: "Status",
        kind: "select",
        group: "meta",
        help: STATUS_HELP,
        options: [
          { value: "DRAFT", label: "Draft" },
          { value: "IN_REVIEW", label: "In review" },
          { value: "PUBLISHED", label: "Published" },
          { value: "ARCHIVED", label: "Archived" },
        ],
      },
      ...SEO_FIELDS,
    ],
  },

  announcements: {
    type: "announcements",
    label: "Announcements",
    singular: "announcement",
    titleField: "title",
    description: "Banners and notices shown at the top of the home page.",
    listMeta: [{ label: "Severity", field: "severity" }],
    defaults: { status: "DRAFT", severity: "INFO", isPinned: false },
    fields: [
      { name: "title", label: "Title", kind: "text", required: true },
      { name: "body", label: "Message", kind: "textarea", rows: 4, required: true },
      {
        name: "severity",
        label: "Severity",
        kind: "select",
        group: "meta",
        options: [
          { value: "INFO", label: "Info" },
          { value: "WARNING", label: "Warning" },
          { value: "CRITICAL", label: "Critical" },
        ],
      },
      { name: "isPinned", label: "Pin to top", kind: "checkbox", group: "meta" },
      { name: "startsAt", label: "Show from", kind: "datetime", group: "meta" },
      { name: "endsAt", label: "Show until", kind: "datetime", group: "meta" },
      {
        name: "linkUrl",
        label: "Link URL",
        kind: "url",
        group: "media",
        placeholder: "https://...",
      },
      { name: "linkLabel", label: "Link text", kind: "text", group: "media" },
      {
        name: "status",
        label: "Status",
        kind: "select",
        group: "meta",
        help: STATUS_HELP,
        options: [
          { value: "DRAFT", label: "Draft" },
          { value: "IN_REVIEW", label: "In review" },
          { value: "PUBLISHED", label: "Published" },
          { value: "ARCHIVED", label: "Archived" },
        ],
      },
    ],
  },

  publications: {
    type: "publications",
    label: "Publications",
    singular: "publication",
    titleField: "title",
    description: "Reports, brochures and forms available to download.",
    listMeta: [
      { label: "Kind", field: "kind" },
      { label: "Size", field: "fileSizeBytes" },
    ],
    defaults: { status: "DRAFT", kind: "OTHER" },
    fields: [
      { name: "title", label: "Title", kind: "text", required: true },
      { name: "summary", label: "Summary", kind: "textarea", rows: 2 },
      {
        name: "fileUrl",
        label: "File URL",
        kind: "url",
        required: true,
        group: "media",
        help: "Direct link to the PDF or document.",
      },
      {
        name: "fileName",
        label: "File name",
        kind: "text",
        required: true,
        group: "media",
        help: "Name shown to visitors when they download, e.g. annual-report-2025.pdf",
      },
      { name: "fileSizeBytes", label: "File size (bytes)", kind: "number", group: "media" },
      {
        name: "mimeType",
        label: "MIME type",
        kind: "text",
        required: true,
        group: "media",
        placeholder: "application/pdf",
      },
      {
        name: "kind",
        label: "Kind",
        kind: "select",
        group: "meta",
        options: [
          { value: "REPORT", label: "Report" },
          { value: "BROCHURE", label: "Brochure" },
          { value: "FORM", label: "Form" },
          { value: "POLICY", label: "Policy" },
          { value: "OTHER", label: "Other" },
        ],
      },
      {
        name: "status",
        label: "Status",
        kind: "select",
        group: "meta",
        help: STATUS_HELP,
        options: [
          { value: "DRAFT", label: "Draft" },
          { value: "IN_REVIEW", label: "In review" },
          { value: "PUBLISHED", label: "Published" },
          { value: "ARCHIVED", label: "Archived" },
        ],
      },
    ],
  },

  pages: {
    type: "pages",
    label: "Pages",
    singular: "page",
    titleField: "title",
    description: "Standalone pages such as About, Privacy or Membership.",
    listMeta: [{ label: "URL", field: "slug" }],
    defaults: { status: "DRAFT", showInFooter: false },
    fields: [
      { name: "title", label: "Title", kind: "text", required: true },
      {
        name: "slug",
        label: "URL",
        kind: "text",
        group: "meta",
        help: "Lowercase words separated by hyphens. Leave blank to derive from the title.",
      },
      { name: "excerpt", label: "Summary", kind: "textarea", rows: 2 },
      { name: "content", label: "Page content", kind: "html", required: true, group: "content" },
      ...IMAGE_FIELDS("imageUrl", "imageAlt"),
      { name: "showInFooter", label: "Show in footer", kind: "checkbox", group: "meta" },
      { name: "displayOrder", label: "Sort order", kind: "number", group: "meta" },
      {
        name: "status",
        label: "Status",
        kind: "select",
        group: "meta",
        help: STATUS_HELP,
        options: [
          { value: "DRAFT", label: "Draft" },
          { value: "IN_REVIEW", label: "In review" },
          { value: "PUBLISHED", label: "Published" },
          { value: "ARCHIVED", label: "Archived" },
        ],
      },
      ...SEO_FIELDS,
    ],
  },

  "gallery/albums": {
    type: "gallery/albums",
    label: "Gallery albums",
    singular: "album",
    titleField: "title",
    description: "Groups of photos shown on /gallery.",
    defaults: { status: "DRAFT" },
    fields: [
      { name: "title", label: "Title", kind: "text", required: true },
      { name: "description", label: "Description", kind: "textarea", rows: 3 },
      {
        name: "coverImageUrl",
        label: "Cover image URL",
        kind: "url",
        group: "media",
      },
      { name: "displayOrder", label: "Sort order", kind: "number", group: "meta" },
      {
        name: "status",
        label: "Status",
        kind: "select",
        group: "meta",
        help: STATUS_HELP,
        options: [
          { value: "DRAFT", label: "Draft" },
          { value: "IN_REVIEW", label: "In review" },
          { value: "PUBLISHED", label: "Published" },
          { value: "ARCHIVED", label: "Archived" },
        ],
      },
    ],
  },

  "gallery/images": {
    type: "gallery/images",
    label: "Gallery images",
    singular: "image",
    titleField: "alt",
    description: "Individual photos, optionally grouped into an album.",
    defaults: { status: "DRAFT" },
    fields: [
      {
        name: "url",
        label: "Image URL",
        kind: "url",
        required: true,
        group: "media",
      },
      { name: "thumbnailUrl", label: "Thumbnail URL", kind: "url", group: "media" },
      {
        name: "alt",
        label: "Alt text",
        kind: "text",
        required: true,
        group: "meta",
        help: "Describe the photo. Required for accessibility.",
      },
      { name: "caption", label: "Caption", kind: "text", group: "meta" },
      { name: "description", label: "Description", kind: "textarea", rows: 3, group: "content" },
      { name: "displayOrder", label: "Sort order", kind: "number", group: "meta" },
      {
        name: "albumId",
        label: "Album",
        kind: "select",
        group: "meta",
        help: "Group this photo with others. Leave as none to show it on its own.",
        optionsFrom: {
          type: "gallery/albums",
          labelField: "title",
          valueField: "id",
          nullable: true,
        },
      },
      {
        name: "projectId",
        label: "Project",
        kind: "select",
        group: "meta",
        help: "Show this photo on a project page. Leave as none if it is not related to one.",
        optionsFrom: {
          type: "projects",
          labelField: "title",
          valueField: "id",
          nullable: true,
        },
      },
      {
        name: "status",
        label: "Status",
        kind: "select",
        group: "meta",
        help: STATUS_HELP,
        options: [
          { value: "DRAFT", label: "Draft" },
          { value: "IN_REVIEW", label: "In review" },
          { value: "PUBLISHED", label: "Published" },
          { value: "ARCHIVED", label: "Archived" },
        ],
      },
    ],
  },
};

export const FIELD_GROUPS: readonly { id: FieldDef["group"]; label: string }[] = [
  { id: "content", label: "Content" },
  { id: "media", label: "Media" },
  { id: "seo", label: "Search engine" },
  { id: "meta", label: "Publishing" },
];

/**
 * Converts an API record into form state, mapping ISO timestamps to the
 * `datetime-local` format the browser inputs expect. Empty values become ""
 * so a controlled input never receives `null`.
 */
export function toFormValues(
  record: Record<string, unknown> | null,
  config: TypeConfig
): Record<string, unknown> {
  if (!record) return { ...config.defaults };
  const values: Record<string, unknown> = { ...config.defaults };
  for (const field of config.fields) {
    const raw = record[field.name];
    if (raw === undefined || raw === null) {
      values[field.name] =
        field.kind === "checkbox" ? false : field.kind === "tags" || field.kind === "lines" ? [] : "";
      continue;
    }
    switch (field.kind) {
      case "checkbox":
        values[field.name] = Boolean(raw);
        break;
      case "tags":
      case "lines":
        values[field.name] = Array.isArray(raw) ? raw : [raw];
        break;
      case "date":
        values[field.name] = String(raw).slice(0, 10);
        break;
      case "datetime":
        values[field.name] = toDateTimeLocal(String(raw));
        break;
      default:
        values[field.name] = String(raw);
    }
  }
  return values;
}

/** `2025-03-04T09:30:00Z` → `2025-03-04T09:30`, the format `datetime-local` uses. */
export function toDateTimeLocal(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

/**
 * Prepares form state for submission: trims text, splits tag/line lists, and
 * drops empty optional fields so the server's `.optional()` validators are not
 * handed a bare `""` where a string or `null` is expected.
 */
export function toPayload(values: Record<string, unknown>, config: TypeConfig): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of config.fields) {
    const raw = values[field.name];

    if (field.kind === "checkbox") {
      payload[field.name] = Boolean(raw);
      continue;
    }
    if (field.kind === "tags" || field.kind === "lines") {
      const list = Array.isArray(raw)
        ? raw.map((v) => String(v).trim()).filter(Boolean)
        : String(raw ?? "")
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean);
      // Empty optional lists are omitted so defaults apply server-side.
      if (list.length || field.required) payload[field.name] = list;
      continue;
    }

    const text = String(raw ?? "").trim();
    if (field.optionsFrom) {
      // A relation needs its cleared state sent explicitly. The generic empty
      // handling below omits blank values, which on an update means "leave this
      // column alone" — so choosing None would quietly keep the old album
      // instead of removing the photo from it. Sending "" is also wrong: the
      // schemas accept any short string, so it would be stored as a dangling
      // foreign key rather than null.
      if (text) {
        payload[field.name] = text;
      } else if (field.optionsFrom.nullable) {
        payload[field.name] = null;
      }
      continue;
    }
    if (!text) {
      if (field.required) payload[field.name] = text;
      else if (field.kind === "number") payload[field.name] = undefined;
      continue;
    }
    if (field.kind === "number") {
      const parsed = Number(text);
      payload[field.name] = Number.isFinite(parsed) ? parsed : undefined;
      continue;
    }
    if (field.kind === "date" || field.kind === "datetime") {
      const parsed = new Date(text);
      if (!Number.isNaN(parsed.getTime())) payload[field.name] = parsed.toISOString();
      continue;
    }
    payload[field.name] = text;
  }
  return payload;
}
