"use client";

import { ProjectCloneSubtitle } from "@/components/projects/ProjectCloneSubtitle";
import { SeedTestDataTrigger } from "@/components/projects/SeedTestDataDialog";

interface ProjectHubAdminActionsProps {
  projectId: string;
  projectName: string;
  clonedFromProjectId: string | null;
  clonedFromProjectName: string | null;
  isTestProject?: boolean;
}

export function ProjectHubAdminActions({
  projectId,
  projectName,
  clonedFromProjectId,
  clonedFromProjectName,
  isTestProject = false,
}: ProjectHubAdminActionsProps) {
  if (!isTestProject && !clonedFromProjectId) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
      {isTestProject && (
        <SeedTestDataTrigger projectId={projectId} projectName={projectName} />
      )}
      {clonedFromProjectId && (
        <ProjectCloneSubtitle clonedFromProjectName={clonedFromProjectName} />
      )}
    </div>
  );
}
