/**
 * Reports the storage configuration a deployment actually resolved.
 *
 * Exists because "uploads are broken" is hard to diagnose from the outside: the
 * upload route returns a 503 with a message, but by then someone is trying to
 * upload. This answers the question up front — which backend is selected, what
 * else is configured, and what to set if the answer is wrong.
 *
 * Read-only. Exits non-zero when no backend is usable, so it can gate a deploy.
 */

import { storageStatus, preferredBackend, availableBackends } from "@/lib/storage";
import { uploadsDir, localUploadsEnabled } from "@/lib/upload-storage";

function main() {
  const status = storageStatus();
  const environment = process.env.NODE_ENV ?? "development";

  console.log("Storage configuration");
  console.log(`  environment        ${environment}`);
  console.log(`  preference         ${preferredBackend()}`);
  console.log(`  selected backend   ${status.selected ?? "(none usable)"}`);
  console.log(
    `  configured         ${status.configured.join(", ") || "(none)"}`
  );
  console.log(
    `  local disk         ${localUploadsEnabled() ? "permitted" : "not permitted"} at ${uploadsDir()}`
  );

  if (status.problem) {
    console.log();
    console.log(`  problem: ${status.problem}`);
  }

  const notes: string[] = [];

  if (status.selected === "local" && environment === "production") {
    notes.push(
      "Local disk in production loses every upload on the next cold start unless\n" +
        "  UPLOAD_DIR is a mounted persistent volume. Supabase Storage is the target."
    );
  }

  if (status.selected === "cloudinary") {
    notes.push(
      "Cloudinary is the outgoing backend. The `get` and `remove` operations are\n" +
        "  intentionally unsupported; anything needing them must move first."
    );
  }

  if (status.selected === "supabase") {
    notes.push(
      "Objects are served from a public bucket by URL. Those URLs are persisted as\n" +
        "  content, so the bucket name and project URL must not change without a\n" +
        "  data migration."
    );
  }

  if (notes.length > 0) {
    console.log();
    for (const note of notes) console.log(note);
  }

  if (!status.available) {
    console.error();
    console.error("No usable storage backend. Uploads will fail with a 503.");
    process.exitCode = 1;
    return;
  }

  console.log();
  console.log(
    `OK. ${availableBackends().length} backend${availableBackends().length === 1 ? "" : "s"} available.`
  );
}

main();
