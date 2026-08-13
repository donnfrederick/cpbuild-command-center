import { db } from "@/lib/db";
import {
  TEST_INSTALL_TEAM_CODE,
  TEST_INSTALL_TEAM_NAME,
  TEST_SEED_SUB_UNIFIER_ID,
} from "./constants";

export interface TestSubcontractorRef {
  installTeamId: string;
  unifierSubId: string;
}

/** Idempotent — creates TEST_SUB if bootstrap has not run yet (common in local dev). */
export async function resolveTestSubcontractor(): Promise<TestSubcontractorRef> {
  const team = await db.installTeam.upsert({
    where: { code: TEST_INSTALL_TEAM_CODE },
    create: { code: TEST_INSTALL_TEAM_CODE, name: TEST_INSTALL_TEAM_NAME },
    update: { name: TEST_INSTALL_TEAM_NAME },
    select: { id: true },
  });

  return { installTeamId: team.id, unifierSubId: TEST_SEED_SUB_UNIFIER_ID };
}

export async function promoteRowForClearInspection(
  rowId: string,
  subcontractor: TestSubcontractorRef
): Promise<void> {
  await db.projectRow.update({
    where: { id: rowId },
    data: {
      scopeStage: "INSTALL",
      scopeStatus: "COMPLETE",
      installerId: subcontractor.installTeamId,
      unifierSubId: subcontractor.unifierSubId,
    },
  });
}
