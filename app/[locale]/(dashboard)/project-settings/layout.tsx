import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getEffectiveSession } from "@/lib/masquerade";
import { canManageIssueReportConfig } from "@/lib/permissions";
import { ProjectSettingsShell } from "@/components/project-settings/ProjectSettingsShell";
import { buildProjectSettingsTabs } from "@/lib/project-settings/tabs";

export default async function ProjectSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const effective = await getEffectiveSession();
  if (!effective?.user) return null;

  const locale = await getLocale();
  const canManage = canManageIssueReportConfig(
    effective.user.role,
    effective.user.specialPermissions,
  );
  if (!canManage) {
    redirect(`/${locale}/projects`);
  }

  const tabs = buildProjectSettingsTabs({ canManageIssueReportConfig: canManage });

  return <ProjectSettingsShell tabs={tabs}>{children}</ProjectSettingsShell>;
}
