/**
 * Assign random valid flooring scope types to every project row, grouped by unit.
 * Each unit gets distinct scopes where possible (no duplicate scope on the same unit).
 *
 * Usage:
 *   npx tsx scripts/randomize-unit-scopes.ts
 *   npx tsx scripts/randomize-unit-scopes.ts --project-id=<uuid>
 *   npx tsx scripts/randomize-unit-scopes.ts --seed=42
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { VALID_FLOORING_SCOPE_NAMES } from "@/lib/scope-type-catalog";
import { createRng, shuffleInPlace } from "@/lib/test-data-seed/random";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

function unitKey(projectId: string, building: string, level: string, unit: string): string {
  return `${projectId}|${building}|${level}|${unit}`;
}

function parseArgs() {
  const projectIdArg = process.argv.find((a) => a.startsWith("--project-id="));
  const seedArg = process.argv.find((a) => a.startsWith("--seed="));
  return {
    projectId: projectIdArg?.split("=")[1]?.trim() || undefined,
    seed: seedArg ? Number(seedArg.split("=")[1]) : undefined,
  };
}

async function main() {
  const { projectId, seed } = parseArgs();
  const rng = createRng(seed);

  const validScopeTypes = await db.scopeType.findMany({
    where: { code: { in: [...VALID_FLOORING_SCOPE_NAMES] } },
    select: { id: true, code: true },
    orderBy: { code: "asc" },
  });

  if (validScopeTypes.length === 0) {
    throw new Error("No valid scope types found — run scripts/bootstrap-scope-type-links.ts first.");
  }

  const rows = await db.projectRow.findMany({
    where: projectId ? { projectId } : undefined,
    select: { id: true, projectId: true, building: true, level: true, unit: true },
    orderBy: [{ projectId: "asc" }, { building: "asc" }, { level: "asc" }, { unit: "asc" }, { rowIndex: "asc" }],
  });

  if (rows.length === 0) {
    console.log("No project rows to update.");
    return;
  }

  const byUnit = new Map<string, string[]>();
  for (const row of rows) {
    const key = unitKey(row.projectId, row.building, row.level, row.unit);
    const list = byUnit.get(key) ?? [];
    list.push(row.id);
    byUnit.set(key, list);
  }

  const updates: { id: string; scopeTypeId: string }[] = [];
  const validIds = validScopeTypes.map((s) => s.id);

  for (const rowIds of byUnit.values()) {
    const pool = shuffleInPlace([...validIds], rng);
    rowIds.forEach((rowId, index) => {
      updates.push({
        id: rowId,
        scopeTypeId: pool[index % pool.length]!,
      });
    });
  }

  const BATCH = 200;
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    await db.$transaction(
      batch.map(({ id, scopeTypeId }) =>
        db.projectRow.update({ where: { id }, data: { scopeTypeId } })
      )
    );
  }

  const scopeCounts = await db.projectRow.groupBy({
    by: ["scopeTypeId"],
    where: projectId ? { projectId } : undefined,
    _count: { _all: true },
  });

  const scopeById = new Map(validScopeTypes.map((s) => [s.id, s.code]));
  console.log(
    `Randomized scopes on ${updates.length} rows across ${byUnit.size} units` +
      (projectId ? ` (project ${projectId})` : "") +
      (seed !== undefined ? ` [seed=${seed}]` : "") +
      "."
  );
  console.log("Scope distribution (top):");
  for (const entry of scopeCounts
    .sort((a, b) => b._count._all - a._count._all)
    .slice(0, 10)) {
    const code = entry.scopeTypeId ? scopeById.get(entry.scopeTypeId) ?? entry.scopeTypeId : "(none)";
    console.log(`  ${code}: ${entry._count._all}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
