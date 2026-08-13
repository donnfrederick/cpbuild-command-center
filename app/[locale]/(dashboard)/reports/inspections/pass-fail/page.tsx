import { getTranslations } from "next-intl/server";
import { InspectionPassFailReportClient } from "@/components/reports/InspectionPassFailReportClient";

export async function generateMetadata() {
  const t = await getTranslations("globalReports.inspectionPassFail");
  return { title: `${t("title")} — CP Build` };
}

export default async function ReportsInspectionsPassFailPage() {
  return <InspectionPassFailReportClient />;
}
