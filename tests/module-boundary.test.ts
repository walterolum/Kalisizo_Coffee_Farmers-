/**
 * The src/ tree is split three ways, and this file is what keeps the split honest.
 *
 *   src/frontend/  React components. Some are client components, some are server
 *                  components that legitimately read data through backend modules.
 *   src/backend/   Modules that cannot execute in a browser.
 *   src/shared/   Modules that can, and are used from either side.
 *
 * Two rules, both enforced here:
 *
 *   1. No `"use client"` module may reach a backend module. This is the rule that
 *      actually prevents a real defect. A client component pulling in Prisma or
 *      `node:fs` either fails the build or ships a browser stub that throws at
 *      runtime, and it inflates the bundle. Frontend *server* components reading
 *      from backend modules is normal and allowed - only client components are
 *      constrained.
 *
 *   2. No module sits in the wrong folder. Folders whose names do not match their
 *      contents are worse than no split at all, because they look correct.
 *
 * Rule 2 exists because of a real bug this suite was written after. The first
 * classification pass counted `import type { X } from "@prisma/client"` as a
 * runtime dependency, but TypeScript erases those. Six modules - admin-api,
 * admin-fields, realtime, security-policy, site and workflow - were filed under
 * backend/ on that false evidence, and client components were importing from
 * "server-only" code that had never touched the server. Stripping type-only
 * imports is therefore not a detail here; it is the whole distinction.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

const FRONTEND = "@/frontend";
const BACKEND = "@/backend";
const SHARED = "@/shared";

/** Every .ts/.tsx under src/, keyed by the "@/..." specifier that reaches it. */
const MODULES = new Map<string, string>();
(function walk(dir: string) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.tsx?$/.test(entry)) {
      const key = `@/${relative(SRC, full).replace(/\\/g, "/").replace(/\.tsx?$/, "")}`;
      MODULES.set(key, full);
    }
  }
})(SRC);

const KEYS = (prefix: string) => [...MODULES.keys()].filter((k) => k.startsWith(prefix)).sort();

/**
 * Removes `import type ... from "..."` statements so the marks scan cannot be
 * fooled by a dependency that does not exist at runtime. A mixed clause such as
 * `import { type A, b } from "x"` is deliberately left alone - `b` is real.
 */
function stripTypeOnlyImports(source: string): string {
  return source.replace(/^[ \t]*import\s+type\s+[^;]*?from\s+["'][^"']+["'];?[ \t]*$/gm, "");
}

/**
 * The leading directive prologue: whitespace, comments, then whatever comes next.
 *
 * A `"use client"` directive is only honoured when it sits in this prologue, so
 * this is exactly the region the compiler looks at. Reading the whole file for
 * the string instead would be wrong twice over - it would miss the four panels
 * whose module doc comment precedes the directive, and it would fire on the word
 * "use client" appearing inside a comment or a string.
 */
function directivePrologue(source: string): string {
  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i);
    const space = /^\s+/.exec(rest);
    if (space) {
      i += space[0].length;
      continue;
    }
    if (rest.startsWith("//")) {
      const newline = source.indexOf("\n", i);
      if (newline === -1) return "";
      i = newline + 1;
      continue;
    }
    if (rest.startsWith("/*")) {
      const end = source.indexOf("*/", i + 2);
      if (end === -1) return "";
      i = end + 2;
      continue;
    }
    return rest;
  }
  return "";
}

/** True when this module opts into the React client bundle. */
function isClientComponent(key: string): boolean {
  return /^["']use client["']/.test(directivePrologue(readFileSync(MODULES.get(key)!, "utf8")));
}

/** Independent, deliberately cruder count used only to police the detector. */
function declaresUseClient(key: string): boolean {
  return /^\s*(["'])use client\1/m.test(readFileSync(MODULES.get(key)!, "utf8"));
}

/**
 * Specifiers this module imports *by value*. Type-only imports produce no runtime
 * edge, so they are excluded: an `import type { ContentStatus } from
 * "@prisma/client"` does not make a module server-only.
 */
function valueImports(key: string): string[] {
  const source = readFileSync(MODULES.get(key)!, "utf8");
  const found: string[] = [];
  const re = /(?:^|\n)[ \t]*(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const stmt = match[0];
    if (/^\s*import\s+type\s/.test(stmt)) continue;
    const braces = stmt.match(/\{([^}]*)\}/);
    if (braces) {
      const names = braces[1].split(",").map((s) => s.trim()).filter(Boolean);
      if (names.length > 0 && names.every((n) => /^type\s/.test(n))) continue;
    }
    found.push(match[1]);
  }
  // Side-effect-only imports: `import "server-only";`
  const bare = /(?:^|\n)[ \t]*import\s+["']([^"']+)["']/g;
  while ((match = bare.exec(source)) !== null) found.push(match[1]);
  return found;
}

/** Resolves a specifier to a src/ module key, or null if external or missing. */
function resolveSpecifier(spec: string, fromKey: string): string | null {
  const base = spec.startsWith("@/")
    ? resolve(SRC, spec.slice(2))
    : resolve(dirname(MODULES.get(fromKey)!), spec);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")];
  for (const candidate of candidates) {
    // The extension must come off to match the keys built by walk(), otherwise a
    // directory import like "@/backend/storage" misses "backend/storage/index".
    const key = `@/${relative(SRC, candidate).replace(/\\/g, "/").replace(/\.tsx?$/, "")}`;
    if (MODULES.has(key)) return key;
  }
  return null;
}

/** Stylesheets and other assets are imports too, but not modules of this tree. */
const ASSET = /\.(css|scss|sass|less|svg|png|jpe?g|gif|webp|avif|ico|woff2?|json)$/;
const isModuleSpecifier = (spec: string) => !ASSET.test(spec);

/**
 * Capabilities that only exist on a server. NEXT_PUBLIC_* is excluded because
 * those values are inlined into the browser bundle by design - reading one is not
 * a server capability and must not push a module into backend/.
 */
const SERVER_MARKS: ReadonlyArray<readonly [RegExp, string]> = [
  [/(?:import|export)(?!\s+type)[\s\S]{0,400}?from\s+["']@prisma\/client["']/, "@prisma/client"],
  [/\bnode:fs\b/, "node:fs"],
  [/\bnode:child_process\b/, "node:child_process"],
  [/\bnode:crypto\b/, "node:crypto"],
  [/\bnode:(os|path|stream|buffer)\b/, "node builtins"],
  [/\b(jsonwebtoken|bcryptjs)\b/, "auth library"],
  [/(?:from|import)\s+["']server-only["']/, "server-only"],
  // Listed last deliberately: a module that also imports bcrypt is more usefully
  // described as needing an auth library than as reading process.env.
  [/process\.env\.(?!NEXT_PUBLIC)/, "non-public process.env"],
];

/** Server capabilities this module has on its own, without following imports. */
function directServerMarks(key: string): string[] {
  const source = stripTypeOnlyImports(readFileSync(MODULES.get(key)!, "utf8"));
  return SERVER_MARKS.filter(([pattern]) => pattern.test(source)).map(([, label]) => label);
}

/** Resolves a module key to the server capability that makes it backend-only. */
function serverReason(key: string, seen = new Set<string>()): string | null {
  if (seen.has(key)) return null;
  seen.add(key);

  const source = stripTypeOnlyImports(readFileSync(MODULES.get(key)!, "utf8"));
  for (const [pattern, label] of SERVER_MARKS) {
    if (pattern.test(source)) return label;
  }
  for (const spec of valueImports(key)) {
    const dep = resolveSpecifier(spec, key);
    if (!dep || dep === key) continue;
    const reason = serverReason(dep, seen);
    if (reason) return reason;
  }
  return null;
}

describe("module boundaries", () => {
  it("has the three trees, and no leftovers of the old layout", () => {
    for (const dir of ["src/frontend", "src/backend", "src/shared"]) {
      expect(existsSync(join(ROOT, dir)), `${dir} should exist`).toBe(true);
    }
    expect(existsSync(join(SRC, "lib")), "src/lib was split up and should be gone").toBe(false);
    expect(existsSync(join(SRC, "components")), "components moved under src/frontend").toBe(false);
  });

  it("still finds the client components it is meant to police", () => {
    // A silent zero would make every rule below pass vacuously.
    const clients = KEYS(FRONTEND).filter(isClientComponent);
    expect(clients.length).toBeGreaterThan(10);
    expect(clients.some((k) => k.includes("/admin/"))).toBe(true);

    // The detector must agree with a plain scan. When it did not, it silently
    // skipped the four panels whose module doc comment precedes the directive -
    // so "use client" appearing after a comment is now its own case.
    const declared = KEYS(FRONTEND).filter(declaresUseClient);
    const undetected = declared.filter((k) => !clients.includes(k));
    expect(undetected).toEqual([]);

    // And specifically: a directive behind a comment must still be seen.
    expect(clients).toContain("@/frontend/components/admin/AuditPanel");
    expect(clients).toContain("@/frontend/components/admin/ContentPanel");
    expect(clients).toContain("@/frontend/components/admin/SettingsPanel");
    expect(clients).toContain("@/frontend/components/admin/UsersPanel");
  });

  it("has no stale specifiers for the pre-split layout", () => {
    const offenders: string[] = [];
    for (const [key, file] of MODULES) {
      const source = readFileSync(file, "utf8");
      if (/@\/lib\//.test(source)) offenders.push(`${key} imports @/lib/`);
      if (/@\/components\//.test(source)) offenders.push(`${key} imports @/components/`);
    }
    expect(offenders).toEqual([]);
  });

  it("resolves every intra-tree specifier to a file that exists", () => {
    const broken: string[] = [];
    for (const key of MODULES.keys()) {
      for (const spec of valueImports(key)) {
        if (!spec.startsWith("@/") && !spec.startsWith(".")) continue;
        if (!isModuleSpecifier(spec)) continue;
        if (!resolveSpecifier(spec, key)) broken.push(`${key} -> ${spec}`);
      }
    }
    expect(broken).toEqual([]);
  });

  describe("rule 1: a client component never reaches backend code", () => {
    it("holds for every use client module", () => {
      const leaks: string[] = [];
      for (const key of KEYS(FRONTEND)) {
        if (!isClientComponent(key)) continue;
        for (const spec of valueImports(key)) {
          const dep = resolveSpecifier(spec, key);
          if (dep && dep.startsWith(BACKEND)) {
            leaks.push(`${key} imports ${dep} (${serverReason(dep) ?? "server-only"})`);
          }
        }
      }
      expect(leaks).toEqual([]);
    });

    it("also catches the transitive case, not just the direct one", () => {
      // A client component may import shared/, and that shared module must not
      // quietly pull in the backend either.
      const leaks: string[] = [];
      for (const key of KEYS(FRONTEND)) {
        if (!isClientComponent(key)) continue;
        for (const spec of valueImports(key)) {
          const dep = resolveSpecifier(spec, key);
          if (!dep || dep === key) continue;
          const reason = serverReason(dep);
          if (reason) leaks.push(`${key} -> ${dep} reaches ${reason}`);
        }
      }
      expect(leaks).toEqual([]);
    });
  });

  describe("rule 2: nothing is filed in the wrong folder", () => {
    it("every backend module really cannot run in a browser", () => {
      const misfiled = KEYS(BACKEND)
        .filter((key) => serverReason(key) === null)
        .map((key) => `${key} is in backend/ but has no server-only dependency`);
      expect(misfiled).toEqual([]);
    });

    it("every shared module really is safe in both bundles", () => {
      const misfiled = KEYS(SHARED)
        .map((key) => [key, serverReason(key)] as const)
        .filter(([, reason]) => reason !== null)
        .map(([key, reason]) => `${key} is in shared/ but needs ${reason}`);
      expect(misfiled).toEqual([]);
    });

    it("keeps Prisma confined to backend/", () => {
      // The single sharpest statement of the split: no file outside backend/
      // imports the ORM. Checked directly, because the transitive view is
      // useless here - every server-rendered page legitimately reaches Prisma
      // through site-content, and that is not what this rule is about.
      const outside = [...MODULES.keys()]
        .filter((key) => !key.startsWith(BACKEND))
        .filter((key) => directServerMarks(key).includes("@prisma/client"));
      expect(outside).toEqual([]);
    });

    it("keeps node builtins out of the frontend tree", () => {
      const outside = KEYS(FRONTEND).filter((key) =>
        directServerMarks(key).some((m) => m.startsWith("node:")),
      );
      expect(outside).toEqual([]);
    });
  });

  describe("classification sanity", () => {
    it("recognises the modules that define each tree", () => {
      expect(serverReason("@/backend/prisma")).toBe("@prisma/client");
      expect(serverReason("@/backend/auth")).toBe("auth library");
      expect(serverReason("@/shared/validators")).toBeNull();
      expect(serverReason("@/shared/admin-api")).toBeNull();
      expect(serverReason("@/shared/workflow")).toBeNull();
      expect(serverReason("@/shared/realtime")).toBeNull();
    });

    it("treats an erased type import as no runtime dependency", () => {
      // The precise bug that misfiled six modules. If this ever regresses, the
      // type-only form must not count as a Prisma dependency.
      const probe = "@/shared/__boundary_probe_typeonly";
      expect(existsSync(MODULES.get(probe) ?? "")).toBe(false);
      expect(serverReason("@/shared/workflow")).toBeNull();
      expect(readFileSync(MODULES.get("@/shared/workflow")!, "utf8")).toMatch(
        /import\s+type\s+\{[^}]*\}\s+from\s+["']@prisma\/client["']/,
      );
    });

    it("classifies a real server module as server-only", () => {
      expect(serverReason("@/backend/storage/local")).toBeTruthy();
      expect(serverReason("@/backend/upload-storage")).toBeTruthy();
      expect(serverReason("@/backend/site-content")).toBeTruthy();
    });
  });
});
