import type { PrismaClient } from "@prisma/client";
import { buildFullRowKeyIndex } from "@/lib/project-row-matching";

type DbLike = Pick<
  PrismaClient,
  | "projectRow"
  | "projectIssue"
  | "projectObservation"
  | "issueScopeTag"
  | "observationScopeTag"
>;

export interface RelinkScopeTagsResult {
  issueTagsCreated: number;
  observationTagsCreated: number;
}

/**
 * Re-create issue/observation scope join tags from durable scopeRefKeys
 * after a merge/add upload replaces row IDs.
 */
export async function relinkScopeTagsForProject(
  db: DbLike,
  projectId: string,
): Promise<RelinkScopeTagsResult> {
  const currentRows = await db.projectRow.findMany({
    where: { projectId },
    select: { id: true, building: true, level: true, unit: true, description: true },
  });
  const index = buildFullRowKeyIndex(currentRows);

  const [issues, observations] = await Promise.all([
    db.projectIssue.findMany({
      where: { projectId, scopeRefKeys: { isEmpty: false } },
      select: {
        id: true,
        scopeRefKeys: true,
        scopeTags: { select: { projectRowId: true } },
      },
    }),
    db.projectObservation.findMany({
      where: { projectId, scopeRefKeys: { isEmpty: false } },
      select: {
        id: true,
        scopeRefKeys: true,
        scopeTags: { select: { projectRowId: true } },
      },
    }),
  ]);

  let issueTagsCreated = 0;
  let observationTagsCreated = 0;

  for (const issue of issues) {
    const existing = new Set(issue.scopeTags.map((t) => t.projectRowId));
    const targetIds = issue.scopeRefKeys
      .map((key) => index.get(key))
      .filter((id): id is string => Boolean(id));

    for (const rowId of targetIds) {
      if (existing.has(rowId)) continue;
      await db.issueScopeTag.create({
        data: { issueId: issue.id, projectRowId: rowId },
      });
      issueTagsCreated++;
    }
  }

  for (const obs of observations) {
    const existing = new Set(obs.scopeTags.map((t) => t.projectRowId));
    const targetIds = obs.scopeRefKeys
      .map((key) => index.get(key))
      .filter((id): id is string => Boolean(id));

    for (const rowId of targetIds) {
      if (existing.has(rowId)) continue;
      await db.observationScopeTag.create({
        data: { observationId: obs.id, projectRowId: rowId },
      });
      observationTagsCreated++;
    }
  }

  return { issueTagsCreated, observationTagsCreated };
}
