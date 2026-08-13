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

/** Orange accent — distinct from building level bars but uses design tokens. */
const CUSTOM_STRIPE = "var(--primary-600)";

export function CustomSiteLocationsSection() {
  const t = useTranslations("units.customSite");
  const tUnits = useTranslations("units");
  const contentId = useId();
  const [expanded, setExpanded] = useState(false);
  const { locations, loading, openAddSheet, openLocation, openEdit, requestDelete } = useCustomSiteLocations();

  const sectionTitle = t("sectionTitle");
  const toggleAria = expanded
    ? t("sectionToggleCollapse", { title: sectionTitle })
    : t("sectionToggleExpand", { title: sectionTitle });

  const barBg = expanded ? "var(--primary-600)" : "var(--primary-50)";
  const barFg = expanded ? "var(--neutral-0)" : "var(--primary-700)";
  const countChipBg = expanded ? "rgba(255,255,255,0.14)" : "var(--color-surface)";
  const countChipFg = expanded ? "var(--neutral-0)" : "var(--color-text-secondary)";

  return (
    <>
      <div style={{ marginBottom: 6 }}>
        <div
          id={`${contentId}-toggle`}
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
            color: barFg,
            ...customSiteStripBarBorder(CUSTOM_STRIPE, true),
            transition: "background-color 0.15s ease, color 0.15s ease",
          }}
        >
          <span
            id={`${contentId}-label`}
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
            aria-label={t("addAria")}
            title={t("addAria")}
            onClick={(e) => {
              e.stopPropagation();
              openAddSheet();
            }}
            style={customSiteStripAddButtonStyle(expanded)}
          >
            <Plus size={14} strokeWidth={2.25} aria-hidden />
          </button>

          <span
            aria-hidden
            style={{
              display: "inline-flex",
              color: expanded ? "var(--neutral-0)" : "var(--neutral-500)",
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
            aria-labelledby={`${contentId}-label`}
            style={{ marginTop: 6, marginBottom: 6 }}
          >
            {loading ? (
              <p style={{ margin: 0, fontSize: 12, color: "var(--neutral-500)", padding: "4px 2px" }}>
                {t("loading")}
              </p>
            ) : (
              <div className="units-grid-squares">
                {locations.map((loc) => (
                  <div key={loc.id} style={{ minWidth: 0 }}>
                    <CustomSiteLocationTile
                      location={loc}
                      onOpen={() => openLocation(loc)}
                      onEdit={() => openEdit(loc)}
                      onDelete={() => requestDelete(loc)}
                    />
                  </div>
                ))}
                <CustomSiteLocationAddTile
                  ariaLabel={t("addAria")}
                  onClick={openAddSheet}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
