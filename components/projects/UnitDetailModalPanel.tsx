"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useDesktopDetailPanel } from "@/hooks/use-desktop-detail-panel";
import {
  EMPTY_ISSUE_META,
  MobileUnitDetailModal,
  type ScopeRow,
  type UnitCard,
} from "@/components/projects/UnitCards";

export interface UnitDetailModalTarget {
  projectId: string;
  building: string;
  level: string;
  unit: string;
}

export interface UnitDetailModalNavItem {
  building: string;
  level: string;
  unit: string;
}

export interface UnitDetailModalNav {
  items: UnitDetailModalNavItem[];
  index: number;
  onNav: (index: number) => void;
}

interface UnitDetailModalPanelProps {
  target: UnitDetailModalTarget;
  nav?: UnitDetailModalNav;
  canManageStatus?: boolean;
  canCalibrate?: boolean;
  currentUserId?: string;
  currentUserRole?: string;
  onClose: () => void;
  onRefreshAll?: () => void;
  /** Prefer side panel on md+; mobile always uses the shared bottom sheet via MobileUnitDetailModal. */
  desktopPanel?: boolean;
}

/** Fetches full unit data and renders the same detail modal as the Locations page. */
export function UnitDetailModalPanel({
  target,
  nav,
  canManageStatus = false,
  canCalibrate = false,
  currentUserId,
  currentUserRole,
  onClose,
  onRefreshAll,
  desktopPanel = false,
}: UnitDetailModalPanelProps) {
  const [card, setCard] = useState<UnitCard | null>(null);
  const [fetching, setFetching] = useState(true);
  const isDesktopViewport = useDesktopDetailPanel();
  const showDesktopPanel = desktopPanel && isDesktopViewport;

  useEffect(() => {
    // Reset loading indicator when the lookup target changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch lifecycle reset
    setFetching(true);
    let cancelled = false;

    const qs = new URLSearchParams({
      ...(target.building ? { building: target.building } : {}),
      ...(target.level ? { level: target.level } : {}),
      unit: target.unit ?? "",
    });
    const url = `/api/projects/${target.projectId}/units/lookup?${qs}`;

    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: {
        building: string;
        level: string;
        unit: string;
        area: string;
        buildPhase: string;
        unitType: string;
        scopes: ScopeRow[];
      }) => {
        if (cancelled) return;
        setCard({
          key: `${d.building}|${d.level}|${d.unit}`,
          building: d.building,
          level: d.level,
          unit: d.unit,
          area: d.area ?? "",
          buildPhase: d.buildPhase ?? "",
          unitType: d.unitType ?? "",
          scopes: d.scopes,
          issueMeta: EMPTY_ISSUE_META,
          locationType: null,
        });
        setFetching(false);
      })
      .catch(() => {
        if (!cancelled) setFetching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [target.projectId, target.building, target.level, target.unit]);

  const hasPrev = nav ? nav.index > 0 : false;
  const hasNext = nav ? nav.index < nav.items.length - 1 : false;

  if (!card) {
    return createPortal(
      <div
        aria-hidden
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 600,
          backgroundColor: "var(--overlay-bg, rgba(0,0,0,0.35))",
        }}
      />,
      document.body,
    );
  }

  return createPortal(
    <>
      <MobileUnitDetailModal
        card={card}
        projectId={target.projectId}
        onSaved={(scopeId, updates) => {
          setCard((prev) =>
            prev
              ? {
                  ...prev,
                  scopes: prev.scopes.map((s) =>
                    s.id === scopeId ? ({ ...s, ...updates } as ScopeRow) : s,
                  ),
                }
              : prev,
          );
        }}
        onInstanceSaved={(rowId, instanceId, updates) => {
          setCard((prev) =>
            prev
              ? {
                  ...prev,
                  scopes: prev.scopes.map((s) =>
                    s.id !== rowId
                      ? s
                      : {
                          ...s,
                          subScopeInstances: s.subScopeInstances.map((inst) =>
                            inst.id === instanceId ? { ...inst, ...updates } : inst,
                          ),
                        },
                  ),
                }
              : prev,
          );
        }}
        onClose={onClose}
        canManageStatus={canManageStatus}
        canCalibrate={canCalibrate}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
        desktopPanel={desktopPanel}
        onRefreshAll={onRefreshAll}
        onPrev={hasPrev && nav ? () => nav.onNav(nav.index - 1) : undefined}
        onNext={hasNext && nav ? () => nav.onNav(nav.index + 1) : undefined}
        unitIndex={nav ? nav.index + 1 : undefined}
        unitTotal={nav ? nav.items.length : undefined}
      />
      {fetching ? (
        <div
          aria-hidden
          style={{
            position: "fixed",
            top: 0,
            right: showDesktopPanel ? 0 : undefined,
            left: showDesktopPanel ? undefined : 0,
            width: showDesktopPanel ? "min(520px, 100vw)" : "100%",
            height: 3,
            zIndex: 702,
            background: "linear-gradient(90deg, var(--primary-400), var(--primary-600))",
            animation: "activityPanelProgress 0.8s ease-in-out infinite alternate",
          }}
        />
      ) : null}
    </>,
    document.body,
  );
}
