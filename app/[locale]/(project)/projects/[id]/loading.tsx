import { getTranslations } from "next-intl/server";
import { ProjectOverviewSkeleton } from "@/components/projects/ProjectOverviewSkeleton";

export default async function ProjectWorkspaceLoading() {
  const t = await getTranslations("projects");
  return <ProjectOverviewSkeleton loadingLabel={t("hubOverviewLoading")} />;
}
