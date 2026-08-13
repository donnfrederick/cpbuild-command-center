/**
 * Bootstrap test media pool + Test Subcontractor install team.
 * Idempotent — safe to run on every Railway container start.
 */
import "dotenv/config";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  isSupabaseFieldMediaConfigured,
  writeLocalFieldMediaFile,
} from "../lib/field-media-local.js";
import { getSupabaseUrlFromEnv } from "../lib/supabase-url-shared.js";
import { TEST_INSTALL_TEAM_CODE, TEST_INSTALL_TEAM_NAME } from "../lib/test-data-seed/constants.js";
import { TEST_MEDIA_POOL } from "../lib/test-data-seed/media-pool.js";

/** Minimal valid 1×1 JPEG (~631 bytes). */
const PLACEHOLDER_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAj8Cf//Z",
  "base64"
);

/** Railway startup must not hang on a slow Supabase response. */
const BOOTSTRAP_UPLOAD_TIMEOUT_MS = 15_000;

async function ensurePoolFile(storageKey: string, data: Buffer): Promise<void> {
  // Seeded MediaAttachment URLs use /api/upload/field-media/file — always keep a local copy.
  await writeLocalFieldMediaFile(storageKey, data);

  if (!isSupabaseFieldMediaConfigured()) {
    return;
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const supabaseUrl = getSupabaseUrlFromEnv();
  if (!serviceRoleKey || !supabaseUrl) {
    console.warn("[bootstrap-test-media] Supabase not fully configured — local copy only");
    return;
  }

  const uploadUrl = `${supabaseUrl}/storage/v1/object/${storageKey}`;
  try {
    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        "Content-Type": "image/jpeg",
        "x-upsert": "true",
      },
      body: new Uint8Array(data),
      signal: AbortSignal.timeout(BOOTSTRAP_UPLOAD_TIMEOUT_MS),
    });

    if (!res.ok) {
      const err = await res.text();
      console.warn(
        `[bootstrap-test-media] Supabase upload failed for ${storageKey} (${res.status}): ${err} — using local copy`
      );
    }
  } catch (err) {
    console.warn(
      `[bootstrap-test-media] Supabase upload error for ${storageKey}:`,
      err instanceof Error ? err.message : err,
      "— using local copy"
    );
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.warn("bootstrap-test-media skipped: DATABASE_URL not set");
    return;
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    await prisma.installTeam.upsert({
      where: { code: TEST_INSTALL_TEAM_CODE },
      create: { code: TEST_INSTALL_TEAM_CODE, name: TEST_INSTALL_TEAM_NAME },
      update: { name: TEST_INSTALL_TEAM_NAME },
    });
    console.log(`Install team ready: ${TEST_INSTALL_TEAM_NAME} (${TEST_INSTALL_TEAM_CODE})`);

    await Promise.all(
      TEST_MEDIA_POOL.map((entry) => ensurePoolFile(entry.storageKey, PLACEHOLDER_JPEG))
    );
    console.log(`Test media pool ready: ${TEST_MEDIA_POOL.length} placeholder images`);
  } finally {
    await prisma.$disconnect();
  }
}

const isMain =
  process.argv[1] === fileURLToPath(import.meta.url) ||
  process.argv[1]?.endsWith("bootstrap-test-media.ts");

if (isMain) {
  main().catch((err) => {
    console.error("[bootstrap-test-media] failed:", err);
    process.exit(1);
  });
}

export { main as bootstrapTestMedia };
