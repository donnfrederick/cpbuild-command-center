"use client";

import { useMemo, useState } from "react";
import { Filter } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { ComparePeriodPicker } from "@/components/reports/ComparePeriodPicker";
import { ActivityCountBarList } from "@/components/reports/ActivityCountBarList";
import { SearchInput } from "@/components/shared/SearchInput";
import { ToolbarActionButton } from "@/components/shared/ToolbarActionButton";
import {
  FilterPanelCheckboxRow,
  FilterPanelFooterActions,
  FilterPanelSection,
  FilterPanelShell,
} from "@/components/shared/filterPanel";
import { formatRole } from "@/lib/permissions";
import {
  filterUserActivityRows,
  sortUserActivityRows,
  uniqueRoleCodes,
} from "@/lib/reports/user-activity-filters";
import type { ActivityCountSort } from "@/lib/reports/activity-count-shared";
import {
  isCustomRangeInvalid,
  type ComparePeriodPreset,
  type ComparePeriodState,
} from "@/lib/reports/portfolio-progress-period";
import { userActivityPeriodQueryString } from "@/lib/reports/user-activity-period-params";
import type { UserActivityRow } from "@/lib/reports/user-activity-types";

interface UserActivityReportClientProps {
  rows: UserActivityRow[];
  period: ComparePeriodState;
}

export function UserActivityReportClient({ rows, period }: UserActivityReportClientProps) {
  const t = useTranslations("dashboardActivity");
  const tProgress = useTranslations("globalReports.portfolioProgress");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<ActivityCountSort>("most");
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [showRoleFilter, setShowRoleFilter] = useState(false);

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

  const availableRoles = useMemo(() => uniqueRoleCodes(rows), [rows]);

  const displayedRows = useMemo(() => {
    const filtered = filterUserActivityRows(rows, { search, roleCodes: roleFilter });
    return sortUserActivityRows(filtered, sort).map((row) => ({
      id: row.id,
      name: row.name,
      subtitle: formatRole(row.role),
      count: row.count,
    }));
  }, [rows, search, roleFilter, sort]);

  const navigatePeriod = (next: ComparePeriodState) => {
    if (next.preset === "custom" && isCustomRangeInvalid(next)) {
      return;
    }
    const qs = userActivityPeriodQueryString(next);
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const toggleRole = (code: string) => {
    setRoleFilter((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
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
          {t("byUserTitle")}
        </h1>
        <p
          style={{
            margin: "4px 0 0",
            fontSize: "var(--text-body, 14px)",
            lineHeight: 1.35,
            color: "var(--neutral-500)",
          }}
        >
          {t("byUserSubtitle")}
        </p>
      </header>

      <section
        aria-label={t("byUserFiltersAria")}
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
              placeholder={t("byUserSearchPlaceholder")}
              ariaLabel={t("byUserSearchAria")}
              clearLabel={t("byUserSearchClear")}
            />
          </div>
          <ToolbarActionButton
            variant="filter-surface"
            icon={<Filter size={16} aria-hidden />}
            active={roleFilter.length > 0}
            badge={roleFilter.length}
            onClick={() => setShowRoleFilter(true)}
            ariaLabel={t("byUserRoleFilterAria")}
          />
        </div>

        <ComparePeriodPicker
          idPrefix="user-activity"
          ariaLabel={t("byUserPeriodLabel")}
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

      {displayedRows.length === 0 ? (
        <p style={{ margin: 0, fontSize: "var(--text-body, 14px)", color: "var(--neutral-500)" }}>
          {t("byUserEmptyFilter")}
        </p>
      ) : (
        <ActivityCountBarList
          rows={displayedRows}
          sort={sort}
          onSortToggle={() => setSort((prev) => (prev === "most" ? "least" : "most"))}
          nameColumnLabel={t("byUserColumnUser")}
          activityColumnLabel={t("byUserColumnActivity")}
          sortActivityAria={t("byUserSortActivityAria")}
          countLabel={(count) => t("byUserEventCount", { count })}
        />
      )}

      {showRoleFilter && (
        <FilterPanelShell
          title={t("byUserRoleFilterTitle")}
          subtitle={t("byUserRoleFilterSubtitle")}
          closeAriaLabel={t("closeFilterPanel")}
          onClose={() => setShowRoleFilter(false)}
          footer={
            <FilterPanelFooterActions
              clearLabel={t("byUserRoleFilterClear")}
              applyLabel={t("filterDone")}
              onClear={() => setRoleFilter([])}
              onApply={() => setShowRoleFilter(false)}
              clearDisabled={roleFilter.length === 0}
            />
          }
        >
          <FilterPanelSection label={t("byUserRoleFilterSection")}>
            {availableRoles.map((code) => (
              <FilterPanelCheckboxRow
                key={code}
                label={formatRole(code)}
                checked={roleFilter.includes(code)}
                onToggle={() => toggleRole(code)}
              />
            ))}
          </FilterPanelSection>
        </FilterPanelShell>
      )}
    </div>
  );
}
