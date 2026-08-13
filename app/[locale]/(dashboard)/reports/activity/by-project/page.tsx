import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getSession } from "@/lib/dev-session";
import { ProjectActivityReportClient } from "@/components/reports/ProjectActivityReportClient";
import {
  parseUserActivityPeriodFromSearchParams as parseProjectActivityPeriodFromSearchParams,
} from "@/lib/reports/user-activity-period-params";
import { fetchProjectActivityRows } from "@/lib/reports/project-activity-service";

export async function generateMetadata() {
  const t = await getTranslations("dashboardActivity");
  return { title: `${t("byProjectTitle")} — CP Build` };
}

export default async function ReportsActivityByProjectPage({
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
  const period = parseProjectActivityPeriodFromSearchParams(params);
  const rows = await fetchProjectActivityRows({
    sessionRole: session.user.role ?? "MEMBER",
    period,
  });

  return <ProjectActivityReportClient rows={rows} period={period} />;
}
