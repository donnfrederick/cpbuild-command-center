/**
 * Upsert flooring subcontractor scope_types and link each to a canonical_scope_types row.
 * Idempotent — safe to re-run on local dev after UPM imports that skip canonical linking.
 *
 * Usage: npx tsx scripts/bootstrap-scope-type-links.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { SCOPE_TO_CANONICAL } from "@/lib/scope-type-catalog";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const canonicalByCode = new Map(
    (await db.canonicalScopeType.findMany()).map((c) => [c.code, c.id] as const)
  );

  const missingCanonical = [...new Set(Object.values(SCOPE_TO_CANONICAL))].filter(
    (code) => !canonicalByCode.has(code)
  );
  if (missingCanonical.length > 0) {
    throw new Error(`Missing canonical_scope_types rows: ${missingCanonical.join(", ")}`);
  }

  let linked = 0;
  for (const [scopeName, canonicalCode] of Object.entries(SCOPE_TO_CANONICAL)) {
    const canonicalScopeTypeId = canonicalByCode.get(canonicalCode)!;
    await db.scopeType.upsert({
      where: { code: scopeName },
      create: { code: scopeName, name: scopeName, canonicalScopeTypeId },
      update: { name: scopeName, canonicalScopeTypeId },
    });
    linked += 1;
  }

  // Re-link any existing scope_types that match migration backfill rules but lost their FK.
  for (const [scopeName, canonicalCode] of Object.entries(SCOPE_TO_CANONICAL)) {
    const canonicalScopeTypeId = canonicalByCode.get(canonicalCode)!;
    await db.scopeType.updateMany({
      where: { code: scopeName, canonicalScopeTypeId: null },
      data: { canonicalScopeTypeId },
    });
  }

  const unlinked = await db.scopeType.findMany({
    where: { canonicalScopeTypeId: null },
    orderBy: { code: "asc" },
    select: { code: true, name: true, _count: { select: { projectRows: true } } },
  });

  console.log(`Linked ${linked} scope types to canonical entries.`);
  if (unlinked.length > 0) {
    console.log("Still unlinked (not in flooring list — link manually if needed):");
    for (const row of unlinked) {
      console.log(`  - ${row.code} (${row._count.projectRows} project rows)`);
    }
  } else {
    console.log("All scope_types are linked to a canonical entry.");
  }

  const tile = await db.scopeType.findFirst({
    where: { code: "Tile" },
    include: { canonicalScopeType: { select: { code: true, displayName: true } } },
  });
  console.log("Tile link:", tile?.canonicalScopeType ?? "NOT FOUND");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
