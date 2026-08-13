"use client";

import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Building2, Layers, Pencil, X } from "lucide-react";
import { useIsBrowser } from "@/hooks/use-is-browser";
import { useDesktopDetailPanel } from "@/hooks/use-desktop-detail-panel";
import type { CustomSiteLocation } from "@/lib/custom-site-locations";
import { customSiteUnitContext, customSiteDetailHeaderSegments } from "@/lib/custom-site-locations";
import {
  EMPTY_ISSUE_META,
  UnitExpandedContent,
  type UnitCard,
} from "@/components/projects/UnitCards";

interface CustomSiteAreaDetailModalProps {
  projectId: string;
  location: CustomSiteLocation;
  currentUserId?: string;
  currentUserRole?: string;
  /** When true, renders as a right-side slide-in panel (desktop) instead of full-screen. */
  desktopPanel?: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onEdit?: () => void;
}

export function CustomSiteAreaDetailModal({
  projectId,
  location,
  currentUserId,
  currentUserRole,
  desktopPanel = false,
  onClose,
  onRefresh,
  onEdit,
}: CustomSiteAreaDetailModalProps) {
  const t = useTranslations("units");
  const tCustomSite = useTranslations("units.customSite");
  const isBrowser = useIsBrowser();
  const isDesktopViewport = useDesktopDetailPanel();
  const showDesktopPanel = desktopPanel && isDesktopViewport;
  const scrollRef = useRef<HTMLDivElement>(null);

  const unitContext = customSiteUnitContext(location);
  const locSegments = customSiteDetailHeaderSegments(location);

  const placeholderCard = useMemo<UnitCard>(
    () => ({
      key: location.id,
      building: unitContext.building,
      level: unitContext.level,
      unit: location.name,
      area: "",
      buildPhase: "",
      unitType: "",
      scopes: [],
      issueMeta: EMPTY_ISSUE_META,
      locationType: null,
    }),
    [location, unitContext.building, unitContext.level],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!isBrowser) return null;

  return createPortal(
    <div data-testid="custom-site-detail-modal">
      <style>{`
        @keyframes csdm-slide-in-right {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
        .csdm-location-meta {
          display: inline-flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px;
          min-width: 0;
        }
        .csdm-location-chip {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          min-height: 24px;
          padding: 4px 8px;
          border-radius: var(--radius-pill);
          background: var(--unit-detail-header-chip-bg);
          color: var(--unit-detail-header-chip-fg);
          font-size: var(--text-caption);
          font-weight: var(--font-weight-extrabold);
          letter-spacing: var(--tracking-ui);
          line-height: 1;
        }
        .csdm-location-chip svg {
          color: currentColor;
          opacity: 0.82;
        }
      `}</style>
      {showDesktopPanel && (
        <div
          aria-hidden="true"
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 180,
            backgroundColor: "var(--overlay-bg, rgba(0,0,0,0.35))",
          }}
        />
      )}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="custom-site-detail-title"
        data-desktop-panel={showDesktopPanel ? "true" : "false"}
        style={
          showDesktopPanel
            ? {
                position: "fixed",
                top: 0,
                right: 0,
                bottom: 0,
                width: "min(520px, 100vw)",
                zIndex: 181,
                backgroundColor: "var(--unit-detail-bg)",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                boxShadow: "var(--shadow-2)",
                animation: "csdm-slide-in-right 0.22s cubic-bezier(0.22,1,0.36,1) both",
              }
            : {
                position: "fixed",
                inset: 0,
                width: "100%",
                minHeight: "100dvh",
                zIndex: 181,
                backgroundColor: "var(--unit-detail-bg)",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                paddingTop: "env(safe-area-inset-top, 0px)",
                paddingBottom: "env(safe-area-inset-bottom, 0px)",
                paddingLeft: "env(safe-area-inset-left, 0px)",
                paddingRight: "env(safe-area-inset-right, 0px)",
              }
        }
      >
        <div
          style={{
            flexShrink: 0,
            padding: "18px 18px 18px",
            backgroundColor: "var(--unit-detail-header-bg)",
            color: "var(--unit-detail-header-fg)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 10px" }}>
                <p
                  id="custom-site-detail-title"
                  style={{
                    margin: 0,
                    fontSize: "var(--text-heading)",
                    fontWeight: "var(--font-weight-black)",
                    color: "var(--unit-detail-header-fg)",
                    lineHeight: 1.05,
                    letterSpacing: "var(--tracking-tight)",
                  }}
                >
                  {location.name}
                </p>
                {locSegments.length > 0 && (
                  <span
                    className="csdm-location-meta"
                    data-testid="custom-site-detail-location"
                    aria-label={locSegments.map((seg) => seg.label).join(", ")}
                  >
                    {locSegments.map((seg) => (
                      <span key={seg.key} className="csdm-location-chip">
                        {seg.icon === "building" ? <Building2 size={13} aria-hidden /> : null}
                        {seg.icon === "layers" ? <Layers size={13} aria-hidden /> : null}
                        <span>{seg.label}</span>
                      </span>
                    ))}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
              {onEdit && (
                <button
                  type="button"
                  onClick={onEdit}
                  aria-label={tCustomSite("editAria", { name: location.name })}
                  title={tCustomSite("editAria", { name: location.name })}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--unit-detail-header-meta)",
                    padding: 6,
                    display: "flex",
                    borderRadius: "var(--radius-md)",
                  }}
                >
                  <Pencil size={18} aria-hidden />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label={t("unitDetailModalClose")}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--unit-detail-header-meta)",
                  padding: 6,
                  display: "flex",
                  flexShrink: 0,
                }}
              >
                <X size={22} aria-hidden />
              </button>
            </div>
          </div>
        </div>

        <div
          ref={scrollRef}
          style={{ flex: 1, overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch" }}
        >
          <UnitExpandedContent
            card={placeholderCard}
            projectId={projectId}
            onSaved={() => {}}
            layout="stacked"
            fieldNotesOnly
            unitContextOverride={unitContext}
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
            onRefreshAll={() => {
              onRefresh();
            }}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
