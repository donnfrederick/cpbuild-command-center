"use client";

/**
 * UnifierExplorerPanel
 *
 * DevTools panel for browsing and previewing data from any Unifier PDS table.
 * Renders as a tab inside the DevTools tray.
 *
 * Layout:
 *   Left sidebar — searchable table list with "integrated" badges
 *   Right area   — column list + "Preview Data" button
 *   Bottom pane  — paginated raw data grid (only shown after fetching)
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Search,
  ChevronRight,
  RefreshCw,
  Copy,
  Check,
  Database,
  Zap,
  AlertCircle,
  ChevronLeft,
  ChevronDown,
  Tag,
  Link,
  X,
  Filter,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Plus,
} from "lucide-react";
import type { UnifierTableDef } from "@/lib/unifier/schema-definition";
import { UnifierProjectView } from "@/components/devtools/UnifierProjectView";

// ── Types ──────────────────────────────────────────────────────────────────

interface FkNavSource {
  fromTable: string;
  fromColumn: string;
  value: string;
}

// ── Filter types ───────────────────────────────────────────────────────────

type FilterOp =
  | "=" | "!=" | "contains" | "starts_with" | "ends_with"
  | ">" | ">=" | "<" | "<=" | "is_null" | "is_not_null";

interface ActiveFilter {
  id: string;
  column: string;
  op: FilterOp;
  value: string;
}

const FILTER_OPERATORS: { value: FilterOp; label: string; noValue?: boolean }[] = [
  { value: "=",           label: "=" },
  { value: "!=",          label: "≠" },
  { value: "contains",    label: "contains" },
  { value: "starts_with", label: "starts with" },
  { value: "ends_with",   label: "ends with" },
  { value: ">",           label: ">" },
  { value: ">=",          label: "≥" },
  { value: "<",           label: "<" },
  { value: "<=",          label: "≤" },
  { value: "is_null",     label: "is null",     noValue: true },
  { value: "is_not_null", label: "is not null", noValue: true },
];

let _uid = 0;
function uid(): string { return `f${++_uid}`; }

// ── Client-side filter / sort pipeline ─────────────────────────────────────

function applyFilters(
  rows: Record<string, unknown>[],
  globalSearch: string,
  filters: ActiveFilter[],
  sort: string | null,
  sortOrder: "asc" | "desc",
): Record<string, unknown>[] {
  let result = rows;

  // 1. Global search — any column contains the search string (case-insensitive)
  if (globalSearch.trim()) {
    const q = globalSearch.toLowerCase();
    result = result.filter((row) =>
      Object.values(row).some((v) => v != null && String(v).toLowerCase().includes(q))
    );
  }

  // 2. Column filters
  const activeOps = filters.filter(
    (f) => f.column && (FILTER_OPERATORS.find((o) => o.value === f.op)?.noValue || f.value !== "")
  );
  if (activeOps.length > 0) {
    result = result.filter((row) =>
      activeOps.every((f) => {
        const rawVal = row[f.column];
        const cellStr = rawVal == null ? "" : String(rawVal);
        const fVal = f.value;
        switch (f.op) {
          case "=":           return cellStr === fVal;
          case "!=":          return cellStr !== fVal;
          case "contains":    return cellStr.toLowerCase().includes(fVal.toLowerCase());
          case "starts_with": return cellStr.toLowerCase().startsWith(fVal.toLowerCase());
          case "ends_with":   return cellStr.toLowerCase().endsWith(fVal.toLowerCase());
          case ">":           return rawVal != null && rawVal !== "" && (!isNaN(Number(cellStr)) && !isNaN(Number(fVal)) ? Number(cellStr) > Number(fVal) : cellStr > fVal);
          case ">=":          return rawVal != null && rawVal !== "" && (!isNaN(Number(cellStr)) && !isNaN(Number(fVal)) ? Number(cellStr) >= Number(fVal) : cellStr >= fVal);
          case "<":           return rawVal != null && rawVal !== "" && (!isNaN(Number(cellStr)) && !isNaN(Number(fVal)) ? Number(cellStr) < Number(fVal) : cellStr < fVal);
          case "<=":          return rawVal != null && rawVal !== "" && (!isNaN(Number(cellStr)) && !isNaN(Number(fVal)) ? Number(cellStr) <= Number(fVal) : cellStr <= fVal);
          case "is_null":     return rawVal == null || rawVal === "";
          case "is_not_null": return rawVal != null && rawVal !== "";
          default:            return true;
        }
      })
    );
  }

  // 3. Sort
  if (sort) {
    result = [...result].sort((a, b) => {
      const av = a[sort]; const bv = b[sort];
      const as = av == null ? "" : String(av);
      const bs = bv == null ? "" : String(bv);
      const aNum = Number(as); const bNum = Number(bs);
      const numCompare = !isNaN(aNum) && !isNaN(bNum) ? aNum - bNum : as.localeCompare(bs);
      return sortOrder === "asc" ? numCompare : -numCompare;
    });
  }

  return result;
}

interface ExploreResponse {
  tableName: string;
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
  returned: number;
  limit: number;
  projectIdFilter: string | null;
  mockMode?: boolean;
}

interface CircuitBreakerState {
  isSuspended: boolean;
  resumesAt: string | null;
  failureCount: number;
}

// ── Shared styles ──────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  height: 28,
  padding: "0 8px",
  border: "1px solid var(--neutral-300)",
  borderRadius: "var(--radius-sm)",
  fontSize: "var(--text-caption)",
  backgroundColor: "var(--neutral-0)",
  color: "var(--neutral-800)",
  outline: "none",
};

const PAGE_SIZES = [25, 50, 100, 200];
const TRUNCATE_LEN = 80;

// Unifier dates arrive as "20250803T160000.000Z" — reformat to something readable.
const UNIFIER_DATE_RE = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\.\d+)?Z?$/;
function formatUnifierDate(s: string): string | null {
  const m = UNIFIER_DATE_RE.exec(s);
  if (!m) return null;
  const [, yr, mo, dy, hr, mn] = m;
  const d = new Date(`${yr}-${mo}-${dy}T${hr}:${mn}:00Z`);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" });
}

function truncate(val: unknown): string {
  if (val == null || val === "") return "—";
  const s = String(val);
  const formatted = formatUnifierDate(s);
  if (formatted) return formatted;
  return s.length > TRUNCATE_LEN ? s.slice(0, TRUNCATE_LEN) + "…" : s;
}

// ── Unifier foreign-key map ───────────────────────────────────────────────
// Maps tableName → columnCode → target tableName.
// Used to render clickable FK chips in the data grid instead of plain copy cells.
const UNIFIER_FK_MAP: Record<string, Record<string, string>> = {
  // ── Line items → their parent header record ──────────────────────────────
  UNIFIER_UXUECON_LINEITEM: { RECORD_ID: "UNIFIER_UXUECON" },
  UNIFIER_UXPOS_LINEITEM:   { RECORD_ID: "UNIFIER_UXPOS" },
  UNIFIER_UXSUM_LINEITEM:   { RECORD_ID: "UNIFIER_UXSUM" },
  UNIFIER_UXMA_LINEITEM:    { RECORD_ID: "UNIFIER_UXMA" },
  UNIFIER_UXBREVP_LINEITEM: { RECORD_ID: "UNIFIER_UXBREVP" },

  // ── Workflow ──────────────────────────────────────────────────────────────
  UNIFIER_SYS_PROCESS: {
    PROJECT_ID:   "UNIFIER_US_XPRJ",
    INITIATOR_ID: "UNIFIER_SYS_USER_INFO",
  },
  UNIFIER_SYS_TASK: {
    PROJECT_ID:  "UNIFIER_US_XPRJ",
    PROCESS_ID:  "UNIFIER_SYS_PROCESS",
    ASSIGNEE_ID: "UNIFIER_SYS_USER_INFO",
  },

  // ── Login usage ───────────────────────────────────────────────────────────
  SYS_LOGIN_USAGE: {
    USER_ID:    "UNIFIER_SYS_USER_INFO",
    PROJECT_ID: "UNIFIER_US_XPRJ",
  },

  // ── Tables with PROJECT_ID + CREATOR_ID ──────────────────────────────────
  UNIFIER_UXUEDR:   { PROJECT_ID: "UNIFIER_US_XPRJ", CREATOR_ID: "UNIFIER_SYS_USER_INFO" },
  UNIFIER_UXTACIN:  { PROJECT_ID: "UNIFIER_US_XPRJ", CREATOR_ID: "UNIFIER_SYS_USER_INFO" },
  UNIFIER_UXCLEARI: { PROJECT_ID: "UNIFIER_US_XPRJ", CREATOR_ID: "UNIFIER_SYS_USER_INFO" },
  UNIFIER_UXPSR:    { PROJECT_ID: "UNIFIER_US_XPRJ", CREATOR_ID: "UNIFIER_SYS_USER_INFO" },
  UNIFIER_UXUECON:  { PROJECT_ID: "UNIFIER_US_XPRJ", CREATOR_ID: "UNIFIER_SYS_USER_INFO" },
  UNIFIER_UXPCO:    { PROJECT_ID: "UNIFIER_US_XPRJ", CREATOR_ID: "UNIFIER_SYS_USER_INFO" },
  UNIFIER_UXPOS:    { PROJECT_ID: "UNIFIER_US_XPRJ", CREATOR_ID: "UNIFIER_SYS_USER_INFO" },
  UNIFIER_UXSUM:    { PROJECT_ID: "UNIFIER_US_XPRJ", CREATOR_ID: "UNIFIER_SYS_USER_INFO" },
  UNIFIER_UXMA:     { PROJECT_ID: "UNIFIER_US_XPRJ", CREATOR_ID: "UNIFIER_SYS_USER_INFO" },

  // ── Tables with PROJECT_ID only ───────────────────────────────────────────
  UNIFIER_UXPT:       { PROJECT_ID: "UNIFIER_US_XPRJ" },
  UNIFIER_P6_ACTIVITY: { PROJECT_ID: "UNIFIER_US_XPRJ" },
  UNIFIER_UXLOC:      { PROJECT_ID: "UNIFIER_US_XPRJ" },
  UNIFIER_UXBSDR:     { PROJECT_ID: "UNIFIER_US_XPRJ" },
  UNIFIER_UXFLSDR:    { PROJECT_ID: "UNIFIER_US_XPRJ" },
  UNIFIER_UXFSDREV:   { PROJECT_ID: "UNIFIER_US_XPRJ" },
  UNIFIER_UXBREVP:    { PROJECT_ID: "UNIFIER_US_XPRJ" },
  UNIFIER_UXWORKO:    { PROJECT_ID: "UNIFIER_US_XPRJ" },
  UNIFIER_UXUEPO:     { PROJECT_ID: "UNIFIER_US_XPRJ" },
  UNIFIER_UXFLDVER:   { PROJECT_ID: "UNIFIER_US_XPRJ" },
  UNIFIER_UXBLDSP:    { PROJECT_ID: "UNIFIER_US_XPRJ" },
};

// ── Component ─────────────────────────────────────────────────────────────

export function UnifierExplorerPanel() {
  // ── Schema state ────────────────────────────────────────────────────────
  const [tables, setTables] = useState<UnifierTableDef[]>([]);
  const [loadingSchema, setLoadingSchema] = useState(true);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  // ── Table selection ──────────────────────────────────────────────────────
  const [selectedTable, setSelectedTable] = useState<UnifierTableDef | null>(null);
  const [tableSearch, setTableSearch] = useState("");

  // ── Column search ────────────────────────────────────────────────────────
  const [colSearch, setColSearch] = useState("");

  // ── Data preview state ───────────────────────────────────────────────────
  const [previewData, setPreviewData] = useState<ExploreResponse | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [projectIdFilter, setProjectIdFilter] = useState("");
  const [limit, setLimit] = useState(50);
  const [previewPage, setPreviewPage] = useState(1);

  // ── Circuit breaker state ─────────────────────────────────────────────────
  const [circuitBreaker, setCircuitBreaker] = useState<CircuitBreakerState | null>(null);
  const [resettingCb, setResettingCb] = useState(false);

  // ── FK navigation state ───────────────────────────────────────────────────
  const [fkNavSource, setFkNavSource] = useState<FkNavSource | null>(null);

  // ── Filter / sort state ───────────────────────────────────────────────────
  const [globalSearch, setGlobalSearch] = useState("");
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sort, setSort] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // ── AI analysis state ─────────────────────────────────────────────────────
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<import("@/lib/ai/types").UnifierTableAnalysis | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisOpen, setAnalysisOpen] = useState(true);

  // ── Copy feedback ─────────────────────────────────────────────────────────
  const [copiedCell, setCopiedCell] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoFetchPending = useRef(false);

  // ── View mode ─────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<"table" | "project">("table");

  // ── Fetch circuit breaker state ───────────────────────────────────────────
  const fetchCircuitBreakerState = useCallback(async () => {
    try {
      const res = await fetch("/api/devtools/unifier-reset", { credentials: "include" });
      if (!res.ok) return;
      const json = await res.json() as { circuitBreaker?: CircuitBreakerState };
      if (json.circuitBreaker) setCircuitBreaker(json.circuitBreaker);
    } catch { /* non-critical — ignore */ }
  }, []);

  const resetCircuitBreaker = useCallback(async () => {
    setResettingCb(true);
    try {
      const res = await fetch("/api/devtools/unifier-reset", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        const json = await res.json() as { after?: CircuitBreakerState };
        if (json.after) setCircuitBreaker(json.after);
        setDataError(null);
        setPreviewData(null);
      }
    } catch { /* ignore */ } finally {
      setResettingCb(false);
    }
  }, []);

  // ── Fetch schema ──────────────────────────────────────────────────────────
  const fetchSchema = useCallback(async () => {
    setLoadingSchema(true);
    setSchemaError(null);
    try {
      const res = await fetch("/api/devtools/unifier-schema", { credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
      setTables((json as { tables: UnifierTableDef[] }).tables ?? []);
    } catch (err) {
      setSchemaError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingSchema(false);
    }
  }, []);

  useEffect(() => {
    fetchSchema();
    fetchCircuitBreakerState();
  }, [fetchSchema, fetchCircuitBreakerState]);

  // ── Fetch preview data ────────────────────────────────────────────────────
  const fetchPreview = useCallback(async () => {
    if (!selectedTable) return;
    setLoadingData(true);
    setDataError(null);
    setPreviewPage(1);
    try {
      const params = new URLSearchParams({
        table: selectedTable.tableName,
        limit: String(limit),
      });
      if (projectIdFilter.trim()) params.set("projectId", projectIdFilter.trim());

      const res = await fetch(`/api/devtools/unifier-explore?${params}`, { credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
      setPreviewData(json as ExploreResponse);
    } catch (err) {
      setDataError(err instanceof Error ? err.message : String(err));
      setPreviewData(null);
      // Refresh circuit breaker state so the banner reflects the new open state
      fetchCircuitBreakerState();
    } finally {
      setLoadingData(false);
    }
  }, [selectedTable, limit, projectIdFilter, fetchCircuitBreakerState]);

  // Auto-fetch when navigateToFK signals a PROJECT_ID jump (both selectedTable
  // and projectIdFilter have been updated in the same React batch).
  useEffect(() => {
    if (autoFetchPending.current && selectedTable && projectIdFilter) {
      autoFetchPending.current = false;
      fetchPreview();
    }
  }, [selectedTable, projectIdFilter, fetchPreview]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const selectTable = (table: UnifierTableDef) => {
    setSelectedTable(table);
    setPreviewData(null);
    setDataError(null);
    setColSearch("");
    setPreviewPage(1);
    setProjectIdFilter("");
    setFkNavSource(null);
    setGlobalSearch("");
    setActiveFilters([]);
    setFiltersOpen(false);
    setSort(null);
    setSortOrder("asc");
    setAnalysisResult(null);
    setAnalysisError(null);
  };

  const navigateToFK = useCallback((
    fromTable: string,
    fromColumn: string,
    targetTableName: string,
    fkValue: string,
  ) => {
    const targetDef = tables.find((t) => t.tableName === targetTableName);
    if (!targetDef) return;
    setFkNavSource({ fromTable, fromColumn, value: fkValue });
    setSelectedTable(targetDef);
    setPreviewData(null);
    setDataError(null);
    setColSearch("");
    setPreviewPage(1);
    setGlobalSearch("");
    setActiveFilters([]);
    setFiltersOpen(false);
    setSort(null);
    setSortOrder("asc");
    setAnalysisResult(null);
    setAnalysisError(null);
    // For PROJECT_ID links, pre-populate the filter and signal auto-fetch
    if (fromColumn === "PROJECT_ID") {
      setProjectIdFilter(fkValue);
      autoFetchPending.current = true;
    } else {
      setProjectIdFilter("");
    }
  }, [tables]);

  const copyCell = (val: string, key: string) => {
    navigator.clipboard.writeText(val).catch(() => {});
    setCopiedCell(key);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopiedCell(null), 1200);
  };

  // ── Filtered lists ────────────────────────────────────────────────────────
  const filteredTables = tables.filter((t) => {
    const q = tableSearch.toLowerCase();
    return (
      t.tableName.toLowerCase().includes(q) ||
      t.displayName.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q)
    );
  });

  const filteredColumns = (selectedTable?.columns ?? []).filter((c) => {
    const q = colSearch.toLowerCase();
    return c.code.toLowerCase().includes(q) || c.label.toLowerCase().includes(q);
  });

  // Client-side filter/sort pipeline — operates on already-fetched rows
  const ROWS_PER_PAGE = 25;
  const displayRows = useMemo(
    () => applyFilters(previewData?.rows ?? [], globalSearch, activeFilters, sort, sortOrder),
    [previewData, globalSearch, activeFilters, sort, sortOrder]
  );
  const totalPreviewPages = Math.ceil(displayRows.length / ROWS_PER_PAGE);
  const pagedRows = displayRows.slice((previewPage - 1) * ROWS_PER_PAGE, previewPage * ROWS_PER_PAGE);

  // Reset to page 1 when filters/sort change
  // (handled inline in the handlers below)

  // ── Jump to Table Explorer (called from Project View) ────────────────────
  const jumpToTable = useCallback((tableName: string, projectId: string) => {
    const targetDef = tables.find((t) => t.tableName === tableName);
    if (!targetDef) return;
    setMode("table");
    setSelectedTable(targetDef);
    setPreviewData(null);
    setDataError(null);
    setColSearch("");
    setPreviewPage(1);
    setGlobalSearch("");
    setActiveFilters([]);
    setFiltersOpen(false);
    setSort(null);
    setSortOrder("asc");
    setAnalysisResult(null);
    setAnalysisError(null);
    setFkNavSource(null);
    setProjectIdFilter(projectId);
    autoFetchPending.current = true;
  }, [tables]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col flex-1 overflow-hidden">

      {/* ── Mode toggle ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "6px var(--space-3)",
          borderBottom: "1px solid var(--neutral-200)",
          backgroundColor: "var(--neutral-50)",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: "var(--text-caption)", fontWeight: 600, color: "var(--neutral-500)", marginRight: 4 }}>View:</span>
        <button
          onClick={() => setMode("table")}
          style={{
            height: 24,
            padding: "0 12px",
            border: `1px solid ${mode === "table" ? "#7C3AED" : "var(--neutral-200)"}`,
            borderRadius: "var(--radius-sm)",
            backgroundColor: mode === "table" ? "rgba(124,58,237,0.08)" : "var(--neutral-0)",
            color: mode === "table" ? "#7C3AED" : "var(--neutral-600)",
            fontSize: "var(--text-caption)",
            fontWeight: mode === "table" ? 600 : 400,
            cursor: "pointer",
          }}
        >
          Tables
        </button>
        <button
          onClick={() => setMode("project")}
          style={{
            height: 24,
            padding: "0 12px",
            border: `1px solid ${mode === "project" ? "#7C3AED" : "var(--neutral-200)"}`,
            borderRadius: "var(--radius-sm)",
            backgroundColor: mode === "project" ? "rgba(124,58,237,0.08)" : "var(--neutral-0)",
            color: mode === "project" ? "#7C3AED" : "var(--neutral-600)",
            fontSize: "var(--text-caption)",
            fontWeight: mode === "project" ? 600 : 400,
            cursor: "pointer",
          }}
        >
          Projects
        </button>
      </div>

      {/* ── Circuit breaker banner (shown in both modes) ── */}
      {circuitBreaker?.isSuspended && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px var(--space-4)",
            backgroundColor: "#fef3c7",
            borderBottom: "1px solid #fde68a",
            fontSize: "var(--text-caption)",
            color: "#92400e",
            flexShrink: 0,
          }}
        >
          <AlertCircle size={13} style={{ flexShrink: 0, color: "#d97706" }} />
          <span style={{ flex: 1 }}>
            <strong>Unifier auth circuit breaker is open.</strong> Calls suspended until{" "}
            {new Date(circuitBreaker.resumesAt!).toLocaleTimeString()}.
            Check that <code style={{ fontFamily: "ui-monospace, monospace", background: "#fde68a", padding: "0 3px", borderRadius: 3 }}>UNIFIER_PASSWORD</code> is correct in your <code style={{ fontFamily: "ui-monospace, monospace", background: "#fde68a", padding: "0 3px", borderRadius: 3 }}>.env</code>.
          </span>
          <button
            onClick={resetCircuitBreaker}
            disabled={resettingCb}
            style={{
              flexShrink: 0,
              height: 24,
              padding: "0 10px",
              border: "1px solid #d97706",
              borderRadius: "var(--radius-sm)",
              backgroundColor: resettingCb ? "#fde68a" : "#fff",
              color: "#92400e",
              fontSize: "var(--text-caption)",
              fontWeight: 600,
              cursor: resettingCb ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <RefreshCw size={11} className={resettingCb ? "animate-spin" : ""} />
            {resettingCb ? "Resetting…" : "Reset Now"}
          </button>
        </div>
      )}

      {/* ── Project View mode ── */}
      {mode === "project" ? (
        <UnifierProjectView onJumpToTable={jumpToTable} />
      ) : (

      <div className="flex flex-1 overflow-hidden">

      {/* ── Left sidebar: table list ── */}
      <div
        className="flex-shrink-0 flex flex-col"
        style={{ width: 220, borderRight: "1px solid var(--neutral-200)", backgroundColor: "var(--neutral-50)" }}
      >
        {/* Sidebar header */}
        <div style={{ padding: "var(--space-3) var(--space-3)", borderBottom: "1px solid var(--neutral-200)", flexShrink: 0 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: "var(--space-2)" }}>
            <h3 style={{ fontSize: "var(--text-body)", fontWeight: 600, color: "var(--neutral-800)", margin: 0 }}>
              Unifier Tables
            </h3>
            <button
              onClick={fetchSchema}
              disabled={loadingSchema}
              title="Reload schema"
              style={{
                padding: 4,
                background: "none",
                border: "none",
                cursor: loadingSchema ? "not-allowed" : "pointer",
                color: "var(--neutral-400)",
                borderRadius: "var(--radius-sm)",
                opacity: loadingSchema ? 0.5 : 1,
              }}
              aria-label="Reload schema"
            >
              <RefreshCw size={12} className={loadingSchema ? "animate-spin" : ""} />
            </button>
          </div>
          {/* Table search */}
          <div style={{ position: "relative" }}>
            <Search size={12} style={{ position: "absolute", left: 7, top: "50%", transform: "translateY(-50%)", color: "var(--neutral-400)", pointerEvents: "none" }} />
            <input
              type="text"
              placeholder="Search tables…"
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              style={{ ...inputStyle, width: "100%", paddingLeft: 24, boxSizing: "border-box" }}
              aria-label="Search tables"
            />
          </div>
          {!loadingSchema && !schemaError && (
            <p style={{ margin: "var(--space-2) 0 0", fontSize: 11, color: "var(--neutral-400)" }}>
              {filteredTables.length} of {tables.length} tables
            </p>
          )}
        </div>

        {/* Table list */}
        <div className="flex-1 overflow-auto" style={{ padding: "var(--space-1)" }}>
          {loadingSchema ? (
            <p style={{ padding: "var(--space-4)", color: "var(--neutral-500)", fontSize: "var(--text-caption)", margin: 0 }}>Loading…</p>
          ) : schemaError ? (
            <div style={{ padding: "var(--space-3)", color: "var(--error-600)", fontSize: "var(--text-caption)" }}>
              <AlertCircle size={12} style={{ display: "inline", marginRight: 4 }} />
              {schemaError}
            </div>
          ) : filteredTables.length === 0 ? (
            <p style={{ padding: "var(--space-3)", color: "var(--neutral-400)", fontSize: "var(--text-caption)", margin: 0 }}>
              No tables match.
            </p>
          ) : (
            filteredTables.map((t) => {
              const isActive = selectedTable?.tableName === t.tableName;
              return (
                <button
                  key={t.tableName}
                  onClick={() => selectTable(t)}
                  className="w-full text-left transition-colors"
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 6,
                    padding: "var(--space-2) var(--space-2)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "var(--text-caption)",
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? "#7C3AED" : "var(--neutral-700)",
                    backgroundColor: isActive ? "rgba(124,58,237,0.08)" : "transparent",
                    border: "none",
                    cursor: "pointer",
                    width: "100%",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = "var(--neutral-100)"; }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = "transparent"; }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.displayName}
                    </div>
                    <div style={{ fontSize: 10, color: isActive ? "rgba(124,58,237,0.7)" : "var(--neutral-400)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "ui-monospace, monospace" }}>
                      {t.tableName}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
                    {t.integrated && (
                      <span
                        title="Already wired into production service"
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          padding: "1px 5px",
                          borderRadius: 100,
                          backgroundColor: "#dcfce7",
                          color: "#15803d",
                          border: "1px solid #bbf7d0",
                          whiteSpace: "nowrap",
                          textTransform: "uppercase",
                          letterSpacing: "0.02em",
                        }}
                      >
                        Live
                      </span>
                    )}
                    {t.isLineItem && (
                      <span
                        title="Line item (child) table"
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          padding: "1px 5px",
                          borderRadius: 100,
                          backgroundColor: "#fef3c7",
                          color: "#92400e",
                          border: "1px solid #fde68a",
                          whiteSpace: "nowrap",
                          textTransform: "uppercase",
                          letterSpacing: "0.02em",
                        }}
                      >
                        LI
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {!selectedTable ? (
          /* Empty state */
          <div
            className="flex flex-col items-center justify-center gap-3"
            style={{ flex: 1, color: "var(--neutral-500)", fontSize: "var(--text-body)" }}
          >
            <Database size={40} style={{ opacity: 0.3 }} />
            <p style={{ margin: 0 }}>Select a table to view its schema</p>
            <p style={{ margin: 0, fontSize: "var(--text-caption)", color: "var(--neutral-400)", textAlign: "center", maxWidth: 280 }}>
              {tables.length > 0
                ? `${tables.length} Unifier tables available. Choose one on the left.`
                : "Loading schema…"}
            </p>
          </div>
        ) : (
          <>
            {/* ── Table detail header ── */}
            <div
              style={{
                padding: "var(--space-3) var(--space-4)",
                borderBottom: "1px solid var(--neutral-200)",
                backgroundColor: "var(--neutral-0)",
                flexShrink: 0,
              }}
            >
              {/* Title row */}
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 style={{ fontSize: "var(--text-body)", fontWeight: 700, color: "var(--neutral-800)", margin: 0 }}>
                      {selectedTable.displayName}
                    </h3>
                    {selectedTable.integrated && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 100, backgroundColor: "#dcfce7", color: "#15803d", border: "1px solid #bbf7d0" }}>
                        <Zap size={9} style={{ display: "inline", marginRight: 2 }} />
                        Integrated
                      </span>
                    )}
                    {selectedTable.isLineItem && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 100, backgroundColor: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }}>
                        <Tag size={9} style={{ display: "inline", marginRight: 2 }} />
                        Line Item
                      </span>
                    )}
                  </div>
                  <p style={{ margin: "2px 0 0", fontSize: "var(--text-caption)", color: "var(--neutral-500)", fontFamily: "ui-monospace, monospace" }}>
                    {selectedTable.tableName}
                  </p>
                  <p style={{ margin: "4px 0 0", fontSize: "var(--text-caption)", color: "var(--neutral-600)" }}>
                    {selectedTable.description}
                  </p>
                </div>
              </div>

              {/* Preview controls */}
              <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: "var(--space-3)" }}>
                {/* Project ID filter */}
                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    placeholder="PROJECT_ID filter (optional)…"
                    value={projectIdFilter}
                    onChange={(e) => setProjectIdFilter(e.target.value)}
                    style={{ ...inputStyle, width: 220 }}
                    aria-label="Filter by Project ID"
                    onKeyDown={(e) => { if (e.key === "Enter") fetchPreview(); }}
                  />
                </div>

                {/* Row limit */}
                <div style={{ position: "relative" }}>
                  <select
                    value={limit}
                    onChange={(e) => setLimit(Number(e.target.value))}
                    style={{ ...inputStyle, paddingRight: 20, appearance: "none" }}
                    aria-label="Row limit"
                  >
                    {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} rows</option>)}
                  </select>
                  <ChevronDown size={10} style={{ position: "absolute", right: 5, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--neutral-500)" }} />
                </div>

                {/* Fetch button */}
                <button
                  onClick={fetchPreview}
                  disabled={loadingData}
                  style={{
                    height: 28,
                    padding: "0 14px",
                    borderRadius: "var(--radius-sm)",
                    border: "none",
                    backgroundColor: "#7C3AED",
                    color: "#fff",
                    fontSize: "var(--text-caption)",
                    fontWeight: 600,
                    cursor: loadingData ? "not-allowed" : "pointer",
                    opacity: loadingData ? 0.7 : 1,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <RefreshCw size={12} className={loadingData ? "animate-spin" : ""} />
                  {loadingData ? "Fetching…" : previewData ? "Refresh" : "Preview Data"}
                </button>

                {/* Analyze with AI */}
                {previewData && !loadingData && (
                  <button
                    onClick={async () => {
                      setAnalyzing(true);
                      setAnalysisError(null);
                      setAnalysisResult(null);
                      setAnalysisOpen(true);
                      try {
                        const res = await fetch("/api/devtools/unifier-analyze", {
                          method: "POST",
                          credentials: "include",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            tableDef: {
                              tableName: selectedTable.tableName,
                              displayName: selectedTable.displayName,
                              description: selectedTable.description,
                              columns: selectedTable.columns,
                            },
                            sampleRows: previewData.rows.slice(0, 10),
                            columns: previewData.columns,
                          }),
                        });
                        const json = await res.json();
                        if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
                        setAnalysisResult(json as import("@/lib/ai/types").UnifierTableAnalysis);
                      } catch (err) {
                        setAnalysisError(err instanceof Error ? err.message : String(err));
                      } finally {
                        setAnalyzing(false);
                      }
                    }}
                    disabled={analyzing}
                    title="Analyze this table with AI — surface integration opportunities"
                    style={{
                      height: 28,
                      padding: "0 12px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid rgba(124,58,237,0.4)",
                      backgroundColor: analyzing ? "rgba(124,58,237,0.1)" : "rgba(124,58,237,0.07)",
                      color: "#7C3AED",
                      fontSize: "var(--text-caption)",
                      fontWeight: 600,
                      cursor: analyzing ? "not-allowed" : "pointer",
                      opacity: analyzing ? 0.8 : 1,
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <Sparkles size={12} className={analyzing ? "animate-pulse" : ""} />
                    {analyzing ? "Analyzing…" : "Analyze with AI"}
                  </button>
                )}

                {/* Row count */}
                {previewData && !loadingData && (
                  <span style={{ fontSize: "var(--text-caption)", color: "var(--neutral-500)" }}>
                    {displayRows.length !== previewData.returned
                      ? `${displayRows.length} of ${previewData.returned.toLocaleString()} rows`
                      : `${previewData.total.toLocaleString()} rows`}
                    {previewData.projectIdFilter ? ` (PROJECT_ID: ${previewData.projectIdFilter})` : ""}
                    {previewData.returned < previewData.total ? ` — showing first ${previewData.returned}` : ""}
                  </span>
                )}
              </div>

              {/* ── Filter bar (global search + column filter builder) ── */}
              {previewData && (
                <div style={{ paddingTop: "var(--space-2)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                  {/* Row 1: global search + filter toggle */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div style={{ position: "relative", flex: 1, minWidth: 160 }}>
                      <Search size={11} style={{ position: "absolute", left: 7, top: "50%", transform: "translateY(-50%)", color: "var(--neutral-400)", pointerEvents: "none" }} />
                      <input
                        type="text"
                        placeholder="Search across all columns…"
                        value={globalSearch}
                        onChange={(e) => { setGlobalSearch(e.target.value); setPreviewPage(1); }}
                        style={{ ...inputStyle, paddingLeft: 24, width: "100%", boxSizing: "border-box" }}
                        aria-label="Search all columns"
                      />
                      {globalSearch && (
                        <button onClick={() => { setGlobalSearch(""); setPreviewPage(1); }} style={{ position: "absolute", right: 5, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 2, color: "var(--neutral-400)", display: "flex" }} aria-label="Clear search">
                          <X size={10} />
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => setFiltersOpen((o) => !o)}
                      style={{
                        height: 28,
                        padding: "0 10px",
                        border: `1px solid ${filtersOpen || activeFilters.length > 0 ? "#7C3AED" : "var(--neutral-300)"}`,
                        borderRadius: "var(--radius-sm)",
                        backgroundColor: filtersOpen || activeFilters.length > 0 ? "rgba(124,58,237,0.07)" : "var(--neutral-0)",
                        color: filtersOpen || activeFilters.length > 0 ? "#7C3AED" : "var(--neutral-600)",
                        fontSize: "var(--text-caption)",
                        fontWeight: 500,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      <Filter size={11} />
                      Filters{activeFilters.length > 0 ? ` (${activeFilters.length})` : ""}
                    </button>
                    {(globalSearch || activeFilters.length > 0 || sort) && (
                      <button
                        onClick={() => { setGlobalSearch(""); setActiveFilters([]); setSort(null); setSortOrder("asc"); setPreviewPage(1); }}
                        style={{ height: 28, padding: "0 8px", border: "1px solid var(--neutral-300)", borderRadius: "var(--radius-sm)", backgroundColor: "var(--neutral-0)", color: "var(--neutral-500)", fontSize: "var(--text-caption)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                      >
                        <X size={10} /> Clear all
                      </button>
                    )}
                  </div>

                  {/* Row 2: filter builder (shown when open) */}
                  {filtersOpen && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {activeFilters.map((f) => (
                        <div key={f.id} className="flex items-center gap-2 flex-wrap">
                          {/* Column picker */}
                          <select
                            value={f.column}
                            onChange={(e) => { const copy = activeFilters.map((x) => x.id === f.id ? { ...x, column: e.target.value } : x); setActiveFilters(copy); setPreviewPage(1); }}
                            style={{ ...inputStyle, minWidth: 110 }}
                          >
                            {(previewData.columns).map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                          {/* Operator picker */}
                          <select
                            value={f.op}
                            onChange={(e) => { const copy = activeFilters.map((x) => x.id === f.id ? { ...x, op: e.target.value as FilterOp } : x); setActiveFilters(copy); setPreviewPage(1); }}
                            style={{ ...inputStyle, minWidth: 90 }}
                          >
                            {FILTER_OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          {/* Value input */}
                          {!FILTER_OPERATORS.find((o) => o.value === f.op)?.noValue && (
                            <input
                              type="text"
                              placeholder="value…"
                              value={f.value}
                              onChange={(e) => { const copy = activeFilters.map((x) => x.id === f.id ? { ...x, value: e.target.value } : x); setActiveFilters(copy); setPreviewPage(1); }}
                              style={{ ...inputStyle, minWidth: 120, flex: 1 }}
                            />
                          )}
                          {/* Remove button */}
                          <button
                            onClick={() => { setActiveFilters((fs) => fs.filter((x) => x.id !== f.id)); setPreviewPage(1); }}
                            style={{ height: 28, width: 28, border: "1px solid var(--neutral-300)", borderRadius: "var(--radius-sm)", backgroundColor: "var(--neutral-0)", color: "var(--neutral-500)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                            aria-label="Remove filter"
                          >
                            <X size={11} />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => {
                          const col = previewData.columns[0] ?? "";
                          setActiveFilters((fs) => [...fs, { id: uid(), column: col, op: "=", value: "" }]);
                        }}
                        style={{ alignSelf: "flex-start", height: 26, padding: "0 10px", border: "1px dashed var(--neutral-300)", borderRadius: "var(--radius-sm)", backgroundColor: "transparent", color: "var(--neutral-500)", fontSize: "var(--text-caption)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                      >
                        <Plus size={11} /> Add filter
                      </button>
                    </div>
                  )}

                  {/* Active filter chips when builder is closed */}
                  {!filtersOpen && activeFilters.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      {activeFilters.map((f) => {
                        const opLabel = FILTER_OPERATORS.find((o) => o.value === f.op)?.label ?? f.op;
                        const noVal = FILTER_OPERATORS.find((o) => o.value === f.op)?.noValue;
                        return (
                          <span key={f.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 100, border: "1px solid rgba(124,58,237,0.3)", backgroundColor: "rgba(124,58,237,0.07)", color: "#7C3AED", fontSize: "var(--text-caption)" }}>
                            <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 600 }}>{f.column}</span>
                            <span style={{ opacity: 0.7 }}>{opLabel}</span>
                            {!noVal && <span style={{ fontFamily: "ui-monospace, monospace" }}>{f.value}</span>}
                            <button onClick={() => { setActiveFilters((fs) => fs.filter((x) => x.id !== f.id)); setPreviewPage(1); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 1, color: "inherit", display: "flex", opacity: 0.7 }} aria-label={`Remove filter on ${f.column}`}><X size={10} /></button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Column list + data grid ── */}
            <div className="flex flex-1 overflow-hidden">

              {/* Column list */}
              <div
                className="flex-shrink-0 flex flex-col"
                style={{ width: 220, borderRight: "1px solid var(--neutral-200)", backgroundColor: "var(--neutral-50)" }}
              >
                <div style={{ padding: "var(--space-2) var(--space-3)", borderBottom: "1px solid var(--neutral-200)", flexShrink: 0 }}>
                  <div className="flex items-center justify-between" style={{ marginBottom: "var(--space-2)" }}>
                    <span style={{ fontSize: "var(--text-caption)", fontWeight: 600, color: "var(--neutral-700)" }}>
                      {selectedTable.columns.length} columns
                    </span>
                  </div>
                  <div style={{ position: "relative" }}>
                    <Search size={11} style={{ position: "absolute", left: 7, top: "50%", transform: "translateY(-50%)", color: "var(--neutral-400)", pointerEvents: "none" }} />
                    <input
                      type="text"
                      placeholder="Search columns…"
                      value={colSearch}
                      onChange={(e) => setColSearch(e.target.value)}
                      style={{ ...inputStyle, width: "100%", paddingLeft: 22, boxSizing: "border-box", height: 26 }}
                      aria-label="Search columns"
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-auto" style={{ padding: "var(--space-1) var(--space-2)" }}>
                  {filteredColumns.map((col) => (
                    <div
                      key={col.code}
                      style={{
                        padding: "var(--space-1) var(--space-2)",
                        borderRadius: "var(--radius-sm)",
                        marginBottom: 2,
                      }}
                    >
                      <div style={{ fontSize: "var(--text-caption)", fontWeight: 500, color: "var(--neutral-800)", fontFamily: "ui-monospace, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {col.code}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--neutral-500)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {col.label}
                      </div>
                    </div>
                  ))}
                  {filteredColumns.length === 0 && colSearch && (
                    <p style={{ padding: "var(--space-2)", color: "var(--neutral-400)", fontSize: "var(--text-caption)", margin: 0 }}>
                      No columns match.
                    </p>
                  )}
                </div>
              </div>

              {/* Data grid */}
              <div className="flex-1 flex flex-col overflow-hidden">

                {/* FK navigation breadcrumb */}
                {fkNavSource && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "5px var(--space-3)",
                      backgroundColor: "rgba(124,58,237,0.07)",
                      borderBottom: "1px solid rgba(124,58,237,0.2)",
                      fontSize: "var(--text-caption)",
                      color: "#7C3AED",
                      flexShrink: 0,
                    }}
                  >
                    <Link size={11} style={{ flexShrink: 0 }} />
                    <span style={{ fontWeight: 500 }}>
                      {fkNavSource.fromTable}
                    </span>
                    <span style={{ color: "rgba(124,58,237,0.6)" }}>·</span>
                    <span style={{ fontFamily: "ui-monospace, monospace" }}>
                      {fkNavSource.fromColumn}
                    </span>
                    <span style={{ color: "rgba(124,58,237,0.6)" }}>=</span>
                    <span
                      style={{
                        fontFamily: "ui-monospace, monospace",
                        backgroundColor: "rgba(124,58,237,0.12)",
                        padding: "1px 5px",
                        borderRadius: 4,
                        maxWidth: 180,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        display: "inline-block",
                      }}
                    >
                      {fkNavSource.value}
                    </span>
                    <button
                      onClick={() => setFkNavSource(null)}
                      title="Dismiss"
                      style={{
                        marginLeft: "auto",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 2,
                        color: "rgba(124,58,237,0.5)",
                        display: "flex",
                        alignItems: "center",
                        borderRadius: "var(--radius-sm)",
                      }}
                      aria-label="Dismiss FK navigation breadcrumb"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}

                {dataError ? (
                  <div style={{ padding: "var(--space-4)", margin: "var(--space-4)", backgroundColor: "var(--error-50)", border: "1px solid var(--error-200)", borderRadius: "var(--radius-sm)", color: "var(--error-700)", fontSize: "var(--text-caption)", fontFamily: "ui-monospace, monospace" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                      <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
                      <span><strong>Error:</strong> {dataError}</span>
                    </div>
                    {(dataError.includes("401") || dataError.includes("authentication") || dataError.includes("suspended")) && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--error-200)" }}>
                        <span style={{ fontFamily: "inherit", color: "var(--error-600)" }}>
                          Circuit breaker is open. Reset it to retry immediately, or wait for the suspension window to expire.
                        </span>
                        <button
                          onClick={resetCircuitBreaker}
                          disabled={resettingCb}
                          style={{
                            flexShrink: 0,
                            height: 24,
                            padding: "0 10px",
                            border: "1px solid var(--error-400)",
                            borderRadius: "var(--radius-sm)",
                            backgroundColor: resettingCb ? "var(--error-100)" : "var(--neutral-0)",
                            color: "var(--error-700)",
                            fontSize: "var(--text-caption)",
                            fontWeight: 600,
                            cursor: resettingCb ? "not-allowed" : "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                          }}
                        >
                          <RefreshCw size={11} className={resettingCb ? "animate-spin" : ""} />
                          {resettingCb ? "Resetting…" : "Reset Circuit Breaker"}
                        </button>
                      </div>
                    )}
                  </div>
                ) : !previewData ? (
                  <div
                    className="flex flex-col items-center justify-center gap-2"
                    style={{ flex: 1, color: "var(--neutral-400)", fontSize: "var(--text-caption)" }}
                  >
                    <ChevronRight size={20} style={{ opacity: 0.4 }} />
                    <p style={{ margin: 0 }}>Click &ldquo;Preview Data&rdquo; to fetch rows from Unifier</p>
                  </div>
                ) : displayRows.length === 0 ? (
                  <div style={{ padding: "var(--space-6)", color: "var(--neutral-500)", fontSize: "var(--text-body)" }}>
                    {previewData?.mockMode ? (
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, backgroundColor: "#fef3c7", border: "1px solid #fde68a", borderRadius: "var(--radius-sm)", padding: "var(--space-3)", color: "#92400e", fontSize: "var(--text-caption)" }}>
                        <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1, color: "#d97706" }} />
                        <span>
                          <strong>Mock mode active</strong> — <code style={{ fontFamily: "ui-monospace, monospace" }}>UNIFIER_MOCK=true</code> is set.
                          The Explorer requires real Unifier credentials to fetch table data.
                          Set a valid <code style={{ fontFamily: "ui-monospace, monospace" }}>UNIFIER_PASSWORD</code> and set <code style={{ fontFamily: "ui-monospace, monospace" }}>UNIFIER_MOCK=false</code> to browse live tables.
                        </span>
                      </div>
                    ) : (
                      <p style={{ margin: 0 }}>No rows returned.</p>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Pagination bar */}
                    {totalPreviewPages > 1 && (
                      <div
                        className="flex items-center gap-2"
                        style={{
                          padding: "var(--space-2) var(--space-3)",
                          borderBottom: "1px solid var(--neutral-200)",
                          backgroundColor: "var(--neutral-0)",
                          flexShrink: 0,
                        }}
                      >
                        <span style={{ fontSize: "var(--text-caption)", color: "var(--neutral-500)" }}>
                          Page {previewPage} / {totalPreviewPages}
                        </span>
                        <button
                          onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                          disabled={previewPage <= 1}
                          style={{ padding: 3, border: "1px solid var(--neutral-300)", borderRadius: "var(--radius-sm)", backgroundColor: "var(--neutral-0)", cursor: previewPage <= 1 ? "not-allowed" : "pointer", opacity: previewPage <= 1 ? 0.5 : 1 }}
                          aria-label="Previous page"
                        >
                          <ChevronLeft size={13} />
                        </button>
                        <button
                          onClick={() => setPreviewPage((p) => Math.min(totalPreviewPages, p + 1))}
                          disabled={previewPage >= totalPreviewPages}
                          style={{ padding: 3, border: "1px solid var(--neutral-300)", borderRadius: "var(--radius-sm)", backgroundColor: "var(--neutral-0)", cursor: previewPage >= totalPreviewPages ? "not-allowed" : "pointer", opacity: previewPage >= totalPreviewPages ? 0.5 : 1 }}
                          aria-label="Next page"
                        >
                          <ChevronRight size={13} />
                        </button>
                      </div>
                    )}

                    {/* Table */}
                    <div className="flex-1 overflow-auto" style={{ padding: "var(--space-3)" }}>
                      <div style={{ border: "1px solid var(--neutral-200)", borderRadius: "var(--radius-md)", overflow: "auto", maxWidth: "100%" }}>
                        <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "collapse", fontSize: "var(--text-caption)" }}>
                          <thead>
                            <tr style={{ backgroundColor: "var(--neutral-100)" }}>
                              {(previewData?.columns ?? []).map((col) => {
                                const colDef = selectedTable.columns.find((c) => c.code === col);
                                const isActive = sort === col;
                                return (
                                  <th
                                    key={col}
                                    title={colDef ? `${col} — ${colDef.label} (click to sort)` : `${col} (click to sort)`}
                                    aria-sort={isActive ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
                                    tabIndex={0}
                                    role="columnheader"
                                    onClick={() => {
                                      if (sort === col) {
                                        setSortOrder((o) => o === "asc" ? "desc" : "asc");
                                      } else {
                                        setSort(col);
                                        setSortOrder("asc");
                                      }
                                      setPreviewPage(1);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        if (sort === col) {
                                          setSortOrder((o) => o === "asc" ? "desc" : "asc");
                                        } else {
                                          setSort(col);
                                          setSortOrder("asc");
                                        }
                                        setPreviewPage(1);
                                      }
                                    }}
                                    style={{
                                      padding: "6px var(--space-3)",
                                      textAlign: "left",
                                      fontWeight: 600,
                                      color: isActive ? "#7C3AED" : "var(--neutral-700)",
                                      borderBottom: "1px solid var(--neutral-200)",
                                      whiteSpace: "nowrap",
                                      minWidth: 90,
                                      position: "sticky",
                                      top: 0,
                                      backgroundColor: isActive ? "rgba(124,58,237,0.06)" : "var(--neutral-100)",
                                      cursor: "pointer",
                                      userSelect: "none",
                                    }}
                                  >
                                    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "var(--text-caption)", fontFamily: "ui-monospace, monospace" }}>
                                      {col}
                                      {isActive
                                        ? (sortOrder === "asc"
                                          ? <ArrowUp size={10} style={{ flexShrink: 0 }} />
                                          : <ArrowDown size={10} style={{ flexShrink: 0 }} />)
                                        : null}
                                    </div>
                                    {colDef && (
                                      <div style={{ fontSize: 10, color: isActive ? "rgba(124,58,237,0.6)" : "var(--neutral-400)", fontWeight: 400, fontFamily: "inherit" }}>{colDef.label}</div>
                                    )}
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>
                          <tbody>
                            {pagedRows.map((row, i) => (
                              <tr
                                key={i}
                                style={{ borderBottom: "1px solid var(--neutral-100)" }}
                                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--neutral-50)")}
                                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}
                              >
                                {(previewData?.columns ?? []).map((col) => {
                                  const rawVal = row[col];
                                  const isNull = rawVal == null;
                                  const cellKey = `${i}-${col}`;
                                  const isCopied = copiedCell === cellKey;
                                  const displayVal = truncate(rawVal);

                                  const fkTarget = selectedTable
                                    ? UNIFIER_FK_MAP[selectedTable.tableName]?.[col]
                                    : undefined;
                                  const isFk = !!fkTarget && !isNull && rawVal !== "";

                                  return (
                                    <td
                                      key={col}
                                      style={{
                                        padding: "5px var(--space-3)",
                                        maxWidth: 220,
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                        color: isNull ? "var(--neutral-400)" : "var(--neutral-800)",
                                        fontStyle: isNull ? "italic" : "normal",
                                      }}
                                    >
                                      {isFk ? (
                                        /* FK chip — navigates to target table */
                                        <button
                                          onClick={() => navigateToFK(
                                            selectedTable!.tableName,
                                            col,
                                            fkTarget,
                                            String(rawVal),
                                          )}
                                          title={`Jump to ${fkTarget} where ${col} = ${String(rawVal)}`}
                                          style={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: 4,
                                            padding: "2px 7px",
                                            borderRadius: 100,
                                            border: "1px solid rgba(124,58,237,0.3)",
                                            backgroundColor: "rgba(124,58,237,0.07)",
                                            color: "#7C3AED",
                                            fontSize: "inherit",
                                            fontFamily: "inherit",
                                            fontWeight: 500,
                                            cursor: "pointer",
                                            maxWidth: "100%",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                            transition: "background-color 0.1s",
                                          }}
                                          onMouseEnter={(e) => {
                                            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(124,58,237,0.15)";
                                          }}
                                          onMouseLeave={(e) => {
                                            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(124,58,237,0.07)";
                                          }}
                                        >
                                          <Link size={9} style={{ flexShrink: 0 }} />
                                          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                                            {displayVal}
                                          </span>
                                        </button>
                                      ) : (
                                        /* Regular cell — click to copy */
                                        <button
                                          className="group"
                                          onClick={() => !isNull && copyCell(String(rawVal), cellKey)}
                                          title={isNull ? "NULL" : `Click to copy: ${String(rawVal)}`}
                                          style={{
                                            background: "none",
                                            border: "none",
                                            cursor: isNull ? "default" : "pointer",
                                            padding: 0,
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 4,
                                            color: "inherit",
                                            fontSize: "inherit",
                                            fontFamily: "inherit",
                                            maxWidth: "100%",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                          }}
                                        >
                                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", fontStyle: isNull ? "italic" : "normal" }}>
                                            {isNull ? "NULL" : displayVal}
                                          </span>
                                          {isCopied ? (
                                            <Check size={10} style={{ flexShrink: 0, color: "#16a34a" }} />
                                          ) : !isNull ? (
                                            <Copy size={9} className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ flexShrink: 0, color: "var(--neutral-400)" }} />
                                          ) : null}
                                        </button>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}

                {/* ── AI Analysis Panel ── */}
                {(analysisResult || analysisError || analyzing) && (
                  <div
                    style={{
                      flexShrink: 0,
                      borderTop: "1px solid rgba(124,58,237,0.2)",
                      backgroundColor: "rgba(124,58,237,0.03)",
                      maxHeight: analysisOpen ? 480 : 44,
                      overflow: analysisOpen ? "auto" : "hidden",
                      transition: "max-height 0.2s ease",
                    }}
                  >
                    {/* Panel header */}
                    <button
                      aria-expanded={analysisOpen}
                      aria-controls="ai-analysis-body"
                      onClick={() => setAnalysisOpen((o) => !o)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        width: "100%",
                        padding: "8px var(--space-3)",
                        borderBottom: analysisOpen ? "1px solid rgba(124,58,237,0.15)" : "none",
                        backgroundColor: "rgba(124,58,237,0.06)",
                        cursor: "pointer",
                        flexShrink: 0,
                        position: "sticky",
                        top: 0,
                        border: "none",
                        textAlign: "left",
                      }}
                    >
                      <Sparkles size={13} style={{ color: "#7C3AED", flexShrink: 0 }} />
                      <span style={{ fontSize: "var(--text-caption)", fontWeight: 600, color: "#7C3AED", flex: 1 }}>
                        AI Integration Analysis — {selectedTable?.displayName}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setAnalysisResult(null); setAnalysisError(null); }}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "rgba(124,58,237,0.5)", display: "flex" }}
                        aria-label="Dismiss analysis"
                      >
                        <X size={12} />
                      </button>
                      <ChevronDown
                        size={13}
                        style={{ color: "#7C3AED", transform: analysisOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
                      />
                    </button>

                    {/* Panel body */}
                    {analysisOpen && (
                      <div id="ai-analysis-body" style={{ padding: "var(--space-3)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>

                        {/* Loading */}
                        {analyzing && (
                          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#7C3AED", fontSize: "var(--text-caption)" }}>
                            <RefreshCw size={13} className="animate-spin" />
                            Sending schema + sample rows to Gemini…
                          </div>
                        )}

                        {/* Error */}
                        {analysisError && (
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 7, padding: "var(--space-3)", backgroundColor: "var(--error-50)", border: "1px solid var(--error-200)", borderRadius: "var(--radius-sm)", color: "var(--error-700)", fontSize: "var(--text-caption)" }}>
                            <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                            {analysisError}
                          </div>
                        )}

                        {/* Results */}
                        {analysisResult && (
                          <>
                            {/* Integration status + summary */}
                            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                              <span style={{
                                fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 100, whiteSpace: "nowrap",
                                ...(analysisResult.integrationStatus === "already-integrated"
                                  ? { backgroundColor: "#dcfce7", color: "#15803d", border: "1px solid #bbf7d0" }
                                  : analysisResult.integrationStatus === "partially-integrated"
                                  ? { backgroundColor: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }
                                  : { backgroundColor: "rgba(124,58,237,0.07)", color: "#7C3AED", border: "1px solid rgba(124,58,237,0.25)" }),
                              }}>
                                {analysisResult.integrationStatus === "already-integrated" ? "Integrated"
                                  : analysisResult.integrationStatus === "partially-integrated" ? "Partially Integrated"
                                  : "Not Yet Integrated"}
                              </span>
                              <p style={{ margin: 0, fontSize: "var(--text-caption)", color: "var(--neutral-700)", flex: 1, minWidth: 200 }}>
                                {analysisResult.summary}
                              </p>
                            </div>

                            {/* Related features */}
                            {analysisResult.relatedDashboardFeatures.length > 0 && (
                              <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--neutral-600)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                  Related Dashboard Features
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                  {analysisResult.relatedDashboardFeatures.map((f, i) => (
                                    <div key={i} style={{ display: "flex", gap: 7, fontSize: "var(--text-caption)" }}>
                                      <span style={{ fontWeight: 600, color: "var(--neutral-800)", minWidth: 120, flexShrink: 0 }}>{f.feature}</span>
                                      <span style={{ color: "var(--neutral-600)" }}>{f.explanation}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Suggested integrations */}
                            {analysisResult.suggestedIntegrations.length > 0 && (
                              <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--neutral-600)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                  Suggested Integrations
                                </div>
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-caption)" }}>
                                  <thead>
                                    <tr style={{ backgroundColor: "rgba(124,58,237,0.06)" }}>
                                      <th style={{ padding: "4px 8px", textAlign: "left", fontWeight: 600, color: "var(--neutral-700)", borderBottom: "1px solid rgba(124,58,237,0.15)" }}>Column</th>
                                      <th style={{ padding: "4px 8px", textAlign: "left", fontWeight: 600, color: "var(--neutral-700)", borderBottom: "1px solid rgba(124,58,237,0.15)" }}>Dashboard Placement</th>
                                      <th style={{ padding: "4px 8px", textAlign: "left", fontWeight: 600, color: "var(--neutral-700)", borderBottom: "1px solid rgba(124,58,237,0.15)", whiteSpace: "nowrap" }}>Effort</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {analysisResult.suggestedIntegrations.map((s, i) => (
                                      <tr key={i} style={{ borderBottom: "1px solid var(--neutral-100)" }}>
                                        <td style={{ padding: "4px 8px", fontFamily: "ui-monospace, monospace", color: "#7C3AED", fontWeight: 500 }}>{s.column}</td>
                                        <td style={{ padding: "4px 8px", color: "var(--neutral-700)" }}>{s.dashboardPlacement}</td>
                                        <td style={{ padding: "4px 8px" }}>
                                          <span style={{
                                            fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 100,
                                            ...(s.effort === "low"
                                              ? { backgroundColor: "#dcfce7", color: "#15803d" }
                                              : s.effort === "medium"
                                              ? { backgroundColor: "#fef3c7", color: "#92400e" }
                                              : { backgroundColor: "#fee2e2", color: "#b91c1c" }),
                                          }}>
                                            {s.effort}
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}

                            {/* New feature ideas */}
                            {analysisResult.newFeatureIdeas.length > 0 && (
                              <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--neutral-600)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                  New Feature Ideas
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                  {analysisResult.newFeatureIdeas.map((idea, i) => (
                                    <div key={i} style={{ padding: "var(--space-2) var(--space-3)", border: "1px solid rgba(124,58,237,0.18)", borderRadius: "var(--radius-sm)", backgroundColor: "rgba(124,58,237,0.04)" }}>
                                      <div style={{ fontWeight: 600, color: "#7C3AED", fontSize: "var(--text-caption)", marginBottom: 2 }}>{idea.title}</div>
                                      <div style={{ fontSize: "var(--text-caption)", color: "var(--neutral-700)", marginBottom: 4 }}>{idea.description}</div>
                                      {idea.tablesNeeded.length > 0 && (
                                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                          {idea.tablesNeeded.map((t) => (
                                            <span key={t} style={{ fontSize: 10, fontFamily: "ui-monospace, monospace", padding: "1px 5px", borderRadius: 4, backgroundColor: "rgba(124,58,237,0.1)", color: "#7C3AED", border: "1px solid rgba(124,58,237,0.2)" }}>
                                              {t}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Data quality notes */}
                            {analysisResult.dataQualityNotes.length > 0 && (
                              <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--neutral-600)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                  Data Quality Notes
                                </div>
                                <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 3 }}>
                                  {analysisResult.dataQualityNotes.map((note, i) => (
                                    <li key={i} style={{ fontSize: "var(--text-caption)", color: "var(--neutral-700)" }}>{note}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
      </div>
      )} {/* end mode === "table" */}
    </div>
  );
}
