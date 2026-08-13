import { db } from "@/lib/db";
import { TEST_SEED_PREFIX } from "./constants";
import { pickOne, randomDateInRange } from "./random";

export interface SeedActivityContext {
  projectId: string;
  batchId: string;
  counts: {
    issues: number;
    observations: number;
    clearInspections: number;
    calibrations: number;
  };
  dateRangeDays: number;
  userIds: string[];
  userNames: Map<string, string>;
  rng: () => number;
}

export async function seedActivityLogs(ctx: SeedActivityContext): Promise<number> {
  let written = 0;
  const totalEntities =
    ctx.counts.issues +
    ctx.counts.observations +
    ctx.counts.clearInspections +
    ctx.counts.calibrations;
  const activityCount = Math.min(totalEntities, Math.max(3, Math.ceil(totalEntities * 0.5)));

  for (let i = 0; i < activityCount; i++) {
    const userId = pickOne(ctx.userIds, ctx.rng);
    const userName = ctx.userNames.get(userId) ?? null;
    const createdAt = randomDateInRange(ctx.dateRangeDays, ctx.rng);

    const eventType =
      i % 3 === 0 ? "ISSUE_CREATED" : i % 3 === 1 ? "OBSERVATION_CREATED" : "SCOPE_INSPECTION_UPDATED";

    const metadata =
      eventType === "ISSUE_CREATED"
        ? {
            eventType,
            issueId: `seed-${ctx.batchId}-${i}`,
            shortDescription: `${TEST_SEED_PREFIX} Synthetic issue`,
            issueType: "OTHER",
            unitRef: null,
            isBlockingWork: false,
            testSeed: true,
          }
        : eventType === "OBSERVATION_CREATED"
          ? {
              eventType,
              observationId: `seed-${ctx.batchId}-${i}`,
              title: `${TEST_SEED_PREFIX} Synthetic observation`,
              observationType: "OTHER",
              unitRef: null,
              testSeed: true,
            }
          : {
              eventType,
              unit: "101",
              building: "A",
              level: "1",
              scopeName: "Seed Scope",
              fromInspectionStatus: null,
              toInspectionStatus: "PASSED",
              testSeed: true,
            };

    await db.activityLog.create({
      data: {
        projectId: ctx.projectId,
        userId,
        userName,
        eventType,
        metadata,
        testSeedBatchId: ctx.batchId,
        createdAt,
      },
    });

    written++;
  }

  return written;
}
