import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";

export function hasFeedbackInboxAccess(
  role: string,
  specialPermissions?: string[]
): boolean {
  return hasPermission(
    role,
    PERMISSIONS.SPECIAL_ACCESS_FEEDBACK_INBOX,
    specialPermissions
  );
}

export async function getMentionedFeedbackReportIds(userId: string): Promise<string[]> {
  const rows = await db.feedbackMention.findMany({
    where: { mentionedUserId: userId },
    select: { feedbackReportId: true },
  });
  return [...new Set(rows.map((r) => r.feedbackReportId))];
}

export function feedbackListWhereClause(
  userId: string,
  role: string,
  mentionedIds: string[],
  specialPermissions?: string[]
): Prisma.FeedbackReportWhereInput | undefined {
  if (hasFeedbackInboxAccess(role, specialPermissions)) return undefined;
  const or: Prisma.FeedbackReportWhereInput[] = [{ userId }];
  if (mentionedIds.length > 0) {
    or.push({ id: { in: mentionedIds } });
  }
  return { OR: or };
}

export type FeedbackViewerContext = "submitter" | "mentioned";

export function viewerContextForReport(
  viewerId: string,
  canViewAll: boolean,
  report: { userId: string }
): FeedbackViewerContext | undefined {
  if (canViewAll) return undefined;
  if (report.userId === viewerId) return "submitter";
  return "mentioned";
}

export async function userCanViewFeedbackReport(args: {
  viewerId: string;
  role: string;
  report: { id: string; userId: string };
  specialPermissions?: string[];
}): Promise<boolean> {
  const { viewerId, role, report, specialPermissions } = args;
  if (hasFeedbackInboxAccess(role, specialPermissions)) return true;
  if (report.userId === viewerId) return true;
  const m = await db.feedbackMention.findUnique({
    where: {
      feedbackReportId_mentionedUserId: {
        feedbackReportId: report.id,
        mentionedUserId: viewerId,
      },
    },
    select: { id: true },
  });
  return !!m;
}

/** Submitter or feedback inbox roles may set / clear assigneeId. */
export function canChangeFeedbackAssignee(args: {
  viewerId: string;
  role: string;
  reportUserId: string;
  specialPermissions?: string[];
}): boolean {
  const { viewerId, role, reportUserId, specialPermissions } = args;
  if (reportUserId === viewerId) return true;
  return hasFeedbackInboxAccess(role, specialPermissions);
}
