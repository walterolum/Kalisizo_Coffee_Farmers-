/**
 * Normalises line endings to LF.
 *
 * The repository is LF throughout. Files rewritten from a Windows shell pick up
 * CRLF, and some of them end up with *both* — the part written by the editor
 * keeps LF while the part written by a script gets CRLF. A file with mixed
 * endings is worse than one that is consistently wrong: every diff against it
 * shows unrelated lines as changed, which is exactly when a real edit is easiest
 * to miss.
 *
 * Usage: node scripts/normalize-line-endings.mjs [dir ...]
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";

const SKIP = new Set(["node_modules", ".next", ".git", "dist", "build"]);
const ROOTS = process.argv.slice(2).length ? process.argv.slice(2) : ["src", "tests", "scripts"];
const EXTENSIONS = [".ts", ".tsx", ".css", ".json", ".md", ".mjs", ".cjs", ".prisma"];

let fixed = 0;

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
      continue;
    }
    if (!EXTENSIONS.includes(extname(full))) continue;

    const original = readFileSync(full, "utf8");
    const normalised = original.replace(/\r\n/g, "\n");
    if (normalised !== original) {
      writeFileSync(full, normalised, "utf8");
      const crlf = (original.match(/\r\n/g) ?? []).length;
      console.log(`normalised ${full} (${crlf} CRLF)`);
      fixed++;
    }
  }
}

for (const root of ROOTS) {
  try {
    walk(root);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

console.log(fixed ? `\n${fixed} file(s) normalised to LF` : "nothing to do");
