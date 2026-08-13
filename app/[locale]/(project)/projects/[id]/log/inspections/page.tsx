import { redirect } from "next/navigation";
import { getEffectiveSession } from "@/lib/masquerade";
import { enrichProjectById } from "@/lib/project-unifier-merge";
import { db } from "@/lib/db";
import { InspectionsPageTabs } from "@/components/projects/InspectionsPageTabs";

export default async function LogInspectionsPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const effective = await getEffectiveSession();
  const { id, locale } = await params;

  if (!effective?.user) {
    redirect(`/${locale}/projects`);
  }

  const [project, dbProject] = await Promise.all([
    enrichProjectById(id),
    db.project.findUnique({ where: { id }, select: { createdAt: true } }),
  ]);

  const projectName = project?.projectName ?? "Project";
  const projectStartedAt = (dbProject?.createdAt ?? new Date()).toISOString();

  return (
    <InspectionsPageTabs
      projectId={id}
      projectName={projectName}
      projectStartedAt={projectStartedAt}
    />
  );
}
