"use client";

import { useState, useEffect, useCallback, useMemo, useRef, useId } from "react";
import { toast } from "sonner";
import { AlertTriangle, Filter, X, ChevronDown, ArrowDownUp, FileDown, CheckSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { FieldLogListSkeleton } from "@/components/projects/FieldLogListSkeleton";
import { FieldLogExportSelectionBar } from "@/components/projects/FieldLogExportSelectionBar";
import { useRegisterOfflineCacheView } from "@/hooks/use-register-offline-cache-view";
import { useOfflineStatus } from "@/hooks/use-offline-status";
import type { IssueSummary } from "@/components/projects/UnitCards";
import { IssueDetailModal } from "@/components/projects/IssueDetailModal";
import { IssueLogRow } from "@/components/projects/issues/IssueLogRow";
import type { UnitContext } from "@/components/projects/AddObservationModal";
import { formatPdfExportErrorToast } from "@/lib/format-pdf-export-error-toast";
import {
  deliverPdfBlob,
  deliverPdfBlobOnUserGesture,
  isMobilePdfDelivery,
} from "@/lib/deliver-pdf-blob";
import { readSnapshotData } from "@/lib/offline/snapshot-cache";
import {
  buildFieldLogLocationFilterOptions,
  fieldLogLocationFilterSummary,
  matchesFieldLogLocationFilter,
} from "@/lib/field-log-location-filter";
import {
  BuildingLevelFilterSection,
  type BuildingLevelFilterOptions,
} from "@/components/shared/BuildingLevelFilterSection";
import {
  FilterChip,
  FilterPanelFooterActions,
  FilterPanelShell,
} from "@/components/shared/filterPanel";
import {
  resolveIssueTypeLabel,
  resolvePartyLabel,
  useIssueCatalog,
} from "@/lib/issues/use-issue-catalog";
import type {
  PublicIssueTypeCatalogItem,
  PublicResponsiblePartyCatalogItem,
} from "@/lib/issues/issue-catalog";

// ── Extended type — API returns building/level/unit on scopeTags.row ──────────

interface IssueRow extends IssueSummary {
  scopeTags: Array<{
    row: {
      id: string;
      building?: string | null;
      level?: string | null;
      unit?: string | null;
      scopeType?: { name: string } | null;
    };
  }>;
  /** Set by offline write-through when a create-issue mutation is queued but not yet synced. */
  _pendingSync?: boolean;
}

type Tab = "open" | "resolved" | "all";

type DatePreset = "all" | "7d" | "30d" | "custom";

interface DateRange {
  preset: DatePreset;
  customFrom: string; // YYYY-MM-DD or ""
  customTo: string;   // YYYY-MM-DD or ""
}

const DATE_PRESET_KEYS: { key: DatePreset; labelKey: "issueFilterDateAll" | "issueFilterDate7d" | "issueFilterDate30d" | "issueFilterDateCustom" }[] = [
  { key: "all",    labelKey: "issueFilterDateAll" },
  { key: "7d",     labelKey: "issueFilterDate7d" },
  { key: "30d",    labelKey: "issueFilterDate30d" },
  { key: "custom", labelKey: "issueFilterDateCustom" },
];

function issueDateRangeLabel(
  dr: DateRange,
  t: ReturnType<typeof useTranslations<"units">>,
): string {
  if (dr.preset === "7d") return t("issueFilterDate7d");
  if (dr.preset === "30d") return t("issueFilterDate30d");
  if (dr.preset === "custom") {
    const parts: string[] = [];
    if (dr.customFrom) parts.push(t("issueFilterDateFromPrefix", { date: dr.customFrom }));
    if (dr.customTo) parts.push(t("issueFilterDateToPrefix", { date: dr.customTo }));
    return parts.length > 0 ? parts.join(" · ") : t("issueFilterDateCustom");
  }
  return t("issueFilterDateAll");
}

interface Filters {
  responsibleParties: string[];
  issueTypes: string[];
  scopeNames: string[];
  subScopeNames: string[];
  buildings: string[];
  levels: string[];
  dateRange: DateRange;
  authors: string[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const EMPTY_FILTERS: Filters = {
  responsibleParties: [],
  issueTypes: [],
  scopeNames: [],
  subScopeNames: [],
  buildings: [],
  levels: [],
  dateRange: { preset: "all", customFrom: "", customTo: "" },
  authors: [],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function issueTypeFilterLabel(
  code: string,
  catalog: PublicIssueTypeCatalogItem[],
): string {
  return resolveIssueTypeLabel(code, catalog);
}

function partyFilterLabel(
  code: string,
  catalog: PublicResponsiblePartyCatalogItem[],
): string {
  return resolvePartyLabel(code, catalog);
}

function buildUnitContext(issue: IssueRow): UnitContext {
  const firstRow = issue.scopeTags[0]?.row;
  const parts = issue.unitRef?.split("|") ?? [];
  const building = firstRow?.building ?? parts[0] ?? "";
  const level    = firstRow?.level    ?? parts[1] ?? "";
  const unit     = firstRow?.unit     ?? parts[2] ?? issue.unitRef ?? "";
  return {
    unitKey: unit || issue.unitRef || "—",
    building,
    level,
    unit,
    unitRef: issue.unitRef ?? `${building}|${level}|${unit}`,
  };
}

function activeFilterCount(f: Filters): number {
  return (
    f.responsibleParties.length +
    f.issueTypes.length +
    f.scopeNames.length +
    f.subScopeNames.length +
    f.buildings.length +
    f.levels.length +
    f.authors.length +
    (f.dateRange.preset !== "all" ? 1 : 0)
  );
}

function applyFilters(issues: IssueRow[], f: Filters): IssueRow[] {
  const now = Date.now();
  const MS_7D  = 7  * 24 * 60 * 60 * 1000;
  const MS_30D = 30 * 24 * 60 * 60 * 1000;

  return issues.filter((i) => {
    if (f.responsibleParties.length > 0) {
      const issueParties =
        i.responsibleParties?.length ? i.responsibleParties : [i.responsibleParty];
      if (!issueParties.some((p) => f.responsibleParties.includes(p))) return false;
    }
    if (f.issueTypes.length > 0 && !f.issueTypes.includes(i.issueType)) return false;
    if (f.authors.length > 0 && !f.authors.includes(i.createdBy.id)) return false;
    if (f.scopeNames.length > 0) {
      if (!i.scopeTags.some((st) => f.scopeNames.includes(st.row.scopeType?.name ?? ""))) return false;
    }
    if (f.subScopeNames.length > 0) {
      if (!(i.subScopeTags ?? []).some((st) => f.subScopeNames.includes(st.subScopeInstance.subScope.name))) return false;
    }

    if (f.buildings.length > 0 || f.levels.length > 0) {
      if (!matchesFieldLogLocationFilter(i.unitRef, f.buildings, f.levels)) return false;
    }

    // Date range filter
    const { preset, customFrom, customTo } = f.dateRange;
    if (preset !== "all") {
      const ts = new Date(i.createdAt).getTime();
      if (preset === "7d"  && ts < now - MS_7D)  return false;
      if (preset === "30d" && ts < now - MS_30D) return false;
      if (preset === "custom") {
        if (customFrom && ts < new Date(customFrom).getTime()) return false;
        // customTo is end-of-day inclusive
        if (customTo && ts > new Date(customTo).getTime() + 24 * 60 * 60 * 1000 - 1) return false;
      }
    }

    return true;
  });
}

// ── Accordion card — defined outside IssueLogFilterPanel to avoid static-component lint error ──

function AccordionCard({
  groupKey,
  title,
  previewLabels,
  count,
  children,
  expandedGroups,
  toggleGroup,
  previewChips,
}: {
  groupKey: string;
  title: string;
  previewLabels: string[];
  count: number;
  children: React.ReactNode;
  expandedGroups: Set<string>;
  toggleGroup: (group: string) => void;
  previewChips: (labels: string[], max?: number) => React.ReactNode;
}) {
  const anyActive = count > 0;
  const expanded = expandedGroups.has(groupKey);
  return (
    <div
      style={{
        border: anyActive ? "1.5px solid var(--primary-400)" : "1.5px solid var(--neutral-200)",
        borderRadius: 10,
        overflow: "hidden",
        transition: "border-color 0.12s",
      }}
    >
      <button
        type="button"
        onClick={() => toggleGroup(groupKey)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8,
          padding: "13px 14px", border: "none",
          backgroundColor: anyActive ? "var(--primary-50)" : "var(--neutral-0)",
          cursor: "pointer", textAlign: "left", transition: "background-color 0.12s",
        }}
      >
        <span style={{ flexShrink: 0, fontSize: 14, fontWeight: 600, color: anyActive ? "var(--primary-700)" : "var(--neutral-800)" }}>
          {title}
        </span>
        {anyActive && !expanded && previewChips(previewLabels)}
        <span style={{ flex: 1 }} />
        {anyActive && expanded && (
          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 99, backgroundColor: "var(--primary-100)", color: "var(--primary-700)", flexShrink: 0 }}>
            {count}
          </span>
        )}
        <ChevronDown
          size={15}
          style={{
            color: "var(--neutral-400)", flexShrink: 0,
            transform: expanded ? "rotate(0deg)" : "rotate(-90deg)",
            transition: "transform 0.18s",
          }}
        />
      </button>
      {expanded && (
        <div style={{ borderTop: "1px solid var(--neutral-100)", padding: "12px 14px 14px", backgroundColor: "var(--neutral-50)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── Filter panel ──────────────────────────────────────────────────────────────

interface FilterPanelOptions {
  /** Maps each scope name to the list of sub-scope names it has across all tab issues */
  scopeSubMap: Record<string, string[]>;
  availableAuthors: { id: string; label: string }[];
  locationFilterOptions: BuildingLevelFilterOptions;
}

function IssueLogFilterPanel({
  filters,
  options,
  catalogIssueTypes,
  catalogParties,
  onChange,
  onClose,
  onClear,
}: {
  filters: Filters;
  options: FilterPanelOptions;
  catalogIssueTypes: PublicIssueTypeCatalogItem[];
  catalogParties: PublicResponsiblePartyCatalogItem[];
  onChange: (f: Filters) => void;
  onClose: () => void;
  onClear: () => void;
}) {
  const t = useTranslations("units");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    const s = new Set<string>();
    if (filters.responsibleParties.length > 0) s.add("party");
    if (filters.issueTypes.length > 0) s.add("type");
    if (filters.scopeNames.length > 0) s.add("scope");
    if (filters.subScopeNames.length > 0) s.add("subscope");
    if (filters.buildings.length > 0 || filters.levels.length > 0) s.add("location");
    if (filters.dateRange.preset !== "all") s.add("date");
    return s;
  });

  function toggleGroup(group: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  function previewChips(labels: string[], max = 2) {
    if (labels.length === 0) return null;
    const shown = labels.slice(0, max);
    const overflow = labels.length - max;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 1, overflow: "hidden", minWidth: 0 }}>
        {shown.map((l) => (
          <span
            key={l}
            style={{
              fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 99,
              backgroundColor: "var(--primary-100)", color: "var(--primary-700)",
              whiteSpace: "nowrap", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0,
            }}
          >
            {l}
          </span>
        ))}
        {overflow > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--primary-500)", whiteSpace: "nowrap", flexShrink: 0 }}>
            +{overflow}
          </span>
        )}
      </div>
    );
  }

  const filterCount = activeFilterCount(filters);

  return (
    <FilterPanelShell
      title={t("issueFilterTitle")}
      subtitle={t("issueFilterSubtitle")}
      closeAriaLabel={t("issueFilterCloseAria")}
      onClose={onClose}
      footer={(close) => (
        <FilterPanelFooterActions
          clearLabel={t("issueFilterClearAll")}
          applyLabel={t("issueFilterDone")}
          onClear={onClear}
          onApply={close}
          clearDisabled={filterCount === 0}
        />
      )}
    >
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>

              {/* Responsible Party */}
              <AccordionCard
                groupKey="party"
                title={t("issueFilterResponsiblePartyLabel")}
                previewLabels={filters.responsibleParties.map((p) => partyFilterLabel(p, catalogParties))}
                count={filters.responsibleParties.length}
                expandedGroups={expandedGroups}
                toggleGroup={toggleGroup}
                previewChips={previewChips}
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {catalogParties.map((party) => (
                    <FilterChip
                      key={party.code}
                      label={resolvePartyLabel(party.code, catalogParties)}
                      active={filters.responsibleParties.includes(party.code)}
                      onClick={() => {
                        const next = filters.responsibleParties.includes(party.code)
                          ? filters.responsibleParties.filter((v) => v !== party.code)
                          : [...filters.responsibleParties, party.code];
                        onChange({ ...filters, responsibleParties: next });
                      }}
                    />
                  ))}
                </div>
              </AccordionCard>

              {/* Issue Type */}
              <AccordionCard
                groupKey="type"
                title={t("issueFilterIssueTypeLabel")}
                previewLabels={filters.issueTypes.map((code) => issueTypeFilterLabel(code, catalogIssueTypes))}
                count={filters.issueTypes.length}
                expandedGroups={expandedGroups}
                toggleGroup={toggleGroup}
                previewChips={previewChips}
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {catalogIssueTypes.map((type) => (
                    <FilterChip
                      key={type.code}
                      label={resolveIssueTypeLabel(type.code, catalogIssueTypes)}
                      active={filters.issueTypes.includes(type.code)}
                      onClick={() => {
                        const next = filters.issueTypes.includes(type.code)
                          ? filters.issueTypes.filter((v) => v !== type.code)
                          : [...filters.issueTypes, type.code];
                        onChange({ ...filters, issueTypes: next });
                      }}
                    />
                  ))}
                </div>
              </AccordionCard>

              {options.locationFilterOptions.buildings.length > 0 && (
                <BuildingLevelFilterSection
                  options={options.locationFilterOptions}
                  value={{ buildings: filters.buildings, levels: filters.levels }}
                  onChange={(next) =>
                    onChange({ ...filters, buildings: next.buildings, levels: next.levels })
                  }
                />
              )}

              {/* Affected Scope — unified with inline sub-scope expand (mirrors AddIssueModal) */}
              {Object.keys(options.scopeSubMap).length > 0 && (() => {
                const scopeNames = Object.keys(options.scopeSubMap).sort();
                const totalCount = filters.scopeNames.length + filters.subScopeNames.length;
                const previewLabels = [
                  ...filters.scopeNames,
                  ...filters.subScopeNames.map((s) => `· ${s}`),
                ];
                return (
                  <AccordionCard
                    groupKey="scope"
                    title={t("issueFilterAffectedScopeLabel")}
                    previewLabels={previewLabels}
                    count={totalCount}
                    expandedGroups={expandedGroups}
                    toggleGroup={toggleGroup}
                    previewChips={previewChips}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {scopeNames.map((scopeName) => {
                        const subScopes = options.scopeSubMap[scopeName] ?? [];
                        const isSelected = filters.scopeNames.includes(scopeName);
                        const hasSubScopes = subScopes.length > 0;
                        const selectedSubCount = subScopes.filter((ss) => filters.subScopeNames.includes(ss)).length;

                        return (
                          <div key={scopeName}>
                            {/* Scope row */}
                            <button
                              type="button"
                              onClick={() => {
                                const next = isSelected
                                  ? filters.scopeNames.filter((v) => v !== scopeName)
                                  : [...filters.scopeNames, scopeName];
                                // Clear sub-scopes belonging to this scope when deselecting
                                const newSubScopes = isSelected
                                  ? filters.subScopeNames.filter((ss) => !subScopes.includes(ss))
                                  : filters.subScopeNames;
                                onChange({ ...filters, scopeNames: next, subScopeNames: newSubScopes });
                              }}
                              style={{
                                width: "100%", display: "flex", alignItems: "center", gap: 10,
                                padding: "9px 12px",
                                borderRadius: isSelected && hasSubScopes ? "10px 10px 0 0" : 10,
                                border: isSelected ? "1.5px solid var(--primary-300)" : "1.5px solid var(--neutral-200)",
                                backgroundColor: isSelected ? "var(--primary-50)" : "var(--neutral-0)",
                                cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                                transition: "background 0.12s, border-color 0.12s",
                              }}
                            >
                              {/* Checkbox indicator */}
                              <span style={{
                                width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                                border: isSelected ? "none" : "1.5px solid var(--neutral-300)",
                                backgroundColor: isSelected ? "var(--primary-500)" : "transparent",
                                display: "flex", alignItems: "center", justifyContent: "center",
                              }}>
                                {isSelected && (
                                  <svg width="11" height="8" viewBox="0 0 11 8" fill="none">
                                    <path d="M1 4L4 7L10 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                )}
                              </span>
                              <span style={{ fontSize: 14, flex: 1, color: isSelected ? "var(--primary-700)" : "var(--neutral-800)", fontWeight: isSelected ? 500 : 400 }}>
                                {scopeName}
                              </span>
                              {hasSubScopes && !isSelected && (
                                <span style={{ fontSize: 11, color: "var(--neutral-400)" }}>{subScopes.length} sub-scopes</span>
                              )}
                              {hasSubScopes && isSelected && selectedSubCount > 0 && (
                                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--primary-600)", backgroundColor: "var(--primary-100)", borderRadius: 10, padding: "2px 7px" }}>
                                  {selectedSubCount} selected
                                </span>
                              )}
                            </button>

                            {/* Inline sub-scope checklist — expands when scope is selected */}
                            {isSelected && hasSubScopes && (
                              <div style={{
                                border: "1.5px solid var(--primary-300)",
                                borderTop: "1px solid var(--primary-100)",
                                borderRadius: "0 0 10px 10px",
                                backgroundColor: "var(--primary-25, #f8f9ff)",
                                padding: "8px 12px 10px 12px",
                                marginBottom: 2,
                              }}>
                                <div style={{ fontSize: 11, color: "var(--neutral-500)", marginBottom: 8, fontStyle: "italic" }}>
                                  Filter to specific sub-scope(s)
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                  {subScopes.map((ss) => {
                                    const ssChecked = filters.subScopeNames.includes(ss);
                                    return (
                                      <button
                                        key={ss}
                                        type="button"
                                        onClick={() => {
                                          const next = ssChecked
                                            ? filters.subScopeNames.filter((v) => v !== ss)
                                            : [...filters.subScopeNames, ss];
                                          onChange({ ...filters, subScopeNames: next });
                                        }}
                                        style={{
                                          display: "flex", alignItems: "center", gap: 10,
                                          padding: "7px 10px", borderRadius: 8,
                                          border: ssChecked ? "1.5px solid var(--primary-300)" : "1.5px solid var(--neutral-200)",
                                          backgroundColor: ssChecked ? "var(--primary-50)" : "var(--neutral-0)",
                                          cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                                          transition: "background 0.1s, border-color 0.1s",
                                        }}
                                      >
                                        <span style={{
                                          width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                                          border: ssChecked ? "none" : "1.5px solid var(--neutral-300)",
                                          backgroundColor: ssChecked ? "var(--primary-500)" : "transparent",
                                          display: "flex", alignItems: "center", justifyContent: "center",
                                        }}>
                                          {ssChecked && (
                                            <svg width="10" height="7" viewBox="0 0 10 7" fill="none">
                                              <path d="M1 3.5L3.5 6L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                          )}
                                        </span>
                                        <span style={{ fontSize: 13, color: ssChecked ? "var(--primary-700)" : "var(--neutral-700)", fontWeight: ssChecked ? 500 : 400 }}>
                                          {ss}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </AccordionCard>
                );
              })()}

              {/* Created by */}
              {options.availableAuthors.length > 0 && (
                <AccordionCard
                  groupKey="authors"
                  title={t("issueFilterCreatedByLabel")}
                  previewLabels={filters.authors.map(
                    (id) => options.availableAuthors.find((a) => a.id === id)?.label ?? id,
                  )}
                  count={filters.authors.length}
                  expandedGroups={expandedGroups}
                  toggleGroup={toggleGroup}
                  previewChips={previewChips}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {options.availableAuthors.map((author) => {
                      const checked = filters.authors.includes(author.id);
                      const initial = author.label.charAt(0).toUpperCase();
                      return (
                        <button
                          key={author.id}
                          type="button"
                          onClick={() => {
                            const next = checked
                              ? filters.authors.filter((v) => v !== author.id)
                              : [...filters.authors, author.id];
                            onChange({ ...filters, authors: next });
                          }}
                          style={{
                            display: "flex", alignItems: "center", gap: 10,
                            padding: "8px 12px", borderRadius: 10,
                            border: checked ? "1.5px solid var(--primary-300)" : "1.5px solid var(--neutral-200)",
                            backgroundColor: checked ? "var(--primary-50)" : "var(--neutral-0)",
                            cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                            transition: "background 0.12s, border-color 0.12s",
                          }}
                        >
                          {/* Avatar initial */}
                          <span style={{
                            width: 28, height: 28, borderRadius: 99, flexShrink: 0,
                            backgroundColor: checked ? "var(--primary-500)" : "var(--neutral-200)",
                            color: checked ? "#fff" : "var(--neutral-600)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 12, fontWeight: 700,
                          }}>
                            {initial}
                          </span>
                          <span style={{ flex: 1, fontSize: 14, color: checked ? "var(--primary-700)" : "var(--neutral-800)", fontWeight: checked ? 500 : 400 }}>
                            {author.label}
                          </span>
                          {checked && (
                            <svg width="14" height="11" viewBox="0 0 14 11" fill="none" aria-hidden>
                              <path d="M1 5.5L5 9.5L13 1.5" stroke="var(--primary-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </AccordionCard>
              )}

              {/* Date Range */}
              {(() => {
                const { preset, customFrom, customTo } = filters.dateRange;
                const isActive = preset !== "all";
                const label = isActive ? issueDateRangeLabel(filters.dateRange, t) : "";
                return (
                  <AccordionCard
                    groupKey="date"
                    title={t("issueFilterDateLabel")}
                    previewLabels={isActive ? [label] : []}
                    count={isActive ? 1 : 0}
                    expandedGroups={expandedGroups}
                    toggleGroup={toggleGroup}
                    previewChips={previewChips}
                  >
                    {/* Preset quick-tap pills */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: preset === "custom" ? 14 : 0 }}>
                      {DATE_PRESET_KEYS.map(({ key, labelKey }) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => onChange({
                            ...filters,
                            dateRange: { preset: key, customFrom: key === "custom" ? customFrom : "", customTo: key === "custom" ? customTo : "" },
                          })}
                          style={{
                            padding: "8px 16px", borderRadius: 99,
                            border: preset === key ? "2px solid var(--primary-500)" : "1.5px solid var(--neutral-300)",
                            backgroundColor: preset === key ? "var(--primary-50)" : "var(--neutral-0)",
                            color: preset === key ? "var(--primary-700)" : "var(--neutral-700)",
                            fontSize: 13, fontWeight: preset === key ? 600 : 400,
                            cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.12s",
                          }}
                        >
                          {t(labelKey)}
                        </button>
                      ))}
                    </div>

                    {/* Custom range date inputs */}
                    {preset === "custom" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--neutral-600)", letterSpacing: "0.03em" }}>
                            {t("issueFilterDateFrom")}
                          </label>
                          <input
                            type="date"
                            value={customFrom}
                            max={customTo || undefined}
                            onChange={(e) => onChange({
                              ...filters,
                              dateRange: { ...filters.dateRange, customFrom: e.target.value },
                            })}
                            style={{
                              width: "100%", padding: "9px 12px", borderRadius: 8,
                              border: "1.5px solid var(--neutral-300)",
                              backgroundColor: "var(--neutral-0)",
                              fontSize: 14, color: "var(--neutral-800)",
                              fontFamily: "inherit", outline: "none", boxSizing: "border-box",
                            }}
                          />
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--neutral-600)", letterSpacing: "0.03em" }}>
                            {t("issueFilterDateTo")}
                          </label>
                          <input
                            type="date"
                            value={customTo}
                            min={customFrom || undefined}
                            onChange={(e) => onChange({
                              ...filters,
                              dateRange: { ...filters.dateRange, customTo: e.target.value },
                            })}
                            style={{
                              width: "100%", padding: "9px 12px", borderRadius: 8,
                              border: "1.5px solid var(--neutral-300)",
                              backgroundColor: "var(--neutral-0)",
                              fontSize: 14, color: "var(--neutral-800)",
                              fontFamily: "inherit", outline: "none", boxSizing: "border-box",
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </AccordionCard>
                );
              })()}

            </div>
    </FilterPanelShell>
  );
}

// ── Scope parsing (mirrors ObservationsLogClient) ─────────────────────────────

type ScopeLevel = "project" | "building" | "level" | "unit";

interface ScopeParsed {
  level: ScopeLevel;
  building: string;
  floor: string;
  unit: string;
  label: string;
}

function parseScope(unitRef: string | null | undefined): ScopeParsed {
  if (!unitRef || unitRef === "||") {
    return { level: "project", building: "", floor: "", unit: "", label: "Project" };
  }
  const parts = unitRef.split("|");
  const building = parts[0] ?? "";
  const floor    = parts[1] ?? "";
  const unit     = parts[2] ?? "";

  if (!building) return { level: "project", building: "", floor: "", unit: "", label: "Project" };
  if (!floor)    return { level: "building", building, floor: "", unit: "", label: building };
  if (!unit)     return { level: "level", building, floor, unit: "", label: `${building} › Level ${floor}` };
  return { level: "unit", building, floor, unit, label: `${building} › Level ${floor} › ${unit}` };
}

// ── CollapsibleGroup (mirrors ObservationsLogClient) ──────────────────────────

function IssueGroup({
  label,
  count,
  open,
  onToggle,
  children,
}: {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const isSingle = count === 1;
  const isOpen = isSingle || open;

  return (
    <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid var(--neutral-200)", marginBottom: 12 }}>
      {isSingle ? (
        <div
          style={{
            display: "flex", alignItems: "center", width: "100%",
            padding: "11px 14px", backgroundColor: "var(--neutral-50)",
            borderBottom: "1px solid var(--neutral-200)", gap: 8,
          }}
        >
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--neutral-700)" }}>
            {label}
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          style={{
            display: "flex", alignItems: "center", width: "100%",
            padding: "11px 14px", backgroundColor: "var(--neutral-50)",
            border: "none", borderBottom: isOpen ? "1px solid var(--neutral-200)" : "none",
            cursor: "pointer", gap: 8, textAlign: "left",
          }}
        >
          <ChevronDown
            size={15}
            style={{
              flexShrink: 0, color: "var(--neutral-500)",
              transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)",
              transition: "transform 0.15s",
            }}
            aria-hidden
          />
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--neutral-700)" }}>
            {label}
          </span>
          <span
            style={{
              fontSize: 11, fontWeight: 600, color: "var(--neutral-500)",
              backgroundColor: "var(--neutral-100)", borderRadius: 99, padding: "2px 8px",
            }}
          >
            {count}
          </span>
        </button>
      )}
      {isOpen && <div className="issue-log-list">{children}</div>}
    </div>
  );
}

// ── PDF export progress overlay ───────────────────────────────────────────────

type ExportStep = "gathering" | "photos" | "rendering" | "finalizing" | "done";

const EXPORT_STEPS: Array<{
  id: ExportStep;
  label: string;
  detail: string;
}> = [
  {
    id: "gathering",
    label: "Gathering issues",
    detail: "Fetching all matching issues from the database…",
  },
  {
    id: "photos",
    label: "Loading photos",
    detail: "Downloading attached images for the report. This is usually the slowest step.",
  },
  {
    id: "rendering",
    label: "Rendering pages",
    detail: "Laying out issues, photos, and comments into print-ready pages…",
  },
  {
    id: "finalizing",
    label: "Finalizing PDF",
    detail: "Compressing and packaging the document for download…",
  },
  {
    id: "done",
    label: "Done!",
    detail: "Your PDF is ready.",
  },
];

function ExportProgressOverlay({
  step,
  issueCount,
  onSavePdf,
  savePdfLabel,
  savePdfHint,
  onCancel,
  cancelLabel,
}: {
  step: ExportStep;
  issueCount: number;
  /** Mobile: fresh tap to share/open after async generation (iOS requires user gesture). */
  onSavePdf?: () => void;
  savePdfLabel?: string;
  savePdfHint?: string;
  /** Abort an in-progress export (hidden when PDF is ready). */
  onCancel?: () => void;
  cancelLabel?: string;
}) {
  const t = useTranslations("units");
  const stepOrder: ExportStep[] = ["gathering", "photos", "rendering", "finalizing", "done"];
  const currentIdx = stepOrder.indexOf(step);
  const isDone = step === "done";
  const current = EXPORT_STEPS.find((s) => s.id === step)!;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={t("issueExportPdfBusyAria")}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        backgroundColor: "var(--overlay-bg, rgba(0,0,0,0.55))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          backgroundColor: "var(--neutral-0)",
          borderRadius: 16,
          padding: "32px 28px",
          maxWidth: 400,
          width: "100%",
          boxShadow: "var(--shadow-2)",
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        {/* Header */}
        <div>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--neutral-400)", marginBottom: 6 }}>
            {t("issueExportPdfBusyAria")}
          </p>
          <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: isDone ? "var(--success-700)" : "var(--neutral-900)" }}>
            {isDone ? "PDF ready!" : current.label + "…"}
          </p>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--neutral-500)", lineHeight: 1.5 }}>
            {isDone && onSavePdf && savePdfHint ? savePdfHint : current.detail}
          </p>
        </div>

        {isDone && onSavePdf && savePdfLabel && (
          <button
            type="button"
            onClick={onSavePdf}
            style={{
              width: "100%",
              padding: "12px 16px",
              border: "none",
              borderRadius: 10,
              backgroundColor: "var(--neutral-900)",
              color: "var(--neutral-0)",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {savePdfLabel}
          </button>
        )}

        {/* Step indicators */}
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {EXPORT_STEPS.filter((s) => s.id !== "done").map((s, idx) => {
            const done = idx < currentIdx;
            const active = idx === currentIdx;
            return (
              <li
                key={s.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  opacity: done || active ? 1 : 0.35,
                }}
              >
                {/* Status dot */}
                <span
                  aria-hidden
                  style={{
                    flexShrink: 0,
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    backgroundColor: done
                      ? "var(--success-600)"
                      : active
                        ? "var(--primary-600)"
                        : "var(--neutral-200)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    color: done || active ? "#fff" : "var(--neutral-400)",
                    transition: "background-color 0.3s",
                  }}
                >
                  {done ? "✓" : idx + 1}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: active ? 600 : 400,
                    color: done
                      ? "var(--success-700)"
                      : active
                        ? "var(--neutral-900)"
                        : "var(--neutral-400)",
                  }}
                >
                  {s.label}
                </span>
                {/* Active spinner */}
                {active && !isDone && (
                  <span
                    aria-hidden
                    className="animate-spin"
                    style={{
                      marginLeft: "auto",
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      border: "2px solid var(--neutral-200)",
                      borderTopColor: "var(--primary-600)",
                      display: "inline-block",
                      flexShrink: 0,
                    }}
                  />
                )}
              </li>
            );
          })}
        </ol>

        {/* Footer note */}
        {!isDone && (
          <>
            <p style={{ margin: 0, fontSize: 11, color: "var(--neutral-400)", textAlign: "center", lineHeight: 1.4 }}>
              Exporting {issueCount} issue{issueCount !== 1 ? "s" : ""} —
              this may take 15–30 seconds for large reports with many photos.
            </p>
            {onCancel && cancelLabel ? (
              <button
                type="button"
                onClick={onCancel}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1.5px solid var(--neutral-300)",
                  borderRadius: 8,
                  background: "var(--neutral-0)",
                  color: "var(--neutral-700)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {cancelLabel}
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  projectId: string;
  projectName?: string;
  currentUserId?: string;
  currentUserRole?: string;
  canManageStatus?: boolean;
  /** When true, omits the standalone page title (combined Issues/Observations tabs own the header). */
  embeddedInFieldReports?: boolean;
}

export function IssuesLogClient({
  projectId,
  projectName = "Project",
  currentUserId,
  currentUserRole,
  embeddedInFieldReports = false,
}: Props) {
  const t = useTranslations("units");
  const tFieldReports = useTranslations("projects.fieldReports");
  const tOffline = useTranslations("offlineIndicator");
  const { isOnline } = useOfflineStatus();
  const { issueTypes: catalogIssueTypes, responsibleParties: catalogParties } =
    useIssueCatalog(projectId);
  const [allIssues, setAllIssues] = useState<IssueRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [isFromCache, setIsFromCache] = useState(false);
  const [cacheDate, setCacheDate]     = useState<string | null>(null);
  useRegisterOfflineCacheView(isFromCache, cacheDate);
  const [activeTab, setActiveTab] = useState<Tab>("open");
  const [filters, setFilters]     = useState<Filters>(EMPTY_FILTERS);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [exportStep, setExportStep] = useState<
    null | "gathering" | "photos" | "rendering" | "finalizing" | "done"
  >(null);
  const [exportProgressCount, setExportProgressCount] = useState(0);
  const [pendingPdf, setPendingPdf] = useState<{ blob: Blob; fileName: string } | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);
  const exportTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const exporting = exportStep !== null;
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIssueIds, setSelectedIssueIds] = useState<Set<string>>(() => new Set());
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(max-width: 767px)").matches;
  });
  const [projectOpen,  setProjectOpen]  = useState(true);
  const [buildingOpen, setBuildingOpen] = useState<Record<string, boolean>>({});
  const [levelOpen,    setLevelOpen]    = useState<Record<string, boolean>>({});
  const [unitOpen,     setUnitOpen]     = useState<Record<string, boolean>>({});

  const fetchIssues = useCallback(async () => {
    setError(null);
    setIsFromCache(false);
    try {
      const res = await fetch(`/api/projects/${projectId}/issues`);
      if (!res.ok) throw new Error("Failed to load issues");
      const data: { issues: IssueRow[] } = await res.json();
      setAllIssues(data.issues);
    } catch (e) {
      const snapshot = await readSnapshotData(projectId);
      if (snapshot?.data && Array.isArray(snapshot.data.issues)) {
        const offlineIssues = (snapshot.data.issues as Array<IssueRow & { projectId?: string }>)
          .filter((i) => i.projectId === projectId);
        setAllIssues(offlineIssues);
        setIsFromCache(true);
        setCacheDate(snapshot.generatedAt ?? null);
        setLoading(false);
        return;
      }
      setError(e instanceof Error ? e.message : "Failed to load issues");
    } finally {
      setLoading(false);
    }
     
  }, [projectId]); // intentionally omits isOnline — uses navigator.onLine directly in catch

  useEffect(() => { fetchIssues(); }, [fetchIssues]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobileViewport(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Deep-link: read ?openIssue=<id> from URL after issues load
  useEffect(() => {
    if (allIssues.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const openIssueId = params.get("openIssue");
    if (!openIssueId) return;

    // Find the issue across all tabs
    const allSorted = [...allIssues].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const idx = allSorted.findIndex((i) => i.id === openIssueId);
    if (idx === -1) return;

    // Switch to the correct tab
    const target = allSorted[idx];
    if (target.status === "RESOLVED") setActiveTab("resolved");
    else setActiveTab("open");

    // Open the modal — use a short delay so the tab filter has updated
    setTimeout(() => {
      setSelectedIndex(idx);
    }, 50);
  }, [allIssues]);

  function openIssueAt(issueId: string, withResolve = false) {
    const idx = sorted.findIndex((i) => i.id === issueId);
    if (idx === -1) return;
    setResolveOpen(withResolve);
    setSelectedIndex(idx);
  }

  // Tab groups
  const openIssues     = allIssues.filter((i) => i.status === "OPEN");
  const resolvedIssues = allIssues.filter((i) => i.status === "RESOLVED");

  const tabIssues =
    activeTab === "all"
      ? allIssues
      : activeTab === "open"
        ? openIssues
        : resolvedIssues;

  const filtered  = applyFilters(tabIssues, filters);
  const filterCount = activeFilterCount(filters);
  const hasFilters  = filterCount > 0;

  const sorted = [...filtered].sort((a, b) => {
    const aT = new Date(a.createdAt).getTime();
    const bT = new Date(b.createdAt).getTime();
    return sortOrder === "newest" ? bT - aT : aT - bT;
  });

  const sortedIdSet = useMemo(() => new Set(sorted.map((i) => i.id)), [sorted]);

  const effectiveSelectedIds = useMemo(
    () => new Set([...selectedIssueIds].filter((id) => sortedIdSet.has(id))),
    [selectedIssueIds, sortedIdSet],
  );

  const toggleSelect = useCallback((issueId: string) => {
    setSelectedIssueIds((prev) => {
      const next = new Set(prev);
      if (next.has(issueId)) next.delete(issueId);
      else next.add(issueId);
      return next;
    });
  }, []);

  const selectAllVisible = useCallback(() => {
    setSelectedIssueIds((prev) => {
      const next = new Set(prev);
      for (const issue of sorted) next.add(issue.id);
      return next;
    });
  }, [sorted]);

  const deselectAll = useCallback(() => {
    setSelectedIssueIds(new Set());
  }, []);

  const exitSelectMode = useCallback(() => {
    setIsSelectMode(false);
    setSelectedIssueIds(new Set());
  }, []);

  const enterSelectMode = useCallback(() => {
    setIsSelectMode(true);
  }, []);

  const renderIssueRow = useCallback(
    (issue: IssueRow) => (
      <IssueLogRow
        key={issue.id}
        issue={issue}
        variant="log"
        showResponsible
        issueTypeCatalog={catalogIssueTypes}
        selectMode={isSelectMode}
        selected={effectiveSelectedIds.has(issue.id)}
        onToggleSelect={() => toggleSelect(issue.id)}
        onView={() => setSelectedIndex(sorted.findIndex((i) => i.id === issue.id))}
        onResolve={
          issue.status !== "RESOLVED"
            ? () => openIssueAt(issue.id, true)
            : undefined
        }
      />
    ),
    [isSelectMode, effectiveSelectedIds, toggleSelect, sorted, catalogIssueTypes],
  );

  // ── Location groups (same 4-bucket approach as ObservationsLogClient) ─────────

  const projectIssues = useMemo(() => sorted.filter((i) => parseScope(i.unitRef).level === "project"), [sorted]);

  const buildingGroups = useMemo(() => {
    const map = new Map<string, IssueRow[]>();
    for (const i of sorted) {
      if (parseScope(i.unitRef).level !== "building") continue;
      const { building } = parseScope(i.unitRef);
      const list = map.get(building) ?? [];
      list.push(i);
      map.set(building, list);
    }
    return map;
  }, [sorted]);

  const levelGroups = useMemo(() => {
    const map = new Map<string, { label: string; items: IssueRow[] }>();
    for (const i of sorted) {
      if (parseScope(i.unitRef).level !== "level") continue;
      const { building, floor } = parseScope(i.unitRef);
      const key = `${building}|${floor}`;
      const entry = map.get(key) ?? { label: `${building} › Level ${floor}`, items: [] };
      entry.items.push(i);
      map.set(key, entry);
    }
    return map;
  }, [sorted]);

  const unitGroups = useMemo(() => {
    const map = new Map<string, { label: string; items: IssueRow[] }>();
    for (const i of sorted) {
      if (parseScope(i.unitRef).level !== "unit") continue;
      const { building, floor, unit } = parseScope(i.unitRef);
      const key = `${building}|${floor}|${unit}`;
      const entry = map.get(key) ?? { label: `${building} › Level ${floor} › ${unit}`, items: [] };
      entry.items.push(i);
      map.set(key, entry);
    }
    return map;
  }, [sorted]);

  // Build scope → sub-scope map from all issues in the current tab (not filtered,
  // so the panel always shows all available options regardless of active filters)
  const panelScopeSubMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const issue of tabIssues) {
      for (const st of issue.scopeTags) {
        const scopeName = st.row.scopeType?.name;
        if (!scopeName) continue;
        if (!map[scopeName]) map[scopeName] = [];
      }
      for (const st of issue.subScopeTags ?? []) {
        const scopeName = st.subScopeInstance.row.scopeType?.name;
        const subName   = st.subScopeInstance.subScope.name;
        if (!scopeName) continue;
        if (!map[scopeName]) map[scopeName] = [];
        if (!map[scopeName].includes(subName)) map[scopeName].push(subName);
      }
    }
    for (const key of Object.keys(map)) map[key].sort();
    return map;
  }, [tabIssues]);

  // Build unique author list from all issues in current tab
  const availableAuthors = useMemo(() => {
    const seen = new Map<string, string>();
    for (const issue of tabIssues) {
      const { id, name, email } = issue.createdBy;
      if (!seen.has(id)) seen.set(id, name ?? email.split("@")[0]);
    }
    return Array.from(seen.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [tabIssues]);

  const locationFilterOptions = useMemo(
    (): BuildingLevelFilterOptions => buildFieldLogLocationFilterOptions(allIssues),
    [allIssues],
  );

  const countLabel = (tab: Tab) => {
    const base =
      tab === "open" ? openIssues : tab === "resolved" ? resolvedIssues : allIssues;
    if (activeTab === tab && hasFilters) return `${filtered.length}/${base.length}`;
    return String(base.length);
  };

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setFilters(EMPTY_FILTERS);
    setSelectedIndex(null);
  };

  const handleUpdated = useCallback((updated: IssueSummary) => {
    setAllIssues((prev) => prev.map((i) => i.id === updated.id ? { ...i, ...updated } as IssueRow : i));
  }, []);

  const handleDeleted = useCallback((issueId: string) => {
    setAllIssues((prev) => prev.filter((i) => i.id !== issueId));
    setSelectedIndex(null);
  }, []);

  const handleGroupResolved = useCallback(() => {
    fetchIssues();
    setSelectedIndex(null);
  }, [fetchIssues]);

  const clearExportTimers = useCallback(() => {
    exportTimersRef.current.forEach(clearTimeout);
    exportTimersRef.current = [];
  }, []);

  const handleCancelExport = useCallback(() => {
    clearExportTimers();
    exportAbortRef.current?.abort();
    exportAbortRef.current = null;
    setExportStep(null);
    setPendingPdf(null);
  }, [clearExportTimers]);

  const handleExport = useCallback(async (selectedIds?: string[]) => {
    const isSelectionExport = selectedIds !== undefined;
    const exportCount = isSelectionExport ? selectedIds.length : sorted.length;

    if (exporting) return;
    if (isSelectionExport && selectedIds.length === 0) {
      toast.error(t("issueExportSelectedNone"));
      return;
    }
    if (!isSelectionExport && sorted.length === 0) return;
    if (!isOnline) {
      toast.error(tOffline("offlineActionUnavailable"));
      return;
    }

    setExportProgressCount(exportCount);
    setExportStep("gathering");
    setPendingPdf(null);

    exportAbortRef.current?.abort();
    const abortController = new AbortController();
    exportAbortRef.current = abortController;

    clearExportTimers();
    exportTimersRef.current.push(setTimeout(() => setExportStep("photos"), 3_000));
    exportTimersRef.current.push(setTimeout(() => setExportStep("rendering"), 8_000));
    exportTimersRef.current.push(setTimeout(() => setExportStep("finalizing"), 16_000));

    const body = isSelectionExport
      ? {
          issueIds: selectedIds,
          sortOrder,
          projectName,
          filterSummary: t("issueExportSelectedSummary", { count: selectedIds.length }),
        }
      : (() => {
          const filterParts: string[] = [];
          if (activeTab === "open") filterParts.push(tFieldReports("issueStatusOpen"));
          else if (activeTab === "resolved") filterParts.push(tFieldReports("issueStatusResolved"));
          if (filters.issueTypes.length > 0)
            filterParts.push(filters.issueTypes.map((code) => issueTypeFilterLabel(code, catalogIssueTypes)).join(", "));
          if (filters.responsibleParties.length > 0)
            filterParts.push(filters.responsibleParties.map((p) => partyFilterLabel(p, catalogParties)).join(", "));
          if (filters.authors.length > 0)
            filterParts.push(`${filters.authors.length} author${filters.authors.length > 1 ? "s" : ""}`);
          if (filters.buildings.length > 0 || filters.levels.length > 0) {
            const locationSummary = fieldLogLocationFilterSummary(filters.buildings, filters.levels);
            if (locationSummary) filterParts.push(locationSummary);
          }
          if (filters.dateRange.preset !== "all") filterParts.push(issueDateRangeLabel(filters.dateRange, t));
          return {
            status:
              activeTab === "all"
                ? "all"
                : activeTab === "open"
                  ? "open"
                  : "resolved",
            issueTypes: filters.issueTypes,
            responsibleParties: filters.responsibleParties,
            authors: filters.authors,
            scopeNames: filters.scopeNames,
            buildings: filters.buildings,
            levels: filters.levels,
            dateFrom: filters.dateRange.preset === "custom" ? filters.dateRange.customFrom : undefined,
            dateTo: filters.dateRange.preset === "custom" ? filters.dateRange.customTo : undefined,
            sortOrder,
            projectName,
            filterSummary: filterParts.join(" · ") || "All issues",
          };
        })();

    try {
      const res = await fetch(`/api/projects/${projectId}/issues/export-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: abortController.signal,
      });

      if (abortController.signal.aborted) return;

      clearExportTimers();

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        toast.error(formatPdfExportErrorToast(errBody, "Export failed."));
        setExportStep(null);
        return;
      }

      setExportStep("done");

      const blob = await res.blob();
      if (abortController.signal.aborted) return;

      const fileName = `issues-export-${new Date().toISOString().slice(0, 10)}.pdf`;

      if (isMobilePdfDelivery()) {
        setPendingPdf({ blob, fileName });
        return;
      }

      await deliverPdfBlob(blob, fileName);
      setTimeout(() => setExportStep(null), 1_200);
    } catch (err) {
      clearExportTimers();
      if ((err as Error).name === "AbortError") {
        return;
      }
      toast.error(t("issueExportFailedGeneric"));
      setExportStep(null);
      setPendingPdf(null);
    } finally {
      if (exportAbortRef.current === abortController) {
        exportAbortRef.current = null;
      }
    }
  }, [exporting, sorted, activeTab, filters, sortOrder, projectId, projectName, isOnline, tOffline, t, tFieldReports, catalogIssueTypes, catalogParties, clearExportTimers]);

  const handleExportSelected = useCallback(() => {
    const ids = sorted
      .filter((issue) => effectiveSelectedIds.has(issue.id))
      .map((issue) => issue.id);
    void handleExport(ids);
  }, [sorted, effectiveSelectedIds, handleExport]);

  const handleSavePendingPdf = useCallback(async () => {
    if (!pendingPdf) return;
    try {
      await deliverPdfBlobOnUserGesture(pendingPdf.blob, pendingPdf.fileName);
      setPendingPdf(null);
      setExportStep(null);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        toast.error(t("issueExportSaveFailed"));
      }
    }
  }, [pendingPdf, t]);

  if (loading) {
    if (isMobileViewport) {
      return (
        <FieldLogListSkeleton
          loadingLabel={t("issueLoadingText")}
          embeddedInFieldReports={embeddedInFieldReports}
          showStandaloneChrome={!embeddedInFieldReports}
        />
      );
    }
    return (
      <div style={{ display: "flex", justifyContent: "center", paddingTop: 64, padding: "64px var(--page-padding-x)" }}>
        <span style={{ fontSize: 13, color: "var(--neutral-500)" }}>{t("issueLoadingText")}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, paddingTop: 64, padding: "64px var(--page-padding-x)" }}>
        <AlertTriangle size={20} style={{ color: "var(--error-600)" }} aria-hidden />
        <span style={{ fontSize: 13, color: "var(--neutral-600)" }}>{error}</span>
        <button
          type="button"
          onClick={() => { setLoading(true); fetchIssues(); }}
          style={{ fontSize: 13, color: "var(--primary-700)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>

      {/* ── PDF export progress overlay ─────────────────────────────────────── */}
      {exportStep !== null && (
        <ExportProgressOverlay
          step={exportStep}
          issueCount={exportProgressCount}
          onSavePdf={pendingPdf ? () => void handleSavePendingPdf() : undefined}
          savePdfLabel={pendingPdf ? t("issueExportSavePdf") : undefined}
          savePdfHint={pendingPdf ? t("issueExportSavePdfHint") : undefined}
          onCancel={exportStep !== "done" ? handleCancelExport : undefined}
          cancelLabel={t("issueExportCancel")}
        />
      )}

      {!embeddedInFieldReports && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "14px 16px 12px",
            borderBottom: "1px solid var(--neutral-200)",
            flexShrink: 0,
            backgroundColor: "var(--neutral-0)",
          }}
        >
          <AlertTriangle size={17} style={{ color: "var(--neutral-600)", flexShrink: 0 }} aria-hidden />
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--neutral-900)", flex: 1 }}>
            {t("issuesPageTitle")}
          </h1>
        </div>
      )}

      {/* ── Open / Resolved tab bar (standalone log page only) ── */}
      {!embeddedInFieldReports && (
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--neutral-200)",
          backgroundColor: "var(--neutral-0)",
          flexShrink: 0,
        }}
      >
        {(["open", "resolved"] as Tab[]).map((tab) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => handleTabChange(tab)}
              style={{
                flex: 1, padding: "14px 6px", fontSize: 13,
                fontWeight: isActive ? 700 : 400,
                color: isActive ? "var(--neutral-900)" : "var(--neutral-500)",
                background: "none", border: "none",
                borderBottom: `2px solid ${isActive ? "var(--neutral-900)" : "transparent"}`,
                cursor: "pointer", textAlign: "center",
                transition: "color 0.15s, border-color 0.15s",
              }}
            >
              {tab === "open" ? "Open" : "Resolved"}
              <span style={{ marginLeft: 5, fontSize: 11, fontWeight: 500, opacity: 0.55 }}>
                ({countLabel(tab)})
              </span>
            </button>
          );
        })}
      </div>
      )}

      {/* ── Toolbar: status pills (field reports) or sort-only row (standalone) ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "8px var(--page-padding-x)",
          borderBottom: "1px solid var(--neutral-100)",
          backgroundColor: "var(--neutral-0)",
          flexShrink: 0,
          gap: 6,
        }}
      >
        {embeddedInFieldReports ? (
          <>
            <div
              role="group"
              aria-label={tFieldReports("issueStatusFilterAria")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                flex: 1,
                minWidth: 0,
                overflowX: "auto",
              }}
            >
              {(["open", "resolved", "all"] as const).map((tab) => {
                const isActive = activeTab === tab;
                const label =
                  tab === "open"
                    ? tFieldReports("issueStatusOpen")
                    : tab === "resolved"
                      ? tFieldReports("issueStatusResolved")
                      : tFieldReports("issueStatusAll");
                return (
                  <button
                    key={tab}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => handleTabChange(tab)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                      padding: "5px 8px",
                      borderRadius: 999,
                      border: "none",
                      fontSize: 11,
                      fontWeight: isActive ? 700 : 500,
                      backgroundColor: isActive ? "var(--primary-100)" : "var(--neutral-100)",
                      color: isActive ? "var(--primary-600)" : "var(--neutral-600)",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    {label}
                    <span style={{ fontWeight: 500, opacity: 0.65 }}>({countLabel(tab)})</span>
                  </button>
                );
              })}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => setSortOrder((s) => (s === "newest" ? "oldest" : "newest"))}
                aria-label={sortOrder === "newest" ? t("issueSortNewestAria") : t("issueSortOldestAria")}
                title={sortOrder === "newest" ? t("issueSortNewestFirst") : t("issueSortOldestFirst")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 34,
                  width: 34,
                  borderRadius: 14,
                  border: "none",
                  backgroundColor: "var(--neutral-100)",
                  color: "var(--neutral-500)",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                <ArrowDownUp
                  size={14}
                  aria-hidden
                  style={{
                    transform: sortOrder === "oldest" ? "scaleY(-1)" : "none",
                    transition: "transform 0.15s",
                  }}
                />
              </button>

              <button
                type="button"
                onClick={() => setShowFilters(true)}
                aria-label={t("issueFilterToolbarAria")}
                title={t("issueFilterToolbarTitle")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 34,
                  width: 34,
                  borderRadius: 14,
                  border: "none",
                  backgroundColor: hasFilters ? "var(--orange-50)" : "var(--neutral-100)",
                  color: hasFilters ? "var(--orange-500)" : "var(--neutral-500)",
                  cursor: "pointer",
                  position: "relative",
                  flexShrink: 0,
                  transition: "all 0.12s",
                }}
              >
                <Filter size={14} aria-hidden />
                {filterCount > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      top: -5,
                      right: -5,
                      minWidth: 16,
                      height: 16,
                      borderRadius: 99,
                      backgroundColor: "var(--error-600)",
                      color: "var(--neutral-0)",
                      fontSize: 10,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "0 4px",
                    }}
                  >
                    {filterCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => (isSelectMode ? exitSelectMode() : enterSelectMode())}
                aria-label={t("selectMode")}
                aria-pressed={isSelectMode}
                title={t("selectMode")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 34,
                  width: 34,
                  borderRadius: 14,
                  border: "none",
                  backgroundColor: isSelectMode ? "var(--primary-100)" : "var(--neutral-100)",
                  color: isSelectMode ? "var(--primary-600)" : "var(--neutral-500)",
                  cursor: "pointer",
                  flexShrink: 0,
                  transition: "all 0.12s",
                }}
              >
                <CheckSquare size={14} aria-hidden />
              </button>

              {!isSelectMode && (
              <button
                type="button"
                onClick={() => void handleExport()}
                disabled={exporting || sorted.length === 0}
                aria-label={t("issueExportPdfAria")}
                title={t("issueExportPdfAria")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 34,
                  width: 34,
                  borderRadius: 14,
                  border: "none",
                  backgroundColor: "var(--neutral-100)",
                  color: "var(--neutral-500)",
                  cursor: sorted.length === 0 ? "not-allowed" : "pointer",
                  opacity: sorted.length === 0 ? 0.4 : 1,
                  flexShrink: 0,
                  transition: "all 0.12s",
                }}
              >
                <FileDown size={14} aria-hidden />
              </button>
              )}
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setSortOrder((s) => (s === "newest" ? "oldest" : "newest"))}
              aria-label={sortOrder === "newest" ? t("issueSortNewestAria") : t("issueSortOldestAria")}
              title={sortOrder === "newest" ? t("issueSortNewestFirst") : t("issueSortOldestFirst")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "5px 10px",
                borderRadius: 8,
                border: "1px solid var(--neutral-200)",
                backgroundColor: "var(--neutral-0)",
                color: "var(--neutral-600)",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              <ArrowDownUp
                size={13}
                aria-hidden
                style={{
                  transform: sortOrder === "oldest" ? "scaleY(-1)" : "none",
                  transition: "transform 0.15s",
                }}
              />
              {sortOrder === "newest" ? t("issueSortNewest") : t("issueSortOldest")}
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: "auto" }}>
              <button
                type="button"
                onClick={() => setShowFilters(true)}
                aria-label={t("issueFilterToolbarAria")}
                title={t("issueFilterToolbarTitle")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 34,
                  width: 34,
                  borderRadius: 14,
                  border: "none",
                  backgroundColor: hasFilters ? "var(--orange-50)" : "var(--neutral-100)",
                  color: hasFilters ? "var(--orange-500)" : "var(--neutral-500)",
                  cursor: "pointer",
                  position: "relative",
                  flexShrink: 0,
                  transition: "all 0.12s",
                }}
              >
                <Filter size={14} aria-hidden />
                {filterCount > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      top: -5,
                      right: -5,
                      minWidth: 16,
                      height: 16,
                      borderRadius: 99,
                      backgroundColor: "var(--error-600)",
                      color: "var(--neutral-0)",
                      fontSize: 10,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "0 4px",
                    }}
                  >
                    {filterCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => (isSelectMode ? exitSelectMode() : enterSelectMode())}
                aria-label={t("selectMode")}
                aria-pressed={isSelectMode}
                title={t("selectMode")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 34,
                  width: 34,
                  borderRadius: 14,
                  border: "none",
                  backgroundColor: isSelectMode ? "var(--primary-100)" : "var(--neutral-100)",
                  color: isSelectMode ? "var(--primary-600)" : "var(--neutral-500)",
                  cursor: "pointer",
                  flexShrink: 0,
                  transition: "all 0.12s",
                }}
              >
                <CheckSquare size={14} aria-hidden />
              </button>

              {!isSelectMode && (
              <button
                type="button"
                onClick={() => void handleExport()}
                disabled={exporting || sorted.length === 0}
                aria-label={t("issueExportPdfAria")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  height: 34,
                  padding: "0 12px",
                  borderRadius: 14,
                  border: "none",
                  backgroundColor: "var(--neutral-100)",
                  color: "var(--neutral-500)",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: sorted.length === 0 ? "not-allowed" : "pointer",
                  opacity: sorted.length === 0 ? 0.4 : 1,
                  flexShrink: 0,
                  transition: "all 0.12s",
                  whiteSpace: "nowrap" as const,
                }}
              >
                <FileDown size={13} aria-hidden />
                Export Log
              </button>
              )}
            </div>
          </>
        )}
      </div>

      {isSelectMode && !isMobileViewport && (
        <FieldLogExportSelectionBar
          selectedCount={effectiveSelectedIds.size}
          totalVisible={sorted.length}
          onSelectAll={selectAllVisible}
          onDeselectAll={deselectAll}
          onExport={handleExportSelected}
          onCancel={exitSelectMode}
          exporting={exporting}
          mobile={false}
          exportButtonLabel={t("issueExportSelectedPdf")}
          exportAriaLabel={t("issueExportSelectedAria")}
        />
      )}

      {isSelectMode && isMobileViewport && (
        <FieldLogExportSelectionBar
          selectedCount={effectiveSelectedIds.size}
          totalVisible={sorted.length}
          onSelectAll={selectAllVisible}
          onDeselectAll={deselectAll}
          onExport={handleExportSelected}
          onCancel={exitSelectMode}
          exporting={exporting}
          mobile
          exportButtonLabel={t("issueExportSelectedPdf")}
          exportAriaLabel={t("issueExportSelectedAria")}
        />
      )}

      {/* ── Issue list (grouped by location, same structure as observations) ── */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: isSelectMode && isMobileViewport
            ? "12px var(--page-padding-x) calc(env(safe-area-inset-bottom, 0px) + 120px)"
            : "12px var(--page-padding-x) calc(env(safe-area-inset-bottom, 0px) + 32px)",
        }}
      >
        {sorted.length === 0 ? (
          <div style={{ textAlign: "center", paddingTop: 56 }}>
            <p style={{ fontSize: 14, color: "var(--neutral-400)", margin: 0 }}>
              {embeddedInFieldReports
                ? activeTab === "all"
                  ? tFieldReports("issuesEmptyAll")
                  : activeTab === "open"
                    ? tFieldReports("issuesEmptyOpen")
                    : tFieldReports("issuesEmptyResolved")
                : activeTab === "open"
                  ? "No open issues"
                  : "No resolved issues"}
              {hasFilters && " matching your filters"}
            </p>
            {hasFilters && (
              <button
                type="button"
                onClick={() => setFilters(EMPTY_FILTERS)}
                style={{ marginTop: 10, fontSize: 13, color: "var(--primary-700)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Project scope */}
            {projectIssues.length > 0 && (
              <IssueGroup
                label="Project"
                count={projectIssues.length}
                open={projectOpen}
                onToggle={() => setProjectOpen((v) => !v)}
              >
                {projectIssues.map((issue) => renderIssueRow(issue))}
              </IssueGroup>
            )}

            {/* Building scope */}
            {Array.from(buildingGroups.entries()).map(([bKey, items]) => (
              <IssueGroup
                key={bKey}
                label={bKey}
                count={items.length}
                open={buildingOpen[bKey] ?? true}
                onToggle={() => setBuildingOpen((prev) => ({ ...prev, [bKey]: !(prev[bKey] ?? true) }))}
              >
                {items.map((issue) => renderIssueRow(issue))}
              </IssueGroup>
            ))}

            {/* Level scope */}
            {Array.from(levelGroups.entries()).map(([lKey, { label, items }]) => (
              <IssueGroup
                key={lKey}
                label={label}
                count={items.length}
                open={levelOpen[lKey] ?? true}
                onToggle={() => setLevelOpen((prev) => ({ ...prev, [lKey]: !(prev[lKey] ?? true) }))}
              >
                {items.map((issue) => renderIssueRow(issue))}
              </IssueGroup>
            ))}

            {/* Unit scope */}
            {Array.from(unitGroups.entries()).map(([uKey, { label, items }]) => (
              <IssueGroup
                key={uKey}
                label={label}
                count={items.length}
                open={unitOpen[uKey] ?? true}
                onToggle={() => setUnitOpen((prev) => ({ ...prev, [uKey]: !(prev[uKey] ?? true) }))}
              >
                {items.map((issue) => renderIssueRow(issue))}
              </IssueGroup>
            ))}
          </>
        )}
      </div>

      {/* ── Filter panel ── */}
      {showFilters && (
        <IssueLogFilterPanel
          filters={filters}
          options={{ scopeSubMap: panelScopeSubMap, availableAuthors, locationFilterOptions }}
          catalogIssueTypes={catalogIssueTypes}
          catalogParties={catalogParties}
          onChange={setFilters}
          onClose={() => setShowFilters(false)}
          onClear={() => setFilters(EMPTY_FILTERS)}
        />
      )}

      {/* ── Issue detail modal with prev/next navigation ── */}
      {selectedIndex !== null && sorted[selectedIndex] && (
        <IssueDetailModal
          key={sorted[selectedIndex].id}
          issue={sorted[selectedIndex]}
          unitContext={buildUnitContext(sorted[selectedIndex])}
          projectId={projectId}
          projectName={projectName}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          initialResolveOpen={resolveOpen}
          onClose={() => { setSelectedIndex(null); setResolveOpen(false); }}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
          onGroupResolved={handleGroupResolved}
          issueIndex={selectedIndex + 1}
          issueTotal={sorted.length}
          onPrev={selectedIndex > 0 ? () => setSelectedIndex((i) => (i !== null ? i - 1 : i)) : undefined}
          onNext={selectedIndex < sorted.length - 1 ? () => setSelectedIndex((i) => (i !== null ? i + 1 : i)) : undefined}
        />
      )}

      <style>{`
        @media (max-width: 640px) { .hide-mobile { display: none !important; } }
      `}</style>
    </div>
  );
}
