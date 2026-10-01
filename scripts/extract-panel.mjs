/**
 * One-off, mechanical panel extraction.
 *
 * Copies a `function X({...})` block out of `AdminClient.tsx` into its own file
 * verbatim, adds the imports that block needs, and leaves the original in place.
 * It does not reformat, rename or "improve" anything: the risk in splitting a
 * three-thousand-line file is editing the code while moving it, and every
 * difference introduced this way would be invisible in review.
 *
 * Usage: node scripts/extract-panel.mjs <FunctionName> <TargetFile> <headerFile>
 *
 * The header is read from a file rather than passed as an argument because a
 * shell mangles the double quotes in a TypeScript import statement. It is the
 * imports and constants the new file needs, placed above the extracted body.
 */
import { readFileSync, writeFileSync } from "node:fs";

const [, , fnName, targetFile, headerFile] = process.argv;
if (!fnName || !targetFile || !headerFile) {
  console.error("usage: extract-panel.mjs <FunctionName> <TargetFile> <headerFile>");
  process.exit(2);
}

const importBlock = readFileSync(headerFile, "utf8").replace(/\s+$/, "");

const SOURCE = "src/app/admin/AdminClient.tsx";
const lines = readFileSync(SOURCE, "utf8").split("\n");

const start = lines.findIndex((l) => l.startsWith(`function ${fnName}(`));
if (start === -1) {
  console.error(`could not find "function ${fnName}(" in ${SOURCE}`);
  process.exit(1);
}

// Walk braces from the opening line to find the end of the function.
let depth = 0;
let seen = false;
let end = -1;
for (let i = start; i < lines.length; i++) {
  for (const ch of lines[i]) {
    if (ch === "{") {
      depth++;
      seen = true;
    } else if (ch === "}") {
      depth--;
    }
  }
  if (seen && depth === 0) {
    end = i;
    break;
  }
}
if (end === -1) {
  console.error(`could not find the end of ${fnName}`);
  process.exit(1);
}

const body = lines.slice(start, end + 1);

// Exported panels keep their name so the import site stays a one-word change.
const exported = body.join("\n").replace(`function ${fnName}(`, `export function ${fnName}(`);

const out = [
  '"use client";',
  "",
  importBlock,
  "",
  exported,
  "",
].join("\n");

writeFileSync(targetFile, out, "utf8");
console.log(
  `extracted ${fnName}: lines ${start + 1}..${end + 1} (${body.length} lines) -> ${targetFile}`
);
