import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { getSession } from "@/lib/dev-session";
import { fetchUserSpecialPermissions } from "@/lib/user-special-permissions";
import { RoleManager } from "./_components/RoleManager";

export async function generateMetadata() {
  const t = await getTranslations("roleManager");
  return { title: `${t("pageTitle")} — CP Build` };
}

export default async function AdminRolesPage() {
  const locale = await getLocale();
  const session = await getSession();

  if (!session?.user) redirect(`/${locale}/login`);

  const specialPerms = await fetchUserSpecialPermissions(session.user.id);
  if (!hasPermission(session.user.role, PERMISSIONS.MANAGE_ROLES, specialPerms)) {
    redirect(`/${locale}`);
  }

  return <RoleManager />;
}
