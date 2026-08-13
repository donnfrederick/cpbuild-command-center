"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { GlobalInspectionSubmissionRow } from "@/lib/inspections/fetch-global-inspections-report";
import {
  collectInspectionScopeOptions,
  collectInspectionTypeCodes,
  inspectionTypeFilterLabel,
} from "@/lib/inspections/inspection-report-filters";
import {
  filterSubmissionsForDeficiencyReport,
  rollupInspectionDeficienciesByGroup,
  rollupInspectionDeficienciesBySection,
  type InspectionDeficiencyGroupDimension,
  type InspectionDeficiencyGroupRow,
  type InspectionDeficiencySectionRow,
  type InspectionDeficiencyView,
} from "@/lib/reports/inspection-deficiency-section-rollups";
import {
  defaultInspectionReportPeriod,
  isInspectionReportCustomRangeInvalid,
  resolveInspectionReportPeriodQuery,
  type InspectionReportPeriodState,
} from "@/lib/reports/inspection-report-period";
import { InspectionReportMultiSelectDropdown } from "@/components/reports/InspectionReportMultiSelectDropdown";
import { InspectionReportPeriodPicker } from "@/components/reports/InspectionReportPeriodPicker";
import { InspectionDeficiencyReportSkeleton } from "@/components/reports/InspectionReportBarListSkeletons";

function ViewChip({
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

function DeficiencySectionBarList({
  rows,
  maxCount,
  sectionColumnLabel,
  deficienciesColumnLabel,
  countLabel,
  inspectionCountLabel,
  showHeader = true,
}: {
  rows: InspectionDeficiencySectionRow[];
  maxCount: number;
  sectionColumnLabel: string;
  deficienciesColumnLabel: string;
  countLabel: (count: number) => string;
  inspectionCountLabel: (count: number) => string;
  showHeader?: boolean;
}) {
  const scaleMax = maxCount > 0 ? maxCount : 1;

  return (
    <div>
      {showHeader && (
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
              flex: "1 1 140px",
              minWidth: 0,
              fontSize: "var(--text-caption, 12px)",
              fontWeight: 600,
              color: "var(--neutral-500)",
              textTransform: "uppercase",
              letterSpacing: "0.03em",
            }}
          >
            {sectionColumnLabel}
          </div>
          <div
            style={{
              flex: "1 1 240px",
              minWidth: 160,
              fontSize: "var(--text-caption, 12px)",
              fontWeight: 600,
              color: "var(--neutral-500)",
              textTransform: "uppercase",
              letterSpacing: "0.03em",
              textAlign: "center",
            }}
          >
            {deficienciesColumnLabel}
          </div>
        </div>
      )}

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
          const barPct =
            row.occurrenceCount > 0
              ? Math.max(2, Math.round((row.occurrenceCount / scaleMax) * 100))
              : 0;
          return (
            <li
              key={row.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: showHeader ? "10px 0" : "8px 0",
                borderBottom: "1px solid var(--neutral-200)",
              }}
            >
              <div style={{ flex: "1 1 140px", minWidth: 0 }}>
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
                  {row.sectionTitle}
                </div>
                {row.inspectionCount > 0 && (
                  <div
                    style={{
                      marginTop: 2,
                      fontSize: "var(--text-caption, 12px)",
                      color: "var(--neutral-500)",
                    }}
                  >
                    {inspectionCountLabel(row.inspectionCount)}
                  </div>
                )}
              </div>

              <div
                style={{
                  flex: "1 1 240px",
                  minWidth: 160,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
                aria-label={
                  row.occurrenceCount > 0 ? countLabel(row.occurrenceCount) : undefined
                }
              >
                <span
                  style={{
                    flexShrink: 0,
                    minWidth: 36,
                    textAlign: "right",
                    fontSize: "var(--text-caption, 12px)",
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                    color:
                      row.occurrenceCount > 0 ? "var(--error-600)" : "var(--neutral-400)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.occurrenceCount > 0 ? countLabel(row.occurrenceCount) : "—"}
                </span>

                <div
                  aria-hidden
                  style={{
                    flex: 1,
                    height: 8,
                    borderRadius: "var(--radius-sm, 6px)",
                    backgroundColor: "var(--neutral-100)",
                    overflow: "hidden",
                    minWidth: 48,
                  }}
                >
                  {row.occurrenceCount > 0 && (
                    <div
                      style={{
                        width: `${barPct}%`,
                        height: "100%",
                        backgroundColor: "var(--error-500)",
                        minWidth: 2,
                      }}
                    />
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ScopeComparisonStrip({
  groups,
  maxTotal,
  heading,
  onSelect,
}: {
  groups: InspectionDeficiencyGroupRow[];
  maxTotal: number;
  heading: string;
  onSelect: (groupId: string) => void;
}) {
  const scaleMax = maxTotal > 0 ? maxTotal : 1;

  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          marginBottom: 6,
          fontSize: "var(--text-caption, 12px)",
          fontWeight: 600,
          color: "var(--neutral-500)",
          textTransform: "uppercase",
          letterSpacing: "0.03em",
        }}
      >
        {heading}
      </div>
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {groups.map((group) => {
          const barPct = Math.max(2, Math.round((group.totalOccurrences / scaleMax) * 100));
          return (
            <li key={group.id}>
              <button
                type="button"
                onClick={() => onSelect(group.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "6px 0",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    flex: "0 0 88px",
                    minWidth: 0,
                    fontSize: "var(--text-caption, 12px)",
                    fontWeight: 600,
                    color: "var(--neutral-800)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {group.name}
                </span>
                <div
                  aria-hidden
                  style={{
                    flex: 1,
                    height: 8,
                    borderRadius: "var(--radius-sm, 6px)",
                    backgroundColor: "var(--neutral-100)",
                    overflow: "hidden",
                    minWidth: 48,
                  }}
                >
                  <div
                    style={{
                      width: `${barPct}%`,
                      height: "100%",
                      backgroundColor: "var(--error-500)",
                      minWidth: 2,
                    }}
                  />
                </div>
                <span
                  style={{
                    flexShrink: 0,
                    minWidth: 32,
                    fontSize: "var(--text-caption, 12px)",
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                    color: "var(--error-600)",
                    textAlign: "right",
                  }}
                >
                  {group.totalOccurrences}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DeficiencyGroupAccordion({
  groups,
  expandedId,
  onExpandedChange,
  groupTotalLabel,
  sectionColumnLabel,
  deficienciesColumnLabel,
  countLabel,
  inspectionCountLabel,
}: {
  groups: InspectionDeficiencyGroupRow[];
  expandedId: string | null;
  onExpandedChange: (id: string | null) => void;
  groupTotalLabel: (count: number) => string;
  sectionColumnLabel: string;
  deficienciesColumnLabel: string;
  countLabel: (count: number) => string;
  inspectionCountLabel: (count: number) => string;
}) {
  return (
    <ul
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {groups.map((group) => {
        const expanded = expandedId === group.id;
        const sectionMax = group.sections.reduce(
          (max, row) => Math.max(max, row.occurrenceCount),
          0
        );
        return (
          <li
            key={group.id}
            style={{
              border: "1px solid var(--neutral-200)",
              borderRadius: "var(--radius-md, 8px)",
              overflow: "hidden",
              backgroundColor: "var(--neutral-0)",
            }}
          >
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => onExpandedChange(expanded ? null : group.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "10px 12px",
                border: "none",
                background: expanded ? "var(--neutral-50)" : "var(--neutral-0)",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              {expanded ? (
                <ChevronDown size={16} aria-hidden style={{ flexShrink: 0, color: "var(--neutral-500)" }} />
              ) : (
                <ChevronRight size={16} aria-hidden style={{ flexShrink: 0, color: "var(--neutral-500)" }} />
              )}
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: "var(--text-body, 14px)",
                  fontWeight: 600,
                  color: "var(--neutral-900)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {group.name}
              </span>
              <span
                style={{
                  flexShrink: 0,
                  fontSize: "var(--text-caption, 12px)",
                  fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                  color: "var(--error-600)",
                  whiteSpace: "nowrap",
                }}
              >
                {groupTotalLabel(group.totalOccurrences)}
              </span>
            </button>
            {expanded && (
              <div
                style={{
                  padding: "0 12px 10px 36px",
                  borderTop: "1px solid var(--neutral-200)",
                }}
              >
                <DeficiencySectionBarList
                  rows={group.sections}
                  maxCount={sectionMax}
                  sectionColumnLabel={sectionColumnLabel}
                  deficienciesColumnLabel={deficienciesColumnLabel}
                  countLabel={countLabel}
                  inspectionCountLabel={inspectionCountLabel}
                  showHeader={false}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const GROUP_VIEWS: InspectionDeficiencyGroupDimension[] = [
  "scope",
  "project",
  "subcontractor",
  "pm",
  "im",
];

export function InspectionDeficiencyReportClient() {
  const t = useTranslations("globalReports.inspectionDeficiencies");
  const tInspections = useTranslations("inspections");
  const tProgress = useTranslations("globalReports.portfolioProgress");
  const locale = useLocale();

  const [submissions, setSubmissions] = useState<GlobalInspectionSubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<InspectionReportPeriodState>(defaultInspectionReportPeriod);
  const [view, setView] = useState<InspectionDeficiencyView>("overview");
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [selectedInspectionTypeCodes, setSelectedInspectionTypeCodes] = useState<Set<string>>(
    () => new Set()
  );
  const [selectedScopeCodes, setSelectedScopeCodes] = useState<Set<string>>(() => new Set());

  const unassignedLabel = tInspections("reportFilterUnassigned");

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

  useEffect(() => {
    if (view === "scope" && selectedScopeCodes.size > 0) {
      setSelectedScopeCodes(new Set());
    }
  }, [view, selectedScopeCodes.size]);

  useEffect(() => {
    setExpandedGroupId(null);
  }, [selectedInspectionTypeCodes, selectedScopeCodes, period]);

  const periodPresets = useMemo(
    () => [
      { id: "all" as const, label: tProgress("periodAll") },
      { id: "1w" as const, label: tProgress("period1w") },
      { id: "30d" as const, label: tProgress("period30d") },
      { id: "custom" as const, label: tProgress("periodCustom") },
    ],
    [tProgress]
  );

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

  const scopeFilterForQuery = view === "scope" ? new Set<string>() : selectedScopeCodes;

  const filteredSubmissions = useMemo(
    () =>
      filterSubmissionsForDeficiencyReport(submissions, {
        selectedInspectionTypeCodes,
        selectedScopeCodes: scopeFilterForQuery,
      }),
    [submissions, selectedInspectionTypeCodes, scopeFilterForQuery]
  );

  const overviewRows = useMemo(
    () =>
      rollupInspectionDeficienciesBySection(filteredSubmissions, {
        includeZeroSections: true,
      }),
    [filteredSubmissions]
  );

  const scopeComparisonGroups = useMemo(
    () => rollupInspectionDeficienciesByGroup(filteredSubmissions, "scope", unassignedLabel),
    [filteredSubmissions, unassignedLabel]
  );

  const groupRows = useMemo(() => {
    if (view === "overview") return [];
    return rollupInspectionDeficienciesByGroup(filteredSubmissions, view, unassignedLabel);
  }, [filteredSubmissions, view, unassignedLabel]);

  const overviewMaxCount = useMemo(
    () => overviewRows.reduce((max, row) => Math.max(max, row.occurrenceCount), 0),
    [overviewRows]
  );

  const totalOccurrences = useMemo(
    () => overviewRows.reduce((sum, row) => sum + row.occurrenceCount, 0),
    [overviewRows]
  );

  const scopeStripMax = useMemo(
    () => scopeComparisonGroups.reduce((max, group) => Math.max(max, group.totalOccurrences), 0),
    [scopeComparisonGroups]
  );

  const viewLabels: Record<InspectionDeficiencyView, string> = {
    overview: t("viewOverview"),
    scope: t("viewScope"),
    project: t("viewProject"),
    subcontractor: t("viewSubcontractor"),
    pm: t("viewPm"),
    im: t("viewIm"),
  };

  const hasInspections = filteredSubmissions.length > 0;
  const hasSectionBreakdown =
    view === "overview" ? overviewRows.length > 0 : groupRows.length > 0;

  const handleScopeStripSelect = (groupId: string) => {
    setView("scope");
    setExpandedGroupId(groupId);
  };

  const sectionListProps = {
    sectionColumnLabel: t("columnSection"),
    deficienciesColumnLabel: t("columnDeficiencies"),
    countLabel: (count: number) => t("occurrenceCount", { count }),
    inspectionCountLabel: (count: number) => t("inspectionCount", { count }),
  };

  return (
    <div
      className="ird-root"
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
          marginBottom: 8,
          width: "100%",
          minWidth: 0,
          flexWrap: "wrap",
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

        {view !== "scope" && (
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
        )}

        <div style={{ marginLeft: "auto", flexShrink: 0 }}>
          <InspectionReportPeriodPicker
            idPrefix="inspection-deficiency-period"
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

      <div
        role="group"
        aria-label={t("viewAria")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 10,
          overflowX: "auto",
          paddingBottom: 2,
        }}
      >
        {(["overview", ...GROUP_VIEWS] as InspectionDeficiencyView[]).map((key) => (
          <ViewChip
            key={key}
            label={viewLabels[key]}
            active={view === key}
            onClick={() => {
              setView(key);
              setExpandedGroupId(null);
            }}
          />
        ))}
      </div>

      {!loading && !error && view === "overview" && hasSectionBreakdown && (
        <p
          style={{
            margin: "0 0 10px",
            fontSize: "var(--text-caption, 12px)",
            color: "var(--neutral-500)",
          }}
        >
          {t("summaryTotal", {
            count: totalOccurrences,
            sections: overviewRows.filter((row) => row.occurrenceCount > 0).length,
          })}
        </p>
      )}

      {loading && (
        <InspectionDeficiencyReportSkeleton
          sectionColumnLabel={t("columnSection")}
          deficienciesColumnLabel={t("columnDeficiencies")}
          loadingLabel={t("loading")}
          variant={view === "overview" ? "overview" : "grouped"}
        />
      )}

      {!loading && error && (
        <p style={{ margin: 0, padding: "24px 0", color: "var(--error-600)", fontSize: 14 }}>
          {t("loadError")}
        </p>
      )}

      {!loading && !error && !hasInspections && (
        <p style={{ margin: 0, padding: "24px 0", color: "var(--neutral-500)", fontSize: 14 }}>
          {t("emptyNoInspections")}
        </p>
      )}

      {!loading && !error && hasInspections && !hasSectionBreakdown && (
        <p style={{ margin: 0, padding: "24px 0", color: "var(--neutral-500)", fontSize: 14 }}>
          {t("emptyNoDeficiencies")}
        </p>
      )}

      {!loading && !error && hasInspections && hasSectionBreakdown && view === "overview" && (
        <>
          {scopeComparisonGroups.length > 1 && (
            <ScopeComparisonStrip
              groups={scopeComparisonGroups}
              maxTotal={scopeStripMax}
              heading={t("scopeComparisonHeading")}
              onSelect={handleScopeStripSelect}
            />
          )}
          <DeficiencySectionBarList
            rows={overviewRows}
            maxCount={overviewMaxCount}
            {...sectionListProps}
          />
        </>
      )}

      {!loading && !error && hasInspections && hasSectionBreakdown && view !== "overview" && (
        <DeficiencyGroupAccordion
          groups={groupRows}
          expandedId={expandedGroupId}
          onExpandedChange={setExpandedGroupId}
          groupTotalLabel={(count) => t("groupTotal", { count })}
          {...sectionListProps}
        />
      )}
    </div>
  );
}
