"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import { ChevronRight, ChevronDown, Download } from "lucide-react";
import { SearchInput } from "@/components/shared/SearchInput";
import {
  unitInstallCompletePercent,
  unitQtyInstallCompletePercent,
  type ScopeStage,
  type ScopeStatus,
} from "@/lib/unit-scope-progress";
import type { InspectionStatus } from "@/lib/scope-square-style";
import {
  getCachedSubItems,
  ensureSubItemsFetched,
  type SubItem,
} from "@/components/projects/SubcontractorPicker";

// ─── Public row shape ────────────────────────────────────────────────────────

export interface BreakdownRow {
  id: string;
  building: string;
  level: string;
  unit: string;
  area: string;
  shipPhase: string;
  buildPhase: string;
  description: string;
  scopeType: {
    id: string;
    code: string;
    name: string;
    canonicalScopeType?: { id: string; code: string; displayName: string } | null;
  } | null;
  installer: { id: string; code: string; name: string } | null;
  unifierSubId: string | null;
  qty: number | null;
  scopeStage: ScopeStage;
  scopeStatus: ScopeStatus;
  inspectionStatus: InspectionStatus;
  startDate: string | null;
  finishDate: string | null;
  percentComplete: number | null;
  subScopeInstances: ReadonlyArray<{
    qty: number | null;
    scopeStage: ScopeStage;
    scopeStatus: ScopeStatus;
  }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Resolves the display name for a scope row using the same priority as UnitCards:
 * canonical displayName → raw scopeType name → row description.
 */
function resolveScopeName(row: Pick<BreakdownRow, "scopeType" | "description">): string {
  return (
    row.scopeType?.canonicalScopeType?.displayName ??
    row.scopeType?.name ??
    row.description ??
    "—"
  );
}

// ─── Internal tree types ─────────────────────────────────────────────────────

type PhaseField = "shipPhase" | "buildPhase";
type SortKey =
  | "scopeName"
  | "pct"
  | "stage"
  | "status"
  | "inspection"
  | "startDate"
  | "finishDate"
  | "installer";
type SortDir = "asc" | "desc";

interface UnitGroup {
  key: string;
  unit: string;
  area: string;
  scopes: BreakdownRow[];
}
interface LevelGroup {
  key: string;
  level: string;
  units: UnitGroup[];
}
interface PhaseGroup {
  key: string;
  phase: string;
  levels: LevelGroup[];
}
interface BuildingGroup {
  key: string;
  building: string;
  phases: PhaseGroup[];
}

// ─── Tree helpers ─────────────────────────────────────────────────────────────

function allScopesIn(bg: BuildingGroup): BreakdownRow[] {
  return bg.phases.flatMap((p) => p.levels.flatMap((l) => l.units.flatMap((u) => u.scopes)));
}
function allScopesInPhase(pg: PhaseGroup): BreakdownRow[] {
  return pg.levels.flatMap((l) => l.units.flatMap((u) => u.scopes));
}
function allScopesInLevel(lg: LevelGroup): BreakdownRow[] {
  return lg.units.flatMap((u) => u.scopes);
}

function toQtyProgressScopes(scopes: BreakdownRow[]) {
  return scopes.map((r) => ({
    qty: r.qty,
    scopeStage: r.scopeStage,
    scopeStatus: r.scopeStatus,
    subScopeInstances: r.subScopeInstances,
  }));
}

/** Scope-count % for unit/location rollups (equal weight per scope). */
function rollupGroupPct(scopes: BreakdownRow[]): number {
  return unitInstallCompletePercent(
    scopes.map((r) => ({
      scopeStage: r.scopeStage,
      scopeStatus: r.scopeStatus,
    }))
  );
}

/** Qty-weighted % within a single scope row (sub-scopes use their qty). */
function scopeRowPct(scope: BreakdownRow): number {
  return unitQtyInstallCompletePercent(toQtyProgressScopes([scope]));
}

function minDate(scopes: BreakdownRow[]): string | null {
  let min: string | null = null;
  for (const s of scopes) {
    if (s.startDate !== null && (min === null || s.startDate < min)) min = s.startDate;
  }
  return min;
}
function maxDate(scopes: BreakdownRow[]): string | null {
  let max: string | null = null;
  for (const s of scopes) {
    if (s.finishDate !== null && (max === null || s.finishDate > max)) max = s.finishDate;
  }
  return max;
}

/** @internal exported for unit tests only */
export function groupRows(rows: BreakdownRow[], phaseField: PhaseField): BuildingGroup[] {
  // building -> phase -> level -> unit -> rows
  const buildingMap = new Map<string, Map<string, Map<string, Map<string, BreakdownRow[]>>>>();

  for (const row of rows) {
    const bKey = row.building || "—";
    const pKey = row[phaseField] || "—";
    const lKey = row.level || "—";
    const uKey = row.unit || "—";

    if (!buildingMap.has(bKey)) buildingMap.set(bKey, new Map());
    const phaseMap = buildingMap.get(bKey)!;
    if (!phaseMap.has(pKey)) phaseMap.set(pKey, new Map());
    const levelMap = phaseMap.get(pKey)!;
    if (!levelMap.has(lKey)) levelMap.set(lKey, new Map());
    const unitMap = levelMap.get(lKey)!;
    if (!unitMap.has(uKey)) unitMap.set(uKey, []);
    unitMap.get(uKey)!.push(row);
  }

  return Array.from(buildingMap.entries()).map(([bKey, phaseMap]) => ({
    key: bKey,
    building: bKey,
    phases: Array.from(phaseMap.entries()).map(([pKey, levelMap]) => ({
      key: `${bKey}|${pKey}`,
      phase: pKey,
      levels: Array.from(levelMap.entries()).map(([lKey, unitMap]) => ({
        key: `${bKey}|${pKey}|${lKey}`,
        level: lKey,
        units: Array.from(unitMap.entries()).map(([uKey, scopes]) => ({
          key: `${bKey}|${pKey}|${lKey}|${uKey}`,
          unit: uKey,
          area: scopes[0]?.area ?? "",
          scopes,
        })),
      })),
    })),
  }));
}

/** @internal exported for unit tests only */
export function sortScopes(
  scopes: BreakdownRow[],
  sortKey: SortKey | null,
  sortDir: SortDir,
  resolveSubName?: (row: BreakdownRow) => string | null
): BreakdownRow[] {
  if (!sortKey) return scopes;
  // Precompute pct once per row to avoid repeated rollupGroupPct calls inside the comparator
  const pctCache = sortKey === "pct" ? new Map(scopes.map((r) => [r.id, scopeRowPct(r)])) : null;
  return [...scopes].sort((a, b) => {
    let aVal: string | number = 0;
    let bVal: string | number = 0;
    switch (sortKey) {
      case "scopeName":
        aVal = resolveScopeName(a).toLowerCase();
        bVal = resolveScopeName(b).toLowerCase();
        break;
      case "pct":
        aVal = pctCache!.get(a.id) ?? 0;
        bVal = pctCache!.get(b.id) ?? 0;
        break;
      case "stage":
        aVal = a.scopeStage ?? "";
        bVal = b.scopeStage ?? "";
        break;
      case "status":
        aVal = a.scopeStatus ?? "";
        bVal = b.scopeStatus ?? "";
        break;
      case "inspection":
        aVal = a.inspectionStatus ?? "";
        bVal = b.inspectionStatus ?? "";
        break;
      case "startDate":
        aVal = a.startDate ?? "";
        bVal = b.startDate ?? "";
        break;
      case "finishDate":
        aVal = a.finishDate ?? "";
        bVal = b.finishDate ?? "";
        break;
      case "installer":
        aVal = (resolveSubName ? resolveSubName(a) : a.installer?.name)?.toLowerCase() ?? "";
        bVal = (resolveSubName ? resolveSubName(b) : b.installer?.name)?.toLowerCase() ?? "";
        break;
    }
    if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
    return 0;
  });
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function sanitizeCsvCell(value: string): string {
  // Prefix formula-injection characters so spreadsheets treat the cell as text
  const safe = /^[=+\-@\t]/.test(value) ? `'${value}` : value;
  const escaped = safe.replace(/"/g, '""').replace(/\|/g, " ");
  if (escaped.includes(",") || escaped.includes("\n") || escaped.includes('"')) {
    return `"${escaped}"`;
  }
  return escaped;
}

/** @internal exported for unit tests only */
export function resolveInstallerName(row: BreakdownRow, subs: SubItem[]): string {
  if (row.unifierSubId) return subs.find((s) => s.id === row.unifierSubId)?.name ?? "";
  return row.installer?.name ?? "";
}

/** @internal exported for unit tests only */
export function exportToCsv(groups: BuildingGroup[], phaseField: PhaseField, subs: SubItem[]): string {
  const headers = [
    "Depth",
    "Building",
    phaseField === "shipPhase" ? "Ship Phase" : "Build Phase",
    "Level",
    "Unit",
    "Area",
    "Scope",
    "% Complete",
    "Stage",
    "Status",
    "Inspection",
    "Start Date",
    "Finish Date",
    "Installer",
  ];
  const rows: string[] = [headers.join(",")];

  function addRow(cells: (string | number)[]): void {
    rows.push(cells.map((v) => sanitizeCsvCell(String(v))).join(","));
  }

  for (const bg of groups) {
    const bScopes = allScopesIn(bg);
    addRow([0, bg.building, "", "", "", "", "", rollupGroupPct(bScopes), "", "", "", minDate(bScopes) ?? "", maxDate(bScopes) ?? "", ""]);

    for (const pg of bg.phases) {
      const pScopes = allScopesInPhase(pg);
      addRow([1, bg.building, pg.phase, "", "", "", "", rollupGroupPct(pScopes), "", "", "", minDate(pScopes) ?? "", maxDate(pScopes) ?? "", ""]);

      for (const lg of pg.levels) {
        const lScopes = allScopesInLevel(lg);
        addRow([2, bg.building, pg.phase, lg.level, "", "", "", rollupGroupPct(lScopes), "", "", "", minDate(lScopes) ?? "", maxDate(lScopes) ?? "", ""]);

        for (const ug of lg.units) {
          addRow([3, bg.building, pg.phase, lg.level, ug.unit, ug.area, "", rollupGroupPct(ug.scopes), "", "", "", minDate(ug.scopes) ?? "", maxDate(ug.scopes) ?? "", ""]);
          for (const s of ug.scopes) {
            addRow([
              4,
              bg.building,
              pg.phase,
              lg.level,
              ug.unit,
              ug.area,
              resolveScopeName(s),
              scopeRowPct(s),
              s.scopeStage ?? "",
              s.scopeStatus ?? "",
              s.inspectionStatus ?? "",
              s.startDate ?? "",
              s.finishDate ?? "",
              resolveInstallerName(s, subs),
            ]);
          }
        }
      }
    }
  }
  return rows.join("\n");
}

// ─── Badge components ─────────────────────────────────────────────────────────

const BADGE_BASE: React.CSSProperties = {
  display: "inline-block",
  padding: "1px 6px",
  borderRadius: 10,
  fontSize: 10,
  fontWeight: 600,
  lineHeight: "16px",
};

function StageBadge({ value }: { value: ScopeStage }) {
  if (!value) return <span style={{ color: "var(--neutral-400)", fontSize: 11 }}>—</span>;
  const COLORS: Record<string, { bg: string; color: string }> = {
    STAGING: { bg: "var(--primary-100)", color: "var(--primary-700)" },
    ASSEMBLY: { bg: "var(--warning-100)", color: "var(--warning-700)" },
    INSTALL: { bg: "var(--success-100)", color: "var(--success-700)" },
  };
  const c = COLORS[value] ?? { bg: "var(--neutral-100)", color: "var(--neutral-700)" };
  return <span style={{ ...BADGE_BASE, backgroundColor: c.bg, color: c.color }}>{value}</span>;
}

function StatusBadgePill({ value }: { value: ScopeStatus }) {
  if (!value) return <span style={{ color: "var(--neutral-400)", fontSize: 11 }}>—</span>;
  const COLORS: Record<string, { bg: string; color: string }> = {
    NOT_STARTED: { bg: "var(--neutral-100)", color: "var(--neutral-600)" },
    IN_PROGRESS: { bg: "var(--primary-100)", color: "var(--primary-700)" },
    BLOCKED: { bg: "var(--error-100)", color: "var(--error-700)" },
    COMPLETE: { bg: "var(--success-100)", color: "var(--success-700)" },
  };
  const c = COLORS[value] ?? { bg: "var(--neutral-100)", color: "var(--neutral-700)" };
  return (
    <span style={{ ...BADGE_BASE, backgroundColor: c.bg, color: c.color }}>
      {value.replace(/_/g, " ")}
    </span>
  );
}

function InspectionBadge({ value }: { value: InspectionStatus }) {
  if (!value) return <span style={{ color: "var(--neutral-400)", fontSize: 11 }}>—</span>;
  const COLORS: Record<string, { bg: string; color: string }> = {
    READY: { bg: "var(--warning-100)", color: "var(--warning-700)" },
    PASSED: { bg: "var(--success-100)", color: "var(--success-700)" },
    FAILED: { bg: "var(--error-100)", color: "var(--error-700)" },
  };
  const c = COLORS[value] ?? { bg: "var(--neutral-100)", color: "var(--neutral-700)" };
  return <span style={{ ...BADGE_BASE, backgroundColor: c.bg, color: c.color }}>{value}</span>;
}

function PctBar({ pct }: { pct: number }) {
  const clamped = Math.min(Math.max(pct, 0), 100);
  const barColor =
    clamped >= 100
      ? "var(--success-600)"
      : clamped > 0
        ? "var(--primary-500)"
        : "var(--neutral-300)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div
        aria-hidden
        style={{
          width: 48,
          height: 6,
          backgroundColor: "var(--neutral-200)",
          borderRadius: 3,
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: `${clamped}%`,
            height: "100%",
            backgroundColor: barColor,
            transition: "width 0.2s",
          }}
        />
      </div>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--neutral-700)",
          minWidth: 30,
          textAlign: "right",
        }}
      >
        {pct}%
      </span>
    </div>
  );
}

// ─── Sort indicator helper ────────────────────────────────────────────────────

function SortIndicator({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey | null; sortDir: SortDir }) {
  if (sortKey !== col) return <span aria-hidden style={{ opacity: 0.35, marginLeft: 2 }}>↕</span>;
  return <span aria-hidden style={{ marginLeft: 2 }}>{sortDir === "asc" ? "↑" : "↓"}</span>;
}

// ─── Main component ───────────────────────────────────────────────────────────

interface LocationProgressBreakdownProps {
  units: BreakdownRow[];
}

export function LocationProgressBreakdown({ units }: LocationProgressBreakdownProps) {
  const t = useTranslations("projects.breakdown");

  // Resolve Unifier sub names — reuse the module-level singleton from SubcontractorPicker
  const [subs, setSubs] = useState<SubItem[]>(getCachedSubItems() ?? []);
  useEffect(() => {
    if (getCachedSubItems() !== null) return;
    let cancelled = false;
    ensureSubItemsFetched().then(() => {
      if (!cancelled) setSubs(getCachedSubItems() ?? []);
    });
    return () => { cancelled = true; };
  }, []);

  const subsById = useMemo(() => new Map(subs.map((s) => [s.id, s.name])), [subs]);

  const resolveSubName = useCallback(
    (row: BreakdownRow): string | null => {
      if (row.unifierSubId) return subsById.get(row.unifierSubId) ?? null;
      return row.installer?.name ?? null;
    },
    [subsById]
  );

  const [phaseField, setPhaseField] = useState<PhaseField>("shipPhase");
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [search, setSearch] = useState("");

  const filteredUnits = useMemo(() => {
    if (!search.trim()) return units;
    const q = search.toLowerCase();
    return units.filter(
      (r) =>
        r.building.toLowerCase().includes(q) ||
        r.level.toLowerCase().includes(q) ||
        r.unit.toLowerCase().includes(q) ||
        r.area.toLowerCase().includes(q) ||
        resolveScopeName(r).toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r[phaseField].toLowerCase().includes(q)
    );
  }, [units, search, phaseField]);

  const groups = useMemo(
    () => groupRows(filteredUnits, phaseField),
    [filteredUnits, phaseField]
  );

  const allKeys = useMemo(() => {
    const keys: string[] = [];
    for (const bg of groups) {
      keys.push(bg.key);
      for (const pg of bg.phases) {
        keys.push(pg.key);
        for (const lg of pg.levels) {
          keys.push(lg.key);
          for (const ug of lg.units) keys.push(ug.key);
        }
      }
    }
    return keys;
  }, [groups]);

  const expandAll = useCallback(() => setExpandedKeys(new Set(allKeys)), [allKeys]);
  const collapseAll = useCallback(() => setExpandedKeys(new Set()), []);

  const toggleKey = useCallback((key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return key;
      }
      setSortDir("asc");
      return key;
    });
  }, []);

  const handleExport = useCallback(() => {
    const csv = exportToCsv(groups, phaseField, subs);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "progress-breakdown.csv";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }, [groups, phaseField, subs]);

  const COL: React.CSSProperties = {
    padding: "6px 12px",
    textAlign: "left",
    fontSize: "var(--text-caption)",
    whiteSpace: "nowrap",
    verticalAlign: "middle",
  };

  const HEADER: React.CSSProperties = {
    ...COL,
    fontWeight: 600,
    color: "var(--neutral-700)",
    backgroundColor: "var(--neutral-50)",
    borderBottom: "2px solid var(--neutral-200)",
    position: "sticky",
    top: 0,
    zIndex: 10,
    padding: 0,
  };

  const SORT_BTN: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "6px 12px",
    width: "100%",
    background: "none",
    border: "none",
    cursor: "pointer",
    userSelect: "none",
    fontWeight: 600,
    fontSize: "var(--text-caption)",
    color: "var(--neutral-700)",
    whiteSpace: "nowrap",
    textAlign: "left",
  };

  if (units.length === 0) {
    return (
      <div
        style={{
          padding: "var(--space-8)",
          textAlign: "center",
          color: "var(--neutral-500)",
          fontSize: "var(--text-body)",
        }}
      >
        {t("noRows")}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* ── Breakdown toolbar ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
          padding: "var(--space-3) var(--space-4)",
          borderBottom: "1px solid var(--neutral-200)",
          flexWrap: "wrap",
          flexShrink: 0,
        }}
      >
        {/* Phase toggle */}
        <div
          role="group"
          aria-label={t("groupByPhaseAria")}
          style={{
            display: "flex",
            border: "1px solid var(--neutral-300)",
            borderRadius: "var(--radius-sm)",
            overflow: "hidden",
          }}
        >
          {(["shipPhase", "buildPhase"] as PhaseField[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setPhaseField(f)}
              aria-pressed={phaseField === f}
              style={{
                padding: "var(--space-1) var(--space-3)",
                border: "none",
                fontSize: "var(--text-caption)",
                fontWeight: phaseField === f ? 600 : 400,
                backgroundColor:
                  phaseField === f ? "var(--primary-600)" : "var(--neutral-0)",
                color: phaseField === f ? "white" : "var(--neutral-700)",
                cursor: "pointer",
              }}
            >
              {f === "shipPhase" ? t("groupByShipPhase") : t("groupByBuildPhase")}
            </button>
          ))}
        </div>

        {/* Expand / Collapse */}
        <button
          type="button"
          onClick={expandAll}
          aria-label={t("expandAll")}
          style={{
            padding: "var(--space-1) var(--space-3)",
            fontSize: "var(--text-caption)",
            border: "1px solid var(--neutral-300)",
            borderRadius: "var(--radius-sm)",
            backgroundColor: "var(--neutral-0)",
            cursor: "pointer",
          }}
        >
          {t("expandAll")}
        </button>
        <button
          type="button"
          onClick={collapseAll}
          aria-label={t("collapseAll")}
          style={{
            padding: "var(--space-1) var(--space-3)",
            fontSize: "var(--text-caption)",
            border: "1px solid var(--neutral-300)",
            borderRadius: "var(--radius-sm)",
            backgroundColor: "var(--neutral-0)",
            cursor: "pointer",
          }}
        >
          {t("collapseAll")}
        </button>

        {/* Search */}
        <div style={{ minWidth: 200, flex: "0 1 260px" }}>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t("searchPlaceholder")}
            ariaLabel={t("searchAria")}
            fontSize={12}
            height={34}
          />
        </div>

        {/* Export CSV */}
        <button
          type="button"
          onClick={handleExport}
          aria-label={t("exportCsvAria")}
          style={{
            padding: "var(--space-1) var(--space-3)",
            fontSize: "var(--text-caption)",
            border: "1px solid var(--neutral-300)",
            borderRadius: "var(--radius-sm)",
            backgroundColor: "var(--neutral-0)",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--space-2)",
            marginLeft: "auto",
          }}
        >
          <Download size={14} aria-hidden />
          {t("exportCsv")}
        </button>
      </div>

      {/* ── Tree table ── */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {filteredUnits.length === 0 ? (
          <div
            style={{
              padding: "var(--space-8)",
              textAlign: "center",
              color: "var(--neutral-500)",
              fontSize: "var(--text-body)",
            }}
          >
            {t("noRowsMatch")}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-caption)" }}>
            <thead>
              <tr>
                <th style={{ ...HEADER, minWidth: 260 }}>
                  <button type="button" style={SORT_BTN} onClick={() => handleSort("scopeName")} aria-label={`${t("colLocation")} — ${t("sortColumn")}`}>
                    {t("colLocation")}
                    <SortIndicator col="scopeName" sortKey={sortKey} sortDir={sortDir} />
                  </button>
                </th>
                <th style={{ ...HEADER, width: 100 }}>
                  <button type="button" style={SORT_BTN} onClick={() => handleSort("pct")} aria-label={`${t("colPct")} — ${t("sortColumn")}`}>
                    {t("colPct")}
                    <SortIndicator col="pct" sortKey={sortKey} sortDir={sortDir} />
                  </button>
                </th>
                <th style={{ ...HEADER, width: 90 }}>
                  <button type="button" style={SORT_BTN} onClick={() => handleSort("stage")} aria-label={`${t("colStage")} — ${t("sortColumn")}`}>
                    {t("colStage")}
                    <SortIndicator col="stage" sortKey={sortKey} sortDir={sortDir} />
                  </button>
                </th>
                <th style={{ ...HEADER, width: 120 }}>
                  <button type="button" style={SORT_BTN} onClick={() => handleSort("status")} aria-label={`${t("colStatus")} — ${t("sortColumn")}`}>
                    {t("colStatus")}
                    <SortIndicator col="status" sortKey={sortKey} sortDir={sortDir} />
                  </button>
                </th>
                <th style={{ ...HEADER, width: 100 }}>
                  <button type="button" style={SORT_BTN} onClick={() => handleSort("inspection")} aria-label={`${t("colInspection")} — ${t("sortColumn")}`}>
                    {t("colInspection")}
                    <SortIndicator col="inspection" sortKey={sortKey} sortDir={sortDir} />
                  </button>
                </th>
                <th style={{ ...HEADER, width: 110 }}>
                  <button type="button" style={SORT_BTN} onClick={() => handleSort("startDate")} aria-label={`${t("colStart")} — ${t("sortColumn")}`}>
                    {t("colStart")}
                    <SortIndicator col="startDate" sortKey={sortKey} sortDir={sortDir} />
                  </button>
                </th>
                <th style={{ ...HEADER, width: 110 }}>
                  <button type="button" style={SORT_BTN} onClick={() => handleSort("finishDate")} aria-label={`${t("colFinish")} — ${t("sortColumn")}`}>
                    {t("colFinish")}
                    <SortIndicator col="finishDate" sortKey={sortKey} sortDir={sortDir} />
                  </button>
                </th>
                <th style={{ ...HEADER, width: 130 }}>
                  <button type="button" style={SORT_BTN} onClick={() => handleSort("installer")} aria-label={`${t("colInstaller")} — ${t("sortColumn")}`}>
                    {t("colInstaller")}
                    <SortIndicator col="installer" sortKey={sortKey} sortDir={sortDir} />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.map((bg) => {
                const bScopes = allScopesIn(bg);
                const bExpanded = expandedKeys.has(bg.key);
                return (
                  <React.Fragment key={bg.key}>
                    {/* Building row */}
                    <tr style={{ backgroundColor: "var(--neutral-100)", borderBottom: "1px solid var(--neutral-200)" }}>
                      <td style={{ ...COL, paddingLeft: 12 }}>
                        <button
                          type="button"
                          onClick={() => toggleKey(bg.key)}
                          aria-expanded={bExpanded}
                          aria-label={`${bExpanded ? t("collapse") : t("expand")} ${bg.building}`}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            fontWeight: 700,
                            fontSize: "var(--text-caption)",
                            color: "var(--neutral-900)",
                            padding: 0,
                          }}
                        >
                          {bExpanded ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
                          {bg.building}
                        </button>
                      </td>
                      <td style={COL}><PctBar pct={rollupGroupPct(bScopes)} /></td>
                      <td style={COL} />
                      <td style={COL} />
                      <td style={COL} />
                      <td style={{ ...COL, color: "var(--neutral-600)" }}>{minDate(bScopes) ?? "—"}</td>
                      <td style={{ ...COL, color: "var(--neutral-600)" }}>{maxDate(bScopes) ?? "—"}</td>
                      <td style={COL} />
                    </tr>

                    {bExpanded &&
                      bg.phases.map((pg) => {
                        const pScopes = allScopesInPhase(pg);
                        const pExpanded = expandedKeys.has(pg.key);
                        return (
                          <React.Fragment key={pg.key}>
                            {/* Phase row */}
                            <tr style={{ backgroundColor: "var(--neutral-50)", borderBottom: "1px solid var(--neutral-100)" }}>
                              <td style={{ ...COL, paddingLeft: 32 }}>
                                <button
                                  type="button"
                                  onClick={() => toggleKey(pg.key)}
                                  aria-expanded={pExpanded}
                                  aria-label={`${pExpanded ? t("collapse") : t("expand")} ${pg.phase}`}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 6,
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                    fontWeight: 600,
                                    fontSize: "var(--text-caption)",
                                    color: "var(--neutral-900)",
                                    padding: 0,
                                  }}
                                >
                                  {pExpanded ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />}
                                  {pg.phase}
                                </button>
                              </td>
                              <td style={COL}><PctBar pct={rollupGroupPct(pScopes)} /></td>
                              <td style={COL} /><td style={COL} /><td style={COL} />
                              <td style={{ ...COL, color: "var(--neutral-600)" }}>{minDate(pScopes) ?? "—"}</td>
                              <td style={{ ...COL, color: "var(--neutral-600)" }}>{maxDate(pScopes) ?? "—"}</td>
                              <td style={COL} />
                            </tr>

                            {pExpanded &&
                              pg.levels.map((lg) => {
                                const lScopes = allScopesInLevel(lg);
                                const lExpanded = expandedKeys.has(lg.key);
                                return (
                                  <React.Fragment key={lg.key}>
                                    {/* Level row */}
                                    <tr style={{ borderBottom: "1px solid var(--neutral-100)" }}>
                                      <td style={{ ...COL, paddingLeft: 52 }}>
                                        <button
                                          type="button"
                                          onClick={() => toggleKey(lg.key)}
                                          aria-expanded={lExpanded}
                                          aria-label={`${lExpanded ? t("collapse") : t("expand")} ${t("levelPrefix")} ${lg.level}`}
                                          style={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: 6,
                                            background: "none",
                                            border: "none",
                                            cursor: "pointer",
                                            fontSize: "var(--text-caption)",
                                            color: "var(--neutral-900)",
                                            padding: 0,
                                          }}
                                        >
                                          {lExpanded ? <ChevronDown size={12} aria-hidden /> : <ChevronRight size={12} aria-hidden />}
                                          <span style={{ color: "var(--neutral-500)", marginRight: 2 }}>
                                            {t("levelPrefix")}
                                          </span>
                                          {lg.level}
                                        </button>
                                      </td>
                                      <td style={COL}><PctBar pct={rollupGroupPct(lScopes)} /></td>
                                      <td style={COL} /><td style={COL} /><td style={COL} />
                                      <td style={{ ...COL, color: "var(--neutral-600)" }}>{minDate(lScopes) ?? "—"}</td>
                                      <td style={{ ...COL, color: "var(--neutral-600)" }}>{maxDate(lScopes) ?? "—"}</td>
                                      <td style={COL} />
                                    </tr>

                                    {lExpanded &&
                                      lg.units.map((ug) => {
                                        const uExpanded = expandedKeys.has(ug.key);
                                        const sortedScopes = sortScopes(ug.scopes, sortKey, sortDir, resolveSubName);
                                        return (
                                          <React.Fragment key={ug.key}>
                                            {/* Unit row */}
                                            <tr style={{ borderBottom: "1px solid var(--neutral-100)" }}>
                                              <td style={{ ...COL, paddingLeft: 72 }}>
                                                <button
                                                  type="button"
                                                  onClick={() => toggleKey(ug.key)}
                                                  aria-expanded={uExpanded}
                                                  aria-label={`${uExpanded ? t("collapse") : t("expand")} ${t("unitPrefix")} ${ug.unit}`}
                                                  style={{
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    gap: 6,
                                                    background: "none",
                                                    border: "none",
                                                    cursor: "pointer",
                                                    fontSize: "var(--text-caption)",
                                                    color: "var(--neutral-900)",
                                                    padding: 0,
                                                  }}
                                                >
                                                  {uExpanded ? <ChevronDown size={12} aria-hidden /> : <ChevronRight size={12} aria-hidden />}
                                                  <span style={{ color: "var(--neutral-500)", marginRight: 2 }}>
                                                    {t("unitPrefix")}
                                                  </span>
                                                  {ug.unit}
                                                  {ug.area ? (
                                                    <span style={{ color: "var(--neutral-500)", marginLeft: 4 }}>
                                                      · {ug.area}
                                                    </span>
                                                  ) : null}
                                                </button>
                                              </td>
                                              <td style={COL}><PctBar pct={rollupGroupPct(ug.scopes)} /></td>
                                              <td style={COL} /><td style={COL} /><td style={COL} />
                                              <td style={{ ...COL, color: "var(--neutral-600)" }}>{minDate(ug.scopes) ?? "—"}</td>
                                              <td style={{ ...COL, color: "var(--neutral-600)" }}>{maxDate(ug.scopes) ?? "—"}</td>
                                              <td style={COL}>
                                                {(() => {
                                                  const names = [...new Set(ug.scopes.map(resolveSubName).filter(Boolean))];
                                                  return names.length === 1 ? (
                                                    <span style={{ fontSize: 11, color: "var(--neutral-600)" }}>{names[0]}</span>
                                                  ) : names.length > 1 ? (
                                                    <span style={{ fontSize: 11, color: "var(--neutral-500)" }}>{names.length} {t("installerCount")}</span>
                                                  ) : null;
                                                })()}
                                              </td>
                                            </tr>

                                            {/* Scope leaf rows */}
                                            {uExpanded &&
                                              sortedScopes.map((scope) => (
                                                <tr
                                                  key={scope.id}
                                                  style={{
                                                    borderBottom: "1px solid var(--neutral-100)",
                                                    backgroundColor: "var(--neutral-0)",
                                                  }}
                                                >
                                                  <td
                                                    style={{
                                                      ...COL,
                                                      paddingLeft: 92,
                                                      color: "var(--neutral-700)",
                                                    }}
                                                  >
                                                    {resolveScopeName(scope)}
                                                  </td>
                                                  <td style={COL}><PctBar pct={scopeRowPct(scope)} /></td>
                                                  <td style={COL}><StageBadge value={scope.scopeStage} /></td>
                                                  <td style={COL}><StatusBadgePill value={scope.scopeStatus} /></td>
                                                  <td style={COL}><InspectionBadge value={scope.inspectionStatus} /></td>
                                                  <td style={{ ...COL, color: "var(--neutral-600)" }}>
                                                    {scope.startDate ?? "—"}
                                                  </td>
                                                  <td style={{ ...COL, color: "var(--neutral-600)" }}>
                                                    {scope.finishDate ?? "—"}
                                                  </td>
                                                  <td style={{ ...COL, color: "var(--neutral-700)" }}>
                                                    {resolveSubName(scope) ?? (
                                                      <span style={{ color: "var(--neutral-400)" }}>—</span>
                                                    )}
                                                  </td>
                                                </tr>
                                              ))}
                                          </React.Fragment>
                                        );
                                      })}
                                  </React.Fragment>
                                );
                              })}
                          </React.Fragment>
                        );
                      })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
