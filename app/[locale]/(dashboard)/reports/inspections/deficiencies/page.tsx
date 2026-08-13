import { getTranslations } from "next-intl/server";
import { InspectionDeficiencyReportClient } from "@/components/reports/InspectionDeficiencyReportClient";

export async function generateMetadata() {
  const t = await getTranslations("globalReports.inspectionDeficiencies");
  return { title: `${t("title")} — CP Build` };
}

export default async function ReportsInspectionsDeficienciesPage() {
  return <InspectionDeficiencyReportClient />;
}
