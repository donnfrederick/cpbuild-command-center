import { getTranslations } from "next-intl/server";
import { GlobalProgressReportClient } from "@/components/reports/GlobalProgressReportClient";

export async function generateMetadata() {
  const t = await getTranslations("globalReports");
  return { title: `${t("progress")} — CP Build` };
}

export default function ReportsProgressPage() {
  return <GlobalProgressReportClient />;
}
