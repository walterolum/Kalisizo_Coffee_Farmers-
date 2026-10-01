/**
 * Verifies that row level security is doing what the migration claims.
 *
 * Applying the migration is not the same as the control working. A table owner
 * ignores its own policies unless the table is also FORCEd, and Prisma connects
 * as the owner, so a database can hold a complete and correct-looking policy set
 * that every query sails straight past. `pg_policies` would still list them.
 *
 * That failure is invisible from the application: nothing errors, pages just
 * render empty. So this checks the database's actual behaviour rather than the
 * presence of the DDL, and exits non-zero if any property has regressed. Intended
 * to run in CI after migrate, and before trusting a production cutover.
 *
 * Two independent connections are used on purpose:
 *
 *   - the owner connection (DIRECT_DATABASE_URL) to inspect the catalog, which
 *     bypasses row security and is the only way to see the whole truth;
 *   - the application connection (DATABASE_URL) to check what the app actually
 *     gets.
 *
 * Using two real logins rather than SET ROLE avoids inheriting session state and
 * privileges, which is exactly the kind of flattering artefact that makes a
 * security test pass without testing anything.
 */
import { PrismaClient, Prisma } from "@prisma/client";

/** Tables Prisma owns. Excluded because it is recreated by migrate and never queried by the app. */
const IGNORED_TABLES = new Set(["_prisma_migrations"]);

const failures: string[] = [];
const notes: string[] = [];

type RoleRow = {
  rolname: string;
  rolsuper: boolean;
  rolbypassrls: boolean;
  rolcanlogin: boolean;
};

type RlsStateRow = { relname: string; enabled: boolean; forced: boolean };

function check(ok: boolean, label: string, detail = "") {
  const mark = ok ? "pass" : "FAIL";
  console.log(`  [${mark}] ${label}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures.push(label);
}

async function main() {
  const ownerUrl = process.env.DIRECT_DATABASE_URL;
  const appUrl = process.env.DATABASE_URL;

  if (!ownerUrl) throw new Error("DIRECT_DATABASE_URL is not set");
  if (!appUrl) throw new Error("DATABASE_URL is not set");

  const owner = new PrismaClient({ datasources: { db: { url: ownerUrl } } });
  const app = new PrismaClient({ datasources: { db: { url: appUrl } } });

  try {
    const tables = await owner.$queryRaw<Array<{ relname: string }>>`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
      ORDER BY c.relname
    `;
    const targets = tables.map((t) => t.relname).filter((n) => !IGNORED_TABLES.has(n));
    if (targets.length === 0) throw new Error("no tables found in public schema");

    console.log(`\nRow security audit over ${targets.length} tables\n`);

    // ------------------------------------------------------------------
    // 1. FORCE is the load-bearing property. Without it the policies below
    //    are inert for the application role, because it is the table owner.
    // ------------------------------------------------------------------
    console.log("1. Row security enabled AND forced");
    const rlsState = await owner.$queryRaw<Array<RlsStateRow>>`
      SELECT c.relname,
             c.relrowsecurity       AS enabled,
             c.relforcerowsecurity  AS forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
    `;
    const notProtected = rlsState.filter((t) => !IGNORED_TABLES.has(t.relname) && (!t.enabled || !t.forced));
    check(
      notProtected.length === 0,
      "every table has ENABLE and FORCE row security",
      notProtected.length ? `missing on: ${notProtected.map((t) => t.relname).join(", ")}` : `${targets.length} tables`
    );

    // ------------------------------------------------------------------
    // 2. The roles must not be able to ignore policies.
    // ------------------------------------------------------------------
    console.log("\n2. Roles cannot bypass row security");
    const roles = await owner.$queryRaw<Array<RoleRow>>`
      SELECT rolname, rolsuper, rolbypassrls, rolcanlogin
      FROM pg_roles
      WHERE rolname IN ('kalisizo_app','anon','authenticated')
      ORDER BY rolname
    `;
    const privileged = roles.filter((r) => r.rolsuper || r.rolbypassrls);
    check(
      privileged.length === 0,
      "no role is superuser or has BYPASSRLS",
      privileged.length
        ? `privileged: ${privileged.map((r) => r.rolname).join(", ")}`
        : roles.map((r) => r.rolname).join(", ")
    );
    const appRole = roles.find((r) => r.rolname === "kalisizo_app");
    check(!!appRole, "the kalisizo_app role exists");
    check(!!appRole?.rolcanlogin, "kalisizo_app can log in", appRole?.rolcanlogin ? "" : "run: ALTER ROLE kalisizo_app WITH LOGIN PASSWORD '...'");

    // ------------------------------------------------------------------
    // 3. The public keys are the ones whose credentials ship to every
    //    browser, so they must hold nothing.
    // ------------------------------------------------------------------
    console.log("\n3. Public keys hold no privileges");
    const publicGrants = await owner.$queryRaw<Array<{ table_name: string; grantee: string }>>`
      SELECT table_name, grantee
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND grantee IN ('anon','authenticated')
      GROUP BY table_name, grantee
    `;
    check(
      publicGrants.length === 0,
      "anon and authenticated hold no table privileges",
      publicGrants.length
        ? `granted on: ${publicGrants.map((g) => `${g.table_name}->${g.grantee}`).join(", ")}`
        : "none"
    );

    // ------------------------------------------------------------------
    // 4. Row security must be a no-op for the application role. Compared by
    //    counting every table both ways: a permissive policy that was subtly
    //    wrong would show up here as a short count, and would otherwise look
    //    like a legitimately empty table.
    // ------------------------------------------------------------------
    console.log("\n4. Application role sees exactly what the owner sees");
    const mismatched: string[] = [];
    let totalRows = 0;
    for (const table of targets) {
      const [o] = await owner.$queryRawUnsafe<Array<{ c: bigint }>>(
        `SELECT count(*)::bigint AS c FROM ${quoteIdent(table)}`
      );
      const [a] = await app.$queryRawUnsafe<Array<{ c: bigint }>>(
        `SELECT count(*)::bigint AS c FROM ${quoteIdent(table)}`
      );
      totalRows += Number(o.c);
      if (Number(o.c) !== Number(a.c)) {
        mismatched.push(`${table} (owner ${o.c}, app ${a.c})`);
      }
    }
    check(
      mismatched.length === 0,
      "row counts match on every table",
      mismatched.length ? mismatched.join("; ") : `${totalRows} rows across ${targets.length} tables`
    );

    // ------------------------------------------------------------------
    // 5. The application must still be able to write. Read-only checks would
    //    pass here while the admin CMS silently stopped saving anything.
    // ------------------------------------------------------------------
    console.log("\n5. Application role can write");
    try {
      await app.$transaction(async (tx) => {
        const probeId = "rls_verify_probe";
        await tx.$executeRawUnsafe(
          // The status casts are required here: Prisma normally emits them from
          // its own knowledge of the enums, and raw SQL has no such knowledge.
          `INSERT INTO ${quoteIdent("ContactInquiry")}
             (id, "fullName", email, message, status, "createdAt", "updatedAt")
           VALUES ($1,$2,$3,$4,$5::"InquiryStatus", now(), now())`,
          probeId,
          "Row Security Verify",
          "rls-verify@example.invalid",
          "transactional probe, rolled back",
          "PENDING"
        );
        // $executeRawUnsafe resolves to the affected row count, not a row set.
        const upd = await tx.$executeRawUnsafe(
          `UPDATE ${quoteIdent("ContactInquiry")} SET status = 'REVIEWED'::"InquiryStatus" WHERE id = $1`,
          probeId
        );
        const del = await tx.$executeRawUnsafe(
          `DELETE FROM ${quoteIdent("ContactInquiry")} WHERE id = $1`,
          probeId
        );
        check(upd === 1, "update affects the inserted row", `rows: ${upd}`);
        check(del === 1, "delete removes it again", `rows: ${del}`);
        // Throwing here rolls the whole probe back, so no residue is left even
        // if the deletes above silently did nothing.
        throw new Error("__ROLLBACK_PROBE__");
      });
    } catch (err) {
      if (err instanceof Error && err.message === "__ROLLBACK_PROBE__") {
        notes.push("write probe ran inside a transaction and was rolled back");
      } else {
        check(false, "application role can write", err instanceof Error ? err.message : String(err));
      }
    }

    // ------------------------------------------------------------------
    // 6. Fail closed. Models a table added by a future migration whose policy
    //    nobody remembered to write. It must be invisible rather than
    //    readable, so the mistake is loud instead of silent.
    // ------------------------------------------------------------------
    console.log("\n6. Fail closed on an unmanaged table");
    const probeTable = "rls_verify_failclosed_probe";
    try {
      await owner.$executeRawUnsafe(`DROP TABLE IF EXISTS ${quoteIdent(probeTable)}`);
      await owner.$executeRawUnsafe(
        `CREATE TABLE ${quoteIdent(probeTable)} (id int primary key, note text)`
      );
      await owner.$executeRawUnsafe(
        `INSERT INTO ${quoteIdent(probeTable)} (id, note) VALUES (1, 'should be invisible')`
      );
      await owner.$executeRawUnsafe(
        `ALTER TABLE ${quoteIdent(probeTable)} ENABLE ROW LEVEL SECURITY`
      );
      await owner.$executeRawUnsafe(
        `ALTER TABLE ${quoteIdent(probeTable)} FORCE ROW LEVEL SECURITY`
      );
      // Granted, deliberately, with no policy - exactly the drift this guards.
      await owner.$executeRawUnsafe(`GRANT SELECT ON ${quoteIdent(probeTable)} TO kalisizo_app`);
      await owner.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO kalisizo_app`);

      const [seen] = await app.$queryRawUnsafe<Array<{ c: bigint }>>(
        `SELECT count(*)::bigint AS c FROM ${quoteIdent(probeTable)}`
      );
      check(
        Number(seen.c) === 0,
        "a table with FORCE but no policy is invisible to the app",
        `rows visible: ${seen.c}`
      );
    } finally {
      await owner.$executeRawUnsafe(`DROP TABLE IF EXISTS ${quoteIdent(probeTable)}`);
    }

    // ------------------------------------------------------------------
    // 7. The application role must not be able to edit its own guard rails.
    // ------------------------------------------------------------------
    console.log("\n7. Application role cannot alter the schema");
    // Asked as the owner, which is the only connection able to inspect another
    // role's privileges.
    const [ddl] = await owner.$queryRawUnsafe<Array<{ can_create: boolean }>>(
      `SELECT has_schema_privilege('kalisizo_app','public','CREATE') AS can_create`
    );
    check(
      ddl.can_create === false,
      "kalisizo_app has no CREATE on schema public",
      ddl.can_create ? "it can add objects to the protected schema" : ""
    );

    console.log("");
    if (notes.length) {
      for (const n of notes) console.log(`note: ${n}`);
      console.log("");
    }

    if (failures.length) {
      console.error(`Row security audit FAILED (${failures.length}):`);
      for (const f of failures) console.error(`  - ${f}`);
      console.error(
        "\nIf FORCE row security is missing, every policy here is inert for the application\n" +
          "role. Re-apply prisma/migrations/20261002000000_row_level_security."
      );
      process.exitCode = 1;
      return;
    }

    console.log(`Row security audit passed (${targets.length} tables).`);
  } finally {
    await Promise.allSettled([owner.$disconnect(), app.$disconnect()]);
  }
}

/** Quote an identifier for interpolation. Names come from the catalog, never from input. */
function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

main().catch((err) => {
  console.error(err instanceof Prisma.PrismaClientKnownRequestError ? err.message : err);
  process.exit(1);
});