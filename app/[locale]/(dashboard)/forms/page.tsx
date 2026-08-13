import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { Loader2 } from "lucide-react";
import { getEffectiveSession } from "@/lib/masquerade";
import { canManageForms, canManageIssueReportConfig } from "@/lib/permissions";
import { FormsPageClient } from "@/components/forms/FormsPageClient";

function FormsPageFallback() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
        minHeight: 200,
        color: "var(--neutral-400)",
      }}
    >
      <Loader2 size={24} className="animate-spin" aria-hidden />
    </div>
  );
}

export async function generateMetadata() {
  const t = await getTranslations("forms");
  return { title: `${t("title")} — CP Build` };
}

export default async function FormsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const effective = await getEffectiveSession();
  if (!effective?.user) return null;

  const locale = await getLocale();
  const params = await searchParams;
  const userCanManageForms = canManageForms(
    effective.user.role,
    effective.user.specialPermissions,
  );
  const userCanManageIssueReportConfig = canManageIssueReportConfig(
    effective.user.role,
    effective.user.specialPermissions,
  );

  if (params.tab === "issue-setup" && userCanManageIssueReportConfig) {
    redirect(`/${locale}/project-settings/issue-config`);
  }

  if (!userCanManageForms) {
    if (userCanManageIssueReportConfig) {
      redirect(`/${locale}/project-settings/issue-config`);
    }
    redirect(`/${locale}/projects`);
  }

  return (
    <Suspense fallback={<FormsPageFallback />}>
      <FormsPageClient canManageForms={userCanManageForms} />
    </Suspense>
  );
}
