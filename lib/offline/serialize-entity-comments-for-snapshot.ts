/**
 * Issue and observation comments bundled for offline comment-thread reads.
 */

import { db } from "@/lib/db";

export interface OfflineEntityCommentsPayload {
  issues: Record<string, unknown[]>;
  observations: Record<string, unknown[]>;
}

export async function serializeEntityCommentsForSnapshot(
  projectIds: string[],
): Promise<OfflineEntityCommentsPayload> {
  if (projectIds.length === 0) {
    return { issues: {}, observations: {} };
  }

  const [issueComments, observationComments] = await Promise.all([
    db.issueComment.findMany({
      where: { issue: { projectId: { in: projectIds } } },
      include: {
        author: { select: { id: true, name: true, email: true } },
        attachments: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    db.observationComment.findMany({
      where: { observation: { projectId: { in: projectIds } } },
      include: {
        author: { select: { id: true, name: true, email: true } },
        attachments: true,
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const issues: Record<string, unknown[]> = {};
  for (const comment of issueComments) {
    const list = issues[comment.issueId] ?? [];
    list.push({
      ...comment,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
    });
    issues[comment.issueId] = list;
  }

  const observations: Record<string, unknown[]> = {};
  for (const comment of observationComments) {
    const list = observations[comment.observationId] ?? [];
    list.push({
      ...comment,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
    });
    observations[comment.observationId] = list;
  }

  return { issues, observations };
}
