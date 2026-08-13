import { getTranslations } from "next-intl/server";
import { IssueCatalogManager } from "@/components/forms/IssueCatalogManager";

export async function generateMetadata() {
  const t = await getTranslations("projectSettings");
  return { title: `${t("issueConfig")} — ${t("pageTitle")} — CP Build` };
}

export default function IssueConfigPage() {
  return (
    <div style={{ maxWidth: 800 }}>
      <IssueCatalogManager />
    </div>
  );
}
