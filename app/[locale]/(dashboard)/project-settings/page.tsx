import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

export default async function ProjectSettingsIndexPage() {
  const locale = await getLocale();
  redirect(`/${locale}/project-settings/issue-config`);
}
