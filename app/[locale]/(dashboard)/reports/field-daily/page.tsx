import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { FieldDailyReportClient } from "@/components/reports/FieldDailyReportClient";
import { getEffectiveSession } from "@/lib/masquerade";
import { canGenerateFieldDailyReport, canUseFieldDailyReport } from "@/lib/field-daily-report/auth";

export async function generateMetadata() {
  const t = await getTranslations("globalReports");
  return { title: `${t("fieldDaily")} — CP Build` };
}

export default async function FieldDailyReportPage() {
  const locale = await getLocale();
  const effective = await getEffectiveSession();
  if (!effective?.user) redirect(`/${locale}/login`);

  if (!canUseFieldDailyReport(effective.user.role)) {
    redirect(`/${locale}/reports`);
  }

  return (
    <FieldDailyReportClient
      currentUserId={effective.user.id}
      currentUserRole={effective.user.role}
      canGenerateReport={canGenerateFieldDailyReport(effective.user.role)}
    />
  );
}
