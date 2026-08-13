import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

/** Legacy route — Activity lives under Reports. */
export default async function LegacyActivityRedirectPage() {
  const locale = await getLocale();
  redirect(`/${locale}/reports/activity`);
}
