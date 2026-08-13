#!/usr/bin/env tsx
/**
 * Exit 0 when migrate target is safe; exit 1 when production is targeted.
 * Loads .env (migrate credentials) and fingerprints .env.prod.local (blocklist only).
 */
import "dotenv/config";
import { assertSafeMigrateTarget, loadProdMigrateFingerprints } from "@/lib/db/guard-migrate-target";

const allowProdMigrate =
  process.env.ALLOW_PROD_MIGRATE === "1" || process.env.ALLOW_PROD_MIGRATE === "true";

const assessment = assertSafeMigrateTarget({
  databaseUrl: process.env.DATABASE_URL,
  directUrl: process.env.DIRECT_URL,
  prodFingerprints: loadProdMigrateFingerprints(process.cwd()),
  allowProdMigrate,
});

if (assessment.blocked) {
  process.stderr.write("\n❌ BLOCKED: prisma migrate would run against production\n");
  process.stderr.write(`   Host: ${assessment.host}\n`);
  process.stderr.write(`   Fingerprint: ${assessment.fingerprint}\n`);
  process.stderr.write(`   Reason: ${assessment.reason}\n\n`);
  process.stderr.write("   Safe options:\n");
  process.stderr.write("   • Point DATABASE_URL / DIRECT_URL in .env at local Docker or dev Supabase\n");
  process.stderr.write("   • Use npm run db:deploy only after confirming: npm run db:studio:check\n");
  process.stderr.write("   • Intentional prod migrate (rare): ALLOW_PROD_MIGRATE=1 npm run db:deploy\n\n");
  process.exit(1);
}

if (allowProdMigrate && assessment.matchedProd) {
  process.stderr.write(
    "⚠️  ALLOW_PROD_MIGRATE=1 — proceeding against production fingerprint (override acknowledged)\n",
  );
}

process.stdout.write(
  `✓ Migrate guard: ${assessment.fingerprint} (${assessment.reason})\n`,
);
