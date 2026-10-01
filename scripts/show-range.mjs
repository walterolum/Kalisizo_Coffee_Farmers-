/**
 * Reads a contiguous line range out of a file and prints it.
 *
 * The counterpart to `remove-range.mjs`: used to inspect exactly what a panel
 * depends on before moving it, so the imports for the new file are derived from
 * the code rather than guessed.
 *
 * Usage: node scripts/show-range.mjs <file> <firstLine> <lastLine>   (1-based, inclusive)
 */
import { readFileSync } from "node:fs";

const [, , file, firstRaw, lastRaw] = process.argv;
const first = Number(firstRaw);
const last = Number(lastRaw);

if (!file || !Number.isInteger(first) || !Number.isInteger(last)) {
  console.error("usage: show-range.mjs <file> <firstLine> <lastLine>");
  process.exit(2);
}

const lines = readFileSync(file, "utf8").split("\n");
console.log(lines.slice(first - 1, last).join("\n"));
