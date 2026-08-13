/** Shape returned by issue list/detail APIs — adds responsibleParties array. */
export function serializeIssueResponsibleParties<T extends {
  responsiblePartyCode: string;
  responsiblePartyTags?: Array<{ partyCode: string }>;
}>(issue: T): T & { responsibleParties: string[] } {
  const fromTags = issue.responsiblePartyTags?.map((t) => t.partyCode);
  const responsibleParties =
    fromTags && fromTags.length > 0 ? fromTags : [issue.responsiblePartyCode];
  return { ...issue, responsibleParties };
}

export function serializeIssuesResponsibleParties<T extends {
  responsiblePartyCode: string;
  responsiblePartyTags?: Array<{ partyCode: string }>;
}>(issues: T[]): Array<T & { responsibleParties: string[] }> {
  return issues.map(serializeIssueResponsibleParties);
}
