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
} from "@/components/shared/filterPanel";

export interface BuildingLevelFilterOptions {
  buildings: string[];
  buildingLevels: Record<string, string[]>;
}

export interface BuildingLevelFilterValue {
  buildings: string[];
  levels: string[];
}

interface BuildingLevelFilterSectionProps {
  options: BuildingLevelFilterOptions;
  value: BuildingLevelFilterValue;
  onChange: (next: BuildingLevelFilterValue) => void;
  /** When true, omit the outer section header (caller supplies title). */
  bare?: boolean;
}

export function BuildingLevelFilterSection({
  options,
  value,
  onChange,
  bare = false,
}: BuildingLevelFilterSectionProps) {
  const tUnits = useTranslations("units");

  const [expandedBuildings, setExpandedBuildings] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const building of value.buildings) initial.add(building);
    for (const levelKey of value.levels) initial.add(levelKey.split("::")[0] ?? "");
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
    const wholeSelected = value.buildings.includes(building);
    const levels = options.buildingLevels[building] ?? [];
    if (wholeSelected) {
      onChange({
        buildings: value.buildings.filter((b) => b !== building),
        levels: value.levels.filter((lk) => !lk.startsWith(`${building}::`)),
      });
      return;
    }
    onChange({
      buildings: [...value.buildings, building],
      levels: value.levels.filter((lk) => !lk.startsWith(`${building}::`)),
    });
    if (levels.length > 0) {
      setExpandedBuildings((prev) => new Set(prev).add(building));
    }
  };

  const toggleLevel = (building: string, level: string) => {
    const levelKey = `${building}::${level}`;
    const active = value.levels.includes(levelKey);
    onChange({
      buildings: value.buildings.filter((b) => b !== building),
      levels: active
        ? value.levels.filter((lk) => lk !== levelKey)
        : [...value.levels, levelKey],
    });
  };

  const locationActiveCount = value.buildings.length + value.levels.length;

  if (options.buildings.length === 0) return null;

  const accordion = (
    <FilterPanelAccordionStack>
      {options.buildings.map((building) => {
        const expanded = expandedBuildings.has(building);
        const levels = options.buildingLevels[building] ?? [];
        const wholeSelected = value.buildings.includes(building);
        const selectedLevelCount = levels.filter((level) =>
          value.levels.includes(`${building}::${level}`),
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
                    checked={value.levels.includes(`${building}::${level}`)}
                    onToggle={() => toggleLevel(building, level)}
                  />
                );
              })}
            </FilterPanelScrollList>
          </FilterAccordionCard>
        );
      })}
    </FilterPanelAccordionStack>
  );

  if (bare) return accordion;

  return (
    <FilterPanelSection
      label={tUnits("filterLocation")}
      activeCount={locationActiveCount}
    >
      {accordion}
    </FilterPanelSection>
  );
}
