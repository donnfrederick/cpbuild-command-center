"use client";

import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";

const ROW_COUNT = 8;
const WIDTHS = [68, 80, 55, 72, 62, 75, 58, 70];

interface InspectionReportTableSkeletonProps {
  showProjectColumn?: boolean;
  showImColumn?: boolean;
  showQuickFilters?: boolean;
  projectColumnLabel?: string;
}

export function InspectionReportTableSkeleton({
  showProjectColumn = false,
  showImColumn = true,
  showQuickFilters = false,
  projectColumnLabel = "Project",
}: InspectionReportTableSkeletonProps) {
  const t = useTranslations("inspections");

  const cellPad = "11px 14px";
  const thStyle: CSSProperties = {
    padding: cellPad,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.5)",
    whiteSpace: "nowrap",
    textAlign: "left",
  };

  return (
    <div
      aria-busy="true"
      aria-label={t("reportLoading")}
      style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, gap: 0 }}
    >
      {showQuickFilters ? (
        <div
          style={{
            display: "flex",
            gap: 8,
            padding: "8px 0 10px",
            flexWrap: "wrap",
            flexShrink: 0,
          }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} style={{ width: i === 0 ? 56 : 88, height: 28, borderRadius: 999 }} />
          ))}
        </div>
      ) : null}

      <div
        className="irf-skeleton-desktop"
        style={{
          flex: 1,
          minHeight: 240,
          border: "1px solid var(--neutral-200)",
          borderRadius: 10,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "var(--neutral-0)",
        }}
      >
        <div style={{ overflowX: "auto", flex: 1 }}>
          <table
            style={{
              width: "100%",
              minWidth: showProjectColumn ? (showImColumn ? 1160 : 1060) : showImColumn ? 1060 : 960,
              borderCollapse: "collapse",
            }}
          >
            <thead>
              <tr style={{ background: "var(--neutral-900)" }}>
                <th style={{ ...thStyle, width: 44 }}>#</th>
                {showProjectColumn ? <th style={thStyle}>{projectColumnLabel}</th> : null}
                <th style={thStyle}>{t("reportTableColUnit")}</th>
                <th style={thStyle}>{t("reportTableColAttempt")}</th>
                <th style={thStyle}>{t("reportTableInspectionType")}</th>
                <th style={thStyle}>{t("reportTableColScope")}</th>
                {showImColumn ? <th style={thStyle}>{t("reportTableColIm")}</th> : null}
                <th style={thStyle}>{t("reportTableColInspector")}</th>
                <th style={thStyle}>{t("reportTableColSubcontractor")}</th>
                <th style={thStyle}>{t("reportTableColDate")}</th>
                <th style={{ ...thStyle, textAlign: "center" }}>{t("reportTableColResult")}</th>
                <th style={{ ...thStyle, textAlign: "right" }}>{t("reportTableColDeficiencies")}</th>
                <th style={{ ...thStyle, width: 72 }} aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: ROW_COUNT }).map((_, i) => (
                <tr
                  key={i}
                  style={{
                    background: i % 2 === 0 ? "var(--neutral-0)" : "var(--neutral-50, #fafafa)",
                  }}
                >
                  <td style={{ padding: cellPad }}>
                    <Skeleton style={{ width: 20, height: 14 }} />
                  </td>
                  {showProjectColumn ? (
                    <td style={{ padding: cellPad }}>
                      <Skeleton style={{ width: `${WIDTHS[i]}%`, height: 14, maxWidth: 220 }} />
                    </td>
                  ) : null}
                  <td style={{ padding: cellPad }}>
                    <Skeleton style={{ width: `${WIDTHS[(i + 2) % WIDTHS.length]}%`, height: 14, maxWidth: 120 }} />
                  </td>
                  <td style={{ padding: cellPad }}>
                    <Skeleton style={{ width: 28, height: 14 }} />
                  </td>
                  <td style={{ padding: cellPad }}>
                    <Skeleton style={{ width: 72, height: 14 }} />
                  </td>
                  <td style={{ padding: cellPad }}>
                    <Skeleton style={{ width: 48, height: 14 }} />
                  </td>
                  {showImColumn ? (
                    <td style={{ padding: cellPad }}>
                      <Skeleton style={{ width: 64, height: 14 }} />
                    </td>
                  ) : null}
                  <td style={{ padding: cellPad }}>
                    <Skeleton style={{ width: 56, height: 14 }} />
                  </td>
                  <td style={{ padding: cellPad }}>
                    <Skeleton style={{ width: 80, height: 14 }} />
                  </td>
                  <td style={{ padding: cellPad }}>
                    <Skeleton style={{ width: 72, height: 14 }} />
                  </td>
                  <td style={{ padding: cellPad, textAlign: "center" }}>
                    <Skeleton style={{ width: 58, height: 22, borderRadius: 999, margin: "0 auto" }} />
                  </td>
                  <td style={{ padding: cellPad, textAlign: "right" }}>
                    <Skeleton style={{ width: 24, height: 14, marginLeft: "auto" }} />
                  </td>
                  <td style={{ padding: cellPad }}>
                    <Skeleton style={{ width: 28, height: 28, borderRadius: "var(--radius-sm, 6px)" }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div
        className="irf-skeleton-mobile"
        style={{ display: "none", flexDirection: "column", gap: 8, flex: 1, minHeight: 0 }}
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            style={{
              border: "1px solid var(--neutral-200)",
              borderRadius: 10,
              padding: 12,
              backgroundColor: "var(--neutral-0)",
            }}
          >
            <Skeleton style={{ width: "70%", height: 16, marginBottom: 8 }} />
            <Skeleton style={{ width: "45%", height: 12, marginBottom: 6 }} />
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <Skeleton style={{ width: 64, height: 22, borderRadius: 999 }} />
              <Skeleton style={{ width: 48, height: 22, borderRadius: 999 }} />
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @media (max-width: 639px) {
          .irf-skeleton-desktop { display: none !important; }
          .irf-skeleton-mobile { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
