import { db } from "@/lib/db";
import { pickOne, randomDateInRange } from "./random";
import {
  OBSERVATION_DESCRIPTIONS,
  OBSERVATION_TITLES,
  unitRefFromRow,
} from "./templates";
import { pickRandomPoolEntry, resolveTestMediaPoolUrl, type SeedMediaContext } from "./media-pool";
import type { ScopeRowCandidate } from "./pick-rows";
import { DEFAULT_MEDIA_RATIO } from "./constants";

const OBSERVATION_TYPES = ["QUALITY", "PROGRESS", "SAFETY", "OTHER"] as const;

export interface SeedObservationsContext {
  projectId: string;
  batchId: string;
  count: number;
  withMediaRatio: number;
  dateRangeDays: number;
  userIds: string[];
  rng: () => number;
  rows: ScopeRowCandidate[];
  media: SeedMediaContext;
}

export async function seedObservations(ctx: SeedObservationsContext): Promise<number> {
  let observations = 0;

  for (let i = 0; i < ctx.count; i++) {
    const authorId = pickOne(ctx.userIds, ctx.rng);
    const row = ctx.rows.length > 0 ? pickOne(ctx.rows, ctx.rng) : null;
    const createdAt = randomDateInRange(ctx.dateRangeDays, ctx.rng);
    const withMedia = ctx.rng() < ctx.withMediaRatio;
    const poolEntry = withMedia ? pickRandomPoolEntry(ctx.media.pool, ctx.rng) : null;

    await db.projectObservation.create({
      data: {
        projectId: ctx.projectId,
        testSeedBatchId: ctx.batchId,
        unitRef: row ? unitRefFromRow(row) : undefined,
        title: pickOne(OBSERVATION_TITLES, ctx.rng),
        description: pickOne(OBSERVATION_DESCRIPTIONS, ctx.rng),
        observationTypeCode: pickOne(OBSERVATION_TYPES, ctx.rng),
        authorId,
        createdAt,
        updatedAt: createdAt,
        scopeTags: row
          ? { create: [{ projectRowId: row.id, id: `${ctx.batchId}-obs-${i}-${row.id}` }] }
          : undefined,
        attachments: poolEntry
          ? {
              create: [
                {
                  storageKey: poolEntry.storageKey,
                  storageUrl: resolveTestMediaPoolUrl(poolEntry.storageKey, ctx.media.origin),
                  mimeType: poolEntry.mimeType,
                  fileSizeBytes: poolEntry.fileSizeBytes,
                  uploadedById: authorId,
                  testSeedBatchId: ctx.batchId,
                },
              ],
            }
          : undefined,
      },
    });

    observations++;
  }

  return observations;
}

export function defaultMediaRatio(withMediaRatio?: number): number {
  return withMediaRatio ?? DEFAULT_MEDIA_RATIO;
}
