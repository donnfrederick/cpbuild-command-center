import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

/** Legacy path — redirects to Issue Config tab. */
export default async function LegacyIssueSetupPage() {
  const locale = await getLocale();
  redirect(`/${locale}/project-settings/issue-config`);
}
