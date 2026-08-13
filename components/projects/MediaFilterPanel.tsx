"use client";

import { useTranslations } from "next-intl";
import {
  FilterPanelFooterActions,
  FilterPanelShell,
} from "@/components/shared/filterPanel";
import { MediaSharedFilterSections } from "@/components/projects/MediaSharedFilterSections";
import type { MediaActiveFilters, MediaLocationFilterOptions } from "@/lib/media/media-filters";

interface MediaFilterPanelProps {
  filters: MediaActiveFilters;
  options: MediaLocationFilterOptions;
  onChange: (filters: MediaActiveFilters) => void;
  onClose: () => void;
  onClear: () => void;
  locationCount?: { filtered: number; total: number } | null;
}

export function MediaFilterPanel({
  filters,
  options,
  onChange,
  onClose,
  onClear,
  locationCount,
}: MediaFilterPanelProps) {
  const t = useTranslations("units.mediaView");
  const tUnits = useTranslations("units");

  return (
    <FilterPanelShell
      title={t("filterTitle")}
      subtitle={t("filterSubtitle")}
      closeAriaLabel={tUnits("filterClose")}
      onClose={onClose}
      summary={
        locationCount ? (
          <p style={{ margin: 0, fontSize: 13, color: "var(--neutral-600)" }}>
            {t("filterLocationSummary", {
              filtered: locationCount.filtered,
              total: locationCount.total,
            })}
          </p>
        ) : undefined
      }
      footer={
        <FilterPanelFooterActions
          clearLabel={tUnits("filterClearAll")}
          applyLabel={tUnits("filterDone")}
          onClear={onClear}
          onApply={onClose}
        />
      }
    >
      <MediaSharedFilterSections filters={filters} onChange={onChange} options={options} />
    </FilterPanelShell>
  );
}
