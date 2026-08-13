"use client";

import { useCallback, useState } from "react";
import { Info, Settings, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { IssuesLogClient } from "@/components/projects/IssuesLogClient";
import { ObservationsLogClient } from "@/components/projects/ObservationsLogClient";

export type FieldReportsTab = "issues" | "observations";

export function fieldReportsLocationsHintStorageKey(userId: string, projectId: string): string {
  return `cc-field-reports-locations-hint:${userId}:${projectId}`;
}

interface ProjectFieldReportsClientProps {
  projectId: string;
  currentUserId: string;
  currentUserRole?: string;
  canManageStatus: boolean;
  canManageIssueReportConfig?: boolean;
}

export function ProjectFieldReportsClient({
  projectId,
  currentUserId,
  currentUserRole,
  canManageStatus,
  canManageIssueReportConfig = false,
}: ProjectFieldReportsClientProps) {
  const t = useTranslations("projects.fieldReports");
  const pathname = usePathname();
  const hintStorageKey = fieldReportsLocationsHintStorageKey(currentUserId, projectId);
  const [hintHidden, setHintHidden] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(hintStorageKey) === "1";
    } catch {
      return false;
    }
  });

  const dismissLocationsHint = useCallback(() => {
    setHintHidden(true);
    try {
      localStorage.setItem(hintStorageKey, "1");
    } catch {
      // ignore quota / private mode
    }
  }, [hintStorageKey]);

  const issuesHref = `/projects/${projectId}/field-reports` as const;
  const observationsHref = `/projects/${projectId}/field-reports/observations` as const;

  const onObservations =
    pathname === observationsHref || pathname.endsWith("/field-reports/observations");
  const activeTab: FieldReportsTab = onObservations ? "observations" : "issues";

  const tabs = [
    { id: "issues" as const, href: issuesHref, label: t("tabIssues"), active: !onObservations },
    { id: "observations" as const, href: observationsHref, label: t("tabObservations"), active: onObservations },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%", flex: 1 }}>
      <nav
        aria-label={t("tabsAria")}
        style={{
          padding: "0 var(--page-padding-x, 12px)",
          borderBottom: "1px solid var(--neutral-200)",
          backgroundColor: "var(--neutral-0)",
          flexShrink: 0,
          display: "flex",
          alignItems: "stretch",
          gap: 8,
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", flex: 1, minWidth: 0 }}>
          {tabs.map((tab) => (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={tab.active ? "page" : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "12px 8px",
                fontSize: 13,
                fontWeight: tab.active ? 700 : 500,
                color: tab.active ? "var(--primary-600)" : "var(--neutral-500)",
                textDecoration: "none",
                borderBottom: tab.active
                  ? "2px solid var(--primary-600)"
                  : "2px solid transparent",
                marginBottom: -1,
                whiteSpace: "nowrap",
                textAlign: "center",
              }}
            >
              {tab.label}
            </Link>
          ))}
        </div>
        {canManageIssueReportConfig && (
          <Link
            href="/project-settings/issue-config"
            aria-label={t("issueSetupLinkAria")}
            title={t("issueSetupLinkAria")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              alignSelf: "center",
              flexShrink: 0,
              marginRight: -4,
              borderRadius: "var(--radius-sm)",
              color: "var(--neutral-500)",
              textDecoration: "none",
            }}
          >
            <Settings size={18} aria-hidden />
          </Link>
        )}
      </nav>

      {hintHidden === false && (
        <div
          role="note"
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            padding: "8px var(--page-padding-x, 12px)",
            borderBottom: "1px solid var(--warning-600)",
            backgroundColor: "var(--warning-100)",
            flexShrink: 0,
          }}
        >
          <Info
            size={14}
            aria-hidden
            style={{ color: "var(--warning-600)", flexShrink: 0, marginTop: 1 }}
          />
          <p
            style={{
              margin: 0,
              flex: 1,
              minWidth: 0,
              fontSize: "var(--text-caption, 12px)",
              lineHeight: 1.45,
              color: "var(--warning-600)",
            }}
          >
            {t.rich("addFromLocationsHint", {
              link: (chunks) => (
                <Link
                  href={`/projects/${projectId}/units`}
                  style={{
                    color: "var(--warning-600)",
                    fontWeight: 700,
                    textDecoration: "underline",
                  }}
                >
                  {chunks}
                </Link>
              ),
            })}
          </p>
          <button
            type="button"
            onClick={dismissLocationsHint}
            aria-label={t("dismissLocationsHint")}
            title={t("dismissLocationsHint")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              margin: -6,
              padding: 0,
              flexShrink: 0,
              border: "none",
              borderRadius: "var(--radius-sm)",
              background: "transparent",
              color: "var(--warning-600)",
              cursor: "pointer",
            }}
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {activeTab === "issues" ? (
          <IssuesLogClient
            projectId={projectId}
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
            canManageStatus={canManageStatus}
            embeddedInFieldReports
          />
        ) : (
          <ObservationsLogClient
            projectId={projectId}
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
            embeddedInFieldReports
          />
        )}
      </div>
    </div>
  );
}
