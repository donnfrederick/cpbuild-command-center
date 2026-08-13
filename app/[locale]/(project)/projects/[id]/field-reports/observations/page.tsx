import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getEffectiveSession } from "@/lib/masquerade";
import { hasPermission, canManageIssueReportConfig, PERMISSIONS } from "@/lib/permissions";
import { ProjectFieldReportsClient } from "@/components/projects/ProjectFieldReportsClient";

export default async function FieldReportsObservationsPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const effective = await getEffectiveSession();
  if (!effective?.user) {
    redirect(`/${locale}/projects`);
  }

  const canManageStatus = hasPermission(effective.user.role, PERMISSIONS.MANAGE_UNIT_STATUS);
  const userCanManageIssueReportConfig = canManageIssueReportConfig(
    effective.user.role,
    effective.user.specialPermissions,
  );

  return (
    <ProjectFieldReportsClient
      projectId={id}
      currentUserId={effective.user.id}
      currentUserRole={effective.user.role}
      canManageStatus={canManageStatus}
      canManageIssueReportConfig={userCanManageIssueReportConfig}
    />
  );
}
