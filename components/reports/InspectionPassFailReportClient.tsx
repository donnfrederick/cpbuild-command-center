"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { GlobalInspectionSubmissionRow } from "@/lib/inspections/fetch-global-inspections-report";
import {
  collectInspectionScopeOptions,
  collectInspectionTypeCodes,
  filterGlobalInspectionSubmissions,
  inspectionTypeFilterLabel,
} from "@/lib/inspections/inspection-report-filters";
import {
  rollupInspectionPassFailRates,
  type InspectionPassFailDimension,
  type InspectionPassFailRow,
} from "@/lib/reports/inspection-pass-fail-rollups";
import {
  defaultInspectionReportPeriod,
  isInspectionReportCustomRangeInvalid,
  resolveInspectionReportPeriodQuery,
  type InspectionReportPeriodState,
} from "@/lib/reports/inspection-report-period";
import { InspectionReportMultiSelectDropdown } from "@/components/reports/InspectionReportMultiSelectDropdown";
import { InspectionReportPeriodPicker } from "@/components/reports/InspectionReportPeriodPicker";
import { InspectionPassFailBarListSkeleton } from "@/components/reports/InspectionReportBarListSkeletons";

function DimensionChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={{
        padding: "4px 10px",
        borderRadius: 999,
        border: active ? "1.5px solid var(--primary-500)" : "1px solid var(--neutral-300)",
        backgroundColor: active ? "var(--primary-50)" : "var(--neutral-0)",
        color: active ? "var(--primary-700)" : "var(--neutral-700)",
        fontSize: 12,
        fontWeight: active ? 600 : 500,
        cursor: "pointer",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {label}
    </button>
  );
}

function PassFailRateBarList({
  rows,
  nameColumnLabel,
  ratesColumnLabel,
  passRateLabel,
  failRateLabel,
  countSummaryLabel,
}: {
  rows: InspectionPassFailRow[];
  nameColumnLabel: string;
  ratesColumnLabel: string;
  passRateLabel: (rate: number) => string;
  failRateLabel: (rate: number) => string;
  countSummaryLabel: (passed: number, failed: number) => string;
}) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 0 6px",
          borderBottom: "1px solid var(--neutral-200)",
        }}
      >
        <div
          style={{
            flex: "1 1 120px",
            minWidth: 0,
            fontSize: "var(--text-caption, 12px)",
            fontWeight: 600,
            color: "var(--neutral-500)",
            textTransform: "uppercase",
            letterSpacing: "0.03em",
          }}
        >
          {nameColumnLabel}
        </div>
        <div
          style={{
            flex: "1 1 280px",
            minWidth: 180,
            fontSize: "var(--text-caption, 12px)",
            fontWeight: 600,
            color: "var(--neutral-500)",
            textTransform: "uppercase",
            letterSpacing: "0.03em",
            textAlign: "center",
          }}
        >
          {ratesColumnLabel}
        </div>
      </div>

      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {rows.map((row) => {
          const passPct = row.passRate ?? 0;
          const failPct = row.total > 0 ? 100 - passPct : 0;
          return (
            <li
              key={row.id || "__unassigned__"}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 0",
                borderBottom: "1px solid var(--neutral-200)",
              }}
            >
              <div style={{ flex: "1 1 120px", minWidth: 0 }}>
                <div
                  style={{
                    fontSize: "var(--text-body, 14px)",
                    fontWeight: 600,
                    color: "var(--neutral-900)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.name}
                </div>
                <div
                  style={{
                    marginTop: 2,
                    fontSize: "var(--text-caption, 12px)",
                    color: "var(--neutral-500)",
                  }}
                >
                  {countSummaryLabel(row.passed, row.failed)}
                </div>
              </div>

              <div
                style={{
                  flex: "1 1 280px",
                  minWidth: 180,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
                aria-label={
                  row.total > 0
                    ? `${passRateLabel(passPct)}; ${failRateLabel(failPct)}`
                    : undefined
                }
              >
                <span
                  style={{
                    flexShrink: 0,
                    minWidth: 52,
                    textAlign: "right",
                    fontSize: "var(--text-caption, 12px)",
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                    color: row.passed > 0 ? "var(--success-600)" : "var(--neutral-400)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.total > 0 ? passRateLabel(passPct) : "—"}
                </span>

                <div
                  aria-hidden
                  style={{
                    flex: 1,
                    height: 8,
                    borderRadius: "var(--radius-sm, 6px)",
                    backgroundColor: "var(--neutral-100)",
                    overflow: "hidden",
                    display: "flex",
                    minWidth: 48,
                  }}
                >
                  {row.total > 0 && (
                    <>
                      <div
                        style={{
                          width: `${passPct}%`,
                          height: "100%",
                          backgroundColor: "var(--success-500)",
                          minWidth: row.passed > 0 ? 2 : 0,
                        }}
                      />
                      <div
                        style={{
                          width: `${failPct}%`,
                          height: "100%",
                          backgroundColor: "var(--error-500)",
                          minWidth: row.failed > 0 ? 2 : 0,
                        }}
                      />
                    </>
                  )}
                </div>

                <span
                  style={{
                    flexShrink: 0,
                    minWidth: 52,
                    textAlign: "left",
                    fontSize: "var(--text-caption, 12px)",
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                    color: row.failed > 0 ? "var(--error-600)" : "var(--neutral-400)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.total > 0 ? failRateLabel(failPct) : "—"}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function InspectionPassFailReportClient() {
  const t = useTranslations("globalReports.inspectionPassFail");
  const tInspections = useTranslations("inspections");
  const tProgress = useTranslations("globalReports.portfolioProgress");
  const locale = useLocale();

  const [submissions, setSubmissions] = useState<GlobalInspectionSubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<InspectionReportPeriodState>(defaultInspectionReportPeriod);
  const [dimension, setDimension] = useState<InspectionPassFailDimension>("im");
  const [selectedInspectionTypeCodes, setSelectedInspectionTypeCodes] = useState<Set<string>>(
    () => new Set()
  );
  const [selectedScopeCodes, setSelectedScopeCodes] = useState<Set<string>>(() => new Set());

  const fetchReport = useCallback(async (p: { from?: string; to?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (p.from) qs.set("from", p.from);
      if (p.to) qs.set("to", p.to);
      const query = qs.toString();
      const res = await fetch(`/api/reports/global-inspections${query ? `?${query}` : ""}`);
      if (!res.ok) throw new Error("Failed to load report");
      const payload = (await res.json()) as { submissions: GlobalInspectionSubmissionRow[] };
      setSubmissions(payload.submissions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (period.preset === "custom" && isInspectionReportCustomRangeInvalid(period)) {
      return;
    }

    const delayMs = period.preset === "custom" ? 400 : 0;
    const timer = setTimeout(() => {
      void fetchReport(resolveInspectionReportPeriodQuery(period));
    }, delayMs);

    return () => clearTimeout(timer);
  }, [period, fetchReport]);

  const periodPresets = useMemo(
    () => [
      { id: "all" as const, label: tProgress("periodAll") },
      { id: "1w" as const, label: tProgress("period1w") },
      { id: "30d" as const, label: tProgress("period30d") },
      { id: "custom" as const, label: tProgress("periodCustom") },
    ],
    [tProgress]
  );

  const unassignedLabel = tInspections("reportFilterUnassigned");

  const availableInspectionTypeCodes = useMemo(
    () => collectInspectionTypeCodes(submissions),
    [submissions]
  );

  const inspectionTypeOptions = useMemo(
    () =>
      availableInspectionTypeCodes.map((code) => ({
        code,
        label: inspectionTypeFilterLabel(code),
      })),
    [availableInspectionTypeCodes]
  );

  useEffect(() => {
    setSelectedInspectionTypeCodes((prev) => {
      if (prev.size === 0) return prev;
      return new Set([...prev].filter((code) => availableInspectionTypeCodes.includes(code)));
    });
  }, [availableInspectionTypeCodes]);

  const scopeOptions = useMemo(
    () =>
      collectInspectionScopeOptions(submissions).map((option) => ({
        code: option.code,
        label: option.name,
      })),
    [submissions]
  );

  useEffect(() => {
    setSelectedScopeCodes((prev) => {
      if (prev.size === 0) return prev;
      const codes = new Set(scopeOptions.map((option) => option.code));
      return new Set([...prev].filter((code) => codes.has(code)));
    });
  }, [scopeOptions]);

  const filteredSubmissions = useMemo(
    () =>
      filterGlobalInspectionSubmissions(submissions, {
        selectedInspectionTypeCodes,
        selectedScopeCodes,
      }),
    [submissions, selectedInspectionTypeCodes, selectedScopeCodes]
  );

  const rows = useMemo(
    () => rollupInspectionPassFailRates(filteredSubmissions, dimension, unassignedLabel),
    [filteredSubmissions, dimension, unassignedLabel]
  );

  const dimensionLabels: Record<InspectionPassFailDimension, string> = {
    im: t("dimensionIm"),
    pm: t("dimensionPm"),
    subcontractor: t("dimensionSubcontractor"),
    project: t("dimensionProject"),
  };

  const nameColumnLabel = dimensionLabels[dimension];

  return (
    <div
      className="irf-root"
      style={{
        width: "100%",
        padding: "10px var(--page-padding-x, 12px) 48px",
        boxSizing: "border-box",
      }}
    >
      <h1 className="sr-only">{t("title")}</h1>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
          width: "100%",
          minWidth: 0,
        }}
      >
        <InspectionReportMultiSelectDropdown
          options={inspectionTypeOptions}
          selectedCodes={selectedInspectionTypeCodes}
          onChange={setSelectedInspectionTypeCodes}
          allLabel={t("typeFilterAll")}
          countLabel={(count) => t("typeFilterCount", { count })}
          menuAriaLabel={t("typeFilterAria")}
          clearLabel={tInspections("reportFilterClearSelection")}
          variant="primary"
        />

        <InspectionReportMultiSelectDropdown
          options={scopeOptions}
          selectedCodes={selectedScopeCodes}
          onChange={setSelectedScopeCodes}
          allLabel={t("scopeFilterAll")}
          countLabel={(count) => t("scopeFilterCount", { count })}
          menuAriaLabel={t("scopeFilterAria")}
          clearLabel={tInspections("reportFilterClearSelection")}
          variant="neutral"
        />

        <span
          aria-hidden
          style={{
            width: 1,
            height: 20,
            background: "var(--neutral-200)",
            flexShrink: 0,
          }}
        />

        <div
          role="group"
          aria-label={t("dimensionAria")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
            overflowX: "auto",
            paddingBottom: 2,
            minWidth: 0,
          }}
        >
          {(Object.keys(dimensionLabels) as InspectionPassFailDimension[]).map((key) => (
            <DimensionChip
              key={key}
              label={dimensionLabels[key]}
              active={dimension === key}
              onClick={() => setDimension(key)}
            />
          ))}
        </div>

        <div style={{ marginLeft: "auto", flexShrink: 0 }}>
          <InspectionReportPeriodPicker
            idPrefix="inspection-pass-fail-period"
            ariaLabel={t("periodAria")}
            period={period}
            onPeriodChange={setPeriod}
            periodPresets={periodPresets}
            locale={locale}
            customFromLabel={tProgress("customFrom")}
            customToLabel={tProgress("customTo")}
            customRangeError={tProgress("customRangeError")}
            clearCustomLabel={t("clearCustomLabel")}
          />
        </div>
      </div>

      {loading && (
        <InspectionPassFailBarListSkeleton
          nameColumnLabel={nameColumnLabel}
          ratesColumnLabel={t("columnPassFailRates")}
          loadingLabel={t("loading")}
        />
      )}

      {!loading && error && (
        <p style={{ margin: 0, padding: "24px 0", color: "var(--error-600)", fontSize: 14 }}>
          {t("loadError")}
        </p>
      )}

      {!loading && !error && rows.length === 0 && (
        <p style={{ margin: 0, padding: "24px 0", color: "var(--neutral-500)", fontSize: 14 }}>
          {t("empty")}
        </p>
      )}

      {!loading && !error && rows.length > 0 && (
        <PassFailRateBarList
          rows={rows}
          nameColumnLabel={nameColumnLabel}
          ratesColumnLabel={t("columnPassFailRates")}
          passRateLabel={(rate) => t("passRateLabeled", { rate })}
          failRateLabel={(rate) => t("failRateLabeled", { rate })}
          countSummaryLabel={(passed, failed) =>
            t("countSummary", { passed, failed, total: passed + failed })
          }
        />
      )}
    </div>
  );
}
