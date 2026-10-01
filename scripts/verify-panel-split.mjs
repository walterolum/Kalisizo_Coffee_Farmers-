/**
 * Guards the split of `AdminClient.tsx` into per-panel files.
 *
 * A verbatim diff against the pre-split file was the first version of this. It
 * turned out to be the wrong tool: the working tree at that point already
 * contained a session's worth of deliberate changes (window.confirm replaced by
 * ConfirmDialog, save feedback made truthful, realtime topics added), so every
 * line differed and the output said nothing about the extraction. It also could
 * not run at all without a commit to compare against, and the repository has
 * none. A check that reports differences it cannot attribute is noise.
 *
 * What it checks instead are the two ways the split actually goes wrong:
 * losing code, and wiring a panel to nothing. Both are silent — the first shows
 * up as a subtle behaviour change, the second as a blank screen.
 *
 * Usage: node scripts/verify-panel-split.mjs
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CLIENT = "src/app/admin/AdminClient.tsx";
const COMPONENT_DIR = "src/components/admin";

const client = readFileSync(CLIENT, "utf8");
const components = readdirSync(COMPONENT_DIR)
  .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))
  .map((f) => ({ file: f, source: readFileSync(join(COMPONENT_DIR, f), "utf8") }));

const problems = [];
const fail = (message) => problems.push(message);

/* ---------------------------------------------------------- brace balance */

function braceBalance(source, label) {
  // Counted outside strings and comments, since JSX text and template literals
  // legitimately contain braces that are not code.
  let depth = 0;
  let mode = "code";
  let quote = "";
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    const next = source[i + 1];
    if (mode === "line-comment") {
      if (c === "\n") mode = "code";
      continue;
    }
    if (mode === "block-comment") {
      if (c === "*" && next === "/") {
        mode = "code";
        i++;
      }
      continue;
    }
    if (mode === "string") {
      if (c === "\\") i++;
      else if (c === quote) mode = "code";
      continue;
    }
    if (c === "/" && next === "/") {
      mode = "line-comment";
      i++;
      continue;
    }
    if (c === "/" && next === "*") {
      mode = "block-comment";
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      mode = "string";
      quote = c;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth < 0) {
        fail(`${label}: a closing brace at offset ${i} with nothing open`);
        return;
      }
    }
  }
  if (depth !== 0) {
    fail(`${label}: ${depth} brace(s) left open — a function was cut short`);
  }
}

braceBalance(client, CLIENT);
for (const { file, source } of components) {
  braceBalance(source, join(COMPONENT_DIR, file));
}

/* ------------------------------------------------ nothing lost in the move */

/** `function Name(` / `export function Name(` / `export async function Name(`. */
function declaredFunctions(source) {
  return [
    ...source.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/g),
  ].map((m) => m[1]);
}

const clientFunctions = new Set(declaredFunctions(client));
const componentFunctions = new Set(
  components.flatMap(({ source }) => declaredFunctions(source))
);

/**
 * The panels `AdminClient` renders. Each has to be defined in exactly one place;
 * a name defined in neither, or in both, is a wiring mistake.
 *
 * Two shapes are matched: the single-line `{tab === "x" && <X ... />}` form and
 * the multi-line `{tab === "x" && (\n <X ... />\n)}` form, which is how the
 * panels that take several props are written.
 */
const rendered = [
  ...[...client.matchAll(/\{tab === "(\w+)" && <(\w+)/g)].map((m) => ({ tab: m[1], component: m[2] })),
  ...[...client.matchAll(/\{tab === "(\w+)" && \(\s*\n\s*<(\w+)/g)].map((m) => ({
    tab: m[1],
    component: m[2],
  })),
];

// The nav model is the source of truth for which screens must exist, so it is
// what the render list is compared against rather than a hard-coded count.
const navSource = readFileSync(join(COMPONENT_DIR, "nav.ts"), "utf8");
// The `PanelId` union is the authoritative list of screens. Reading the union
// rather than the `id:` fields avoids picking up the nav *group* ids, which are
// not panels and have nothing behind them.
const panelIdUnion = /export type PanelId =([\s\S]*?);/.exec(navSource);
const navTabs = new Set(
  panelIdUnion ? [...panelIdUnion[1].matchAll(/"([a-z-]+)"/g)].map((x) => x[1]) : []
);

if (navTabs.size < 15) {
  fail(`only read ${navTabs.size} panel ids from nav.ts; the union parse looks wrong`);
}

// Most content tabs are dispatched through CONTENT_TABS into the single
// <ContentPanel> rather than rendered one by one, so both routes count as
// served. Keys with a hyphen are quoted in the object literal, hence the
// optional quotes in the pattern.
const dispatched = new Set(
  [...client.matchAll(/"?([a-z-]+)"?:\s*"[a-z/]+",/g)].map((m) => m[1])
);

for (const tab of navTabs) {
  if (!rendered.some((r) => r.tab === tab) && !dispatched.has(tab)) {
    fail(`the nav offers "${tab}" but AdminClient renders no panel for it`);
  }
}

for (const { tab, component } of rendered) {
  const inClient = clientFunctions.has(component);
  const inComponents = componentFunctions.has(component);
  if (inClient && inComponents) {
    fail(`${component} is defined in both AdminClient and a component file`);
  }
  if (!inClient && !inComponents) {
    fail(`tab "${tab}" renders <${component}>, which is not defined anywhere`);
  }
  // A component defined in another file has to be imported; one defined right
  // here is already in scope and must not be.
  if (!inClient) {
    const imported = new RegExp(`import\\s*\\{[^}]*\\b${component}\\b[^}]*\\}`, "s").test(client);
    if (!imported) {
      fail(`tab "${tab}" renders <${component}> but AdminClient does not import it`);
    }
  }
}

/* -------------------------------------------- every import resolves to code */

for (const { file, source } of [{ file: CLIENT, source: client }, ...components]) {
  for (const m of source.matchAll(/from\s+"@\/([^"]+)"/g)) {
    const target = join("src", m[1]);
    const found = [".ts", ".tsx", "/index.ts", "/index.tsx"].some((ext) => {
      try {
        readFileSync(target + ext);
        return true;
      } catch {
        return false;
      }
    });
    if (!found) fail(`${file} imports @/${m[1]}, which does not exist`);
  }
}

/* ------------------------------------------------------------------ report */

if (problems.length) {
  for (const p of problems) console.error(`FAIL ${p}`);
  process.exit(1);
}

console.log(`${CLIENT}: ${clientFunctions.size} functions, ${client.split("\n").length} lines`);
console.log(`${components.length} files in components/admin, ${componentFunctions.size} functions total`);
console.log(`${rendered.length} panels rendered, each defined once and imported`);
console.log("braces balanced everywhere; no dangling import");
