import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getEffectiveSession } from "@/lib/masquerade";
import { AnnouncementsManager } from "@/components/admin/AnnouncementsManager";

export async function generateMetadata() {
  const t = await getTranslations("admin.announcements");
  return { title: `${t("pageTitle")} — CP Build Field Tracker` };
}

export default async function AdminAnnouncementsPage() {
  const locale = await getLocale();
  const effective = await getEffectiveSession();

  if (!effective?.user) redirect(`/${locale}/login`);

  const realRole = effective.masquerade?.actorRole ?? effective.rolePreview?.realRole ?? effective.user.role;
  if (realRole !== "ADMIN") {
    redirect(`/${locale}`);
  }

  return <AnnouncementsManager />;
}
