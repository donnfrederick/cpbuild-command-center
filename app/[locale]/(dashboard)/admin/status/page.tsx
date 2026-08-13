import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { getSession } from "@/lib/dev-session";
import { StatusDashboard } from "./_components/StatusDashboard";

export async function generateMetadata() {
  const t = await getTranslations("adminStatus");
  return { title: `${t("title")} — CP Build` };
}

export default async function AdminStatusPage() {
  const locale = await getLocale();
  const session = await getSession();

  if (!session?.user) redirect(`/${locale}/login`);

  if (!hasPermission(session.user.role, PERMISSIONS.MANAGE_ROLES)) {
    redirect(`/${locale}`);
  }

  return <StatusDashboard />;
}
