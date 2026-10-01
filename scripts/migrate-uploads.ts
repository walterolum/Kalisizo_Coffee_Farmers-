/**
 * Moves locally stored uploads to the configured storage backend and repoints
 * the database at the new URLs.
 *
 * The two halves have to happen together. Copying files without rewriting the
 * stored URLs leaves every image on the site broken the moment the local backend
 * stops being selected; rewriting URLs without copying the files breaks them in
 * the other direction. So this script refuses to report success unless both are
 * done, and it reports what it did rather than assuming.
 *
 * Safe to run more than once. Already-absolute URLs are left alone, and an object
 * that already exists in the target bucket is reused rather than re-uploaded.
 *
 * Dry run by default. Passing `--apply` is required to write anything, because
 * this rewrites live content.
 *
 * Usage:
 *   npm run storage:migrate            # report only
 *   npm run storage:migrate -- --apply # perform the move
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

import { prisma } from "@/lib/prisma";
import {
  contentTypeFor,
  isStoredName,
  uploadsDir,
} from "@/lib/upload-storage";
import {
  getStorageBackend,
  storageStatus,
  type StorageBackend,
} from "@/lib/storage";
import {
  buildUrlMap,
  planUrlRewrite,
  UPLOAD_PREFIX_LIKE,
  URL_COLUMN_SQL,
  type PendingRewrite,
} from "@/lib/storage/rewrite";

const apply = process.argv.includes("--apply");
const keepLocalCopies = process.argv.includes("--keep-local");

type UploadRow = { name: string; size: number };

async function findLocalUploads(): Promise<UploadRow[]> {
  const dir = uploadsDir();
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    console.log(`No local upload directory at ${dir}. Nothing to move.`);
    return [];
  }

  const rows: UploadRow[] = [];
  for (const name of entries) {
    // Anything not matching the allowlist is not something this application
    // wrote, so it is not ours to move or delete.
    if (!isStoredName(name)) {
      console.log(`  skipping ${name}: not a well-formed stored name`);
      continue;
    }
    const info = await stat(join(dir, name));
    if (!info.isFile()) continue;
    rows.push({ name, size: info.size });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Uploads each file and records where it ended up.
 *
 * A failure on one file does not abort the rest: the point is to report exactly
 * which references cannot be moved, and stopping at the first failure would hide
 * the rest behind one error.
 */
async function uploadAll(
  backend: StorageBackend,
  files: UploadRow[]
): Promise<{ moved: Array<{ name: string; url: string }>; failed: Array<{ name: string; reason: string }> }> {
  const moved: Array<{ name: string; url: string }> = [];
  const failed: Array<{ name: string; reason: string }> = [];
  const dir = uploadsDir();

  for (const file of files) {
    const contentType = contentTypeFor(file.name);
    if (!contentType) {
      failed.push({ name: file.name, reason: "unrecognised extension" });
      continue;
    }

    try {
      const body = await readFile(join(dir, file.name));
      const stored = await backend.put({
        key: file.name,
        body,
        contentType,
        folder: "kalisizo-coffee/migrated",
      });
      moved.push({ name: file.name, url: stored.url });
      console.log(
        `  uploaded ${file.name} (${formatBytes(file.size)}) -> ${stored.url}`
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      failed.push({ name: file.name, reason });
      console.error(`  FAILED ${file.name}: ${reason}`);
    }
  }

  return { moved, failed };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

type UrlColumn = { table_name: string; column_name: string };

/**
 * Works out every stored value that would change, without writing anything.
 *
 * Returns the plan and the values that look wrong, so a human can review before
 * `--apply`. Values are read column by column with the identifiers quoted
 * because the schema uses Prisma's mixed-case model names.
 */
async function planRewrites(
  urlsByName: ReadonlyMap<string, string>
): Promise<{ pending: PendingRewrite[]; suspicious: string[] }> {
  const columns = await prisma.$queryRawUnsafe<UrlColumn[]>(URL_COLUMN_SQL);
  const pending: PendingRewrite[] = [];
  const suspicious: string[] = [];

  for (const { table_name, column_name } of columns) {
    const table = quoteIdent(table_name);
    const column = quoteIdent(column_name);

    // `ctid` is a Postgres system column present on every table, so rows can be
    // identified for the review listing without first checking whether each table
    // happens to have an `id`. It is only used for display: the write is keyed on
    // the current value, not on the identifier.
    const rows = await prisma.$queryRawUnsafe<
      Array<Record<string, string | null>>
    >(
      `SELECT ctid::text AS __id, ${column} AS __value
       FROM ${table}
       WHERE ${column} LIKE $1`,
      `${UPLOAD_PREFIX_LIKE}`
    );

    for (const row of rows) {
      const decision = planUrlRewrite(row.__value, urlsByName);
      if (decision.action === "rewrite") {
        pending.push({
          table: table_name,
          column: column_name,
          id: row.__id ?? "?",
          from: decision.from,
          to: decision.to,
        });
      } else if (decision.action === "suspicious") {
        suspicious.push(`${table_name}.${column_name}: ${decision.reason}`);
      }
    }
  }

  return { pending, suspicious };
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Applies the planned rewrites in one transaction.
 *
 * All or nothing on purpose. A partial rewrite leaves the site in a state where
 * some images resolve and some do not, with no record of which is which, and the
 * only way out is to read this script's output.
 */
async function applyRewrites(pending: PendingRewrite[]): Promise<number> {
  let changed = 0;
  await prisma.$transaction(async (tx) => {
    for (const row of pending) {
      const result = await tx.$executeRawUnsafe(
        `UPDATE ${quoteIdent(row.table)}
         SET ${quoteIdent(row.column)} = $1
         WHERE ${quoteIdent(row.column)} = $2`,
        row.to,
        row.from
      );
      changed += result;
    }
  });
  return changed;
}

async function main() {
  const status = storageStatus();
  console.log("Storage configuration:");
  console.log(`  selected:  ${status.selected ?? "(none)"}`);
  console.log(`  available: ${status.configured.join(", ") || "(none)"}`);
  if (status.problem) console.log(`  note:      ${status.problem}`);
  console.log(`  mode:      ${apply ? "APPLY (will write)" : "DRY RUN (no changes)"}`);
  console.log();

  const backend = getStorageBackend();
  if (!backend) {
    console.error(
      "No usable storage backend. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, " +
        "or the CLOUDINARY_* variables, then run this again."
    );
    process.exitCode = 1;
    return;
  }

  if (backend.name === "local") {
    // Moving local files to local would rewrite URLs onto themselves and report a
    // success that did nothing.
    console.error(
      "The selected backend is `local`, so there is nowhere to move anything. " +
        "Configure the target backend or set STORAGE_BACKEND explicitly."
    );
    process.exitCode = 1;
    return;
  }

  const files = await findLocalUploads();
  console.log(
    `Found ${files.length} local upload${files.length === 1 ? "" : "s"} in ${uploadsDir()}`
  );
  if (files.length === 0) {
    console.log("Nothing to migrate.");
    return;
  }
  console.log();

  const { moved, failed } = await uploadAll(backend, files);
  console.log();

  if (moved.length === 0) {
    console.error("No files were uploaded. The database has not been touched.");
    process.exitCode = 1;
    return;
  }

  const { pending, suspicious } = await planRewrites(buildUrlMap(moved));

  console.log(`Database references to repoint: ${pending.length}`);
  for (const row of pending) {
    console.log(
      `  ${row.table}.${row.column} [${row.id}]\n      ${row.from}\n   -> ${row.to}`
    );
  }

  if (suspicious.length > 0) {
    console.log();
    console.log(`Values under /uploads/ that are not well-formed stored names (${suspicious.length}):`);
    for (const note of suspicious) console.log(`  ${note}`);
    console.log(
      "  These are left untouched. Check them by hand: rewriting would be a guess."
    );
  }

  // A reference to a file that failed to upload is the dangerous case, because
  // the URL stays valid now and breaks when the local backend goes away.
  const uploaded = new Set(moved.map((m) => m.name));
  const knownReferences = pending.map((row) => row.from);
  const orphaned = await findUnresolvedReferences(knownReferences, uploaded);
  if (orphaned.length > 0) {
    console.log();
    console.log(`References that would be left pointing at local disk (${orphaned.length}):`);
    for (const note of orphaned) console.log(`  ${note}`);
    console.log(
      "  These rows are NOT being repointed, because the file was not uploaded. " +
        "Do not remove the local backend until they are resolved."
    );
  }

  if (failed.length > 0) {
    console.log();
    console.log(`Files that failed to upload (${failed.length}):`);
    for (const f of failed) console.log(`  ${f.name}: ${f.reason}`);
  }

  if (pending.length === 0) {
    console.log();
    console.log("No stored URLs needed repointing. Files are in the new backend.");
  } else if (!apply) {
    console.log();
    console.log("Dry run: nothing was written. Re-run with --apply to make these changes.");
  } else {
    console.log();
    const changed = await applyRewrites(pending);
    console.log(`Repointed ${changed} stored URL${changed === 1 ? "" : "s"}.`);

    if (!keepLocalCopies && failed.length === 0 && orphaned.length === 0) {
      console.log();
      console.log(
        "Local copies were left in place. Delete them manually once the new URLs are\n" +
          "confirmed working, so a rollback is still possible."
      );
    }
  }

  await prisma.$disconnect();
}

/**
 * Finds stored `/uploads/` references whose file was not uploaded.
 *
 * Compares against the values already planned for rewrite plus the uploaded set,
 * so it also catches a name that is referenced but has no file on disk at all —
 * a pre-existing broken image worth surfacing.
 */
async function findUnresolvedReferences(
  alreadyPlanned: string[],
  uploaded: ReadonlySet<string>
): Promise<string[]> {
  const unresolved: string[] = [];
  const planned = new Set(alreadyPlanned);

  for (const url of await allStoredUploadUrls()) {
    if (planned.has(url)) continue;
    const name = url.replace(/^\/uploads\//, "");
    if (!isStoredName(name)) continue;
    if (uploaded.has(name)) continue;
    unresolved.push(`${url} (no matching file was uploaded)`);
  }
  return unresolved;
}

async function allStoredUploadUrls(): Promise<string[]> {
  const columns = await prisma.$queryRawUnsafe<UrlColumn[]>(URL_COLUMN_SQL);
  const urls = new Set<string>();

  for (const { table_name, column_name } of columns) {
    const rows = await prisma.$queryRawUnsafe<Array<{ __value: string | null }>>(
      `SELECT ${quoteIdent(column_name)} AS __value
       FROM ${quoteIdent(table_name)}
       WHERE ${quoteIdent(column_name)} LIKE $1`,
      UPLOAD_PREFIX_LIKE
    );
    for (const row of rows) {
      if (row.__value) urls.add(row.__value);
    }
  }

  return Array.from(urls);
}

main().catch(async (error) => {
  console.error("Migration failed:", error);
  await prisma.$disconnect().catch(() => {});
  process.exitCode = 1;
});
