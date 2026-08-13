"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Filter, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { ComparePeriodDropdown } from "@/components/reports/ComparePeriodDropdown";
import { PortfolioProgressLevelBreakdownModal } from "@/components/reports/PortfolioProgressLevelBreakdownModal";
import { SearchInput } from "@/components/shared/SearchInput";
import { ToolbarActionButton } from "@/components/shared/ToolbarActionButton";
import {
  FilterPanelFooterActions,
  FilterPanelSection,
  FilterPanelShell,
  FilterPanelSummary,
  FilterPanelSummaryStat,
  FilterPill,
  FilterPillGroup,
} from "@/components/shared/filterPanel";
import { formatReportDate, formatReportDateRangeCompact } from "@/lib/format-report-date";
import {
  globalProgressDetailUrl,
  globalProgressListUrl,
  portfolioProgressDetailCacheKey,
} from "@/lib/reports/portfolio-progress-client";
import { buildProjectLocationsHref } from "@/lib/reports/portfolio-progress-project-links";
import {
  comparePeriodShortLabel,
  copyComparePeriod,
  defaultComparePeriod,
  isCustomRangeInvalid,
  resolveComparePeriodRange,
  type ComparePeriodPreset,
  type ComparePeriodState,
} from "@/lib/reports/portfolio-progress-period";
import {
  PORTFOLIO_IM_UNASSIGNED,
  projectMatchesPeopleFilters,
  toggleFilterValue,
  uniqueInstallManagers,
  uniqueProjectManagers,
} from "@/lib/reports/portfolio-progress-filters";
import {
  formatPortfolioProgressDeltaPct,
  isPortfolioProgressPositiveDelta,
  portfolioProgressDeltaColor,
} from "@/lib/reports/portfolio-progress-display";
import { projectVerifiedRollup } from "@/lib/reports/portfolio-progress-rollups";
import type {
  PortfolioProjectListItem,
  PortfolioProjectSnapshot,
  ScopeProgressSnapshot,
} from "@/lib/reports/portfolio-progress-types";

type ProjectFilter = "all" | "changed" | "unchanged";

function projectMatchesSearch(project: PortfolioProjectListItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    project.name.toLowerCase().includes(q) ||
    project.id.toLowerCase().includes(q) ||
    (project.unifierPid?.toLowerCase().includes(q) ?? false) ||
    (project.projectManagerName?.toLowerCase().includes(q) ?? false) ||
    (project.installManagerName?.toLowerCase().includes(q) ?? false)
  );
}

function PortfolioProgressPeopleFilterPanel({
  open,
  onClose,
  pmFilter,
  imFilter,
  onPmToggle,
  onImToggle,
  onClear,
  uniquePMs,
  uniqueIMs,
  filteredCount,
  totalCount,
}: {
  open: boolean;
  onClose: () => void;
  pmFilter: string[];
  imFilter: string[];
  onPmToggle: (name: string) => void;
  onImToggle: (name: string) => void;
  onClear: () => void;
  uniquePMs: string[];
  uniqueIMs: string[];
  filteredCount: number;
  totalCount: number;
}) {
  const t = useTranslations("globalReports.portfolioProgress");
  const tProjects = useTranslations("projects");
  const tCommon = useTranslations("common");

  if (!open) return null;

  const imLabel = (name: string) =>
    name === PORTFOLIO_IM_UNASSIGNED ? t("filterUnassigned") : name;

  return (
    <FilterPanelShell
      title={t("filterPeopleTitle")}
      subtitle={t("filterPeopleSubtitle")}
      closeAriaLabel={tCommon("close")}
      onClose={onClose}
      summary={
        <FilterPanelSummary>
          <FilterPanelSummaryStat
            filtered={filteredCount}
            total={totalCount}
            label={t("projectCount", { count: filteredCount })}
          />
        </FilterPanelSummary>
      }
      footer={(close) => (
        <FilterPanelFooterActions
          clearLabel={t("filterPeopleClear")}
          applyLabel={tCommon("apply")}
          onClear={onClear}
          onApply={close}
          clearDisabled={pmFilter.length === 0 && imFilter.length === 0}
        />
      )}
    >
      {uniqueIMs.length > 0 && (
        <FilterPanelSection label={tProjects("installManager")}>
          <FilterPillGroup>
            {uniqueIMs.map((name) => (
              <FilterPill
                key={name || "__unassigned__"}
                label={imLabel(name)}
                active={imFilter.includes(name)}
                onClick={() => onImToggle(name)}
              />
            ))}
          </FilterPillGroup>
        </FilterPanelSection>
      )}
      {uniquePMs.length > 0 && (
        <FilterPanelSection label={tProjects("projectManager")}>
          <FilterPillGroup>
            {uniquePMs.map((name) => (
              <FilterPill
                key={name}
                label={name}
                active={pmFilter.includes(name)}
                onClick={() => onPmToggle(name)}
              />
            ))}
          </FilterPillGroup>
        </FilterPanelSection>
      )}
    </FilterPanelShell>
  );
}

function periodDisplayForState(
  comparePeriod: ComparePeriodState,
  locale: string,
  options: {
    formatWeekOf: (range: string) => string;
    shortAll: string;
    shortCustom: string;
    presetLabels: Record<ComparePeriodPreset, string>;
    deltaVsPeriod: (period: string) => string;
  },
): {
  periodShort: string;
  periodTitle: string;
  periodRangeDisplay: string;
  periodPresetLabel: string;
} {
  const customRangeInvalid = isCustomRangeInvalid(comparePeriod);
  const periodShort = comparePeriodShortLabel(
    comparePeriod,
    {
      formatWeekOf: options.formatWeekOf,
      shortAll: options.shortAll,
      shortCustom: options.shortCustom,
    },
    locale,
  );
  let periodRangeDisplay = options.shortCustom;
  if (comparePeriod.preset === "all") {
    periodRangeDisplay = options.shortAll;
  } else if (!customRangeInvalid) {
    const { from, to } = resolveComparePeriodRange(comparePeriod);
    periodRangeDisplay = formatReportDateRangeCompact(from, to, locale);
  }
  return {
    periodShort,
    periodTitle: options.deltaVsPeriod(periodShort),
    periodRangeDisplay,
    periodPresetLabel: options.presetLabels[comparePeriod.preset],
  };
}

function showingProgressWindowLabel(
  comparePeriod: ComparePeriodState,
  periodRangeDisplay: string,
  labels: {
    showingProgressAll: string;
    showingProgressWeekOf: (range: string) => string;
    showingProgressRange: (range: string) => string;
  },
): string | null {
  if (isCustomRangeInvalid(comparePeriod)) return null;
  if (comparePeriod.preset === "all") return labels.showingProgressAll;
  if (comparePeriod.preset === "1w") {
    return labels.showingProgressWeekOf(periodRangeDisplay);
  }
  return labels.showingProgressRange(periodRangeDisplay);
}

function rollupDeltaTextClass(delta: number | null): string {
  if (isPortfolioProgressPositiveDelta(delta)) {
    return "portfolio-project-card-rollup-delta-text--up";
  }
  return "portfolio-project-card-rollup-delta-text--neutral";
}

function formatRollupDeltaThisPeriod(
  delta: number | null,
  labels: {
    noChangeThisPeriod: string;
    deltaThisPeriod: (value: number) => string;
    zeroDeltaThisPeriod: string;
  },
): string {
  if (delta === null) return labels.noChangeThisPeriod;
  if (isPortfolioProgressPositiveDelta(delta)) return labels.deltaThisPeriod(delta);
  return labels.zeroDeltaThisPeriod;
}

function ScopeProgressCell({
  pct,
  delta,
  variant,
}: {
  pct: number;
  delta: number | null;
  variant: "verified" | "unverified";
}) {
  return (
    <div className={`portfolio-scope-progress-cell portfolio-scope-progress-cell--${variant}`}>
      <div className="portfolio-scope-progress-bar-track" aria-hidden>
        <div
          className={`portfolio-scope-progress-bar-fill portfolio-scope-progress-bar-fill--${variant}`}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
      <div className="portfolio-scope-progress-stats">
        <span className="portfolio-scope-progress-pct">{pct}%</span>
        <span
          className="portfolio-scope-progress-delta"
          style={{ color: portfolioProgressDeltaColor(delta) }}
        >
          {formatPortfolioProgressDeltaPct(delta)}
        </span>
      </div>
    </div>
  );
}

function ScopeProgressList({
  scopes,
  labels,
}: {
  scopes: ScopeProgressSnapshot[];
  labels: {
    verifiedShort: string;
    unverifiedShort: string;
  };
}) {
  return (
    <div className="portfolio-scope-progress-list">
      <div className="portfolio-scope-progress-head">
        <span className="portfolio-scope-progress-head-spacer" aria-hidden />
        <span className="portfolio-scope-progress-head-col portfolio-scope-progress-head-col--verified">
          <span className="portfolio-scope-progress-dot portfolio-scope-progress-dot--verified" aria-hidden />
          {labels.verifiedShort}
        </span>
        <span className="portfolio-scope-progress-head-col portfolio-scope-progress-head-col--unverified">
          <span className="portfolio-scope-progress-dot portfolio-scope-progress-dot--unverified" aria-hidden />
          {labels.unverifiedShort}
        </span>
      </div>
      {scopes.map((scope) => (
        <div key={scope.scopeName} className="portfolio-scope-progress-row">
          <span className="portfolio-scope-progress-name">{scope.scopeName}</span>
          <ScopeProgressCell
            pct={scope.verifiedPct}
            delta={scope.verifiedDelta}
            variant="verified"
          />
          <ScopeProgressCell
            pct={scope.subPct}
            delta={scope.subDelta}
            variant="unverified"
          />
        </div>
      ))}
    </div>
  );
}

function ProjectCardHeader({
  projectName,
  projectMeta,
  verifiedPct,
  verifiedDelta,
  rollupTitle,
  overallLabel,
  deltaThisPeriodLabels,
}: {
  projectName: string;
  projectMeta: string;
  verifiedPct: number;
  verifiedDelta: number | null;
  rollupTitle: string;
  overallLabel: string;
  deltaThisPeriodLabels: {
    noChangeThisPeriod: string;
    deltaThisPeriod: (value: number) => string;
    zeroDeltaThisPeriod: string;
  };
}) {
  const complete = verifiedPct >= 100;

  return (
    <div className="portfolio-project-card-header">
      <div className="portfolio-project-card-title-wrap">
        <h3 className="portfolio-project-card-title">{projectName}</h3>
        <p className="portfolio-project-card-meta">{projectMeta}</p>
      </div>
      <div
        className={`portfolio-project-card-rollup-block${complete ? " portfolio-project-card-rollup-block--complete" : ""}`}
        title={rollupTitle}
      >
        <span className="portfolio-project-card-rollup-label">{overallLabel}</span>
        <span className="portfolio-project-card-rollup-pct">{verifiedPct}%</span>
        <span
          className={`portfolio-project-card-rollup-delta-text ${rollupDeltaTextClass(verifiedDelta)}`}
        >
          {formatRollupDeltaThisPeriod(verifiedDelta, deltaThisPeriodLabels)}
        </span>
      </div>
    </div>
  );
}

function ProjectCard({
  listItem,
  periodShort,
  onOpenLevelBreakdown,
  openLevelBreakdownLabel,
  openLevelBreakdownAriaLabel,
  openProjectLocationsLabel,
  openProjectLocationsAriaLabel,
  locationsHref,
  cardLabels,
}: {
  listItem: PortfolioProjectListItem;
  periodShort: string;
  onOpenLevelBreakdown: () => void;
  openLevelBreakdownLabel: string;
  openLevelBreakdownAriaLabel: string;
  openProjectLocationsLabel: string;
  openProjectLocationsAriaLabel: string;
  locationsHref: string;
  cardLabels: {
    verifiedShort: string;
    unverifiedShort: string;
    overallVerifiedLabel: string;
    noChangeThisPeriod: string;
    zeroDeltaThisPeriod: string;
    deltaThisPeriod: (value: number) => string;
    projectMeta: (scopeCount: number, complete: boolean) => string;
    projectRollupTitle: (pct: number, deltaLabel: string, period: string) => string;
  };
}) {
  const rollupSource: PortfolioProjectSnapshot = {
    id: listItem.id,
    name: listItem.name,
    unifierPid: listItem.unifierPid,
    projectManagerName: listItem.projectManagerName,
    installManagerName: listItem.installManagerName,
    hasChangesInPeriod: listItem.hasChangesInPeriod,
    scopeSummaries: listItem.scopeSummaries,
    buildings: [],
  };

  const rollup = useMemo(() => projectVerifiedRollup(rollupSource), [rollupSource]);

  const projectMeta = cardLabels.projectMeta(
    listItem.scopeSummaries.length,
    rollup.verifiedPct >= 100,
  );

  return (
    <div className="portfolio-project-card">
      <div className="portfolio-project-card-summary">
        <ProjectCardHeader
          projectName={listItem.name}
          projectMeta={projectMeta}
          verifiedPct={rollup.verifiedPct}
          verifiedDelta={rollup.verifiedDelta}
          overallLabel={cardLabels.overallVerifiedLabel}
          deltaThisPeriodLabels={{
            noChangeThisPeriod: cardLabels.noChangeThisPeriod,
            deltaThisPeriod: cardLabels.deltaThisPeriod,
            zeroDeltaThisPeriod: cardLabels.zeroDeltaThisPeriod,
          }}
          rollupTitle={cardLabels.projectRollupTitle(
            rollup.verifiedPct,
            formatRollupDeltaThisPeriod(rollup.verifiedDelta, {
              noChangeThisPeriod: cardLabels.noChangeThisPeriod,
              deltaThisPeriod: cardLabels.deltaThisPeriod,
              zeroDeltaThisPeriod: cardLabels.zeroDeltaThisPeriod,
            }),
            periodShort,
          )}
        />
        <ScopeProgressList
          scopes={listItem.scopeSummaries}
          labels={{
            verifiedShort: cardLabels.verifiedShort,
            unverifiedShort: cardLabels.unverifiedShort,
          }}
        />
      </div>

      <div className="portfolio-project-card-footer">
        <button
          type="button"
          className="portfolio-project-card-detail-toggle"
          aria-haspopup="dialog"
          aria-label={openLevelBreakdownAriaLabel}
          onClick={onOpenLevelBreakdown}
        >
          <span className="portfolio-project-card-detail-toggle-label">{openLevelBreakdownLabel}</span>
        </button>
        <a
          href={locationsHref}
          target="_blank"
          rel="noopener noreferrer"
          className="portfolio-project-card-locations-page-link"
          aria-label={openProjectLocationsAriaLabel}
        >
          {openProjectLocationsLabel}
        </a>
      </div>
    </div>
  );
}

export function PortfolioProgressWireframe() {
  const locale = useLocale();
  const t = useTranslations("globalReports.portfolioProgress");
  const [filter, setFilter] = useState<ProjectFilter>("all");
  const [projectSearch, setProjectSearch] = useState("");
  const [pmFilter, setPmFilter] = useState<string[]>([]);
  const [imFilter, setImFilter] = useState<string[]>([]);
  const [peopleFilterOpen, setPeopleFilterOpen] = useState(false);
  const [comparePeriod, setComparePeriod] = useState<ComparePeriodState>(() => defaultComparePeriod());
  const [modalProjectId, setModalProjectId] = useState<string | null>(null);
  const [listProjects, setListProjects] = useState<PortfolioProjectListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [detailByKey, setDetailByKey] = useState<Record<string, PortfolioProjectSnapshot>>({});
  const [detailPeriodByProjectId, setDetailPeriodByProjectId] = useState<
    Record<string, ComparePeriodState>
  >({});
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const customRangeInvalid = isCustomRangeInvalid(comparePeriod);

  const fetchList = useCallback(async () => {
    if (customRangeInvalid) {
      setListProjects([]);
      setListLoading(false);
      return;
    }
    setListLoading(true);
    setListError(null);
    try {
      const res = await fetch(globalProgressListUrl(comparePeriod));
      if (!res.ok) throw new Error(t("loadError"));
      const data = (await res.json()) as { projects: PortfolioProjectListItem[] };
      setListProjects(data.projects ?? []);
    } catch {
      setListError(t("loadError"));
      setListProjects([]);
    } finally {
      setListLoading(false);
    }
  }, [comparePeriod, customRangeInvalid, t]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const fetchDetail = useCallback(
    async (projectId: string, period: ComparePeriodState) => {
      if (isCustomRangeInvalid(period)) return;
      const cacheKey = portfolioProgressDetailCacheKey(projectId, period);
      setDetailLoadingId(projectId);
      try {
        const res = await fetch(globalProgressDetailUrl(projectId, period));
        if (!res.ok) return;
        const data = (await res.json()) as { project: PortfolioProjectSnapshot };
        if (data.project) {
          setDetailByKey((prev) => ({ ...prev, [cacheKey]: data.project }));
        }
      } finally {
        setDetailLoadingId((current) => (current === projectId ? null : current));
      }
    },
    [],
  );

  const handleDetailPeriodChange = useCallback(
    (projectId: string, period: ComparePeriodState) => {
      setDetailPeriodByProjectId((prev) => ({ ...prev, [projectId]: period }));
      void fetchDetail(projectId, period);
    },
    [fetchDetail],
  );

  const handleOpenLevelBreakdown = useCallback(
    (projectId: string) => {
      const period = copyComparePeriod(comparePeriod);
      setDetailPeriodByProjectId((prev) => ({ ...prev, [projectId]: period }));
      setModalProjectId(projectId);
      void fetchDetail(projectId, period);
    },
    [comparePeriod, fetchDetail],
  );

  const filteredProjects = useMemo(() => {
    if (customRangeInvalid) return [];
    let list = listProjects;
    if (filter === "changed") list = list.filter((p) => p.hasChangesInPeriod);
    else if (filter === "unchanged") list = list.filter((p) => !p.hasChangesInPeriod);
    if (pmFilter.length > 0 || imFilter.length > 0) {
      list = list.filter((p) => projectMatchesPeopleFilters(p, pmFilter, imFilter));
    }
    if (projectSearch.trim()) {
      list = list.filter((p) => projectMatchesSearch(p, projectSearch));
    }
    return list;
  }, [filter, listProjects, customRangeInvalid, projectSearch, pmFilter, imFilter]);

  const uniquePMs = useMemo(() => uniqueProjectManagers(listProjects), [listProjects]);
  const uniqueIMs = useMemo(() => uniqueInstallManagers(listProjects), [listProjects]);
  const peopleFilterCount = pmFilter.length + imFilter.length;
  const hasPeopleFilter = peopleFilterCount > 0;

  const activeModalProjectId = useMemo(() => {
    if (modalProjectId === null) return null;
    return filteredProjects.some((p) => p.id === modalProjectId) ? modalProjectId : null;
  }, [modalProjectId, filteredProjects]);
  const modalProject =
    activeModalProjectId !== null
      ? listProjects.find((p) => p.id === activeModalProjectId) ?? null
      : null;
  const modalDetailPeriod =
    activeModalProjectId !== null
      ? detailPeriodByProjectId[activeModalProjectId] ?? comparePeriod
      : comparePeriod;
  const modalDetailProject =
    activeModalProjectId !== null
      ? detailByKey[portfolioProgressDetailCacheKey(activeModalProjectId, modalDetailPeriod)] ??
        null
      : null;

  const periodPresets: { id: ComparePeriodPreset; label: string }[] = [
    { id: "1w", label: t("period1w") },
    { id: "2w", label: t("period2w") },
    { id: "30d", label: t("period30d") },
    { id: "all", label: t("periodAll") },
    { id: "custom", label: t("periodCustom") },
  ];

  const presetLabels = useMemo(
    (): Record<ComparePeriodPreset, string> => ({
      "1w": t("period1w"),
      "2w": t("period2w"),
      "30d": t("period30d"),
      all: t("periodAll"),
      custom: t("periodCustom"),
    }),
    [t],
  );

  const cardLabels = useMemo(
    () => ({
      verifiedShort: t("verifiedShort"),
      unverifiedShort: t("unverifiedShort"),
      overallVerifiedLabel: t("overallVerifiedLabel"),
      noChangeThisPeriod: t("noChangeThisPeriod"),
      zeroDeltaThisPeriod: t("zeroDeltaThisPeriod"),
      deltaThisPeriod: (value: number) => t("deltaThisPeriod", { delta: value }),
      projectMeta: (scopeCount: number, complete: boolean) =>
        t("projectMeta", {
          count: scopeCount,
          status: complete ? t("statusComplete") : t("statusInProgress"),
        }),
      projectRollupTitle: (pct: number, deltaLabel: string, period: string) =>
        t("projectRollupTitle", { pct, delta: deltaLabel, period }),
      detailLoading: t("detailLoading"),
    }),
    [t],
  );

  const periodPickerShared = useMemo(
    () => ({
      customFromLabel: t("customFrom"),
      customToLabel: t("customTo"),
      customRangeError: t("customRangeError"),
      periodRangeSummary: (from: string, to: string) => t("periodRangeSummary", { from, to }),
      shortAll: t("periodShortAll"),
      shortCustom: t("periodShortCustom"),
      formatWeekOf: (range: string) => t("periodWeekOf", { range }),
    }),
    [t],
  );

  const periodPickerLabels = useMemo(
    () => ({
      ...periodPickerShared,
      projectPeriodLabel: t("projectPeriodLabel"),
      deltaVsPeriod: (period: string) => t("deltaVsPeriod", { period }),
    }),
    [periodPickerShared, t],
  );

  const baseProjectById = useMemo(
    () => new Map(listProjects.map((p) => [p.id, p])),
    [listProjects],
  );

  const filters: { id: ProjectFilter; label: string }[] = [
    { id: "all", label: t("filterAll") },
    { id: "changed", label: t("filterChanged") },
    { id: "unchanged", label: t("filterUnchanged") },
  ];

  const globalPeriodDisplay = useMemo(
    () =>
      periodDisplayForState(comparePeriod, locale, {
        formatWeekOf: periodPickerShared.formatWeekOf,
        shortAll: periodPickerShared.shortAll,
        shortCustom: periodPickerShared.shortCustom,
        presetLabels,
        deltaVsPeriod: periodPickerLabels.deltaVsPeriod,
      }),
    [comparePeriod, locale, periodPickerShared, presetLabels, periodPickerLabels.deltaVsPeriod],
  );

  const reportWindowHint = useMemo(
    () =>
      showingProgressWindowLabel(comparePeriod, globalPeriodDisplay.periodRangeDisplay, {
        showingProgressAll: t("showingProgressAll"),
        showingProgressWeekOf: (range) => t("showingProgressWeekOf", { range }),
        showingProgressRange: (range) => t("showingProgressRange", { range }),
      }),
    [comparePeriod, globalPeriodDisplay.periodRangeDisplay, t],
  );

  return (
    <div
      className="portfolio-progress-page"
      style={{
        padding: "var(--page-padding-y, 12px) var(--page-padding-x, 12px)",
        maxWidth: 1200,
      }}
    >
      <header style={{ marginBottom: 6 }}>
        <h1
          style={{
            margin: 0,
            fontSize: "var(--text-heading, 18px)",
            fontWeight: 700,
            color: "var(--neutral-900)",
            lineHeight: 1.25,
          }}
        >
          {t("title")}
        </h1>
        <p
          style={{
            margin: "2px 0 6px",
            fontSize: 12,
            lineHeight: 1.35,
            color: "var(--neutral-500)",
          }}
        >
          {t("subtitle")}
        </p>
      </header>

      {listLoading && (
        <p
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            margin: "0 0 8px",
            fontSize: 12,
            color: "var(--neutral-600)",
          }}
        >
          <Loader2 size={14} className="animate-spin" aria-hidden />
          {t("listLoading")}
        </p>
      )}

      {listError && (
        <p role="alert" style={{ margin: "0 0 8px", fontSize: 12, color: "var(--error-600)" }}>
          {listError}
        </p>
      )}

      {/* Filters: find projects → narrow list → compare window */}
      <section className="portfolio-progress-filters" aria-label={t("filterLabel")}>
        <div className="portfolio-progress-toolbar-row">
          <SearchInput
            className="portfolio-progress-search-field"
            variant="surface"
            height={36}
            fontSize={13}
            value={projectSearch}
            onChange={setProjectSearch}
            placeholder={t("searchPlaceholder")}
            ariaLabel={t("searchAriaLabel")}
            clearLabel={t("clearSearch")}
          />
          <div className="portfolio-progress-toolbar-actions">
            <div
              role="tablist"
              aria-label={t("filterLabel")}
              className="portfolio-progress-filter-tabs"
            >
              {filters.map((f) => {
                const active = filter === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setFilter(f.id)}
                    className={`portfolio-progress-filter-tab${
                      active ? " portfolio-progress-filter-tab--active" : ""
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
            <ComparePeriodDropdown
              idPrefix="portfolio-progress"
              ariaLabel={t("periodLabel")}
              comparePeriod={comparePeriod}
              onComparePeriodChange={setComparePeriod}
              periodPresets={periodPresets}
              locale={locale}
              {...periodPickerShared}
            />
            <ToolbarActionButton
              icon={<Filter size={14} aria-hidden />}
              badge={peopleFilterCount}
              active={peopleFilterCount > 0}
              onClick={() => setPeopleFilterOpen(true)}
              ariaLabel={t("filterPeopleAria")}
            />
          </div>
        </div>
      </section>

      <div className="portfolio-progress-list-meta">
        {reportWindowHint ? (
          <p className="portfolio-progress-report-window-hint">{reportWindowHint}</p>
        ) : (
          <span className="portfolio-progress-report-window-hint" aria-hidden="true" />
        )}
        <span className="portfolio-progress-filter-count" aria-live="polite">
          {t("projectCount", { count: filteredProjects.length })}
        </span>
      </div>

      <PortfolioProgressPeopleFilterPanel
        open={peopleFilterOpen}
        onClose={() => setPeopleFilterOpen(false)}
        pmFilter={pmFilter}
        imFilter={imFilter}
        onPmToggle={(name) => setPmFilter((prev) => toggleFilterValue(prev, name))}
        onImToggle={(name) => setImFilter((prev) => toggleFilterValue(prev, name))}
        onClear={() => {
          setPmFilter([]);
          setImFilter([]);
        }}
        uniquePMs={uniquePMs}
        uniqueIMs={uniqueIMs}
        filteredCount={filteredProjects.length}
        totalCount={listProjects.length}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filteredProjects.length === 0 ? (
          <p style={{ color: "var(--neutral-500)", fontSize: "var(--text-body, 14px)" }}>
            {projectSearch.trim()
              ? t("emptySearch")
              : hasPeopleFilter
                ? t("emptyPeopleFilter")
                : t("emptyFilter")}
          </p>
        ) : (
          filteredProjects.map((project) => {
            if (!baseProjectById.has(project.id)) return null;
            return (
              <ProjectCard
                key={project.id}
                listItem={project}
                periodShort={globalPeriodDisplay.periodShort}
                onOpenLevelBreakdown={() => handleOpenLevelBreakdown(project.id)}
                openLevelBreakdownLabel={t("openLevelBreakdown")}
                openLevelBreakdownAriaLabel={t("openLevelBreakdownAria", { project: project.name })}
                openProjectLocationsLabel={t("openProjectLocationsPage")}
                openProjectLocationsAriaLabel={t("openProjectLocationsPageAria", {
                  project: project.name,
                })}
                locationsHref={buildProjectLocationsHref(locale, project.id)}
                cardLabels={cardLabels}
              />
            );
          })
        )}
      </div>

      {modalProject && (
        <PortfolioProgressLevelBreakdownModal
          open={activeModalProjectId !== null}
          onClose={() => setModalProjectId(null)}
          listItem={modalProject}
          detailProject={modalDetailProject}
          detailLoading={detailLoadingId === activeModalProjectId}
          detailPeriod={modalDetailPeriod}
          onDetailPeriodChange={(period) =>
            handleDetailPeriodChange(activeModalProjectId!, period)
          }
          levelReportLabel={t("levelReportTitle")}
          detailLoadingLabel={t("detailLoading")}
          periodPresets={periodPresets}
          periodPickerLabels={periodPickerLabels}
        />
      )}

    </div>
  );
}
