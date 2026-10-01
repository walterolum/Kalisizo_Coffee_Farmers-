import { describe, expect, it } from "vitest";
import {
  toDateTimeLocal,
  toFormValues,
  toPayload,
  TYPE_CONFIGS,
} from "@/lib/admin-fields";
import {
  announcementSchema,
  eventSchema,
  galleryAlbumSchema,
  galleryImageSchema,
  newsArticleSchema,
  pageSchema,
  projectSchema,
  publicationSchema,
} from "@/lib/validators";
import {
  CONTENT_STATUSES,
  CONTENT_TYPES,
  STATUS_TRANSITIONS,
  type ContentType,
} from "@/lib/admin-api";
import { canTransition } from "@/lib/workflow";
import type { z } from "zod";

/**
 * Each content type's editor config, paired with the Zod schema the API
 * validates against. Used to catch the two drifting apart: a renamed column
 * would otherwise only surface as a runtime 400 when an editor hit Save.
 */
const SCHEMAS: Record<ContentType, z.ZodTypeAny> = {
  news: newsArticleSchema,
  events: eventSchema,
  projects: projectSchema,
  announcements: announcementSchema,
  publications: publicationSchema,
  pages: pageSchema,
  "gallery/albums": galleryAlbumSchema,
  "gallery/images": galleryImageSchema,
};

/**
 * The accepted field names of a schema. Zod v4 keeps `.refine()` on the same
 * schema object, so the shape is normally a direct property; the fallbacks cover
 * wrapper types that nest the object one level down.
 */
function acceptedFields(schema: z.ZodTypeAny): string[] {
  const candidate = schema as unknown as { shape?: Record<string, z.ZodTypeAny> };
  if (candidate.shape) return Object.keys(candidate.shape);
  const def = schema._def as { innerType?: z.ZodTypeAny; schema?: z.ZodTypeAny };
  const inner = def.innerType ?? def.schema;
  const innerShape = inner as unknown as { shape?: Record<string, z.ZodTypeAny> } | undefined;
  return innerShape?.shape ? Object.keys(innerShape.shape) : [];
}

/** The schema for a single field, or undefined when the schema does not accept it. */
function fieldSchema(schema: z.ZodTypeAny, name: string): z.ZodTypeAny | undefined {
  const shape = (schema as unknown as { shape?: Record<string, z.ZodTypeAny> }).shape;
  return shape?.[name];
}

describe("content type configs", () => {
  it("covers every content type the API client can address", () => {
    for (const type of CONTENT_TYPES) {
      expect(TYPE_CONFIGS[type]).toBeDefined();
    }
  });

  it("declares a title field that the schema also knows about", () => {
    for (const type of CONTENT_TYPES) {
      const config = TYPE_CONFIGS[type];
      // `alt` is the display field for gallery images rather than a `title`.
      if (config.titleField !== "alt") {
        expect(acceptedFields(SCHEMAS[type])).toContain(config.titleField);
      }
    }
  });

  it("only declares fields the API schema accepts", () => {
    for (const type of CONTENT_TYPES) {
      const known = new Set(acceptedFields(SCHEMAS[type]));
      expect(known.size).toBeGreaterThan(0);
      for (const field of TYPE_CONFIGS[type].fields) {
        expect(known.has(field.name), `${type}.${field.name} is not in the API schema`).toBe(true);
      }
    }
  });

  it("sources every relation from a content type that exists and is itself editable", () => {
    for (const type of CONTENT_TYPES) {
      for (const field of TYPE_CONFIGS[type].fields) {
        const source = field.optionsFrom;
        if (!source) continue;

        // A relation pointing at a missing type would render an empty picker.
        expect(TYPE_CONFIGS[source.type], `${type}.${field.name} → ${source.type}`).toBeDefined();
        // And the source list is read through the generic list API, so the
        // target has to be one of the addressable content types.
        expect(CONTENT_TYPES).toContain(source.type);
        // The label column is what the editor reads, so it has to be a column the
        // source type's schema actually returns.
        const targetSchema = SCHEMAS[source.type];
        if (field.name === "albumId" || field.name === "projectId") {
          expect(acceptedFields(targetSchema)).toContain(source.labelField);
        }
      }
    }
  });

  it("offers the relations the gallery image schema can store", () => {
    // albumId and projectId are indexed foreign keys on GalleryImage. Without a
    // field for them the photos can never be grouped, which is the whole point
    // of the gallery.
    const relations = TYPE_CONFIGS["gallery/images"].fields
      .filter((field) => field.optionsFrom)
      .map((field) => field.name);
    expect(relations.sort()).toEqual(["albumId", "projectId"]);
  });

  it("marks fields required by the schema as required in the form", () => {
    // A field the API insists on must not be optional in the UI, or the editor
    // only discovers the rule from a server error.
    const cases: Array<[ContentType, string]> = [
      ["news", "title"],
      ["news", "excerpt"],
      ["news", "content"],
      ["events", "startAt"],
      ["projects", "title"],
      ["pages", "content"],
      ["gallery/images", "alt"],
      ["gallery/images", "url"],
      ["publications", "fileUrl"],
      ["announcements", "body"],
    ];
    for (const [type, name] of cases) {
      const field = TYPE_CONFIGS[type].fields.find((f) => f.name === name);
      expect(field, `${type}.${name} is missing from the form`).toBeDefined();
      expect(field?.required, `${type}.${name} should be required`).toBe(true);
    }
  });

  it("does not mark an optional field as required", () => {
    // Stricter-than-server fields block saving content the API would accept,
    // for example demanding alt text on a record that has no image at all.
    for (const type of CONTENT_TYPES) {
      for (const field of TYPE_CONFIGS[type].fields) {
        if (!field.required) continue;
        const schema = fieldSchema(SCHEMAS[type], field.name);
        expect(schema, `${type}.${field.name} is not in the API schema`).toBeDefined();
        expect(
          schema?.safeParse(undefined).success,
          `${type}.${field.name} is required in the form but optional in the API`
        ).toBe(false);
      }
    }
  });

  it("never offers a status value outside the workflow enum", () => {
    const allowed = new Set(["DRAFT", "IN_REVIEW", "PUBLISHED", "ARCHIVED"]);
    for (const type of CONTENT_TYPES) {
      const status = TYPE_CONFIGS[type].fields.find((f) => f.name === "status");
      expect(status, `${type} has no status field`).toBeDefined();
      for (const option of status?.options ?? []) {
        expect(allowed.has(option.value)).toBe(true);
      }
    }
  });

  it("defaults new records to a private draft", () => {
    for (const type of CONTENT_TYPES) {
      // Creating straight to PUBLISHED would bypass editorial review.
      expect(TYPE_CONFIGS[type].defaults.status, `${type} should default to DRAFT`).toBe("DRAFT");
    }
  });

  it("offers exactly the transitions the workflow allows", () => {
    // The status picker is derived from the server table, so this guards
    // against a future edit reintroducing a second, divergent copy.
    for (const from of CONTENT_STATUSES) {
      const expected = CONTENT_STATUSES.filter((to) => canTransition(from, to));
      expect(STATUS_TRANSITIONS[from], `transitions from ${from}`).toEqual(expected);
    }
  });

  it("always offers a way back to draft from an archived item", () => {
    // Without this an editor could archive content with no route back.
    expect(STATUS_TRANSITIONS.ARCHIVED).toContain("DRAFT");
  });
});

describe("toFormValues", () => {
  const news = TYPE_CONFIGS.news;

  it("uses the config defaults when creating", () => {
    expect(toFormValues(null, news)).toMatchObject({ status: "DRAFT", isFeatured: false });
  });

  it("maps an API record onto form state", () => {
    const values = toFormValues(
      { title: "Harvest report", excerpt: "A summary", isFeatured: true },
      news
    );
    expect(values.title).toBe("Harvest report");
    expect(values.isFeatured).toBe(true);
  });

  it("turns null and undefined into empty controls", () => {
    const values = toFormValues({ title: "X", imageAlt: null, tagNames: undefined }, news);
    expect(values.imageAlt).toBe("");
    expect(values.tagNames).toEqual([]);
  });

  it("truncates timestamps to the datetime-local format", () => {
    const values = toFormValues({ startAt: "2025-03-04T09:30:00.000Z" }, TYPE_CONFIGS.events);
    expect(String(values.startAt)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it("reduces a timestamp to a date for date fields", () => {
    const values = toFormValues({ startDate: "2025-03-04T00:00:00.000Z" }, TYPE_CONFIGS.projects);
    expect(values.startDate).toBe("2025-03-04");
  });
});

describe("toDateTimeLocal", () => {
  it("formats a valid timestamp", () => {
    const local = toDateTimeLocal(new Date(2025, 2, 4, 9, 30).toISOString());
    expect(local).toBe("2025-03-04T09:30");
  });

  it("returns an empty string for unparseable input", () => {
    expect(toDateTimeLocal("not-a-date")).toBe("");
  });
});

describe("toPayload", () => {
  const news = TYPE_CONFIGS.news;

  it("trims whitespace from text", () => {
    const payload = toPayload({ title: "  Harvest  ", excerpt: " Summary " }, news);
    expect(payload.title).toBe("Harvest");
    expect(payload.excerpt).toBe("Summary");
  });

  it("splits comma-separated tags into a list", () => {
    const payload = toPayload({ tagNames: "harvest, training , " }, news);
    expect(payload.tagNames).toEqual(["harvest", "training"]);
  });

  it("omits optional fields that are blank", () => {
    // Sending "" where the schema wants `undefined` or `null` would 400.
    const payload = toPayload({ title: "A title", imageAlt: "   " }, news);
    expect("imageAlt" in payload).toBe(false);
  });

  it("converts numbers and rejects non-numeric input", () => {
    expect(toPayload({ fileSizeBytes: "2048" }, TYPE_CONFIGS.publications).fileSizeBytes).toBe(2048);
    expect(toPayload({ fileSizeBytes: "abc" }, TYPE_CONFIGS.publications).fileSizeBytes).toBeUndefined();
  });

  it("converts date fields to ISO strings", () => {
    const payload = toPayload({ startAt: "2025-03-04T09:30" }, TYPE_CONFIGS.events);
    expect(typeof payload.startAt).toBe("string");
    expect(new Date(String(payload.startAt)).getTime()).not.toBeNaN();
  });

  it("produces a payload the API schema accepts", () => {
    // The end-to-end guard: a complete, valid record must survive serialisation.
    const payload = toPayload(
      {
        title: "Harvest report",
        excerpt: "How the season went",
        content: "<p>A long enough body to satisfy the minimum length rule.</p>",
        status: "IN_REVIEW",
        tagNames: "harvest, training",
        isFeatured: true,
      },
      news
    );
    expect(newsArticleSchema.safeParse(payload).success).toBe(true);
  });

  it("rejects an incomplete record the same way the API would", () => {
    const payload = toPayload({ title: "Missing everything else" }, news);
    expect(newsArticleSchema.safeParse(payload).success).toBe(false);
  });

  it("submits null when clearing a nullable relation, and does nothing if it cannot be cleared", () => {
    const galleryImages = TYPE_CONFIGS["gallery/images"];
    // albumId is nullable, so clearing it must be explicit null.
    const cleared = toPayload({ albumId: "" }, galleryImages);
    expect(cleared.albumId).toBeNull();
    expect("albumId" in cleared).toBe(true);

    // projectId is nullable too — test consistency.
    const clearedProject = toPayload({ projectId: "   " }, galleryImages);
    expect(clearedProject.projectId).toBeNull();
  });

  it("keeps a relation value that is non-empty", () => {
    const galleryImages = TYPE_CONFIGS["gallery/images"];
    const payload = toPayload({ albumId: "alb_123" }, galleryImages);
    expect(payload.albumId).toBe("alb_123");
  });
});
