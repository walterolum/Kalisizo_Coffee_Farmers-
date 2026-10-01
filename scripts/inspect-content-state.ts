/**
 * One-off read-only probe: reports which models actually carry a `status`
 * column, what the real publication state of the content is, and anything sitting
 * in a non-published state (which is invisible on the public site).
 *
 * Run with: npx tsx scripts/inspect-content-state.ts
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const WORKFLOW_STATUSES = ["DRAFT", "IN_REVIEW", "PUBLISHED", "ARCHIVED"] as const;

type Delegate = {
  count(args: Record<string, unknown>): Promise<number>;
};

function delegateOf(model: string): Delegate {
  return (prisma as unknown as Record<string, Delegate>)[model];
}

/**
 * Reads the real model list out of the schema file. A grep over the file reports
 * the wrong answer because each `model` block is followed by 40 lines of the
 * *next* model, so a naive "does this contain status" test picks up fields that
 * belong to a different table. Splitting on the block braces does not.
 */
function modelsWithStatus(): string[] {
  const source = readFileSync("prisma/schema.prisma", "utf8");
  const names: string[] = [];
  for (const block of source.match(/^model\s+\w+\s*\{[\s\S]*?^\}/gm) ?? []) {
    if (/^\s+status\s+ContentStatus/m.test(block)) {
      names.push(block.match(/^model\s+(\w+)/)![1]);
    }
  }
  return names;
}

async function main() {
  const withStatus = modelsWithStatus();

  console.log("--- models with a ContentStatus column ---");
  for (const model of withStatus) {
    const delegate = delegateOf(model);
    const counts: string[] = [];
    let total = 0;
    for (const status of WORKFLOW_STATUSES) {
      const n = await delegate.count({ where: { status } });
      total += n;
      counts.push(`${status}=${n}`);
    }
    let live = "-";
    try {
      live = String(await delegate.count({ where: { status: "PUBLISHED", deletedAt: null } }));
    } catch {
      // Models without `deletedAt` cannot be filtered that way.
      live = String(await delegate.count({ where: { status: "PUBLISHED" } }));
    }
    console.log(
      `${model.padEnd(18)} total=${String(total).padEnd(5)} live=${live.padEnd(5)} ${counts.join(" ")}`
    );
  }

  const notPublished = await prisma.service.findMany({
    where: { status: { not: "PUBLISHED" } },
    select: { title: true, status: true },
    orderBy: { displayOrder: "asc" },
  });
  console.log(
    notPublished.length
      ? `\nPrograms not PUBLISHED:\n${notPublished.map((s) => `  ${s.status}  ${s.title}`).join("\n")}`
      : "\nAll programs are PUBLISHED."
  );

  const programs = await prisma.service.findMany({
    select: { title: true, status: true, displayOrder: true, deletedAt: true },
    orderBy: [{ displayOrder: "asc" }],
  });
  console.log(`\nPrograms on record: ${programs.length}`);
  for (const p of programs) {
    console.log(
      `  #${p.displayOrder}  ${p.status.padEnd(10)} ${p.title}${p.deletedAt ? "  (deleted)" : ""}`
    );
  }
}

main()
  .catch((error) => {
    console.error("probe failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
