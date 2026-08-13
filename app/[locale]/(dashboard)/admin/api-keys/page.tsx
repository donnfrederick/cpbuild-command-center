import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { getSession } from "@/lib/dev-session";
import { ApiKeysManager } from "./_components/ApiKeysManager";

export async function generateMetadata() {
  const t = await getTranslations("apiKeys");
  return { title: `${t("pageTitle")} — CP Build` };
}

export default async function AdminApiKeysPage() {
  const locale = await getLocale();
  const session = await getSession();

  if (!session?.user) redirect(`/${locale}/login`);

  if (!hasPermission(session.user.role, PERMISSIONS.MANAGE_ROLES)) {
    redirect(`/${locale}`);
  }

  return <ApiKeysManager />;
}
