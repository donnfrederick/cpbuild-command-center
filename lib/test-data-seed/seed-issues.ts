import { db } from "@/lib/db";
import { pickOne, randomDateInRange } from "./random";
import {
  ISSUE_TYPE_CATALOG_DEFINITIONS,
  RESPONSIBLE_PARTY_CATALOG_DEFINITIONS,
} from "@/lib/issues/issue-catalog-definitions";
import {
  ISSUE_COMMENTS,
  ISSUE_DESCRIPTIONS,
  ISSUE_NOTES,
  unitRefFromRow,
} from "./templates";
import { pickRandomPoolEntry, resolveTestMediaPoolUrl, type SeedMediaContext } from "./media-pool";
import type { ScopeRowCandidate } from "./pick-rows";
import { DEFAULT_COMMENT_RATIO, DEFAULT_RESOLVED_RATIO } from "./constants";

const ISSUE_TYPES = ISSUE_TYPE_CATALOG_DEFINITIONS.map((row) => row.code);

const RESPONSIBLE_PARTIES = RESPONSIBLE_PARTY_CATALOG_DEFINITIONS.map((row) => row.code);

const VISUAL_EVIDENCE_CODES = new Set(
  ISSUE_TYPE_CATALOG_DEFINITIONS.filter((row) => row.requiresVisual).map((row) => row.code),
);

export interface SeedIssuesContext {
  projectId: string;
  batchId: string;
  count: number;
  resolvedRatio: number;
  commentRatio: number;
  dateRangeDays: number;
  userIds: string[];
  userNames: Map<string, string>;
  rng: () => number;
  rows: ScopeRowCandidate[];
  media: SeedMediaContext;
}

export interface SeedIssuesResult {
  issues: number;
  comments: number;
}

export async function seedIssues(ctx: SeedIssuesContext): Promise<SeedIssuesResult> {
  let issues = 0;
  let comments = 0;

  for (let i = 0; i < ctx.count; i++) {
    const createdById = pickOne(ctx.userIds, ctx.rng);
    const issueType = pickOne(ISSUE_TYPES, ctx.rng);
    const row = ctx.rows.length > 0 ? pickOne(ctx.rows, ctx.rng) : null;
    const createdAt = randomDateInRange(ctx.dateRangeDays, ctx.rng);
    const isResolved = ctx.rng() < ctx.resolvedRatio;
    const shortDescription = pickOne(ISSUE_DESCRIPTIONS, ctx.rng).slice(0, 50);
    const notes = pickOne(ISSUE_NOTES, ctx.rng) || null;

    const poolEntry =
      VISUAL_EVIDENCE_CODES.has(issueType) || ctx.rng() < 0.45
        ? pickRandomPoolEntry(ctx.media.pool, ctx.rng)
        : null;

    const partyCode = pickOne(RESPONSIBLE_PARTIES, ctx.rng);

    const issue = await db.projectIssue.create({
      data: {
        projectId: ctx.projectId,
        testSeedBatchId: ctx.batchId,
        unitRef: row ? unitRefFromRow(row) : undefined,
        shortDescription,
        notes,
        issueTypeCode: issueType,
        responsiblePartyCode: partyCode,
        responsiblePartyTags: {
          create: [{ partyCode }],
        },
        isBlockingWork: ctx.rng() < 0.15,
        status: isResolved ? "RESOLVED" : "OPEN",
        resolvedAt: isResolved ? new Date(createdAt.getTime() + 86400000) : null,
        resolvedById: isResolved ? createdById : null,
        createdById,
        createdAt,
        updatedAt: createdAt,
        scopeTags: row
          ? { create: [{ projectRowId: row.id, id: `${ctx.batchId}-issue-${i}-${row.id}` }] }
          : undefined,
        attachments: poolEntry
          ? {
              create: [
                {
                  storageKey: poolEntry.storageKey,
                  storageUrl: resolveTestMediaPoolUrl(poolEntry.storageKey, ctx.media.origin),
                  mimeType: poolEntry.mimeType,
                  fileSizeBytes: poolEntry.fileSizeBytes,
                  uploadedById: createdById,
                  testSeedBatchId: ctx.batchId,
                },
              ],
            }
          : undefined,
      },
    });

    issues++;

    if (ctx.rng() < ctx.commentRatio) {
      const authorId = pickOne(ctx.userIds, ctx.rng);
      const commentAt = new Date(createdAt.getTime() + 3600000);
      const commentMedia =
        ctx.rng() < 0.5 ? pickRandomPoolEntry(ctx.media.pool, ctx.rng) : null;
      await db.issueComment.create({
        data: {
          issueId: issue.id,
          authorId,
          body: pickOne(ISSUE_COMMENTS, ctx.rng),
          testSeedBatchId: ctx.batchId,
          createdAt: commentAt,
          updatedAt: commentAt,
          attachments: commentMedia
            ? {
                create: [
                  {
                    storageKey: commentMedia.storageKey,
                    storageUrl: resolveTestMediaPoolUrl(commentMedia.storageKey, ctx.media.origin),
                    mimeType: commentMedia.mimeType,
                    fileSizeBytes: commentMedia.fileSizeBytes,
                    uploadedById: authorId,
                    testSeedBatchId: ctx.batchId,
                  },
                ],
              }
            : undefined,
        },
      });
      comments++;
    }
  }

  return { issues, comments };
}

export function defaultIssueRatios(resolvedRatio?: number, commentRatio?: number) {
  return {
    resolvedRatio: resolvedRatio ?? DEFAULT_RESOLVED_RATIO,
    commentRatio: commentRatio ?? DEFAULT_COMMENT_RATIO,
  };
}
