import { getTranslations } from "next-intl/server";
import { ReportsHubClient } from "@/components/reports/ReportsHubClient";

export async function generateMetadata() {
  const t = await getTranslations("globalReports");
  return { title: `${t("hubTitle")} — CP Build` };
}

export default function ReportsHubPage() {
  return <ReportsHubClient />;
}
