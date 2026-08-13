"use client";

import { useId, useState } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { CustomSiteLocationTile } from "@/components/projects/CustomSiteLocationTile";
import { CustomSiteLocationAddTile } from "@/components/projects/CustomSiteLocationAddTile";
import { useCustomSiteLocations } from "@/components/projects/CustomSiteLocationsProvider";
import {
  CUSTOM_SITE_STRIP_COUNT_STYLE,
  CUSTOM_SITE_STRIP_ROW_STYLE,
  CUSTOM_SITE_STRIP_TITLE_STYLE,
  customSiteStripAddButtonStyle,
  customSiteStripBarBorder,
} from "@/components/projects/customSiteStripRowStyle";

interface BuildingCustomSiteLocationsStripProps {
  buildingKey: string;
  buildingStripe: string;
}

/**
 * Collapsed-by-default strip for custom locations scoped to a building (not a level).
 * Sits under the building header and above level rows.
 */
export function BuildingCustomSiteLocationsStrip({
  buildingKey,
  buildingStripe,
}: BuildingCustomSiteLocationsStripProps) {
  const t = useTranslations("units.customSite");
  const tUnits = useTranslations("units");
  const contentId = useId();
  const [expanded, setExpanded] = useState(false);
  const { locationsForBuilding, openAddSheetForBuilding, openLocation, openEdit, requestDelete, locationsFilterVisible } =
    useCustomSiteLocations();
  const locations = locationsForBuilding(buildingKey);

  if (!locationsFilterVisible) return null;

  const sectionTitle = t("buildingSectionTitle");
  const toggleAria = expanded
    ? t("buildingSectionToggleCollapse", { title: sectionTitle })
    : t("buildingSectionToggleExpand", { title: sectionTitle });

  const barBg = expanded ? buildingStripe : "var(--neutral-50)";
  const barFg = expanded
    ? buildingStripe === "var(--building-c)"
      ? "var(--color-text-primary)"
      : "var(--color-text-inverse)"
    : "var(--neutral-800)";
  const countChipBg = expanded ? "rgba(255,255,255,0.14)" : "var(--color-surface)";
  const countChipFg = expanded ? barFg : "var(--color-text-secondary)";
  const chevronColor = expanded ? barFg : "var(--neutral-500)";

  return (
    <div style={{ marginBottom: 6 }}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-controls={contentId}
        aria-label={toggleAria}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        style={{
          ...CUSTOM_SITE_STRIP_ROW_STYLE,
          backgroundColor: barBg,
          ...customSiteStripBarBorder(buildingStripe, !expanded),
          transition: "background-color 0.15s ease, color 0.15s ease",
        }}
      >
        <span
          style={{
            ...CUSTOM_SITE_STRIP_TITLE_STYLE,
            color: barFg,
          }}
        >
          {sectionTitle}
        </span>
        <span
          style={{
            ...CUSTOM_SITE_STRIP_COUNT_STYLE,
            backgroundColor: countChipBg,
            color: countChipFg,
          }}
        >
          {tUnits("locationGroupUnitCountCompact", { count: locations.length })}
        </span>

        <button
          type="button"
          aria-label={t("addForBuildingAria", { building: buildingKey })}
          title={t("addForBuildingAria", { building: buildingKey })}
          onClick={(e) => {
            e.stopPropagation();
            openAddSheetForBuilding(buildingKey);
          }}
          style={customSiteStripAddButtonStyle(expanded)}
        >
          <Plus size={14} strokeWidth={2.25} aria-hidden />
        </button>

        <span
          aria-hidden
          style={{
            display: "inline-flex",
            color: chevronColor,
            flexShrink: 0,
          }}
        >
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </div>

      {expanded && (
        <div
          id={contentId}
          role="region"
          aria-label={sectionTitle}
          className="units-grid-squares"
          style={{ marginTop: 6 }}
        >
          {locations.map((loc) => (
            <div key={loc.id} style={{ minWidth: 0 }}>
              <CustomSiteLocationTile
                location={loc}
                variant="level"
                onOpen={() => openLocation(loc)}
                onEdit={() => openEdit(loc)}
                onDelete={() => requestDelete(loc)}
              />
            </div>
          ))}
          <CustomSiteLocationAddTile
            ariaLabel={t("addForBuildingAria", { building: buildingKey })}
            onClick={() => openAddSheetForBuilding(buildingKey)}
          />
        </div>
      )}
    </div>
  );
}
