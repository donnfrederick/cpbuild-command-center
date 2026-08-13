import { getEffectiveSession } from "@/lib/masquerade";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { ActivityLogClient } from "@/components/projects/ActivityLogClient";

export default async function LogActivityPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { id: projectId } = await params;
  const effective = await getEffectiveSession();

  const canManageStatus = effective?.user
    ? hasPermission(effective.user.role, PERMISSIONS.MANAGE_UNIT_STATUS)
    : false;

  const showLocationTracking = effective?.user
    ? hasPermission(effective.user.role, PERMISSIONS.VIEW_LOCATION_TRACKING, effective.user.specialPermissions)
    : false;

  return (
    <ActivityLogClient
      projectId={projectId}
      canManageStatus={canManageStatus}
      canViewLocationTracking={showLocationTracking}
      currentUserId={effective?.user?.id}
      currentUserDisplayName={effective?.user?.name ?? undefined}
      currentUserRole={effective?.user?.role}
    />
  );
}
