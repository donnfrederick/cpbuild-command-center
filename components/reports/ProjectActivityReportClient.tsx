"use client";

import { useMemo, useState } from "react";
import { Filter } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { ActivityCountBarList } from "@/components/reports/ActivityCountBarList";
import { ActivityListCountSummary } from "@/components/shared/ActivityListCountSummary";
import { ComparePeriodPicker } from "@/components/reports/ComparePeriodPicker";
import { SearchInput } from "@/components/shared/SearchInput";
import { ToolbarActionButton } from "@/components/shared/ToolbarActionButton";
import {
  FilterPanelCheckboxRow,
  FilterPanelFooterActions,
  FilterPanelSection,
  FilterPanelShell,
} from "@/components/shared/filterPanel";
import type { ActivityCountSort } from "@/lib/reports/activity-count-shared";
import {
  isCustomRangeInvalid,
  type ComparePeriodPreset,
  type ComparePeriodState,
} from "@/lib/reports/portfolio-progress-period";
import { toggleFilterValue } from "@/lib/reports/portfolio-progress-filters";
import {
  filterProjectActivityRows,
  projectActivitySubtitle,
  sortActivityCountRows,
  uniqueProjectActivityIMs,
  uniqueProjectActivityPMs,
} from "@/lib/reports/project-activity-filters";
import type { ProjectActivityRow } from "@/lib/reports/project-activity-types";
import {
  userActivityPeriodQueryString as projectActivityPeriodQueryString,
} from "@/lib/reports/user-activity-period-params";

interface ProjectActivityReportClientProps {
  rows: ProjectActivityRow[];
  period: ComparePeriodState;
}

export function ProjectActivityReportClient({ rows, period }: ProjectActivityReportClientProps) {
  const t = useTranslations("dashboardActivity");
  const tProgress = useTranslations("globalReports.portfolioProgress");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<ActivityCountSort>("most");
  const [pmFilter, setPmFilter] = useState<string[]>([]);
  const [imFilter, setImFilter] = useState<string[]>([]);
  const [showPeopleFilter, setShowPeopleFilter] = useState(false);

  const periodPresets = useMemo(
    (): { id: ComparePeriodPreset; label: string }[] => [
      { id: "1w", label: tProgress("period1w") },
      { id: "2w", label: tProgress("period2w") },
      { id: "30d", label: tProgress("period30d") },
      { id: "all", label: tProgress("periodAll") },
      { id: "custom", label: tProgress("periodCustom") },
    ],
    [tProgress],
  );

  const uniquePMs = useMemo(() => uniqueProjectActivityPMs(rows), [rows]);
  const uniqueIMs = useMemo(() => uniqueProjectActivityIMs(rows), [rows]);
  const peopleFilterCount = pmFilter.length + imFilter.length;

  const displayedRows = useMemo(() => {
    const filtered = filterProjectActivityRows(rows, { search, pmFilter, imFilter });
    return sortActivityCountRows(
      filtered.map((row) => ({
        id: row.id,
        name: row.name,
        subtitle: projectActivitySubtitle(row),
        count: row.count,
      })),
      sort,
    );
  }, [rows, search, pmFilter, imFilter, sort]);

  const filteredProjectCount = useMemo(
    () => filterProjectActivityRows(rows, { search, pmFilter, imFilter }).length,
    [rows, search, pmFilter, imFilter],
  );
  const totalProjectCount = rows.length;
  const projectCountLabel =
    filteredProjectCount < totalProjectCount
      ? t("byProjectCountFilteredSummary", {
          filtered: filteredProjectCount,
          total: totalProjectCount,
        })
      : t("byProjectCountSummary", { count: totalProjectCount });

  const navigatePeriod = (next: ComparePeriodState) => {
    if (next.preset === "custom" && isCustomRangeInvalid(next)) {
      return;
    }
    const qs = projectActivityPeriodQueryString(next);
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <div
      style={{
        padding: "var(--page-padding-y, 12px) var(--page-padding-x, 12px)",
        maxWidth: 1200,
      }}
    >
      <header style={{ marginBottom: 10 }}>
        <h1
          style={{
            margin: 0,
            fontSize: "var(--text-heading, 20px)",
            fontWeight: 700,
            color: "var(--neutral-900)",
            lineHeight: 1.25,
          }}
        >
          {t("byProjectTitle")}
        </h1>
        <p
          style={{
            margin: "4px 0 0",
            fontSize: "var(--text-body, 14px)",
            lineHeight: 1.35,
            color: "var(--neutral-500)",
          }}
        >
          {t("byProjectSubtitle")}
        </p>
      </header>

      <section
        aria-label={t("byProjectFiltersAria")}
        style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <SearchInput
              variant="surface"
              height={36}
              fontSize={13}
              value={search}
              onChange={setSearch}
              placeholder={t("byProjectSearchPlaceholder")}
              ariaLabel={t("byProjectSearchAria")}
              clearLabel={t("byProjectSearchClear")}
            />
          </div>
          <ToolbarActionButton
            variant="filter-surface"
            icon={<Filter size={16} aria-hidden />}
            active={peopleFilterCount > 0}
            badge={peopleFilterCount}
            onClick={() => setShowPeopleFilter(true)}
            ariaLabel={t("byProjectPeopleFilterAria")}
          />
        </div>

        <ComparePeriodPicker
          idPrefix="project-activity"
          ariaLabel={t("byProjectPeriodLabel")}
          comparePeriod={period}
          onComparePeriodChange={navigatePeriod}
          periodPresets={periodPresets}
          locale={locale}
          customFromLabel={tProgress("customFrom")}
          customToLabel={tProgress("customTo")}
          customRangeError={tProgress("customRangeError")}
          periodRangeSummary={(from, to) => tProgress("periodRangeSummary", { from, to })}
        />
      </section>

      {totalProjectCount === 0 ? (
        <p style={{ margin: 0, fontSize: "var(--text-body, 14px)", color: "var(--neutral-500)" }}>
          {t("byProjectEmptyFilter")}
        </p>
      ) : (
        <>
          <ActivityListCountSummary
            filtered={filteredProjectCount}
            total={totalProjectCount}
            label={projectCountLabel}
          />
          {displayedRows.length === 0 ? (
            <p style={{ margin: "12px 0 0", fontSize: "var(--text-body, 14px)", color: "var(--neutral-500)" }}>
              {t("byProjectEmptyFilter")}
            </p>
          ) : (
            <ActivityCountBarList
              rows={displayedRows}
              sort={sort}
              onSortToggle={() => setSort((prev) => (prev === "most" ? "least" : "most"))}
              nameColumnLabel={t("byProjectColumnProject")}
              activityColumnLabel={t("byProjectColumnActivity")}
              sortActivityAria={t("byProjectSortActivityAria")}
              countLabel={(count) => t("byProjectEventCount", { count })}
            />
          )}
        </>
      )}

      {showPeopleFilter && (
        <FilterPanelShell
          title={tProgress("filterPeopleTitle")}
          subtitle={tProgress("filterPeopleSubtitle")}
          closeAriaLabel={t("closeFilterPanel")}
          onClose={() => setShowPeopleFilter(false)}
          footer={
            <FilterPanelFooterActions
              clearLabel={tProgress("filterPeopleClear")}
              applyLabel={t("filterDone")}
              onClear={() => {
                setPmFilter([]);
                setImFilter([]);
              }}
              onApply={() => setShowPeopleFilter(false)}
              clearDisabled={peopleFilterCount === 0}
            />
          }
        >
          {uniquePMs.length > 0 && (
            <FilterPanelSection label={t("byProjectPmSection")}>
              {uniquePMs.map((pm) => (
                <FilterPanelCheckboxRow
                  key={pm}
                  label={pm}
                  checked={pmFilter.includes(pm)}
                  onToggle={() => setPmFilter((prev) => toggleFilterValue(prev, pm))}
                />
              ))}
            </FilterPanelSection>
          )}
          {uniqueIMs.length > 0 && (
            <FilterPanelSection label={t("byProjectImSection")}>
              {uniqueIMs.map((im) => (
                <FilterPanelCheckboxRow
                  key={im || "__unassigned__"}
                  label={im || tProgress("filterUnassigned")}
                  checked={imFilter.includes(im)}
                  onToggle={() => setImFilter((prev) => toggleFilterValue(prev, im))}
                />
              ))}
            </FilterPanelSection>
          )}
        </FilterPanelShell>
      )}
    </div>
  );
}
