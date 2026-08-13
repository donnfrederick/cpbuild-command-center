import { InspectionsReportClient } from "@/components/projects/InspectionsReportClient";

interface InspectionsPageTabsProps {
  projectId: string;
  projectName: string;
  projectStartedAt: string;
}

export function InspectionsPageTabs({
  projectId,
  projectName,
  projectStartedAt,
}: InspectionsPageTabsProps) {
  return (
    <InspectionsReportClient
      projectId={projectId}
      projectName={projectName}
      projectStartedAt={projectStartedAt}
    />
  );
}
