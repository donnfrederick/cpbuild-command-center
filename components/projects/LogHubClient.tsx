"use client";

import { useState, useEffect } from "react";
import type { ElementType } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Activity, AlertTriangle, Eye, ChevronRight } from "lucide-react";
import { useOptionalRouteFetch } from "@/components/navigation/route-fetch-provider";
import { isAbortError } from "@/lib/route-fetch";
import { readSnapshotIssuesForProject } from "@/lib/offline/snapshot-project-reads";

interface Props {
  projectId: string;
}

interface HubItem {
  key: string;
  labelKey: string;
  descKey: string;
  href: string;
  icon: ElementType | "inspectionBadge";
}

function ReportInspectionBadgeIcon() {
  return (
    <svg
      aria-hidden
      className="report-card__inspection-badge"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="M10.5 2.35 2.9 5.15v6.15c0 4.3 3.05 7.55 7.6 9.45 4.55-1.9 7.6-5.15 7.6-9.45V5.15L10.5 2.35Z"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <circle cx="17.25" cy="16.75" r="5.1" fill="currentColor" />
      <path
        d="m14.7 16.75 1.55 1.55 3.35-3.55"
        stroke="var(--color-text-inverse)"
        strokeWidth="2.15"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LogHubClient({ projectId }: Props) {
  const t = useTranslations("projects");
  const routeFetch = useOptionalRouteFetch();
  const [openIssueCount, setOpenIssueCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    routeFetch(`/api/projects/${projectId}/issues`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { issues?: Array<{ status: string }> } | null) => {
        if (cancelled || !data?.issues) return;
        const open = data.issues.filter((i) => i.status === "OPEN").length;
        setOpenIssueCount(open);
      })
      .catch(async (err) => {
        if (isAbortError(err)) return;
        const cached = await readSnapshotIssuesForProject(projectId);
        if (cancelled) return;
        if (cached) {
          const open = (cached.data as Array<{ status?: string }>).filter(
            (i) => i.status === "OPEN",
          ).length;
          setOpenIssueCount(open);
          return;
        }
        setOpenIssueCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, routeFetch]);

  const items: HubItem[] = [
    {
      key: "issues",
      labelKey: "logHubIssues",
      descKey: "logHubIssuesDesc",
      href: `/projects/${projectId}/log/issues`,
      icon: AlertTriangle,
    },
    {
      key: "observations",
      labelKey: "logHubObservations",
      descKey: "logHubObservationsDesc",
      href: `/projects/${projectId}/log/observations`,
      icon: Eye,
    },
    {
      key: "inspections",
      labelKey: "logHubInspections",
      descKey: "logHubInspectionsDesc",
      href: `/projects/${projectId}/log/inspections`,
      icon: "inspectionBadge",
    },
    {
      key: "activity",
      labelKey: "logHubActivity",
      descKey: "logHubActivityDesc",
      href: `/projects/${projectId}/log/activity`,
      icon: Activity,
    },
  ];

  return (
    <div className="reports-hub">
      <h1 className="reports-hub__title">
        {t("tabLog")}
      </h1>

      <div className="reports-grid">
        {items.map((item) => {
          const isIssues = item.key === "issues";
          const isLoadingIssueCount = isIssues && openIssueCount === null;
          const showBadge = isIssues && openIssueCount !== null && openIssueCount > 0;
          const Icon = item.icon === "inspectionBadge" ? null : item.icon;

          return (
            <Link
              key={item.key}
              href={item.href as Parameters<typeof Link>[0]["href"]}
              className={`report-card report-card--${item.key}`}
            >
              <div className="report-card__top">
                <div className="report-card__icon">
                  {Icon ? <Icon size={22} aria-hidden /> : <ReportInspectionBadgeIcon />}
                </div>
                <span className="report-card__arrow" aria-hidden>
                  <ChevronRight size={17} />
                </span>
              </div>

              <div className="report-card__body">
                <div className="report-card__title-row">
                  <p className="report-card__title">
                    {t(item.labelKey as Parameters<typeof t>[0])}
                  </p>
                  {isLoadingIssueCount && (
                    <span
                      aria-hidden="true"
                      style={{
                        display: "inline-flex",
                        width: 28,
                        height: 20,
                        borderRadius: 99,
                        background:
                          "linear-gradient(90deg, var(--neutral-100) 0%, var(--neutral-200) 50%, var(--neutral-100) 100%)",
                        backgroundSize: "200% 100%",
                        animation: "issueCountPulse 1.1s ease-in-out infinite",
                      }}
                    />
                  )}
                  {showBadge && (
                    <span className="report-card__badge">
                      {openIssueCount}
                    </span>
                  )}
                </div>
                <p className="report-card__description">
                  {t(item.descKey as Parameters<typeof t>[0])}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
      <style>{`
        @keyframes issueCountPulse {
          0% { background-position: 100% 0; }
          100% { background-position: -100% 0; }
        }
      `}</style>
    </div>
  );
}
