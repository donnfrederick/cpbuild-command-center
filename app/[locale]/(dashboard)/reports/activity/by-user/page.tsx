import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getSession } from "@/lib/dev-session";
import { UserActivityReportClient } from "@/components/reports/UserActivityReportClient";
import { parseUserActivityPeriodFromSearchParams } from "@/lib/reports/user-activity-period-params";
import { fetchUserActivityRows } from "@/lib/reports/user-activity-service";

export async function generateMetadata() {
  const t = await getTranslations("dashboardActivity");
  return { title: `${t("byUserTitle")} — CP Build` };
}

export default async function ReportsActivityByUserPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getLocale();
  const session = await getSession();

  if (!session?.user) {
    redirect(`/${locale}/login`);
  }

  const params = await searchParams;
  const period = parseUserActivityPeriodFromSearchParams(params);
  const rows = await fetchUserActivityRows({
    sessionRole: session.user.role ?? "MEMBER",
    period,
  });

  return <UserActivityReportClient rows={rows} period={period} />;
}
