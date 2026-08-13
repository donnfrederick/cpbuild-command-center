import { getTranslations } from "next-intl/server";
import { InspectionsReportClient } from "@/components/projects/InspectionsReportClient";

export async function generateMetadata() {
  const t = await getTranslations("globalReports");
  return { title: `${t("inspections")} — CP Build` };
}

export default async function ReportsInspectionsPage() {
  const t = await getTranslations("globalReports.globalInspections");

  return (
    <InspectionsReportClient
      mode="global"
      pageTitle={t("title")}
      pageSubtitle={t("subtitle")}
      projectColumnLabel={t("projectColumn")}
    />
  );
}
