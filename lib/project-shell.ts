import { db } from "@/lib/db";

export type ProjectShell = {
  id: string;
  projectName: string;
};

function shellDisplayName(row: { unifierPid: string | null; isTestProject: boolean }): string {
  if (row.isTestProject) return "Unnamed Test Project";
  if (row.unifierPid) return "Project";
  return "Project";
}

/** Fast DB-only lookup for project workspace shell (no Unifier). */
export async function getProjectShellById(id: string): Promise<ProjectShell | null> {
  const row = await db.project.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, unifierPid: true, isTestProject: true },
  });
  if (!row) return null;
  return {
    id: row.id,
    projectName: shellDisplayName(row),
  };
}
