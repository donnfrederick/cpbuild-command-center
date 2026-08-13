"use client";

import { useState, useCallback, useRef, useEffect, useId, useMemo } from "react";
import {
  List, LayoutGrid, MapPin, Expand, Filter, Split,
  Building2, CheckSquare,
} from "lucide-react";
import { SearchInput } from "@/components/shared/SearchInput";
import { ToolbarActionButton } from "@/components/shared/ToolbarActionButton";
import {
  FilterAccordionCard,
  FilterChip,
  FilterPanelAccordionStack,
  FilterPanelCheckboxRow,
  FilterPanelEmptyState,
  FilterPanelFooterActions,
  FilterPanelInlineSearch,
  FilterPanelListRow,
  FilterPanelMetaLine,
  FilterPanelScrollList,
  FilterPanelSection,
  FilterPanelShell,
  FilterPanelSummary,
  FilterPanelSummaryDivider,
  FilterPanelSummaryStat,
  FilterPill,
  FilterPillGroup,
} from "@/components/shared/filterPanel";
import { useUnitsTranslator } from "@/lib/units-i18n";
import { toast } from "sonner";
import { UnitCards, unitTypeColor } from "@/components/projects/UnitCards";
import { BulkActionsBar } from "@/components/projects/BulkActionsBar";
import { BulkActionsSheet } from "@/components/projects/BulkActionsSheet";
import { BulkRevertOverlay } from "@/components/projects/BulkRevertOverlay";
import type { ScopedRow } from "@/components/projects/BulkActionsSheet";
import type { BulkStatusUndoPayload } from "@/lib/bulk-status-undo-client";
import { performBulkStatusUndo } from "@/lib/bulk-status-undo-client";
import type { FilterOptions, ActiveFilters, ScopeTypeOption } from "@/components/projects/UnitCards";
import type { LocationKindFilter } from "@/lib/location-kind-filter";
import { getCachedSubItems, ensureSubItemsFetched } from "@/components/projects/SubcontractorPicker";
import type { SubItem } from "@/components/projects/SubcontractorPicker";
import { SubScopesModal } from "@/components/projects/SubScopesModal";
import { SubScopeEntrySheet } from "@/components/projects/SubScopeEntrySheet";
import { SubScopeManagementPanel } from "@/components/projects/SubScopeManagementPanel";
import { ObservationDetailModal } from "@/components/projects/ObservationDetailModal";
import type { ObsSummary } from "@/components/projects/UnitCards";
import {
  readLocationsListFiltersSession,
  writeLocationsListFiltersSession,
} from "@/lib/locations-list-filters-session";
import {
  isInspectionOverlayChromeSuppressed,
  subscribeInspectionOverlayChrome,
} from "@/lib/inspections/inspection-overlay-chrome";
import {
  effectiveBoolean,
  nextPinnedBoolean,
} from "@/lib/projects/preserve-mobile-unit-chrome";
import {
  resolveIssueTypeLabel,
  resolvePartyLabel,
  useIssueCatalog,
} from "@/lib/issues/use-issue-catalog";
import type {
  PublicIssueTypeCatalogItem,
  PublicResponsiblePartyCatalogItem,
} from "@/lib/issues/issue-catalog";
// Re-export so consumers don't need to import directly from UnitCards.
export type { FilterOptions, ActiveFilters, ScopeTypeOption };

const EMPTY_FILTERS: ActiveFilters = {
  stages: [],
  scopeTypeNames: [],
  scopeSubNames: [],
  unitTypes: [],
  locationKinds: [],
  buildings: [],
  levels: [],
  buildPhases: [],
  areas: [],
  issueTypes: [],
  responsibleParties: [],
  issueStatuses: [],
  issueBlocking: null,
  issueScopeTypeNames: [],
  issueSubScopeNames: [],
  inspectionStatuses: [],
  calibrationStatuses: [],
  subcontractorAssigned: null,
  subcontractorIds: [],
  unitsWithIssuesOnly: false,
};

function activeFilterCount(f: ActiveFilters): number {
  return (
    f.stages.length +
    f.scopeTypeNames.length +
    f.scopeSubNames.length +
    f.unitTypes.length +
    (f.locationKinds ?? []).length +
    f.buildings.length +
    f.levels.length +
    f.buildPhases.length +
    f.areas.length +
    f.issueTypes.length +
    f.responsibleParties.length +
    f.issueStatuses.length +
    (f.issueBlocking !== null ? 1 : 0) +
    f.issueScopeTypeNames.length +
    f.issueSubScopeNames.length +
    (f.inspectionStatuses ?? []).length +
    (f.calibrationStatuses ?? []).length +
    (f.subcontractorAssigned !== null ? 1 : 0) +
    (f.subcontractorIds ?? []).length +
    (f.unitsWithIssuesOnly ? 1 : 0)
  );
}


// ── Toolbar button ─────────────────────────────────────────────────────────────

function ToolbarBtn({
  label,
  icon,
  active,
  badge,
  onClick,
  tooltip,
  ariaLabel,
  disabled,
  variant = "default",
}: {
  label?: string;
  icon?: React.ReactNode;
  active?: boolean;
  badge?: number;
  onClick: () => void;
  tooltip?: string;
  /** When set, used for aria-label (e.g. short action); tooltip still used for title. */
  ariaLabel?: string;
  disabled?: boolean;
  variant?: "default" | "filter";
}) {
  return (
    <ToolbarActionButton
      label={label}
      icon={icon}
      active={active}
      badge={badge}
      onClick={onClick}
      tooltip={tooltip}
      ariaLabel={ariaLabel}
      disabled={disabled}
      variant={variant}
      className={label ? "units-toolbar-btn" : "units-toolbar-icon-btn"}
    />
  );
}

// ── Filter Panel ───────────────────────────────────────────────────────────────

function FilterPanel({
  filters,
  options,
  onChange,
  onClose,
  onClear,
  unitCounts,
  issueTypeCatalog,
  partyCatalog,
}: {
  filters: ActiveFilters;
  options: FilterOptions;
  onChange: (f: ActiveFilters) => void;
  onClose: () => void;
  onClear: () => void;
  unitCounts?: {
    filteredUnits: number; totalUnits: number;
    filteredScopes: number; totalScopes: number;
  } | null;
  issueTypeCatalog: PublicIssueTypeCatalogItem[];
  partyCatalog: PublicResponsiblePartyCatalogItem[];
}) {
  const t = useUnitsTranslator();
  const issueTypeCodes = useMemo(
    () => issueTypeCatalog.map((row) => row.code),
    [issueTypeCatalog],
  );
  const partyCodes = useMemo(
    () => partyCatalog.map((row) => row.code),
    [partyCatalog],
  );

  // Buildings that are expanded to show their levels
  const [expandedBuildings, setExpandedBuildings] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const b of filters.buildings) s.add(b);
    for (const lk of filters.levels) s.add(lk.split("::")[0]);
    return s;
  });

  // Unit Type inline search
  const [unitTypeSearch, setUnitTypeSearch] = useState("");

  // Subcontractor name inline search
  const [subcontractorSearch, setSubcontractorSearch] = useState("");

  // Subcontractor list resolved from the SubcontractorPicker cache
  const [subItems, setSubItems] = useState<SubItem[]>(() => getCachedSubItems() ?? []);
  useEffect(() => {
    if (getCachedSubItems() !== null) return;
    ensureSubItemsFetched().then(() => {
      setSubItems(getCachedSubItems() ?? []);
    });
  }, []);

  // Issue accordion groups
  const [expandedIssueGroups, setExpandedIssueGroups] = useState<Set<string>>(() => {
    const s = new Set<string>();
    if (filters.issueStatuses.length > 0) s.add("status");
    if (filters.issueTypes.length > 0) s.add("type");
    if (filters.responsibleParties.length > 0) s.add("party");
    if (filters.issueBlocking !== null) s.add("blocking");
    if (filters.issueScopeTypeNames.length > 0) s.add("issueScope");
    if (filters.issueSubScopeNames.length > 0) s.add("issueSubScope");
    return s;
  });

  function toggleIssueGroup(group: string) {
    setExpandedIssueGroups((prev) => {
      if (prev.has(group)) {
        // Already open — close it
        const next = new Set(prev);
        next.delete(group);
        return next;
      }
      // Open this one and close all others (exclusive accordion)
      return new Set([group]);
    });
  }

  const filterCount = activeFilterCount(filters);

  function toggle<K extends "stages" | "scopeTypeNames" | "unitTypes" | "buildings" | "buildPhases" | "areas">(
    key: K,
    value: string
  ) {
    const arr = filters[key] as string[];
    const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
    onChange({ ...filters, [key]: next });
  }

  function toggleLevel(building: string, level: string) {
    const key = `${building}::${level}`;
    const next = filters.levels.includes(key)
      ? filters.levels.filter((v) => v !== key)
      : [...filters.levels, key];
    onChange({ ...filters, levels: next });
  }

  function toggleLocationKind(kind: LocationKindFilter) {
    const arr = filters.locationKinds;
    const next = arr.includes(kind) ? arr.filter((k) => k !== kind) : [...arr, kind];
    onChange({ ...filters, locationKinds: next });
  }

  function toggleBuildingExpand(b: string) {
    setExpandedBuildings((prev) => {
      const next = new Set(prev);
      if (next.has(b)) next.delete(b);
      else next.add(b);
      return next;
    });
  }

  const STATUSES = [
    { key: "STAGING", label: t("filterStageInStaging") },
    { key: "ASSEMBLY", label: t("filterStageInAssembly") },
    { key: "INSTALL_IN_PROGRESS", label: t("filterStageInstallInProgress") },
    { key: "INSTALL_COMPLETE_SUB", label: t("filterStageInstallCompleteSub") },
    { key: "INSTALL_COMPLETE", label: t("filterStageInstallCompleteVerified") },
  ];

  return (
    <FilterPanelShell
      title={t("filterTitle")}
      subtitle={t("filterSubtitle")}
      closeAriaLabel={t("filterClose")}
      onClose={onClose}
      summary={
        unitCounts && unitCounts.totalUnits > 0 ? (
          <FilterPanelSummary>
            <FilterPanelSummaryStat
              filtered={unitCounts.filteredUnits}
              total={unitCounts.totalUnits}
              label={t("filterSummaryLocations", {
                filtered: unitCounts.filteredUnits.toLocaleString(),
                total: unitCounts.totalUnits.toLocaleString(),
              })}
            />
            <FilterPanelSummaryDivider />
            <FilterPanelSummaryStat
              filtered={unitCounts.filteredScopes}
              total={unitCounts.totalScopes}
              label={t("filterSummaryScopes", {
                filtered: unitCounts.filteredScopes.toLocaleString(),
                total: unitCounts.totalScopes.toLocaleString(),
              })}
            />
          </FilterPanelSummary>
        ) : undefined
      }
      footer={(close) => (
        <FilterPanelFooterActions
          clearLabel={t("filterClearAll")}
          applyLabel={t("filterDone")}
          onClear={onClear}
          onApply={close}
          clearDisabled={filterCount === 0}
        />
      )}
    >

      <FilterPanelSection label={t("filterIssues")}>
        <FilterPillGroup>
          <FilterPill
            label={t("filterUnitsWithIssues")}
            active={filters.unitsWithIssuesOnly}
            onClick={() =>
              onChange({
                ...filters,
                unitsWithIssuesOnly: !filters.unitsWithIssuesOnly,
              })
            }
          />
        </FilterPillGroup>
        <FilterPanelAccordionStack>
          <FilterAccordionCard
            label={t("filterIssueStatus")}
            expanded={expandedIssueGroups.has("status")}
            onToggle={() => toggleIssueGroup("status")}
            activeCount={filters.issueStatuses.length}
            previewLabels={filters.issueStatuses.map((s) =>
              s === "OPEN" ? t("filterIssueStatusOpen") : t("filterIssueStatusResolved"),
            )}
          >
            <div className="filter-panel-chip-row">
              {(["OPEN", "RESOLVED"] as const).map((status) => (
                <FilterChip
                  key={status}
                  label={status === "OPEN" ? t("filterIssueStatusOpen") : t("filterIssueStatusResolved")}
                  active={filters.issueStatuses.includes(status)}
                  onClick={() => {
                    const next = filters.issueStatuses.includes(status)
                      ? filters.issueStatuses.filter((v) => v !== status)
                      : [...filters.issueStatuses, status];
                    onChange({ ...filters, issueStatuses: next });
                  }}
                />
              ))}
            </div>
          </FilterAccordionCard>

          <FilterAccordionCard
            label={t("filterIssueType")}
            expanded={expandedIssueGroups.has("type")}
            onToggle={() => toggleIssueGroup("type")}
            activeCount={filters.issueTypes.length}
            previewLabels={filters.issueTypes.map((type) =>
              resolveIssueTypeLabel(type, issueTypeCatalog),
            )}
          >
            <div className="filter-panel-chip-row">
              {issueTypeCodes.map((type) => (
                <FilterChip
                  key={type}
                  label={resolveIssueTypeLabel(type, issueTypeCatalog)}
                  active={filters.issueTypes.includes(type)}
                  onClick={() => {
                    const next = filters.issueTypes.includes(type)
                      ? filters.issueTypes.filter((v) => v !== type)
                      : [...filters.issueTypes, type];
                    onChange({ ...filters, issueTypes: next });
                  }}
                />
              ))}
            </div>
          </FilterAccordionCard>

          <FilterAccordionCard
            label={t("filterResponsibleParty")}
            expanded={expandedIssueGroups.has("party")}
            onToggle={() => toggleIssueGroup("party")}
            activeCount={filters.responsibleParties.length}
            previewLabels={filters.responsibleParties.map((p) =>
              resolvePartyLabel(p, partyCatalog),
            )}
          >
            <div className="filter-panel-chip-row">
              {partyCodes.map((party) => (
                <FilterChip
                  key={party}
                  label={resolvePartyLabel(party, partyCatalog)}
                  active={filters.responsibleParties.includes(party)}
                  onClick={() => {
                    const next = filters.responsibleParties.includes(party)
                      ? filters.responsibleParties.filter((v) => v !== party)
                      : [...filters.responsibleParties, party];
                    onChange({ ...filters, responsibleParties: next });
                  }}
                />
              ))}
            </div>
          </FilterAccordionCard>

          <FilterAccordionCard
            label={t("filterIssueBlockingLabel")}
            expanded={expandedIssueGroups.has("blocking")}
            onToggle={() => toggleIssueGroup("blocking")}
            activeCount={filters.issueBlocking !== null ? 1 : 0}
            previewLabels={
              filters.issueBlocking === true
                ? [t("filterIssueBlocking")]
                : filters.issueBlocking === false
                  ? [t("filterIssueNonBlocking")]
                  : []
            }
          >
            <div className="filter-panel-chip-row">
              <FilterChip
                label={t("filterIssueBlocking")}
                active={filters.issueBlocking === true}
                variant="blocking"
                onClick={() =>
                  onChange({
                    ...filters,
                    issueBlocking: filters.issueBlocking === true ? null : true,
                  })
                }
              />
              <FilterChip
                label={t("filterIssueNonBlocking")}
                active={filters.issueBlocking === false}
                variant="nonblocking"
                onClick={() =>
                  onChange({
                    ...filters,
                    issueBlocking: filters.issueBlocking === false ? null : false,
                  })
                }
              />
            </div>
          </FilterAccordionCard>
        </FilterPanelAccordionStack>
      </FilterPanelSection>

      {options.scopeTypeNames.length > 0 && (
        <FilterPanelSection label={t("filterScope")}>
          <FilterPanelAccordionStack>
            {options.scopeTypeNames.map((scopeName) => {
              const subScopes = options.scopeSubMap[scopeName] ?? [];
              const isSelected = filters.scopeTypeNames.includes(scopeName);
              const hasSubScopes = subScopes.length > 0;
              const selectedSubCount = subScopes.filter((ss) => filters.scopeSubNames.includes(ss)).length;
              return (
                <div key={scopeName}>
                  <button
                    type="button"
                    onClick={() => {
                      const nextScopes = isSelected
                        ? filters.scopeTypeNames.filter((v) => v !== scopeName)
                        : [...filters.scopeTypeNames, scopeName];
                      const nextSubs = isSelected
                        ? filters.scopeSubNames.filter((ss) => !subScopes.includes(ss))
                        : filters.scopeSubNames;
                      onChange({ ...filters, scopeTypeNames: nextScopes, scopeSubNames: nextSubs });
                    }}
                    className={`filter-panel-scope-row${isSelected ? " is-selected" : ""}${isSelected && hasSubScopes ? " has-subs" : ""}`}
                  >
                    <span className="filter-panel-scope-row__box" aria-hidden>
                      {isSelected && (
                        <svg width="11" height="8" viewBox="0 0 11 8" fill="none">
                          <path
                            d="M1 4L4 7L10 1"
                            stroke="var(--color-text-inverse)"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                    <span className="filter-panel-scope-row__label">{scopeName}</span>
                    {hasSubScopes && !isSelected && (
                      <span className="filter-panel-scope-row__meta">
                        {t("filterScopeSubCount", { count: subScopes.length })}
                      </span>
                    )}
                    {hasSubScopes && isSelected && selectedSubCount > 0 && (
                      <span className="filter-panel-scope-row__badge">
                        {t("filterScopeSelectedCount", { count: selectedSubCount })}
                      </span>
                    )}
                  </button>
                  {isSelected && hasSubScopes && (
                    <div className="filter-panel-scope-subs">
                      <div className="filter-panel-scope-subs__hint">{t("filterScopeSubHint")}</div>
                      <div className="filter-panel-scope-subs__list">
                        {subScopes.map((ss) => {
                          const ssChecked = filters.scopeSubNames.includes(ss);
                          return (
                            <button
                              key={ss}
                              type="button"
                              onClick={() => {
                                const next = ssChecked
                                  ? filters.scopeSubNames.filter((v) => v !== ss)
                                  : [...filters.scopeSubNames, ss];
                                onChange({ ...filters, scopeSubNames: next });
                              }}
                              className={`filter-panel-scope-sub-row${ssChecked ? " is-checked" : ""}`}
                            >
                              <span className="filter-panel-scope-sub-row__box" aria-hidden>
                                {ssChecked && (
                                  <svg width="10" height="7" viewBox="0 0 10 7" fill="none">
                                    <path
                                      d="M1 3.5L3.5 6L9 1"
                                      stroke="var(--color-text-inverse)"
                                      strokeWidth="1.8"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                )}
                              </span>
                              <span className="filter-panel-scope-sub-row__label">{ss}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </FilterPanelAccordionStack>
        </FilterPanelSection>
      )}

      <FilterPanelSection label={t("filterStage")}>
        <FilterPillGroup>
          {STATUSES.map(({ key, label }) => (
            <FilterPill
              key={key}
              label={label}
              active={filters.stages.includes(key)}
              onClick={() => toggle("stages", key)}
            />
          ))}
        </FilterPillGroup>
      </FilterPanelSection>

      <FilterPanelSection label={t("filterClearInspection")}>
        <FilterPillGroup>
          {([
            { key: "PASSED", label: t("filterInspectionPassed") },
            { key: "FAILED", label: t("filterInspectionFailed") },
          ] as const).map(({ key, label }) => (
            <FilterPill
              key={key}
              label={label}
              active={(filters.inspectionStatuses ?? []).includes(key)}
              onClick={() => {
                const cur = filters.inspectionStatuses ?? [];
                const next = cur.includes(key)
                  ? cur.filter((v) => v !== key)
                  : [...cur, key];
                onChange({ ...filters, inspectionStatuses: next });
              }}
            />
          ))}
        </FilterPillGroup>
      </FilterPanelSection>

      <FilterPanelSection label={t("filterCalibrationInspection")}>
        <FilterPillGroup>
          {([
            { key: "PASSED", label: t("filterInspectionPassed") },
            { key: "FAILED", label: t("filterInspectionFailed") },
          ] as const).map(({ key, label }) => (
            <FilterPill
              key={key}
              label={label}
              active={(filters.calibrationStatuses ?? []).includes(key)}
              onClick={() => {
                const cur = filters.calibrationStatuses ?? [];
                const next = cur.includes(key)
                  ? cur.filter((v) => v !== key)
                  : [...cur, key];
                onChange({ ...filters, calibrationStatuses: next });
              }}
            />
          ))}
        </FilterPillGroup>
      </FilterPanelSection>

      <FilterPanelSection label={t("filterSubcontractor")}>
        <FilterPillGroup>
          {([
            { key: "yes", label: t("filterSubcontractorAssigned") },
            { key: "no", label: t("filterSubcontractorNotAssigned") },
          ] as const).map(({ key, label }) => (
            <FilterPill
              key={key}
              label={label}
              active={filters.subcontractorAssigned === key}
              onClick={() =>
                onChange({
                  ...filters,
                  subcontractorAssigned: filters.subcontractorAssigned === key ? null : key,
                })
              }
            />
          ))}
        </FilterPillGroup>

        {options.subcontractorIds.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <FilterPanelInlineSearch
              value={subcontractorSearch}
              onChange={setSubcontractorSearch}
              placeholder={t("filterSubcontractorSearch")}
              clearAriaLabel={t("filterClose")}
            />
            {(() => {
              const projectSubs: { id: string; name: string }[] = options.subcontractorIds
                .map((id) => {
                  const found = subItems.find((s) => s.id === id);
                  return { id, name: found?.name ?? id };
                })
                .sort((a, b) => a.name.localeCompare(b.name));

              const q = subcontractorSearch.trim().toLowerCase();
              const visibleSubs = q
                ? projectSubs.filter((s) => s.name.toLowerCase().includes(q))
                : projectSubs;
              const total = projectSubs.length;
              const selectedCount = (filters.subcontractorIds ?? []).length;
              return (
                <>
                  <FilterPanelMetaLine>
                    {q ? (
                      <>
                        <span className="filter-panel-meta-line__strong">{visibleSubs.length}</span>
                        <span>{t("filterSubcontractorOf")}</span>
                        <span className="filter-panel-meta-line__strong">{total}</span>
                        <span>{t("filterSubcontractorLabel")}</span>
                      </>
                    ) : (
                      <>
                        {selectedCount > 0 && (
                          <>
                            <span className="filter-panel-meta-line__accent">{selectedCount}</span>
                            <span>{t("filterSubcontractorSelected")}</span>
                            <span aria-hidden> · </span>
                          </>
                        )}
                        <span className="filter-panel-meta-line__strong">{total}</span>
                        <span>{t("filterSubcontractorLabel")}</span>
                      </>
                    )}
                  </FilterPanelMetaLine>
                  <FilterPanelScrollList maxHeight={240}>
                    {visibleSubs.length === 0 ? (
                      <FilterPanelEmptyState>{t("filterSubcontractorNoMatch")}</FilterPanelEmptyState>
                    ) : (
                      visibleSubs.map(({ id, name }) => {
                        const active = (filters.subcontractorIds ?? []).includes(id);
                        return (
                          <FilterPanelListRow
                            key={id}
                            label={name}
                            active={active}
                            onClick={() => {
                              const cur = filters.subcontractorIds ?? [];
                              onChange({
                                ...filters,
                                subcontractorIds: active
                                  ? cur.filter((i) => i !== id)
                                  : [...cur, id],
                              });
                            }}
                            style={
                              active
                                ? {
                                    background: "var(--control-active-bg)",
                                    color: "var(--control-active-fg)",
                                  }
                                : undefined
                            }
                          />
                        );
                      })
                    )}
                  </FilterPanelScrollList>
                </>
              );
            })()}
          </div>
        )}
      </FilterPanelSection>

      {options.buildings.length > 0 && (
        <FilterPanelSection label={t("filterLocation")}>
          <FilterPanelAccordionStack>
            {options.buildings.map((b) => {
              const expanded = expandedBuildings.has(b);
              const levels = options.buildingLevels[b] ?? [];
              const wholeSelected = filters.buildings.includes(b);
              const selectedLevelCount = levels.filter((l) =>
                filters.levels.includes(`${b}::${l}`),
              ).length;
              const anyActive = wholeSelected || selectedLevelCount > 0;
              const buildingLabel = b === "—" ? t("buildingNotSet") : b;
              const activeCount = wholeSelected ? 1 : selectedLevelCount;

              return (
                <FilterAccordionCard
                  key={b}
                  label={buildingLabel}
                  expanded={expanded}
                  onToggle={() => toggleBuildingExpand(b)}
                  activeCount={anyActive ? activeCount : 0}
                  previewLabels={wholeSelected && !expanded ? [t("filterBuildingAll")] : []}
                  leadingIcon={<Building2 size={15} className="filter-panel-building-icon" aria-hidden />}
                >
                  <FilterPanelScrollList maxHeight={240}>
                    <FilterPanelCheckboxRow
                      label={t("filterAllInBuilding", { building: buildingLabel })}
                      checked={wholeSelected}
                      onToggle={() => toggle("buildings", b)}
                    />
                    {levels.map((level) => {
                      const levelLabel = level === "—" ? t("levelNotSet") : level;
                      return (
                        <FilterPanelCheckboxRow
                          key={level}
                          label={levelLabel}
                          checked={filters.levels.includes(`${b}::${level}`)}
                          onToggle={() => toggleLevel(b, level)}
                        />
                      );
                    })}
                  </FilterPanelScrollList>
                </FilterAccordionCard>
              );
            })}
          </FilterPanelAccordionStack>
        </FilterPanelSection>
      )}

      {options.buildPhases.length > 0 && (
        <FilterPanelSection label={t("filterBuildPhase")}>
          <FilterPanelScrollList maxHeight={200}>
            {options.buildPhases.map((phase) => (
              <FilterPanelListRow
                key={phase}
                label={phase}
                active={filters.buildPhases.includes(phase)}
                onClick={() => toggle("buildPhases", phase)}
              />
            ))}
          </FilterPanelScrollList>
        </FilterPanelSection>
      )}

      {options.areas.length > 0 && (
        <FilterPanelSection label={t("filterArea")}>
          <FilterPanelScrollList maxHeight={240}>
            {options.areas.map((area) => (
              <FilterPanelListRow
                key={area}
                label={area}
                active={filters.areas.includes(area)}
                onClick={() => toggle("areas", area)}
              />
            ))}
          </FilterPanelScrollList>
        </FilterPanelSection>
      )}

      <FilterPanelSection label={t("filterUnitType")}>
        <FilterPanelCheckboxRow
          label={t("filterAllCommonAreas")}
          checked={filters.locationKinds.includes("common_areas")}
          onToggle={() => toggleLocationKind("common_areas")}
        />
        <FilterPanelCheckboxRow
          label={t("filterAllCustomLocations")}
          checked={filters.locationKinds.includes("custom_locations")}
          onToggle={() => toggleLocationKind("custom_locations")}
        />

        <p
          style={{
            margin: "14px 0 8px",
            fontSize: 11,
            fontWeight: 700,
            color: "var(--neutral-500)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {t("filterUnitsSection")}
        </p>
        <FilterPanelCheckboxRow
          label={t("filterAllUnits")}
          checked={filters.locationKinds.includes("units")}
          onToggle={() => toggleLocationKind("units")}
        />

      {options.unitTypes.length > 0 && (
        <>
          <FilterPanelInlineSearch
            value={unitTypeSearch}
            onChange={setUnitTypeSearch}
            placeholder={t("filterUnitTypeSearch")}
            clearAriaLabel={t("filterClose")}
          />
          {(() => {
            const q = unitTypeSearch.trim().toLowerCase();
            const visible = q
              ? options.unitTypes.filter((ut) => ut.toLowerCase().includes(q))
              : options.unitTypes;
            const total = options.unitTypes.length;
            const selectedCount = filters.unitTypes.length;
            return (
              <>
                <FilterPanelMetaLine>
                  {q ? (
                    <>
                      <span className="filter-panel-meta-line__strong">{visible.length}</span>
                      <span>{t("filterUnitTypeOf")}</span>
                      <span className="filter-panel-meta-line__strong">{total}</span>
                      <span>{t("filterUnitTypeLabel")}</span>
                    </>
                  ) : (
                    <>
                      {selectedCount > 0 && (
                        <>
                          <span className="filter-panel-meta-line__accent">{selectedCount}</span>
                          <span>{t("filterUnitTypeSelected")}</span>
                          <span aria-hidden> · </span>
                        </>
                      )}
                      <span className="filter-panel-meta-line__strong">{total}</span>
                      <span>{t("filterUnitTypeLabel")}</span>
                    </>
                  )}
                </FilterPanelMetaLine>
                <FilterPanelScrollList maxHeight={260}>
                  {visible.length === 0 ? (
                    <FilterPanelEmptyState>{t("filterUnitTypeNoMatch")}</FilterPanelEmptyState>
                  ) : (
                    visible.map((ut) => {
                      const active = filters.unitTypes.includes(ut);
                      const { bg, text } = unitTypeColor(ut);
                      return (
                        <FilterPanelListRow
                          key={ut}
                          label={ut}
                          active={active}
                          onClick={() => toggle("unitTypes", ut)}
                          leading={
                            <span
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: "50%",
                                flexShrink: 0,
                                backgroundColor: text,
                              }}
                              aria-hidden
                            />
                          }
                          style={
                            active
                              ? { backgroundColor: bg, color: text }
                              : undefined
                          }
                        />
                      );
                    })
                  )}
                </FilterPanelScrollList>
              </>
            );
          })()}
        </>
      )}
      </FilterPanelSection>
    </FilterPanelShell>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

interface UnitsPageClientProps {
  projectId: string;
  /** Whether the current user may update scopeStage, scopeStatus, and inspectionStatus.
   * True for ADMIN, DESIGNER, DEVELOPER, INSTALL_MANAGER, INSTALL_DIRECTOR. False for CONTROLS_MANAGER and
   * read-only roles. Defaults to false so the component is safe without the prop. */
  canManageStatus?: boolean;
  /** Whether the current user may create sub-scopes (MANAGE_PROJECTS permission).
   * Gates the Sub-scopes toolbar button. Defaults to false. */
  canManageSubScopes?: boolean;
  /** Whether the current user may perform calibration inspections (CALIBRATE_INSPECTION permission). */
  canCalibrate?: boolean;
  /** Whether the current user can open Location Builder (VIEW_UPM permission). */
  canViewUpm?: boolean;
  /** Whether the current user can view GPS / heat map on activity surfaces (VIEW_LOCATION_TRACKING). */
  canViewLocationTracking?: boolean;
  /** ID of the authenticated user — threaded to IssueDetailModal for resolve/reopen gating. */
  currentUserId?: string;
  /** Role of the authenticated user — threaded to IssueDetailModal for resolve/reopen gating. */
  currentUserRole?: string;
}

export function UnitsPageClient({
  projectId,
  canManageStatus = false,
  canManageSubScopes = false,
  canCalibrate = false,
  canViewUpm = false,
  canViewLocationTracking = false,
  currentUserId,
  currentUserRole,
}: UnitsPageClientProps) {
  const t = useUnitsTranslator();
  const { issueTypes: issueTypeCatalog, responsibleParties: partyCatalog } =
    useIssueCatalog(projectId);
  // Toolbar state
  const [viewMode, setViewMode] = useState<"list" | "grid">("grid");
  const [groupByLocation, setGroupByLocation] = useState(false);
  const [expandAll, setExpandAll] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState("");

  // Filter state — always starts as EMPTY_FILTERS on both server and client
  // to avoid hydration mismatches. sessionStorage restore and the deep-link
  // ?inspectionStatus param are applied in useEffects after the first render.
  const [filters, setFilters] = useState<ActiveFilters>(EMPTY_FILTERS);
  /** False until sessionStorage restore finishes — prevents wiping saved filters on mount. */
  const [filtersHydrated, setFiltersHydrated] = useState(false);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    scopeTypeNames: [],
    scopeSubMap: {},
    unitTypes: [],
    issueScopeSubMap: {},
    buildings: [],
    buildingLevels: {},
    scopeTypesByUnitType: {},
    issueScopeTypeNames: [],
    issueSubScopeNames: [],
    subcontractorIds: [],
    buildPhases: [],
    areas: [],
  });
  const [unitsScrollRoot, setUnitsScrollRoot] = useState<HTMLDivElement | null>(null);

  type SubScopesView = null | "menu" | "manage" | "configure";
  const [subScopesView, setSubScopesView] = useState<SubScopesView>(null);
  // Incrementing this triggers a silent background re-fetch in UnitCards without resetting UI state.
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Restore search + filter selections from sessionStorage (per project).
  useEffect(() => {
    setFiltersHydrated(false);
    setSearch("");
    setFilters(EMPTY_FILTERS);

    const saved = readLocationsListFiltersSession(projectId);
    if (saved) {
      setSearch(saved.searchQuery);
      setFilters(saved.filters);
    }
    setFiltersHydrated(true);
  }, [projectId]);

  // Persist filter state for the browser session (survives navigation away and back).
  useEffect(() => {
    if (!filtersHydrated) return;
    writeLocationsListFiltersSession(projectId, { searchQuery: search, filters });
  }, [filtersHydrated, projectId, search, filters]);

  // ── Deep-link: ?inspectionStatus=PASSED|FAILED|READY ─────────────────────
  // Applied after first render (client-only) to avoid server/client hydration
  // mismatches that would occur if we read window.location in useState init.
  // Runs after session restore so URL param overrides restored inspectionStatuses.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const status = p.get("inspectionStatus");
    if (status === "PASSED" || status === "FAILED" || status === "READY") {
      setFilters((prev) => ({ ...prev, inspectionStatuses: [status] }));
    }
  }, []);

  // ── Observation deep-link (from notification @mention) ────────────────────
  const [deepLinkObs, setDeepLinkObs] = useState<ObsSummary | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const obsId = params.get("openObservation");
    if (!obsId) return;
    void fetch(`/api/projects/${projectId}/observations/${obsId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((obs: ObsSummary | null) => { if (obs) setDeepLinkObs(obs); })
      .catch(() => null);
  }, [projectId]);

  // ── Tour simulation: Location Builder upload overlay ─────────────────────────
  // When tour:simulate-field-tracker-upload fires, show a progress overlay
  // for 2.8 s to simulate parsing a Location Builder spreadsheet, then fade out
  // to reveal the already-loaded unit rows.
  // event.detail.lang drives which language the overlay text appears in.
  const [tourUploading, setTourUploading] = useState(false);
  const [tourProgress, setTourProgress] = useState(0);
  const [tourOverlayLang, setTourOverlayLang] = useState<"en" | "es">("en");

  useEffect(() => {
    let progressInterval: ReturnType<typeof setInterval> | null = null;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    function handleSimulateUpload(e: Event) {
      // Clear any already-running animation before starting a new one
      if (progressInterval !== null) { clearInterval(progressInterval); progressInterval = null; }
      if (hideTimer !== null) { clearTimeout(hideTimer); hideTimer = null; }

      const lang = (e as CustomEvent<{ lang?: string }>).detail?.lang === "es" ? "es" : "en";
      setTourOverlayLang(lang);
      setTourUploading(true);
      setTourProgress(0);

      // Fill progress bar from 0 → 100 over ~2.4 s
      const startTime = Date.now();
      const duration = 2400;
      progressInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const pct = Math.min(100, Math.round((elapsed / duration) * 100));
        setTourProgress(pct);
        if (pct >= 100 && progressInterval !== null) {
          clearInterval(progressInterval);
          progressInterval = null;
        }
      }, 50);

      // Hide overlay after 2.8 s (gives a moment at 100% before revealing rows)
      hideTimer = setTimeout(() => {
        setTourUploading(false);
        setTourProgress(0);
      }, 2800);
    }

    window.addEventListener("tour:simulate-field-tracker-upload", handleSimulateUpload);
    return () => {
      window.removeEventListener("tour:simulate-field-tracker-upload", handleSimulateUpload);
      if (progressInterval !== null) clearInterval(progressInterval);
      if (hideTimer !== null) clearTimeout(hideTimer);
    };
  }, []);

  const handleFilterOptionsLoaded = useCallback((opts: FilterOptions) => {
    setFilterOptions(opts);
  }, []);

  /** Align with UnitCards mobile layout (≤767px): grid only, always grouped by location. */
  /** Must match SSR (always false) — set real viewport in `useEffect` to avoid toolbar DOM mismatch on hydrate. */
  const [isMobileUnitsViewport, setIsMobileUnitsViewport] = useState(false);
  const [inspectionOverlayOpen, setInspectionOverlayOpen] = useState(false);
  const [pinnedMobileUnitsViewport, setPinnedMobileUnitsViewport] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobileUnitsViewport(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const sync = () => setInspectionOverlayOpen(isInspectionOverlayChromeSuppressed());
    sync();
    return subscribeInspectionOverlayChrome(sync);
  }, []);

  useEffect(() => {
    setPinnedMobileUnitsViewport((pinned) =>
      nextPinnedBoolean({
        live: isMobileUnitsViewport,
        pinned,
        preserveChrome: inspectionOverlayOpen,
      }),
    );
  }, [isMobileUnitsViewport, inspectionOverlayOpen]);

  const effectiveMobileUnitsViewport = effectiveBoolean({
    live: isMobileUnitsViewport,
    pinned: inspectionOverlayOpen ? pinnedMobileUnitsViewport : null,
  });

  const effectiveViewMode = effectiveMobileUnitsViewport ? "grid" : viewMode;
  // Grid mode always groups by location (button is hidden; mobile forces it too).
  const effectiveGroupByLocation = effectiveMobileUnitsViewport || viewMode === "grid" ? true : groupByLocation;

  const hasActiveFilters = activeFilterCount(filters) > 0 || search.trim().length > 0;
  /** Auto-expand all levels when filters/search are active so filtered units are always visible. */
  const effectiveExpandAll = effectiveMobileUnitsViewport
    ? hasActiveFilters
    : expandAll || hasActiveFilters;

  const handleGridCardSelect = useCallback(() => {
    // List view is hidden — do not reset viewMode when a grid card is selected.
  }, []);

  // ── Bulk-select state ────────────────────────────────────────────────────────
  const [isSelectMode, setIsSelectMode] = useState(false);
  // Persistent "true" selection — never cleared by filter changes.
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [filteredCardKeys, setFilteredCardKeys] = useState<string[]>([]);
  const [unitCounts, setUnitCounts] = useState<{
    filteredUnits: number; totalUnits: number;
    filteredScopes: number; totalScopes: number;
  } | null>(null);

  // Only the selected keys that are currently visible (intersection).
  // BulkActionsBar count, UnitCards display, and bulk actions all use this.
  const effectiveSelectedKeys = useMemo(() => {
    const filteredSet = new Set(filteredCardKeys);
    return new Set([...selectedKeys].filter((k) => filteredSet.has(k)));
  }, [selectedKeys, filteredCardKeys]);

  // When Select All is tapped and there are hidden selected units, we ask whether
  // the user wants to add visible units on top, or replace with visible only.
  const [selectAllPrompt, setSelectAllPrompt] = useState(false);

  const enterSelectMode = useCallback((firstKey: string) => {
    setIsSelectMode(true);
    setSelectedKeys(new Set([firstKey]));
  }, []);

  const toggleSelect = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(
    (currentEffectiveSelected: Set<string>, currentFilteredKeys: string[]) => {
      const hiddenSelectedCount = selectedKeys.size - currentEffectiveSelected.size;
      const hasUnselectedVisible = currentFilteredKeys.some((k) => !currentEffectiveSelected.has(k));
      if (hiddenSelectedCount > 0 && hasUnselectedVisible) {
        // Hidden selected units exist AND visible unselected units exist → ask
        setSelectAllPrompt(true);
      } else {
        // No conflict — union of existing + all visible
        setSelectedKeys((prev) => {
          const next = new Set(prev);
          for (const k of currentFilteredKeys) next.add(k);
          return next;
        });
      }
    },
    [selectedKeys]
  );

  const confirmSelectAllAdd = useCallback(() => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (const k of filteredCardKeys) next.add(k);
      return next;
    });
    setSelectAllPrompt(false);
  }, [filteredCardKeys]);

  const confirmSelectAllReplace = useCallback(() => {
    setSelectedKeys(new Set(filteredCardKeys));
    setSelectAllPrompt(false);
  }, [filteredCardKeys]);

  const deselectAll = useCallback(() => {
    setSelectedKeys(new Set());
    setSelectAllPrompt(false);
  }, []);

  const selectLevelKeys = useCallback((keys: string[], select: boolean) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (select) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  }, []);

  const exitSelectMode = useCallback(() => {
    setIsSelectMode(false);
    setSelectedKeys(new Set());
    setSelectAllPrompt(false);
  }, []);

  const handleFilteredKeysChange = useCallback((keys: string[]) => {
    setFilteredCardKeys(keys);
  }, []);

  // Scope rows (id + stage) for all selected + visible unit cards (fed from UnitCards via callback).
  const [selectedScopeRows, setSelectedScopeRows] = useState<ScopedRow[]>([]);
  const [showBulkActionsSheet, setShowBulkActionsSheet] = useState(false);

  const handleSelectedRowIdsChange = useCallback((rows: ScopedRow[]) => {
    setSelectedScopeRows(rows);
  }, []);

  // Unit keys that received a bulk action — briefly highlighted then cleared.
  const [highlightedUnitKeys, setHighlightedUnitKeys] = useState<Set<string>>(new Set());
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Post-bulk filter: when set, only the affected units are shown + a dismissable banner appears.
  const [postBulkFilter, setPostBulkFilter] = useState<{
    unitKeys: Set<string>;
    actionLabel: string;
    count: number;
    /** Bulk status: parent rows + sub-scope instances updated (may exceed unit count). */
    scopeCount?: number;
    /** Bulk status only — prior values to restore when the user taps Undo on the banner. */
    undoPayload: BulkStatusUndoPayload | null;
  } | null>(null);

  // Level expansion directive fired after a bulk action: snap UnitCards to show only
  // the affected levels (expanded) and collapse all others. The seq counter lets
  // the parent re-trigger even when the affected set is identical between actions.
  const [postBulkLevelDirective, setPostBulkLevelDirective] = useState<{ keys: Set<string>; seq: number } | null>(null);
  const bulkLevelSeqRef = useRef(0);

  const [bannerUndoBusy, setBannerUndoBusy] = useState(false);
  const bannerUndoBusyRef = useRef(false);

  const handleBulkComplete = useCallback((
    affectedUnitKeys: string[],
    meta: {
      actionLabel: string;
      statusUndoPayload?: BulkStatusUndoPayload | null;
      scopesAffected?: number;
    }
  ) => {
    // Replace the timed highlight with a persistent filter so affected units stay visible.
    if (highlightTimerRef.current !== null) clearTimeout(highlightTimerRef.current);
    setHighlightedUnitKeys(new Set());
    setPostBulkFilter({
      unitKeys: new Set(affectedUnitKeys),
      actionLabel: meta.actionLabel,
      count: affectedUnitKeys.length,
      scopeCount: meta.scopesAffected,
      undoPayload: meta.statusUndoPayload ?? null,
    });

    // Scroll the main content area back to the top so the green banner is immediately
    // visible — especially important on mobile where the user may be scrolled far down.
    document.getElementById("main-content")?.scrollTo({ top: 0, behavior: "smooth" });

    // Exit select mode so the user sees the results clearly
    setIsSelectMode(false);
    setSelectedKeys(new Set());
    setSelectAllPrompt(false);

    // Derive the level section keys ("buildingKey::levelKey") from affected unit keys.
    // Card key format: "${building}|${level}|${unit}" — same as unitRef.
    const MISSING = "—";
    const levelSectionKeys = new Set<string>();
    for (const cardKey of affectedUnitKeys) {
      const parts = cardKey.split("|");
      const building = (parts[0] ?? "").trim() || MISSING;
      const level = (parts[1] ?? "").trim() || MISSING;
      levelSectionKeys.add(`${building}::${level}`);
    }

    // Snap UnitCards level expansion to show only the affected levels
    bulkLevelSeqRef.current += 1;
    setPostBulkLevelDirective({ keys: levelSectionKeys, seq: bulkLevelSeqRef.current });
  }, []);

  /** Dismisses the green post-bulk banner only (full unit list again) and clears any Sonner toasts. */
  const dismissPostBulkBanner = useCallback(() => {
    setPostBulkFilter(null);
    toast.dismiss();
  }, []);

  const handleBannerUndo = useCallback(async () => {
    if (!postBulkFilter?.undoPayload || bannerUndoBusyRef.current) return;
    const payload = postBulkFilter.undoPayload;
    bannerUndoBusyRef.current = true;
    setBannerUndoBusy(true);
    try {
      await performBulkStatusUndo(projectId, payload);
      toast.success(t("bulkActionUndoSuccess"));
      setPostBulkFilter(null);
      setPostBulkLevelDirective(null);
      setRefreshTrigger((k) => k + 1);
    } catch {
      toast.error(t("bulkActionUndoFailed"));
    } finally {
      bannerUndoBusyRef.current = false;
      setBannerUndoBusy(false);
    }
  }, [postBulkFilter, projectId, t]);

  const filterCount = activeFilterCount(filters);

  const subScopesToolbarBtn = canManageSubScopes ? (
    <ToolbarBtn
      icon={<Split size={14} />}
      active={subScopesView !== null}
      onClick={() => setSubScopesView("menu")}
      tooltip={t("subScopesTooltip")}
    />
  ) : null;

  const filterToolbarBtn = (
    <ToolbarBtn
      icon={<Filter size={14} />}
      active={filterCount > 0}
      badge={filterCount}
      onClick={() => setShowFilters(true)}
      tooltip={t("filtersTooltip")}
    />
  );

  return (
    <div data-tour="field-tracker" style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, flex: 1 }}>

      {/* ── Toolbar ── */}
      <div
        style={{
          padding: "12px var(--page-padding-x) 0",
          flexShrink: 0,
          borderBottom: "1px solid var(--neutral-200)",
          backgroundColor: "var(--neutral-0)",
        }}
      >
          <style>{`
            .units-toolbar { display: flex; flex-direction: row; align-items: center; gap: 8px; padding-bottom: 12px; }
            .units-toolbar__mobile-top { display: flex; align-items: center; gap: 8px; width: 100%; }
            .units-toolbar__search,
            .units-toolbar__mobile-top .units-toolbar__search { flex: 1; min-width: 0; }
            .units-toolbar__controls { display: flex; align-items: center; gap: 8px; flex-shrink: 0; flex-wrap: nowrap; }
            .units-search-field { height: 44px; }
            .units-toolbar-btn { height: 44px !important; padding-left: 14px !important; padding-right: 14px !important; }
            .units-toolbar-icon-btn { height: 44px !important; width: 44px !important; justify-content: center !important; padding: 0 !important; }
            .units-view-toggle-btn { height: 44px !important; width: 44px !important; }
            .post-bulk-banner {
              position: sticky;
              top: 0;
              z-index: 40;
              margin: 0 0 12px;
              padding: 12px;
              border-radius: var(--radius-lg);
              background: var(--success-50);
              box-shadow: 0 0 0 1px var(--success-300);
              display: grid;
              grid-template-columns: auto minmax(0, 1fr);
              gap: 10px 12px;
              align-items: center;
            }
            .post-bulk-banner__icon {
              width: 22px;
              height: 22px;
              border-radius: var(--radius-pill);
              color: var(--success-600);
              flex-shrink: 0;
            }
            .post-bulk-banner__content {
              min-width: 0;
              display: grid;
              gap: 8px;
            }
            .post-bulk-banner__title {
              margin: 0;
              color: var(--success-700);
              font-size: var(--text-body);
              font-weight: var(--font-weight-black);
              letter-spacing: var(--tracking-tight);
            }
            .post-bulk-banner__details {
              display: flex;
              flex-wrap: wrap;
              gap: 6px;
              align-items: center;
            }
            .post-bulk-banner__pill {
              display: inline-flex;
              align-items: center;
              min-height: 28px;
              padding: 5px 9px;
              border-radius: var(--radius-pill);
              background: rgba(255, 255, 255, 0.68);
              color: var(--success-700);
              font-size: var(--text-caption);
              font-weight: var(--font-weight-extrabold);
              letter-spacing: var(--tracking-ui);
              line-height: 1;
              white-space: nowrap;
            }
            .post-bulk-banner__changed {
              display: inline-flex;
              align-items: center;
              gap: 6px;
              min-height: 28px;
              padding: 5px 10px;
              border-radius: var(--radius-pill);
              background: var(--success-100);
              color: var(--success-700);
              font-size: var(--text-caption);
              font-weight: var(--font-weight-extrabold);
              letter-spacing: var(--tracking-ui);
              line-height: 1;
            }
            .post-bulk-banner__changed-label {
              color: var(--success-600);
              font-weight: var(--font-weight-semibold);
            }
            .post-bulk-banner__actions {
              grid-column: 1 / -1;
              display: flex;
              align-items: center;
              justify-content: flex-end;
              gap: 8px;
              flex-wrap: wrap;
            }
            .post-bulk-banner__button {
              min-height: 40px;
              padding: 0 14px;
              border: none;
              border-radius: var(--radius-md);
              cursor: pointer;
              font: inherit;
              font-size: var(--text-body);
              font-weight: var(--font-weight-extrabold);
            }
            .post-bulk-banner__button--keep {
              background: var(--success-100);
              color: var(--success-700);
            }
            .post-bulk-banner__button--undo {
              background: var(--unit-detail-header-bg);
              color: var(--color-text-inverse);
            }
            .post-bulk-banner__button:disabled {
              cursor: wait;
              opacity: 0.7;
            }
            @media (min-width: 768px) {
              .units-toolbar { flex-direction: row; align-items: center; }
              .units-toolbar__search { flex: 1; min-width: 0; }
              .units-search-field { height: 36px; }
              .units-toolbar-btn { height: 36px !important; padding-left: 12px !important; padding-right: 12px !important; }
              .units-toolbar-icon-btn { height: 36px !important; width: 36px !important; justify-content: center !important; padding: 0 !important; }
              .units-view-toggle-btn { height: 36px !important; width: 36px !important; }
              .post-bulk-banner {
                grid-template-columns: auto minmax(0, 1fr) auto;
              }
              .post-bulk-banner__actions {
                grid-column: auto;
              }
            }
          `}</style>

          <div className="units-toolbar">

            {isMobileUnitsViewport ? (
              <div className="units-toolbar__mobile-top">
                <div className="units-toolbar__search">
                  <SearchInput
                    value={search}
                    onChange={(v) => { setSearch(v); setPostBulkFilter(null); }}
                    placeholder={t("searchPlaceholder")}
                    clearLabel={t("closeSearch")}
                    className="units-search-field"
                  />
                </div>
                {filterToolbarBtn}
                {subScopesToolbarBtn}
                <ToolbarBtn
                  icon={<CheckSquare size={14} />}
                  active={isSelectMode}
                  onClick={() => isSelectMode ? exitSelectMode() : setIsSelectMode(true)}
                  tooltip={t("selectMode")}
                />
              </div>
            ) : (
              <>
                <div className="units-toolbar__search">
                  <SearchInput
                    value={search}
                    onChange={(v) => { setSearch(v); setPostBulkFilter(null); }}
                    placeholder={t("searchPlaceholder")}
                    clearLabel={t("closeSearch")}
                    className="units-search-field"
                  />
                </div>

                <div className="units-toolbar__controls">
                  {/* View toggle (list/grid) — hidden for now; grid is the only view on all viewports */}
                  <div
                    style={{
                      display: "none",
                      border: "1px solid var(--neutral-300)",
                      borderRadius: "var(--radius-sm)",
                      overflow: "hidden",
                      flexShrink: 0,
                    }}
                    aria-hidden="true"
                  >
                    <button
                      type="button"
                      onClick={() => setViewMode("list")}
                      aria-label={t("listView")}
                      title={t("listView")}
                      className="units-view-toggle-btn"
                      tabIndex={-1}
                      style={{
                        width: 36,
                        height: 36,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: "none",
                        borderRight: "1px solid var(--neutral-300)",
                        backgroundColor: viewMode === "list" ? "var(--primary-500)" : "var(--neutral-0)",
                        color: viewMode === "list" ? "var(--neutral-0)" : "var(--neutral-500)",
                        cursor: "pointer",
                        transition: "all 0.12s",
                      }}
                    >
                      <List size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("grid")}
                      aria-label={t("gridView")}
                      title={t("gridView")}
                      className="units-view-toggle-btn"
                      tabIndex={-1}
                      style={{
                        width: 36,
                        height: 36,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: "none",
                        backgroundColor: viewMode === "grid" ? "var(--primary-500)" : "var(--neutral-0)",
                        color: viewMode === "grid" ? "var(--neutral-0)" : "var(--neutral-500)",
                        cursor: "pointer",
                        transition: "all 0.12s",
                      }}
                    >
                      <LayoutGrid size={15} />
                    </button>
                  </div>

                  {/* Group by Location — hidden for now; always active in grid mode */}
                  <div style={{ display: "none" }} aria-hidden="true">
                    <ToolbarBtn
                      label={t("groupByLocation")}
                      icon={<MapPin size={14} />}
                      active={viewMode === "grid" || groupByLocation}
                      disabled={viewMode === "grid"}
                      onClick={() => setGroupByLocation((v) => !v)}
                      tooltip={viewMode === "grid" ? t("groupByLocationLockedInGrid") : t("groupByLocationTooltip")}
                    />
                  </div>

                  {/* Expand All — hidden for now */}
                  <div style={{ display: "none" }} aria-hidden="true">
                    <ToolbarBtn
                      icon={<Expand size={14} />}
                      active={expandAll}
                      onClick={() => setExpandAll((v) => !v)}
                      tooltip={t("expandAll")}
                    />
                  </div>

                  {filterToolbarBtn}
                  {subScopesToolbarBtn}
                  <ToolbarBtn
                    icon={<CheckSquare size={14} />}
                    active={isSelectMode}
                    onClick={() => isSelectMode ? exitSelectMode() : setIsSelectMode(true)}
                    tooltip={t("selectMode")}
                  />
                </div>
              </>
            )}
          </div>

          {/* Desktop bulk-actions bar — replaces toolbar content inline */}
          {!isMobileUnitsViewport && isSelectMode && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                paddingBottom: 12,
                paddingTop: 4,
              }}
            >
              <BulkActionsBar
                mobile={false}
                selectedCount={effectiveSelectedKeys.size}
                totalFilteredCount={filteredCardKeys.length}
                onSelectAll={() => handleSelectAll(effectiveSelectedKeys, filteredCardKeys)}
                onDeselectAll={deselectAll}
                onCancel={exitSelectMode}
                onActionsOpen={() => setShowBulkActionsSheet(true)}
              />
            </div>
          )}
      </div>


      {/* ── Unit card list ── */}
      <div
        ref={setUnitsScrollRoot}
        data-project-scroll-root
        style={{ flex: 1, minHeight: 0, overflowY: "auto", position: "relative" }}
      >
        {/* Tour upload simulation overlay */}
        {tourUploading && (
          <div
            data-testid="tour-upload-overlay"
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 20,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 20,
              backgroundColor: "var(--neutral-0)",
              padding: "0 var(--page-padding-x)",
            }}
          >
            {/* File chip */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 16px",
                borderRadius: "var(--radius-sm)",
                border: "1.5px solid var(--primary-200)",
                backgroundColor: "var(--primary-50)",
                maxWidth: 360,
                width: "100%",
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--primary-700)", flex: 1 }}>
                FieldTracker_Demo.xlsx
              </span>
              <span style={{ fontSize: 12, color: "var(--neutral-500)", whiteSpace: "nowrap" }}>
                15 units
              </span>
            </div>

            {/* Progress bar */}
              <div style={{ width: "100%", maxWidth: 360 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: "var(--neutral-600)" }}>
                  {tourProgress < 100
                    ? (tourOverlayLang === "es" ? "Procesando hoja de cálculo…" : "Parsing spreadsheet…")
                    : (tourOverlayLang === "es" ? "Ubicaciones cargadas — creando filas…" : "Locations loaded — building rows…")}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--primary-600)" }}>
                  {tourProgress}%
                </span>
              </div>
              <div
                style={{
                  height: 6,
                  borderRadius: 99,
                  backgroundColor: "var(--neutral-200)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${tourProgress}%`,
                    borderRadius: 99,
                    backgroundColor: "var(--primary-500)",
                    transition: "width 0.05s linear",
                  }}
                />
              </div>
            </div>

            {/* Row count ticker */}
            <p style={{ fontSize: 13, color: "var(--neutral-500)", margin: 0, textAlign: "center" }}>
              {tourOverlayLang === "es" ? (
                <>
                  {tourProgress < 30 && "Leyendo encabezados de columna…"}
                  {tourProgress >= 30 && tourProgress < 60 && "Mapeando filas del Edificio A…"}
                  {tourProgress >= 60 && tourProgress < 85 && "Mapeando filas de Edificios B y C…"}
                  {tourProgress >= 85 && tourProgress < 100 && "Validando etapas de alcance…"}
                  {tourProgress >= 100 && "✓ Las 15 unidades validadas exitosamente"}
                </>
              ) : (
                <>
                  {tourProgress < 30 && "Reading column headers…"}
                  {tourProgress >= 30 && tourProgress < 60 && "Mapping Building A rows…"}
                  {tourProgress >= 60 && tourProgress < 85 && "Mapping Buildings B & C rows…"}
                  {tourProgress >= 85 && tourProgress < 100 && "Validating scope stages…"}
                  {tourProgress >= 100 && "✓ All 15 units validated successfully"}
                </>
              )}
            </p>
          </div>
        )}

        {/* Mobile bulk-actions bar — fixed bottom portal */}
        {isMobileUnitsViewport && isSelectMode && (
          <BulkActionsBar
            mobile={true}
            selectedCount={effectiveSelectedKeys.size}
            totalFilteredCount={filteredCardKeys.length}
            onSelectAll={() => handleSelectAll(effectiveSelectedKeys, filteredCardKeys)}
            onDeselectAll={deselectAll}
            onCancel={exitSelectMode}
            onActionsOpen={() => setShowBulkActionsSheet(true)}
          />
        )}

        {/* Post-bulk filter banner — sticky so it stays visible while scrolling */}
        {postBulkFilter && (
          <div className="post-bulk-banner">
            <svg className="post-bulk-banner__icon" viewBox="0 0 22 22" fill="none" aria-hidden>
              <circle cx="11" cy="11" r="9" stroke="currentColor" strokeWidth="2" />
              <path d="M7.4 11.2l2.4 2.4 4.8-5.1" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="post-bulk-banner__content">
              <p className="post-bulk-banner__title">{t("postBulkBannerTitle")}</p>
              <div className="post-bulk-banner__details">
                <span className="post-bulk-banner__pill">
                  {t("postBulkBannerUnits", { count: postBulkFilter.count })}
                </span>
                {postBulkFilter.scopeCount != null && (
                  <span className="post-bulk-banner__pill">
                    {t("postBulkBannerScopes", { count: postBulkFilter.scopeCount })}
                  </span>
                )}
                <span className="post-bulk-banner__changed">
                  <span className="post-bulk-banner__changed-label">{t("postBulkBannerChangedTo")}</span>
                  {postBulkFilter.actionLabel}
                </span>
              </div>
            </div>
            <div className="post-bulk-banner__actions">
              <button
                type="button"
                onClick={dismissPostBulkBanner}
                className="post-bulk-banner__button post-bulk-banner__button--keep"
              >
                {t("bulkFilterKeepChanges")}
              </button>
              {postBulkFilter.undoPayload !== null && (
                <button
                  type="button"
                  onClick={() => void handleBannerUndo()}
                  disabled={bannerUndoBusy}
                  className="post-bulk-banner__button post-bulk-banner__button--undo"
                >
                  {t("bulkFilterUndo")}
                </button>
              )}
            </div>
          </div>
        )}

        <UnitCards
          projectId={projectId}
          scrollRootEl={unitsScrollRoot}
          onFilterOptionsLoaded={handleFilterOptionsLoaded}
          search={search}
          viewMode={effectiveViewMode}
          groupByLocation={effectiveGroupByLocation}
          expandAll={effectiveExpandAll}
          activeFilters={filters}
          onGridCardSelect={handleGridCardSelect}
          canManageStatus={canManageStatus}
          canCalibrate={canCalibrate}
          canViewUpm={canViewUpm}
          canViewLocationTracking={canViewLocationTracking}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          onFilteredKeysChange={handleFilteredKeysChange}
          onCountsChange={setUnitCounts}
          forceExpandAllLevels={false}
          isSelectMode={isSelectMode}
          selectedKeys={effectiveSelectedKeys}
          onEnterSelectMode={enterSelectMode}
          onToggleSelect={toggleSelect}
          onSelectLevelKeys={selectLevelKeys}
          onSelectedRowIdsChange={handleSelectedRowIdsChange}
          highlightedUnitKeys={highlightedUnitKeys}
          forcedExpandLevelKeys={postBulkLevelDirective ?? undefined}
          refreshTrigger={refreshTrigger}
          onRefreshAll={() => setRefreshTrigger((k) => k + 1)}
          postBulkFilterKeys={postBulkFilter?.unitKeys}
        />
      </div>

      {/* ── Sub-scopes entry sheet (menu) ── */}
      {subScopesView === "menu" && (
        <SubScopeEntrySheet
          projectId={projectId}
          onManage={() => setSubScopesView("manage")}
          onCreate={() => setSubScopesView("configure")}
          onClose={() => setSubScopesView(null)}
        />
      )}

      {/* ── Sub-scopes management panel ── */}
      {subScopesView === "manage" && (
        <SubScopeManagementPanel
          projectId={projectId}
          onClose={() => setSubScopesView(null)}
          onChanged={() => setRefreshTrigger((k) => k + 1)}
          scopeTypesByUnitType={filterOptions.scopeTypesByUnitType}
        />
      )}

      {/* ── Sub-scopes configure modal (3-step wizard) ── */}
      {subScopesView === "configure" && (
        <SubScopesModal
          projectId={projectId}
          unitTypes={filterOptions.unitTypes}
          scopeTypesByUnitType={filterOptions.scopeTypesByUnitType}
          onClose={() => setSubScopesView(null)}
          onCreated={() => {
            setSubScopesView(null);
            setRefreshTrigger((k) => k + 1);
          }}
        />
      )}

      {/* ── Filter panel ── */}
      {showFilters && (
        <FilterPanel
          filters={filters}
          options={filterOptions}
          onChange={(f) => { setFilters(f); setPostBulkFilter(null); }}
          onClose={() => setShowFilters(false)}
          onClear={() => { setFilters(EMPTY_FILTERS); setPostBulkFilter(null); }}
          unitCounts={unitCounts}
          issueTypeCatalog={issueTypeCatalog}
          partyCatalog={partyCatalog}
        />
      )}

      <BulkRevertOverlay
        open={bannerUndoBusy}
        title={t("bulkActionUndoing")}
        description={t("bulkActionRevertOverlayHint")}
      />

      <BulkActionsSheet
        open={showBulkActionsSheet}
        onClose={() => setShowBulkActionsSheet(false)}
        selectedUnitCount={effectiveSelectedKeys.size}
        scopeRows={selectedScopeRows}
        projectId={projectId}
        userId={currentUserId}
        onSuccess={() => setRefreshTrigger((k) => k + 1)}
        onBulkComplete={handleBulkComplete}
      />

      {/* ── Select All conflict prompt ── */}
      {selectAllPrompt && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setSelectAllPrompt(false)}
            aria-hidden="true"
            style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 600 }}
          />
          {/* Dialog */}
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="select-all-prompt-title"
            style={{
              position: "fixed",
              top: "50%", left: "50%",
              transform: "translate(-50%,-50%)",
              zIndex: 601,
              width: "min(400px, calc(100vw - 32px))",
              backgroundColor: "var(--neutral-0)",
              borderRadius: 16,
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
              padding: "24px 24px 20px",
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <div>
              <h3
                id="select-all-prompt-title"
                style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700, color: "var(--neutral-900)" }}
              >
                {t("selectAllPromptTitle")}
              </h3>
              <p style={{ margin: 0, fontSize: 13, color: "var(--neutral-600)", lineHeight: 1.5 }}>
                {t("selectAllPromptBody", {
                  hidden: selectedKeys.size - effectiveSelectedKeys.size,
                  visible: filteredCardKeys.length,
                })}
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                type="button"
                onClick={confirmSelectAllAdd}
                style={{
                  width: "100%", padding: "12px 16px", border: "none", borderRadius: 10,
                  backgroundColor: "var(--primary-600)", color: "var(--neutral-0)",
                  fontSize: 14, fontWeight: 600, cursor: "pointer", textAlign: "left",
                }}
              >
                {t("selectAllPromptAdd", { count: filteredCardKeys.length - effectiveSelectedKeys.size })}
              </button>
              <button
                type="button"
                onClick={confirmSelectAllReplace}
                style={{
                  width: "100%", padding: "12px 16px",
                  border: "1.5px solid var(--neutral-200)", borderRadius: 10,
                  backgroundColor: "var(--neutral-0)", color: "var(--neutral-800)",
                  fontSize: 14, fontWeight: 500, cursor: "pointer", textAlign: "left",
                }}
              >
                {t("selectAllPromptReplace", { count: filteredCardKeys.length })}
              </button>
              <button
                type="button"
                onClick={() => setSelectAllPrompt(false)}
                style={{
                  width: "100%", padding: "10px 16px", border: "none", borderRadius: 10,
                  backgroundColor: "transparent", color: "var(--neutral-500)",
                  fontSize: 13, fontWeight: 500, cursor: "pointer",
                }}
              >
                {t("selectAllPromptCancel")}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Observation deep-link modal (opened via ?openObservation=<id> from notification) */}
      {deepLinkObs && (
        <ObservationDetailModal
          obs={deepLinkObs}
          unitContext={{
            unitKey: deepLinkObs.unitRef ?? "",
            building: "",
            level: "",
            unit: deepLinkObs.unitRef ?? "",
            unitRef: deepLinkObs.unitRef ?? "",
          }}
          projectId={projectId}
          currentUserId={currentUserId}
          onClose={() => setDeepLinkObs(null)}
          onUpdated={(updated) => setDeepLinkObs(updated)}
        />
      )}
    </div>
  );
}
