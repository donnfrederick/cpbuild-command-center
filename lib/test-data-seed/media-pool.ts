/**
 * Canonical test media pool entries — shared Supabase/local objects referenced by all seeded attachments.
 * Bootstrap script ensures files exist at these stable keys on every deploy.
 *
 * At seed time, `resolveSeedMediaPool` merges bootstrap placeholders with real uploaded field media
 * already in the database (same project first, then environment-wide) so seeded rows reference
 * storage keys that actually resolve in PDF exports and the field-media proxy.
 */

import { db } from "@/lib/db";

export interface TestMediaPoolEntry {
  storageKey: string;
  mimeType: string;
  fileSizeBytes: number;
}

/** Stable keys under field-media/issues/ — valid per isValidFieldMediaStorageKey. */
export const TEST_MEDIA_POOL: TestMediaPoolEntry[] = [
  {
    storageKey: "field-media/issues/test-seed-1.jpg",
    mimeType: "image/jpeg",
    fileSizeBytes: 631,
  },
  {
    storageKey: "field-media/issues/test-seed-2.jpg",
    mimeType: "image/jpeg",
    fileSizeBytes: 631,
  },
  {
    storageKey: "field-media/issues/test-seed-3.jpg",
    mimeType: "image/jpeg",
    fileSizeBytes: 631,
  },
  {
    storageKey: "field-media/issues/test-seed-4.jpg",
    mimeType: "image/jpeg",
    fileSizeBytes: 631,
  },
  {
    storageKey: "field-media/issues/test-seed-5.jpg",
    mimeType: "image/jpeg",
    fileSizeBytes: 631,
  },
];

export interface SeedMediaContext {
  pool: TestMediaPoolEntry[];
  origin?: string;
}

/** Resolve a public URL for a pool entry (local dev or Supabase). */
export function resolveTestMediaPoolUrl(storageKey: string, origin?: string): string {
  const base = (origin ?? process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3002").replace(
    /\/$/,
    ""
  );
  return `${base}/api/upload/field-media/file?key=${encodeURIComponent(storageKey)}`;
}

export function pickRandomPoolEntry<T>(items: T[], pick: () => number): T {
  if (items.length === 0) {
    throw new Error("Cannot pick from an empty media pool");
  }
  return items[Math.floor(pick() * items.length)]!;
}

function dedupePoolEntries(entries: TestMediaPoolEntry[]): TestMediaPoolEntry[] {
  const byKey = new Map<string, TestMediaPoolEntry>();
  for (const entry of entries) {
    if (!entry.storageKey.startsWith("field-media/")) continue;
    if (!entry.mimeType.startsWith("image/")) continue;
    byKey.set(entry.storageKey, entry);
  }
  return Array.from(byKey.values());
}

function rowToPoolEntry(row: {
  storageKey: string | null;
  mimeType: string | null;
  fileSizeBytes: number | null;
}): TestMediaPoolEntry | null {
  const storageKey = row.storageKey?.trim();
  if (!storageKey || !storageKey.startsWith("field-media/")) return null;
  const mimeType = row.mimeType?.trim() || "image/jpeg";
  if (!mimeType.startsWith("image/")) return null;
  return {
    storageKey,
    mimeType,
    fileSizeBytes: row.fileSizeBytes ?? 631,
  };
}

/**
 * Sample real field-media rows already stored in the database.
 * Prefers this project's uploads, then any image in the environment.
 */
export async function loadExistingFieldMediaFromDb(projectId: string): Promise<TestMediaPoolEntry[]> {
  const entries: TestMediaPoolEntry[] = [];

  const projectAttachments = await db.mediaAttachment.findMany({
    where: {
      mimeType: { startsWith: "image/" },
      OR: [
        { issue: { projectId } },
        { issueComment: { issue: { projectId } } },
        { observation: { projectId } },
        { observationComment: { observation: { projectId } } },
        { unitPhotoProjectId: projectId },
      ],
    },
    select: { storageKey: true, mimeType: true, fileSizeBytes: true },
    orderBy: { createdAt: "desc" },
    take: 40,
  });

  for (const row of projectAttachments) {
    const entry = rowToPoolEntry(row);
    if (entry) entries.push(entry);
  }

  const inspectionMedia = await db.inspectionAnswerMedia.findMany({
    where: {
      mimeType: { startsWith: "image/" },
      inspectionAnswer: { inspectionSubmission: { projectId } },
    },
    select: { storageKey: true, mimeType: true, fileSizeBytes: true },
    orderBy: { id: "desc" },
    take: 30,
  });

  for (const row of inspectionMedia) {
    const entry = rowToPoolEntry(row);
    if (entry) entries.push(entry);
  }

  const deficiencyMedia = await db.inspectionDeficiencyMedia.findMany({
    where: {
      mimeType: { startsWith: "image/" },
      inspectionDeficiency: { inspectionAnswer: { inspectionSubmission: { projectId } } },
    },
    select: { storageKey: true, mimeType: true, fileSizeBytes: true },
    orderBy: { id: "desc" },
    take: 30,
  });

  for (const row of deficiencyMedia) {
    const entry = rowToPoolEntry(row);
    if (entry) entries.push(entry);
  }

  if (entries.length > 0) {
    return dedupePoolEntries(entries);
  }

  const globalAttachments = await db.mediaAttachment.findMany({
    where: { mimeType: { startsWith: "image/" } },
    select: { storageKey: true, mimeType: true, fileSizeBytes: true },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  for (const row of globalAttachments) {
    const entry = rowToPoolEntry(row);
    if (entry) entries.push(entry);
  }

  const globalInspectionMedia = await db.inspectionAnswerMedia.findMany({
    where: { mimeType: { startsWith: "image/" } },
    select: { storageKey: true, mimeType: true, fileSizeBytes: true },
    orderBy: { id: "desc" },
    take: 20,
  });

  for (const row of globalInspectionMedia) {
    const entry = rowToPoolEntry(row);
    if (entry) entries.push(entry);
  }

  return dedupePoolEntries(entries);
}

/** Merge DB-sampled refs with bootstrap placeholders; DB entries win on key collision. */
export async function resolveSeedMediaPool(
  projectId: string,
  origin?: string
): Promise<SeedMediaContext> {
  const fromDb = await loadExistingFieldMediaFromDb(projectId);
  const pool = dedupePoolEntries([...fromDb, ...TEST_MEDIA_POOL]);
  return { pool, origin };
}

/** Shape stored on inspection answers / deficiencies / issue attachments. */
export function seedMediaCapturedFile(
  entry: TestMediaPoolEntry,
  seed: string,
  media: SeedMediaContext
): Record<string, unknown> {
  return {
    storageUrl: resolveTestMediaPoolUrl(entry.storageKey, media.origin),
    storageKey: entry.storageKey,
    mimeType: entry.mimeType,
    fileSizeBytes: entry.fileSizeBytes,
    caption: `[TEST-SEED] Field evidence — ${seed}`,
  };
}

export function pickSeedMediaFile(
  seed: string,
  media: SeedMediaContext,
  pick: () => number = () => Math.random()
): Record<string, unknown> {
  const entry = pickRandomPoolEntry(media.pool, pick);
  return seedMediaCapturedFile(entry, seed, media);
}
