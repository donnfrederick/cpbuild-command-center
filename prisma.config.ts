import "dotenv/config";
import { defineConfig } from "prisma/config";

const PLACEHOLDER_URL = "postgresql://localhost:5432/placeholder";
const isGenerateOnly = process.argv.includes("generate");

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    if (isGenerateOnly) {
      return PLACEHOLDER_URL;
    }
    throw new Error(
      "DATABASE_URL is not set. On Railway: add variable DATABASE_URL = ${{Postgres.DATABASE_URL}} to your app service."
    );
  }
  return url;
}

// DIRECT_URL bypasses PgBouncer and connects to Postgres directly.
// Required for `prisma migrate deploy` / `prisma migrate dev` — DDL migrations are
// incompatible with PgBouncer transaction mode.
//
// Supabase: use the "Direct connection" string (db.[ref].supabase.co, port 5432).
// Railway: leave unset — Railway's internal Postgres is accessed directly by the
//          deploy container and doesn't need a separate direct URL.
// Docker local: set to the same value as DATABASE_URL (no PgBouncer involved).
//
// If DIRECT_URL is not set, Prisma Migrate falls back to DATABASE_URL. This is
// fine for Railway/Docker but will cause intermittent failures with Supabase pooler.
function getDirectUrl(): string | undefined {
  return process.env.DIRECT_URL ?? undefined;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: getDatabaseUrl(),
    // directUrl tells Prisma Migrate to run DDL via the direct (non-pooled) connection.
    // The app itself always uses DATABASE_URL via the PrismaPg adapter in lib/db.ts.
    ...((directUrl) => (directUrl ? { directUrl } : {}))(getDirectUrl()),
  },
});
