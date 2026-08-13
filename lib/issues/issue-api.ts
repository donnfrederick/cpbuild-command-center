import {
  serializeIssueResponsibleParties,
  serializeIssuesResponsibleParties,
} from "@/lib/issues/serialize-issue-parties";

/** Map Prisma issue row fields to client-facing aliases (mirrors observation-api). */
export function serializeIssueRow<T extends {
  issueTypeCode: string;
  responsiblePartyCode: string;
}>(row: T): T & { issueType: string; responsibleParty: string } {
  return {
    ...row,
    issueType: row.issueTypeCode,
    responsibleParty: row.responsiblePartyCode,
  };
}

export function serializeIssueForApiClient<
  T extends {
    issueTypeCode: string;
    responsiblePartyCode: string;
    responsiblePartyTags?: Array<{ partyCode: string }>;
  },
>(issue: T): ReturnType<typeof serializeIssueRow<T & { responsibleParties: string[] }>> {
  return serializeIssueRow(serializeIssueResponsibleParties(issue));
}

export function serializeIssuesForApiClient<
  T extends {
    issueTypeCode: string;
    responsiblePartyCode: string;
    responsiblePartyTags?: Array<{ partyCode: string }>;
  },
>(issues: T[]): Array<ReturnType<typeof serializeIssueForApiClient<T>>> {
  return serializeIssuesResponsibleParties(issues).map(serializeIssueRow);
}
