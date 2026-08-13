/** Role codes allowed as feedback assignees (matches DB `Role.code`). */
export const FEEDBACK_ASSIGNEE_ROLE_CODES = ["ADMIN", "DEVELOPER", "DESIGNER"] as const;

export type FeedbackAssignableRoleCode = (typeof FEEDBACK_ASSIGNEE_ROLE_CODES)[number];

const ASSIGNEE_SET = new Set<string>(FEEDBACK_ASSIGNEE_ROLE_CODES);

/**
 * Whether a user's role code may be assigned to feedback.
 * SUPER_ADMIN in DB is treated as ADMIN (legacy).
 */
export function isAllowedFeedbackAssigneeRole(roleCode: string): boolean {
  const normalized = roleCode === "SUPER_ADMIN" ? "ADMIN" : roleCode;
  return ASSIGNEE_SET.has(normalized);
}

/** Filter team directory members to assignable roles only (for UI dropdown). */
export function filterTeamMembersForFeedbackAssignee<
  T extends { role: string },
>(members: T[]): T[] {
  return members.filter((m) => isAllowedFeedbackAssigneeRole(m.role));
}
