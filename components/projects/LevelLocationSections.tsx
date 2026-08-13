"use client";

import type { CSSProperties, ReactNode } from "react";
import type { UnitCard } from "@/components/projects/UnitCards";
import { useTranslations } from "next-intl";
import { CustomSiteLocationTile } from "@/components/projects/CustomSiteLocationTile";
import { CustomSiteLocationAddTile } from "@/components/projects/CustomSiteLocationAddTile";
import { useCustomSiteLocations } from "@/components/projects/CustomSiteLocationsProvider";

function LocationTypeSectionDivider({ label, style }: { label: string; style?: CSSProperties }) {
  return (
    <div
      role="separator"
      aria-label={label}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        margin: "8px 0",
        ...style,
      }}
    >
      <div style={{ flex: 1, height: 1, background: "var(--neutral-200)" }} />
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--neutral-400)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          userSelect: "none",
        }}
      >
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: "var(--neutral-200)" }} />
    </div>
  );
}

export type LevelScopeStatRow = { name: string; pct: number; subPct: number };

/** Per-scope install % — light surface, shown above custom locations when a level expands. */
export function LevelScopeBreakdownPanel({
  scopeStats,
}: {
  scopeStats: LevelScopeStatRow[];
}) {
  const t = useTranslations("units");
  if (scopeStats.length < 2) return null;

  return (
    <div style={{ padding: "8px 0 10px" }}>
      <p
        style={{
          margin: "0 0 8px",
          fontSize: 9,
          fontWeight: 700,
          color: "var(--neutral-400)",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
        }}
      >
        {t("scopeCompleteByScope")}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {scopeStats.map(({ name, pct, subPct }) => (
          <div
            key={name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 0",
            }}
          >
            <span
              style={{
                width: 68,
                fontSize: 11,
                fontWeight: 600,
                color: "var(--color-text-secondary)",
                flexShrink: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={name}
            >
              {name}
            </span>
            <div
              style={{
                flex: 1,
                height: 4,
                borderRadius: 99,
                overflow: "hidden",
                backgroundColor: "var(--neutral-200)",
                display: "flex",
              }}
            >
              {pct > 0 && (
                <div
                  style={{
                    height: "100%",
                    width: `${pct}%`,
                    backgroundColor: "var(--success-600)",
                    borderRadius: subPct > 0 ? 0 : 99,
                    transition: "width 0.4s ease",
                  }}
                />
              )}
              {subPct > 0 && (
                <div
                  style={{
                    height: "100%",
                    width: `${subPct}%`,
                    backgroundColor: "var(--success-300)",
                    borderRadius: pct > 0 ? "0 99px 99px 0" : 99,
                    transition: "width 0.4s ease",
                  }}
                />
              )}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 2,
                flexShrink: 0,
                minWidth: 34,
                justifyContent: "flex-end",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  color: pct === 0 ? "var(--neutral-400)" : "var(--success-700)",
                }}
              >
                {pct}%
              </span>
              {subPct > 0 && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: "var(--success-600)",
                    fontVariantNumeric: "tabular-nums",
                    opacity: 0.75,
                  }}
                >
                  +{subPct}%
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CustomLocationsDivider() {
  const t = useTranslations("units");
  return (
    <div
      role="separator"
      aria-label={t("sectionCustomLocations")}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        margin: "10px 0 6px",
      }}
    >
      <div style={{ flex: 1, height: 1, background: "var(--neutral-200)" }} />
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--primary-600)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          userSelect: "none",
        }}
      >
        {t("sectionCustomLocations")}
      </span>
      <div style={{ flex: 1, height: 1, background: "var(--neutral-200)" }} />
    </div>
  );
}

interface LevelCustomSiteLocationCardsProps {
  buildingKey: string;
  levelKey: string;
}

/** Real building + level rows only — not synthetic __flat / __all buckets. */
function shouldShowLevelCustomSiteSection(
  locationsFilterVisible: boolean,
  buildingKey: string,
  levelKey: string,
): boolean {
  return locationsFilterVisible && buildingKey !== "__flat" && levelKey !== "__all";
}

function LevelCustomSiteLocationCards({ buildingKey, levelKey }: LevelCustomSiteLocationCardsProps) {
  const t = useTranslations("units.customSite");
  const { locationsForLevel, openAddSheetForLevel, openLocation, openEdit, requestDelete } =
    useCustomSiteLocations();
  const locations = locationsForLevel(buildingKey, levelKey);

  return (
    <div className="units-grid-squares" style={{ marginBottom: 8 }}>
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
        ariaLabel={t("addForLevelAria", { building: buildingKey, level: levelKey })}
        onClick={() => openAddSheetForLevel(buildingKey, levelKey)}
      />
    </div>
  );
}

interface LevelLocationSectionsProps {
  buildingKey: string;
  levelKey: string;
  commonAreaCards: UnitCard[];
  unitCards: UnitCard[];
  allCards: UnitCard[];
  renderCardGrid: (cards: UnitCard[]) => ReactNode;
  /** Per-scope install % — rendered above custom locations when ≥2 scopes. */
  scopeStats?: LevelScopeStatRow[];
}

/** Custom location cards + divider for list view (before unit rows). */
export function LevelCustomSiteLocationsStrip({
  buildingKey,
  levelKey,
}: LevelCustomSiteLocationCardsProps) {
  const { locationsFilterVisible } = useCustomSiteLocations();
  if (!shouldShowLevelCustomSiteSection(locationsFilterVisible, buildingKey, levelKey)) {
    return null;
  }

  return (
    <>
      <CustomLocationsDivider />
      <LevelCustomSiteLocationCards buildingKey={buildingKey} levelKey={levelKey} />
    </>
  );
}

/** Renders custom locations, common areas, and units under an expanded level. */
export function LevelLocationSections({
  buildingKey,
  levelKey,
  commonAreaCards,
  unitCards,
  allCards,
  renderCardGrid,
  scopeStats,
}: LevelLocationSectionsProps) {
  const t = useTranslations("units");
  const { locationsFilterVisible } = useCustomSiteLocations();
  const showCustomSection = shouldShowLevelCustomSiteSection(
    locationsFilterVisible,
    buildingKey,
    levelKey,
  );
  const hasCommon = commonAreaCards.length > 0;
  const hasUnits = unitCards.length > 0;
  const cardSectionCount = [hasCommon, hasUnits].filter(Boolean).length;
  const hasScopeBreakdown = (scopeStats?.length ?? 0) >= 2;

  if (cardSectionCount <= 1 && !showCustomSection && !hasScopeBreakdown) {
    return <>{renderCardGrid(allCards)}</>;
  }

  return (
    <>
      {hasScopeBreakdown && scopeStats && (
        <LevelScopeBreakdownPanel scopeStats={scopeStats} />
      )}
      {showCustomSection && (
        <>
          <CustomLocationsDivider />
          <LevelCustomSiteLocationCards buildingKey={buildingKey} levelKey={levelKey} />
        </>
      )}
      {hasCommon && (
        <>
          <LocationTypeSectionDivider label={t("sectionCommonAreas")} style={{ marginBottom: 6 }} />
          {renderCardGrid(commonAreaCards)}
        </>
      )}
      {hasUnits && (
        <>
          {(showCustomSection || hasCommon) && (
            <LocationTypeSectionDivider label={t("sectionUnits")} style={{ margin: "10px 0 6px" }} />
          )}
          {renderCardGrid(unitCards)}
        </>
      )}
    </>
  );
}
