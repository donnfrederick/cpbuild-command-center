import { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { getProjectDisplayNameForMetadata } from "@/lib/project-unifier-merge";
import { TOUR_DEMO_PROJECT_ID, TOUR_DEMO_PROJECT } from "@/lib/tour-demo-data";
import { FolderOpen } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (id === TOUR_DEMO_PROJECT_ID) {
    return { title: `Documents — ${TOUR_DEMO_PROJECT.projectName} — CP Build` };
  }
  const name = await getProjectDisplayNameForMetadata(id);
  return {
    title: name ? `Documents — ${name} — CP Build` : "Documents — CP Build",
  };
}

export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  await params;
  await getLocale();
  const t = await getTranslations("projects");

  return (
    <div
      style={{
        padding: "var(--space-6)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-6)",
        maxWidth: 960,
      }}
    >
      <div>
        <h1
          style={{
            fontSize: "var(--text-heading)",
            fontWeight: 600,
            color: "var(--neutral-900)",
            margin: 0,
          }}
        >
          {t("tabDocuments")}
        </h1>
        <p
          style={{
            fontSize: "var(--text-body)",
            color: "var(--neutral-500)",
            marginTop: "var(--space-2)",
            marginBottom: 0,
          }}
        >
          {t("documentsHubDescription")}
        </p>
      </div>

      {/* Placeholder card */}
      <div
        style={{
          backgroundColor: "var(--neutral-0)",
          border: "2px dashed var(--neutral-200)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-12)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "var(--space-4)",
          textAlign: "center",
        }}
      >
        <FolderOpen
          size={40}
          style={{ color: "var(--neutral-300)" }}
          aria-hidden
        />
        <div>
          <p
            style={{
              fontSize: "var(--text-body)",
              fontWeight: 600,
              color: "var(--neutral-700)",
              margin: "0 0 var(--space-2) 0",
            }}
          >
            {t("comingSoon")}
          </p>
          <p
            style={{
              fontSize: "var(--text-caption)",
              color: "var(--neutral-500)",
              margin: 0,
              maxWidth: 420,
            }}
          >
            {t("documentsHubDescription")}
          </p>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            marginTop: "var(--space-2)",
            padding: "var(--space-2) var(--space-4)",
            backgroundColor: "var(--primary-50)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--primary-200)",
          }}
        >
          <FolderOpen
            size={14}
            style={{ color: "var(--primary-600)", flexShrink: 0 }}
            aria-hidden
          />
          <span
            style={{
              fontSize: "var(--text-caption)",
              color: "var(--primary-700)",
              fontWeight: 500,
            }}
          >
            {t("documentsDataSource")}
          </span>
        </div>
      </div>
    </div>
  );
}
