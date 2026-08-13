import type { Prisma } from "@prisma/client";

export const MAX_RESPONSIBLE_PARTIES_PER_ISSUE = 12;

/** Dedupe while preserving submission order; requires at least one party. */
export function normalizeResponsibleParties(parties: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const party of parties) {
    if (seen.has(party)) continue;
    seen.add(party);
    result.push(party);
  }
  if (result.length === 0) {
    throw new Error("At least one responsible party is required");
  }
  if (result.length > MAX_RESPONSIBLE_PARTIES_PER_ISSUE) {
    throw new Error(`At most ${MAX_RESPONSIBLE_PARTIES_PER_ISSUE} responsible parties allowed`);
  }
  return result;
}

/** Resolve parties from new array field or legacy single field. */
export function resolveResponsiblePartiesInput(input: {
  responsibleParties?: string[];
  responsibleParty?: string;
}): string[] {
  if (input.responsibleParties && input.responsibleParties.length > 0) {
    return normalizeResponsibleParties(input.responsibleParties);
  }
  if (input.responsibleParty) {
    return [input.responsibleParty];
  }
  throw new Error("At least one responsible party is required");
}

/** Extract party codes from join tags (submission order by tag id). */
export function partiesFromTags(
  tags: Array<{ partyCode: string }>,
): string[] {
  return tags.map((t) => t.partyCode);
}

type IssuePartyTx = Pick<
  Prisma.TransactionClient,
  "issueResponsiblePartyTag" | "projectIssue"
>;

/** Replace join rows and sync legacy single column to first party. */
export async function syncIssueResponsiblePartyTags(
  tx: IssuePartyTx,
  issueId: string,
  parties: string[],
): Promise<void> {
  const normalized = normalizeResponsibleParties(parties);
  await tx.issueResponsiblePartyTag.deleteMany({ where: { issueId } });
  await tx.issueResponsiblePartyTag.createMany({
    data: normalized.map((partyCode) => ({ issueId, partyCode })),
  });
  await tx.projectIssue.update({
    where: { id: issueId },
    data: { responsiblePartyCode: normalized[0] },
  });
}
