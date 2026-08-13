/**
 * Seed lookup tables (scope_types, uom_types, location_types, cost_types, install_teams).
 *
 * Usage:
 *   npx tsx scripts/seed-lookups.ts
 *
 * Requires DATABASE_URL (from .env or environment).
 *
 * Or with a JSON file of scope types:
 *   npx tsx scripts/seed-lookups.ts --scope-types='["Framing","Drywall","Electrical",...]'
 *
 * The script upserts by code, so running it multiple times is safe.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const DEFAULT_UOM_TYPES = [
  { code: "EA", name: "Each" },
  { code: "SF", name: "Square Feet" },
  { code: "LF", name: "Linear Feet" },
  { code: "CY", name: "Cubic Yards" },
  { code: "TON", name: "Ton" },
  { code: "HR", name: "Hours" },
  { code: "LS", name: "Lump Sum" },
];

async function upsertScopeTypes(codes: string[]) {
  for (const code of codes) {
    if (!code?.trim()) continue;
    await db.$executeRawUnsafe(
      `INSERT INTO scope_types (id, code, name) VALUES (gen_random_uuid()::text, $1, $2)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name`,
      code.trim(),
      code.trim()
    );
  }
  console.log(`Upserted ${codes.length} scope types`);
}

async function upsertUomTypes(rows: { code: string; name: string }[]) {
  for (const { code, name } of rows) {
    if (!code?.trim()) continue;
    await db.$executeRawUnsafe(
      `INSERT INTO uom_types (id, code, name) VALUES (gen_random_uuid()::text, $1, $2)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name`,
      code.trim(),
      (name || code).trim()
    );
  }
  console.log(`Upserted ${rows.length} UOM types`);
}

async function main() {
  const scopeTypesArg = process.argv.find((a) => a.startsWith("--scope-types="));
  const scopeTypes: string[] = scopeTypesArg
    ? JSON.parse(scopeTypesArg.split("=")[1] ?? "[]")
    : [];

  if (scopeTypes.length > 0) {
    await upsertScopeTypes(scopeTypes);
  } else {
    console.log("No --scope-types= provided. Skipping scope types. Add scope types when you have the list.");
  }

  await upsertUomTypes(DEFAULT_UOM_TYPES);

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
