"use client";

import { useState } from "react";
import { Building2 } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  FilterAccordionCard,
  FilterPanelAccordionStack,
  FilterPanelCheckboxRow,
  FilterPanelScrollList,
  FilterPanelSection,
  FilterPill,
  FilterPillGroup,
} from "@/components/shared/filterPanel";
import type { AlbumSourceType } from "@/lib/media/album-types";
import type { LocationKindFilter } from "@/lib/location-kind-filter";
import { LOCATION_KIND_FILTERS } from "@/lib/location-kind-filter";
import {
  ALBUM_SOURCE_TAG_KEYS,
  MEDIA_SOURCE_FILTER_KEYS,
  type MediaActiveFilters,
  type MediaSourceFilterKey,
} from "@/lib/media/media-filters";
import type { MediaLocationFilterOptions } from "@/lib/media/media-filters";

interface MediaSharedFilterSectionsProps {
  filters: MediaActiveFilters;
  onChange: (filters: MediaActiveFilters) => void;
  options: MediaLocationFilterOptions;
  /** Hide location-kind section (e.g. bulk dialog when list is already narrowed). */
  showLocationKinds?: boolean;
  /** Bulk-load dialog: navy headers toggle section bodies (default collapsed). */
  collapsibleSections?: boolean;
  /** Only when `collapsibleSections` — defaults to false. */
  sectionsDefaultExpanded?: boolean;
}

export function MediaSharedFilterSections({
  filters,
  onChange,
  options,
  showLocationKinds = true,
  collapsibleSections = false,
  sectionsDefaultExpanded = false,
}: MediaSharedFilterSectionsProps) {
  const t = useTranslations("units.mediaView");
  const tUnits = useTranslations("units");
  const tAlbum = useTranslations("units.album");

  const [expandedBuildings, setExpandedBuildings] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const building of filters.buildings) initial.add(building);
    for (const levelKey of filters.levels) initial.add(levelKey.split("::")[0] ?? "");
    return initial;
  });

  const toggleBuildingExpand = (building: string) => {
    setExpandedBuildings((prev) => {
      const next = new Set(prev);
      if (next.has(building)) next.delete(building);
      else next.add(building);
      return next;
    });
  };

  const toggleBuilding = (building: string) => {
    const wholeSelected = filters.buildings.includes(building);
    const levels = options.buildingLevels[building] ?? [];
    if (wholeSelected) {
      onChange({
        ...filters,
        buildings: filters.buildings.filter((b) => b !== building),
        levels: filters.levels.filter((lk) => !lk.startsWith(`${building}::`)),
      });
      return;
    }
    onChange({
      ...filters,
      buildings: [...filters.buildings, building],
      levels: filters.levels.filter((lk) => !lk.startsWith(`${building}::`)),
    });
    if (levels.length > 0) {
      setExpandedBuildings((prev) => new Set(prev).add(building));
    }
  };

  const toggleLevel = (building: string, level: string) => {
    const levelKey = `${building}::${level}`;
    const active = filters.levels.includes(levelKey);
    onChange({
      ...filters,
      buildings: filters.buildings.filter((b) => b !== building),
      levels: active
        ? filters.levels.filter((lk) => lk !== levelKey)
        : [...filters.levels, levelKey],
    });
  };

  const toggleLocationKind = (kind: LocationKindFilter) => {
    const active = filters.locationKinds.includes(kind);
    onChange({
      ...filters,
      locationKinds: active
        ? filters.locationKinds.filter((k) => k !== kind)
        : [...filters.locationKinds, kind],
    });
  };

  const toggleMediaSource = (key: MediaSourceFilterKey) => {
    const active = filters.mediaSourceTypes.includes(key);
    onChange({
      ...filters,
      mediaSourceTypes: active
        ? filters.mediaSourceTypes.filter((k) => k !== key)
        : [...filters.mediaSourceTypes, key],
    });
  };

  const toggleAlbumSourceTag = (tag: AlbumSourceType) => {
    const active = filters.albumSourceTags.includes(tag);
    onChange({
      ...filters,
      albumSourceTags: active
        ? filters.albumSourceTags.filter((k) => k !== tag)
        : [...filters.albumSourceTags, tag],
    });
  };

  const mediaTypeLabel = (key: MediaSourceFilterKey): string => {
    switch (key) {
      case "observation":
        return t("filterMediaTypeObservation");
      case "issue":
        return t("filterMediaTypeIssue");
      case "inspection":
        return t("filterMediaTypeInspection");
      case "general":
        return t("filterMediaTypeGeneral");
      case "status_update":
        return t("filterMediaTypeStatusUpdate");
      default:
        return key;
    }
  };

  const albumTagLabel = (tag: AlbumSourceType): string => {
    const labelMap: Record<AlbumSourceType, string> = {
      observation: tAlbum("sourceObservation"),
      observation_comment: tAlbum("sourceObservationComment"),
      issue: tAlbum("sourceIssue"),
      issue_comment: tAlbum("sourceIssueComment"),
      inspection: tAlbum("sourceInspection"),
      general: tAlbum("sourceGeneral"),
      status_update: tAlbum("sourceStatusUpdate"),
    };
    return labelMap[tag];
  };

  const locationActiveCount =
    filters.buildings.length
    + filters.levels.length;

  const sectionProps = collapsibleSections
    ? { collapsible: true as const, defaultExpanded: sectionsDefaultExpanded }
    : {};

  return (
    <>
      <FilterPanelSection
        label={t("filterMediaType")}
        activeCount={filters.mediaSourceTypes.length}
        {...sectionProps}
      >
        <FilterPillGroup>
          {MEDIA_SOURCE_FILTER_KEYS.map((key) => (
            <FilterPill
              key={key}
              label={mediaTypeLabel(key)}
              active={filters.mediaSourceTypes.includes(key)}
              onClick={() => toggleMediaSource(key)}
            />
          ))}
        </FilterPillGroup>
      </FilterPanelSection>

      <FilterPanelSection
        label={t("filterSourceTags")}
        activeCount={filters.albumSourceTags.length}
        {...sectionProps}
      >
        <FilterPillGroup>
          {ALBUM_SOURCE_TAG_KEYS.map((tag) => (
            <FilterPill
              key={tag}
              label={albumTagLabel(tag)}
              active={filters.albumSourceTags.includes(tag)}
              onClick={() => toggleAlbumSourceTag(tag)}
            />
          ))}
        </FilterPillGroup>
      </FilterPanelSection>

      {showLocationKinds ? (
        <FilterPanelSection
          label={tUnits("filterUnitType")}
          activeCount={filters.locationKinds.length}
          {...sectionProps}
        >
          {LOCATION_KIND_FILTERS.map((kind) => {
            const label =
              kind === "common_areas"
                ? tUnits("filterAllCommonAreas")
                : kind === "custom_locations"
                  ? tUnits("filterAllCustomLocations")
                  : tUnits("filterAllUnits");
            return (
              <FilterPanelCheckboxRow
                key={kind}
                label={label}
                checked={filters.locationKinds.includes(kind)}
                onToggle={() => toggleLocationKind(kind)}
              />
            );
          })}
        </FilterPanelSection>
      ) : null}

      {options.buildings.length > 0 ? (
        <FilterPanelSection
          label={tUnits("filterLocation")}
          activeCount={locationActiveCount}
          {...sectionProps}
        >
          <FilterPanelAccordionStack>
            {options.buildings.map((building) => {
              const expanded = expandedBuildings.has(building);
              const levels = options.buildingLevels[building] ?? [];
              const wholeSelected = filters.buildings.includes(building);
              const selectedLevelCount = levels.filter((level) =>
                filters.levels.includes(`${building}::${level}`),
              ).length;
              const anyActive = wholeSelected || selectedLevelCount > 0;
              const buildingLabel = building === "—" ? tUnits("buildingNotSet") : building;
              const activeCount = wholeSelected ? 1 : selectedLevelCount;

              return (
                <FilterAccordionCard
                  key={building}
                  label={buildingLabel}
                  expanded={expanded}
                  onToggle={() => toggleBuildingExpand(building)}
                  activeCount={anyActive ? activeCount : 0}
                  previewLabels={wholeSelected && !expanded ? [tUnits("filterBuildingAll")] : []}
                  leadingIcon={<Building2 size={15} className="filter-panel-building-icon" aria-hidden />}
                >
                  <FilterPanelScrollList maxHeight={200}>
                    <FilterPanelCheckboxRow
                      label={tUnits("filterAllInBuilding", { building: buildingLabel })}
                      checked={wholeSelected}
                      onToggle={() => toggleBuilding(building)}
                    />
                    {levels.map((level) => {
                      const levelLabel = level === "—" ? tUnits("levelNotSet") : level;
                      return (
                        <FilterPanelCheckboxRow
                          key={level}
                          label={levelLabel}
                          checked={filters.levels.includes(`${building}::${level}`)}
                          onToggle={() => toggleLevel(building, level)}
                        />
                      );
                    })}
                  </FilterPanelScrollList>
                </FilterAccordionCard>
              );
            })}
          </FilterPanelAccordionStack>
        </FilterPanelSection>
      ) : null}
    </>
  );
}
