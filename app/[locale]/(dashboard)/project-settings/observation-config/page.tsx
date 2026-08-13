import { getTranslations } from "next-intl/server";
import { ObservationCatalogManager } from "@/components/forms/ObservationCatalogManager";

export async function generateMetadata() {
  const t = await getTranslations("projectSettings");
  return { title: `${t("observationConfig")} — ${t("pageTitle")} — CP Build` };
}

export default function ObservationConfigPage() {
  return (
    <div style={{ maxWidth: 800 }}>
      <ObservationCatalogManager />
    </div>
  );
}
