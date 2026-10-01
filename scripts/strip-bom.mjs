/**
 * Strips a UTF-8 BOM from the given files.
 *
 * PowerShell 5.1's `Set-Content -Encoding UTF8` writes a BOM, which no other
 * source file in this repository has. It parses fine but shows up as a phantom
 * character in every diff that touches the first line.
 *
 * Usage: node scripts/strip-bom.mjs <file>...
 */
import { readFileSync, writeFileSync } from "node:fs";

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
let changed = 0;

for (const file of process.argv.slice(2)) {
  const bytes = readFileSync(file);
  if (!bytes.subarray(0, 3).equals(BOM)) continue;
  writeFileSync(file, bytes.subarray(3));
  console.log(`stripped BOM: ${file}`);
  changed++;
}

if (!changed) console.log("no BOMs found");
