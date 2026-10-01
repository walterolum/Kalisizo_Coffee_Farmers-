/**
 * One-off, mechanical removal of a contiguous line range from a file.
 *
 * Used while splitting `AdminClient.tsx` apart, where the safe operation is a
 * line-range delete rather than a retyped replacement: anything retyped by hand
 * during a move is a change nobody reviewed.
 *
 * Usage: node scripts/remove-range.mjs <file> <firstLine> <lastLine>   (1-based, inclusive)
 * It prints the deleted text to stdout so the caller can eyeball what went.
 */
import { readFileSync, writeFileSync } from "node:fs";

const [, , file, firstRaw, lastRaw] = process.argv;
const first = Number(firstRaw);
const last = Number(lastRaw);

if (!file || !Number.isInteger(first) || !Number.isInteger(last)) {
  console.error("usage: remove-range.mjs <file> <firstLine> <lastLine>");
  process.exit(2);
}

const lines = readFileSync(file, "utf8").split("\n");
if (first < 1 || last > lines.length || first > last) {
  console.error(`range ${first}..${last} is outside 1..${lines.length}`);
  process.exit(1);
}

console.log(`--- removing lines ${first}..${last} of ${file} ---`);
console.log(lines.slice(first - 1, last).join("\n"));
console.log("--- end ---");

writeFileSync(file, lines.slice(0, first - 1).concat(lines.slice(last)).join("\n"), "utf8");
console.log(`${file} is now ${lines.length - (last - first + 1)} lines`);
