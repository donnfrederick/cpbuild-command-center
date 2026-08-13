import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getEffectiveSession } from "@/lib/masquerade";
import { getSession } from "@/lib/dev-session";
import { db } from "@/lib/db";
import { canViewLocationTracking } from "@/lib/permissions";
import { isTestProjectSquadRole } from "@/lib/production-project-access";
import { enrichProjectListResilient } from "@/lib/project-unifier-merge";
import { DashboardActivityLog } from "@/components/DashboardActivityLog";

export async function generateMetadata() {
  const t = await getTranslations("dashboardActivity");
  return { title: `${t("pageTitle")} — CP Build` };
}

export default async function ReportsActivityPage() {
  const locale = await getLocale();
  const session = await getSession();
  const effective = await getEffectiveSession();

  if (!session?.user) {
    redirect(`/${locale}/login`);
  }

  const showLocationTracking = effective?.user
    ? canViewLocationTracking(effective.user.role, effective.user.specialPermissions)
    : false;

  const squad = isTestProjectSquadRole(session.user.role ?? "MEMBER");
  const rows = await db.project.findMany({
    where: { deletedAt: null, ...(squad ? {} : { isTestProject: false }) },
    orderBy: { createdAt: "asc" },
  });

  const { projects: enriched } = await enrichProjectListResilient(rows);
  const projects = enriched
    .map((p) => ({ id: p.id, name: p.projectName }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  return (
    <DashboardActivityLog projects={projects} canViewLocationTracking={showLocationTracking} />
  );
}
