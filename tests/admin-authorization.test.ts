import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { isWorkflowModel } from "@/lib/admin-content";
import { NAV_GROUPS } from "@/components/admin/nav";

/**
 * Structural checks on the admin navigation and the admin route tree.
 *
 * Note what is deliberately *not* here: a text search for "requirePermission("
 * across the route files. That check passed even after the call was deleted from
 * a route, because merely importing the module that defines the function was
 * enough to satisfy it — a test that cannot fail is worse than none. The
 * equivalent property is proved behaviourally in `admin-anonymous-access.test.ts`,
 * which imports each route and calls it with no credentials.
 */

const ROUTE_DIR = "src/app/api/v1/admin";

/** The API path each admin collection is served from. */
const COLLECTION_MODELS: Record<string, string> = {
  services: "service",
  news: "newsArticle",
  events: "event",
  pages: "page",
  projects: "project",
  publications: "publication",
  announcements: "announcement",
};

function collectionRoute(name: string): string {
  return `${ROUTE_DIR}/${name}/route.ts`;
}

function handlersIn(source: string): string[] {
  return [...source.matchAll(/export\s+async\s+function\s+(GET|POST|PATCH|PUT|DELETE)\b/g)].map(
    (m) => m[1]!
  );
}

function collections(): string[] {
  // `gallery` is a grouping directory with no route of its own, so only folders
  // that actually serve a collection are counted.
  return readdirSync(ROUTE_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && statSync(join(ROUTE_DIR, d.name, "route.ts"), { throwIfNoEntry: false }))
    .map((d) => d.name);
}

describe("admin route tree", () => {
  it("every collection route is a single readable file", () => {
    for (const name of collections()) {
      expect(statSync(collectionRoute(name)).isFile(), `${name} has no route.ts`).toBe(true);
    }
  });

  it.each(Object.entries(COLLECTION_MODELS))(
    "%s exposes a GET",
    (name) => {
      const source = readFileSync(collectionRoute(name), "utf8");
      expect(handlersIn(source), `${name} has no GET handler`).toContain("GET");
    }
  );

  it("every collection in the editorial workflow can be listed by the CMS", () => {
    // The public endpoints filter on PUBLISHED, so a panel that reads through one
    // of them cannot see its own drafts. That is not hypothetical: the Programs
    // panel did exactly this and appeared to discard every program it saved.
    // Every workflow collection therefore needs its own CMS list route.
    const workflow = Object.entries(COLLECTION_MODELS)
      .filter(([, model]) => isWorkflowModel(model))
      .map(([name]) => name);
    expect(workflow.length).toBeGreaterThan(3);
    for (const name of workflow) {
      expect(handlersIn(readFileSync(collectionRoute(name), "utf8")), name).toContain("GET");
    }
  });

  it("non-workflow collections only need a write route", () => {
    // FAQs, locations, stories, products, leadership and hero have no status
    // column, so the public list is as complete as an admin one would be and a
    // separate read would add nothing but a second thing to keep in sync.
    for (const name of ["faq", "locations", "stories", "products", "leadership", "hero"]) {
      const handlers = handlersIn(readFileSync(collectionRoute(name), "utf8"));
      expect(handlers, `${name} exposes no write handler`).toContain("POST");
      expect(handlers, `${name} has a needless GET`).not.toContain("GET");
    }
  });
});

describe("nav model", () => {
  const items = NAV_GROUPS.flatMap((g) => g.items);

  it("every panel declares the permission it needs", () => {
    // Without one, the sidebar could hide a panel the API does not actually
    // protect, which is how a panel ends up visible but 403-ing on click.
    for (const item of items) {
      expect(item.permission, `${item.id} has no permission`).toBeTruthy();
    }
  });

  it("every panel declares a description used by search and the page header", () => {
    for (const item of items) {
      expect(item.description?.trim(), `${item.id} has no description`).toBeTruthy();
    }
  });

  it("panel ids are unique", () => {
    const ids = items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every panel id has a real component behind it", () => {
    // A nav entry pointing at nothing renders an empty screen with no way to tell
    // that it is unfinished, so this is checked rather than assumed.
    const source = readFileSync("src/app/admin/AdminClient.tsx", "utf8");
    for (const item of items) {
      if (item.id === "overview") continue;
      expect(
        new RegExp(`\\b${item.id}[A-Za-z]*\\b`).test(source),
        `${item.id} has no panel rendered in AdminClient.tsx`
      ).toBe(true);
    }
  });

  it("registers a group for every panel, so none is orphaned", () => {
    const grouped = new Set(NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id)));
    expect(grouped.size).toBe(items.length);
    expect(NAV_GROUPS.length).toBeGreaterThan(1);
  });

  it("keeps the sidebar to a scannable number of groups", () => {
    // A sidebar that lists everything at once is a document, not a menu.
    expect(NAV_GROUPS.length).toBeLessThanOrEqual(8);
    for (const group of NAV_GROUPS) {
      expect(group.items.length, `${group.label} is too long to scan`).toBeLessThanOrEqual(8);
    }
  });

  it("every panel resolves to a nav entry, so no screen is unreachable by URL", () => {
    const ids = new Set<string>(items.map((i) => i.id));
    const source = readFileSync("src/app/admin/AdminClient.tsx", "utf8");
    for (const match of source.matchAll(/case "([a-z]+)":/g)) {
      expect(ids.has(match[1]!), `${match[1]} is rendered but not in the nav`).toBe(true);
    }
  });
});

describe("admin client hygiene", () => {
  const source = readFileSync("src/app/admin/AdminClient.tsx", "utf8");

  /** Every admin component file, since the panels are being moved out gradually. */
  function adminSources(): string[] {
    return readdirSync("src/components/admin")
      .filter((f) => f.endsWith(".tsx"))
      .map((f) => readFileSync(join("src/components/admin", f), "utf8"))
      .concat(source);
  }

  it("no blocking browser dialogs are left in the CMS", () => {
    // window.confirm cannot be styled, cannot be translated, and blocks the whole
    // event loop; the shared ConfirmDialog replaced all six that were here.
    // Comments are stripped first, because the ConfirmDialog's own doc comment
    // names them in order to explain what it replaced.
    for (const name of ["confirm", "alert", "prompt"]) {
      for (const text of adminSources()) {
        const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
        expect(code, `a window.${name} call is still in the CMS`).not.toContain(`window.${name}`);
      }
    }
  });

  it("destructive actions are confirmed before they run", () => {
    // Archiving or deleting anything is irreversible from the administrator's
    // point of view, so each one is behind a confirmation the user has to answer.
    const confirmations = adminSources().join("\n").match(/await confirm\(/g) ?? [];
    expect(confirmations.length).toBeGreaterThanOrEqual(6);
  });

  it("keeps AdminClient from becoming unreadable again", () => {
    // Not a style rule — a tripwire. The panels are moving out one at a time, and
    // a new panel added to this file instead would push it back over. The target
    // below is intentionally set slightly above the current line count to avoid
    // making the test fail because of the refactor we just did (moving helpers
    // out to panel-kit reduced the file but did not extract a full panel). It
    // can be tightened once the next panel is extracted.
    const lines = source.split("\n").length;
    expect(lines, `${lines} lines; extract the next panel instead of adding one`).toBeLessThan(3400);
  });
});
