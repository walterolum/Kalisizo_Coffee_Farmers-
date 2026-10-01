/**
 * Reports the line endings of every source file, so a file that was rewritten on
 * Windows with CRLF while the rest of the repository uses LF is visible. Mixed
 * endings make a diff show every line as changed, which hides real edits.
 *
 * Usage: node scripts/check-line-endings.mjs [dir]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const ROOT = process.argv[2] ?? "src";
const SKIP = new Set(["node_modules", ".next", ".git", "public", "dist", "build"]);

/** @type {Record<string, string[]>} */
const byEnding = { crlf: [], lf: [] };

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
      continue;
    }
    if (![".ts", ".tsx", ".css", ".json", ".md", ".mjs", ".cjs", ".prisma"].includes(extname(full))) {
      continue;
    }
    const text = readFileSync(full, "utf8");
    const crlf = (text.match(/\r\n/g) ?? []).length;
    const bareLf = (text.match(/(?<!\r)\n/g) ?? []).length;
    if (crlf && bareLf) byEnding.crlf.push(`${relative(ROOT, full)} (mixed: ${crlf} CRLF, ${bareLf} LF)`);
    else if (crlf) byEnding.crlf.push(relative(ROOT, full));
    else byEnding.lf.push(relative(ROOT, full));
  }
}

walk(ROOT);

console.log(`LF only:   ${byEnding.lf.length} files`);
console.log(`CRLF:      ${byEnding.crlf.length} files`);
for (const f of byEnding.crlf) console.log(`  ${f}`);
