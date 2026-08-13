import { Metadata } from "next";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getProjectDisplayNameForMetadata } from "@/lib/project-unifier-merge";
import { TOUR_DEMO_PROJECT_ID, TOUR_DEMO_PROJECT } from "@/lib/tour-demo-data";
import { getProjectNavAccess, hasPermission, PERMISSIONS } from "@/lib/permissions";
import { getEffectiveSession } from "@/lib/masquerade";
import { MediaPageClient } from "@/components/projects/MediaPageClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (id === TOUR_DEMO_PROJECT_ID) {
    return { title: `Media — ${TOUR_DEMO_PROJECT.projectName} — CP Build` };
  }
  const name = await getProjectDisplayNameForMetadata(id);
  return {
    title: name ? `Media — ${name} — CP Build` : "Media — CP Build",
  };
}

export default async function MediaPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const effective = await getEffectiveSession();

  if (effective?.user) {
    const navAccess = getProjectNavAccess(effective.user.role);
    if (!navAccess.canViewUnits) {
      redirect(`/${locale}/projects/${id}`);
    }
  }

  const canManageStatus = effective?.user
    ? hasPermission(effective.user.role, PERMISSIONS.MANAGE_UNIT_STATUS)
    : false;

  const canCalibrate = effective?.user
    ? hasPermission(effective.user.role, PERMISSIONS.CALIBRATE_INSPECTION)
    : false;

  return (
    <MediaPageClient
      projectId={id}
      canManageStatus={canManageStatus}
      canCalibrate={canCalibrate}
      currentUserId={effective?.user?.id}
      currentUserRole={effective?.user?.role}
    />
  );
}
