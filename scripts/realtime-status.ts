/**
 * Reports the realtime configuration a deployment actually resolved.
 *
 * Same purpose as `storage-status.ts`, and for the same reason: the symptom of a
 * wrong realtime backend is not an error but an absence. Updates simply arrive on
 * the poll timer instead of instantly, so nothing ever reports a failure and the
 * cause is invisible from the outside.
 *
 * The specific trap this catches is a half-applied cutover — the server
 * publishing over Supabase while browsers subscribe over SSE, or the reverse.
 * Both sides are configured, both are individually valid, no request fails, and
 * live updates silently stop. Reading one line of configuration is the only way
 * to see it.
 *
 * Read-only. Exits non-zero when no transport is usable, so it can gate a deploy.
 */

import { realtimeStatus, preferredBackend } from "@/lib/realtime-transport";

function main() {
  const status = realtimeStatus();
  const environment = process.env.NODE_ENV ?? "development";

  console.log("Realtime configuration");
  console.log(`  environment        ${environment}`);
  console.log(`  preference         ${preferredBackend()}`);
  console.log(`  selected backend   ${status.selected ?? "(none usable)"}`);
  console.log(`  configured         ${status.configured.join(", ") || "(none)"}`);
  // The line that matters most: a browser subscribing somewhere the server never
  // publishes to looks identical to working from the outside.
  console.log(`  client subscribes  ${status.clientTransport}`);

  if (status.problem) {
    console.log();
    console.log(`  problem: ${status.problem}`);
  }

  const notes: string[] = [];

  if (status.selected === "sse" && status.configured.includes("supabase")) {
    notes.push(
      "SSE only reaches subscribers attached to the process that handled the write.\n" +
        "  On Vercel, which runs many instances, that is a fraction of your visitors.\n" +
        "  Set REALTIME_BACKEND=\"supabase\" to publish to every subscriber."
    );
  }

  if (status.clientTransport === "supabase") {
    const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!publicUrl || !anonKey) {
      notes.push(
        "The server publishes over Supabase but NEXT_PUBLIC_SUPABASE_URL or\n" +
          "  NEXT_PUBLIC_SUPABASE_ANON_KEY is missing, so browsers fall back to the SSE\n" +
          "  stream and will receive nothing. Both are needed at build time."
      );
    }
  }

  if (status.clientTransport === "supabase") {
    notes.push(
      "The broadcast channel is public until Supabase Auth replaces the\n" +
        "  application's own JWT. Payloads are restricted to collection names so\n" +
        "  nothing row-shaped is exposed; make the channel private once auth moves."
    );
  }

  if (notes.length) {
    console.log();
    for (const note of notes) console.log(`  note: ${note}`);
    console.log();
  }

  if (!status.available) {
    console.error("Realtime is not usable. Live updates will not be delivered.");
    process.exitCode = 1;
    return;
  }

  console.log(`Realtime is using ${status.selected}.`);
}

main();