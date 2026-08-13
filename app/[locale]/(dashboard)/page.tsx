import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

export default async function DashboardPage() {
  const locale = await getLocale();
  redirect(`/${locale}/projects`);
}
