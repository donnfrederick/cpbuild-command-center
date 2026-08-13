"use client";

import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef, forwardRef, useImperativeHandle } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ArrowLeft, Loader2, Search, ArrowUpDown, ArrowUp, ArrowDown, X, Replace, Columns3, Plus, ClipboardPaste, Upload, Download, ChevronUp, ChevronDown, Trash2, Undo2, BarChart3, Table2, Link2 } from "lucide-react";
import { LocationProgressBreakdown } from "@/components/projects/LocationProgressBreakdown";
import { ScopeSetupPanel } from "@/components/projects/ScopeSetupPanel";
import { SubcontractorPicker, type SubcontractorPickerRef } from "@/components/projects/SubcontractorPicker";
import { toast } from "sonner";
import { ProjectDocuments } from "@/components/projects/ProjectDocuments";
import { ProjectCloneSubtitle } from "@/components/projects/ProjectCloneSubtitle";
import { Skeleton } from "@/components/ui/skeleton";
import type { Project } from "@/lib/projects";
import { parseUPM, parseUPMFromFile, validateUPMRows, type UPMValidationError } from "@/lib/upm-parse";
import {
  fieldTrackerRecordFromProjectRow,
  downloadFieldTrackerXlsx,
  FIELD_TRACKER_IMPORT_HEADERS,
} from "@/lib/upm-export";
import {
  FIELD_TRACKER_SEARCH_DEBOUNCE_MS,
  FIELD_TRACKER_UNITS_PAGE_LIMIT,
} from "@/lib/field-tracker-units";
import { LoadingRowsToast } from "@/components/ui/LoadingRowsToast";
import { FileDropOverlay } from "@/components/ui/FileDropOverlay";
import { useFileDrop } from "@/hooks/use-file-drop";
import { ScopeLinkingModal, type UnlinkedScopeType } from "@/components/projects/ScopeLinkingModal";
import { LocationBuilderUploadPreviewModal } from "@/components/projects/LocationBuilderUploadPreviewModal";
import { LocationBuilderSpreadsheetParsingOverlay } from "@/components/projects/LocationBuilderSpreadsheetParsingOverlay";
import {
  appendProjectRowsInBatches,
  AppendRowsCancelledError,
  revertAppendedRowsInBatches,
  type AppendRowsProgress,
} from "@/lib/field-tracker-append-rows";
import { unitQtyInstallCompletePercent, type ScopeStage, type ScopeStatus } from "@/lib/unit-scope-progress";
import type { InspectionStatus } from "@/lib/scope-square-style";

interface LookupItem {
  id: string;
  code: string;
  name: string;
}

interface Lookups {
  scopeTypes: LookupItem[];
  locationTypes: LookupItem[];
  costTypes: LookupItem[];
  installTeams: LookupItem[];
  uomTypes: LookupItem[];
}

interface ProjectRowUnit {
  id: string;
  rowIndex: number;
  building: string;
  level: string;
  unit: string;
  area: string;
  shipPhase: string;
  buildPhase: string;
  scheme: string;
  unitType: string;
  description: string;
  scopeType: {
    id: string;
    code: string;
    name: string;
    canonicalScopeType?: { id: string; code: string; displayName: string } | null;
  } | null;
  csiPrimeCode: string;
  csiDetailCode: string;
  locationType: { id: string; code: string; name: string } | null;
  costType: { id: string; code: string; name: string } | null;
  installer: { id: string; code: string; name: string } | null;
  unifierSubId: string | null;
  qty: number | null;
  uom: { id: string; code: string; name: string } | null;
  unitRate: number | null;
  budgetedManHours: number | null;
  startDate: string | null;
  finishDate: string | null;
  percentComplete: number | null;
  actualManHours: number | null;
  scopeStage: ScopeStage;
  scopeStatus: ScopeStatus;
  inspectionStatus: InspectionStatus;
  subScopeInstances: ReadonlyArray<{
    qty: number | null;
    scopeStage: ScopeStage;
    scopeStatus: ScopeStatus;
  }>;
}

interface ProjectDetailViewProps {
  project: Project;
  /** True for EDIT_UPM holders (ADMIN, CONTROLS_MANAGER). Grants all write operations
   * including the destructive "overwrite existing rows" mode. */
  canManage: boolean;
  /** True when the user can add/edit/delete rows and upload (add/merge modes) but NOT overwrite.
   * Set for INSTALL_MANAGER via MANAGE_PROJECTS. Always true when canManage is true. */
  canAddAndEdit?: boolean;
  /** Base URL for Unifier (for document links). Optional. */
  unifierBaseUrl?: string | null;
  /** Current user ID — used to scope recent subcontractor picks per user in localStorage. */
  currentUserId?: string;
  /** Session role — used for admin-only overwrite force. */
  currentUserRole?: string;
}

const TEXT_COLS = ["building", "level", "unit", "area", "shipPhase", "buildPhase", "scheme", "unitType", "description", "csiPrimeCode", "csiDetailCode"] as const;
const NUMBER_COLS = ["qty", "unitRate", "budgetedManHours", "percentComplete", "actualManHours"] as const;
const DATE_COLS = ["startDate", "finishDate"] as const;
const FK_COLS = ["scopeType", "locationType", "costType", "installer", "uom"] as const;
/** Read-only progress columns — shown by default, never editable. */
const PROGRESS_COLS = ["installCompletePct", "scopeStage", "scopeStatus", "inspectionStatus"] as const;

const COL_KEYS: Record<string, string> = {
  building: "building",
  level: "level",
  unit: "unit",
  area: "area",
  shipPhase: "shipPhase",
  buildPhase: "buildPhase",
  scheme: "scheme",
  unitType: "unitType",
  description: "description",
  scopeType: "scopeType",
  csiPrimeCode: "csiPrimeCode",
  csiDetailCode: "csiDetailCode",
  locationType: "locationType",
  costType: "costType",
  installer: "installer",
  qty: "qty",
  uom: "uom",
  unitRate: "unitRate",
  budgetedManHours: "budgetedManHours",
  startDate: "startDate",
  finishDate: "finishDate",
  percentComplete: "percentComplete",
  actualManHours: "actualManHours",
  scopeStage: "scopeStage",
  scopeStatus: "scopeStatus",
  inspectionStatus: "inspectionStatus",
  installCompletePct: "installCompletePct",
};

const ALL_COLS = [...TEXT_COLS, ...FK_COLS, ...NUMBER_COLS, ...DATE_COLS, ...PROGRESS_COLS] as const;
const EDITABLE_COLS = [...TEXT_COLS, ...FK_COLS, ...NUMBER_COLS, ...DATE_COLS] as const;
const NUM_EDITABLE = EDITABLE_COLS.length;
const COL_INDEX: Record<string, number> = Object.fromEntries(EDITABLE_COLS.map((c, i) => [c, i]));

const UPM_HIDDEN_COLUMNS_KEY = "upm-hidden-columns";

/** Fields that cannot be cleared once set (Location Builder required columns). */
const LB_REQUIRED_FIELDS = ["unitType", "description", "scopeType"] as const;
type LbRequiredField = (typeof LB_REQUIRED_FIELDS)[number];

function isLbRequiredFieldEmpty(field: string, value: string | number | null): boolean {
  if (!LB_REQUIRED_FIELDS.includes(field as LbRequiredField)) return false;
  if (value === null || value === undefined) return true;
  return String(value).trim() === "";
}

function bulkUpdateFieldValue(column: string, raw: string): string | number | null {
  const trimmed = raw.trim();
  if (NUMBER_COLS.includes(column as (typeof NUMBER_COLS)[number])) {
    if (trimmed === "") return null;
    const n = parseFloat(raw);
    return Number.isNaN(n) ? null : n;
  }
  if (DATE_COLS.includes(column as (typeof DATE_COLS)[number])) {
    return trimmed === "" ? null : trimmed;
  }
  if (FK_COLS.includes(column as (typeof FK_COLS)[number])) {
    return trimmed === "" ? null : trimmed;
  }
  return trimmed;
}

/** Map internal col names to API spreadsheet keys. */
const COL_TO_API_KEY: Record<string, string> = {
  building: "Building",
  level: "Level",
  unit: "Unit",
  area: "Area",
  shipPhase: "Ship. Phase",
  buildPhase: "Build Phase",
  scheme: "Scheme",
  unitType: "Unit Type",
  description: "Description",
  scopeType: "Scope Type",
  csiPrimeCode: "CSI Prime Code",
  csiDetailCode: "CSI Detail Code",
  locationType: "Location Type",
  costType: "Cost Type",
  installer: "Installer",
  qty: "QTY",
  uom: "UOM",
  unitRate: "Unit Rate",
  budgetedManHours: "Budgeted Man Hours",
  startDate: "Start Date",
  finishDate: "Finish Date",
  percentComplete: "Percent Complete",
  actualManHours: "Actual Man Hours",
};

type EditableCellRef = { focus(): void };

// ─── Progress badge style constants (hoisted to avoid per-render allocation) ──

const BADGE_BASE_STYLE: React.CSSProperties = {
  display: "inline-block",
  padding: "1px 6px",
  borderRadius: 10,
  fontSize: 10,
  fontWeight: 600,
  lineHeight: "16px",
};

const STAGE_COLORS: Record<string, { bg: string; color: string }> = {
  STAGING: { bg: "var(--primary-100)", color: "var(--primary-700)" },
  ASSEMBLY: { bg: "var(--warning-100)", color: "var(--warning-700)" },
  INSTALL: { bg: "var(--success-100)", color: "var(--success-700)" },
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  NOT_STARTED: { bg: "var(--neutral-100)", color: "var(--neutral-600)" },
  IN_PROGRESS: { bg: "var(--primary-100)", color: "var(--primary-700)" },
  BLOCKED: { bg: "var(--error-100)", color: "var(--error-700)" },
  PENDING_VERIFICATION: { bg: "var(--success-50)", color: "var(--success-700)" },
  COMPLETE: { bg: "var(--success-100)", color: "var(--success-700)" },
};

const INSP_COLORS: Record<string, { bg: string; color: string }> = {
  READY: { bg: "var(--warning-100)", color: "var(--warning-700)" },
  PASSED: { bg: "var(--success-100)", color: "var(--success-700)" },
  FAILED: { bg: "var(--error-100)", color: "var(--error-700)" },
};

function getCellDisplayValue(row: ProjectRowUnit, col: string): string {
  if (col === "installCompletePct") {
    const pct = unitQtyInstallCompletePercent(
      row.subScopeInstances.length > 0
        ? row.subScopeInstances.map((inst) => ({
            qty: inst.qty,
            scopeStage: inst.scopeStage,
            scopeStatus: inst.scopeStatus,
            subScopeInstances: [],
          }))
        : [{ qty: row.qty, scopeStage: row.scopeStage, scopeStatus: row.scopeStatus, subScopeInstances: [] }]
    );
    return String(pct);
  }
  const v = row[col as keyof ProjectRowUnit];
  if (v == null) return "";
  if (typeof v === "object" && "name" in v && "code" in v) return (v.name || v.code) ?? "";
  if (typeof v === "number") return String(v);
  return String(v);
}

function matchesGlobalSearch(row: ProjectRowUnit, query: string, column: string | "all"): boolean {
  if (!query.trim()) return true;
  const q = query.toLowerCase().trim();
  if (column === "all") {
    return ALL_COLS.some((col) => getCellDisplayValue(row, col).toLowerCase().includes(q));
  }
  return getCellDisplayValue(row, column).toLowerCase().includes(q);
}

function matchesColumnFilters(row: ProjectRowUnit, columnFilters: Record<string, string>): boolean {
  for (const [col, q] of Object.entries(columnFilters)) {
    if (!q.trim()) continue;
    const val = getCellDisplayValue(row, col).toLowerCase();
    if (!val.includes(q.toLowerCase().trim())) return false;
  }
  return true;
}

export function ProjectDetailView({ project, canManage, canAddAndEdit, unifierBaseUrl, currentUserId, currentUserRole }: ProjectDetailViewProps) {
  // canWrite: true for any user who can add/edit/delete rows (includes INSTALL_MANAGER).
  // canManage: true only for EDIT_UPM holders who may also use the destructive overwrite mode.
  const canWrite = canManage || (canAddAndEdit ?? false);
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");
  const colLabel = (col: string) => t(`columns.${COL_KEYS[col] ?? col}`);
  const [units, setUnits] = useState<ProjectRowUnit[]>([]);
  // Always mirrors the latest units value so event-handler callbacks can read it
  // without a stale closure. Synced in useLayoutEffect (not render) to avoid
  // mutating a ref during an interruptible concurrent render pass.
  const latestUnitsRef = useRef<ProjectRowUnit[]>([]);
  useLayoutEffect(() => { latestUnitsRef.current = units; }, [units]);
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [loading, setLoading] = useState(true);
  /** True while refetching rows after search/column scope changes — table-only overlay, not full page. */
  const [unitsRefreshing, setUnitsRefreshing] = useState(false);
  const [hasMoreRows, setHasMoreRows] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalRowCount, setTotalRowCount] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [justSavedIds, setJustSavedIds] = useState<Set<string>>(new Set());
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [filterQuery, setFilterQuery] = useState("");
  /** Debounced / committed copy for API + server-side "all columns" search (see commitSearchNow). */
  const [debouncedFilterQuery, setDebouncedFilterQuery] = useState("");
  const filterQueryRef = useRef(filterQuery);
  filterQueryRef.current = filterQuery;
  const debouncedFilterQueryRef = useRef(debouncedFilterQuery);
  debouncedFilterQueryRef.current = debouncedFilterQuery;
  const searchDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Apply the current input immediately (clears pending debounce). */
  const commitSearchNow = useCallback(() => {
    if (searchDebounceTimerRef.current) {
      clearTimeout(searchDebounceTimerRef.current);
      searchDebounceTimerRef.current = null;
    }
    setDebouncedFilterQuery(filterQueryRef.current);
  }, []);
  const [filterColumn, setFilterColumn] = useState<string | "all">("all");
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [bulkColumn, setBulkColumn] = useState<string>("building");
  const [bulkValue, setBulkValue] = useState<string>("");
  const [findReplaceCol, setFindReplaceCol] = useState<string>("building");
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "breakdown" | "scope-setup">("grid");
  const columnPickerRef = useRef<HTMLDivElement>(null);
  const [showAddRows, setShowAddRows] = useState(false);
  const [addRowsPaste, setAddRowsPaste] = useState("");
  const [addingRows, setAddingRows] = useState(false);
  const [appendRowsProgress, setAppendRowsProgress] = useState<AppendRowsProgress | null>(null);
  const appendCancelRequestedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addRowsPasteRef = useRef<HTMLTextAreaElement>(null);
  const [showAddRowForm, setShowAddRowForm] = useState(false);
  const [addRowFormValues, setAddRowFormValues] = useState<Record<string, string>>({});
  const [justAddedRowId, setJustAddedRowId] = useState<string | null>(null);
  const [lastUndoable, setLastUndoable] = useState<
    | { type: "add"; rowIds: string[] }
    | { type: "overwrite"; previousRows: Record<string, string>[] }
    | null
  >(null);
  const [undoing, setUndoing] = useState(false);
  const [pendingUnlinkedScopes, setPendingUnlinkedScopes] = useState<UnlinkedScopeType[]>([]);
  type UploadPreviewState = {
    headers: string[];
    rows: Record<string, string>[];
    validationErrors: UPMValidationError[];
    fileName: string | null;
    source: "upload" | "paste" | "drop";
  };
  const [uploadPreview, setUploadPreview] = useState<UploadPreviewState | null>(null);
  const [previewExistingRows, setPreviewExistingRows] = useState<Record<string, string>[]>([]);
  const [previewExistingLoading, setPreviewExistingLoading] = useState(false);
  const [isParsingUpload, setIsParsingUpload] = useState(false);
  const [parsingSpreadsheetName, setParsingSpreadsheetName] = useState<string | null>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const tableLoadSentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(false);
  /** Latest search scope for the project-id effect (avoids stale closure). */
  const unitsFilterRef = useRef({ debouncedFilterQuery: "", filterColumn: "all" as string | "all" });
  unitsFilterRef.current = { debouncedFilterQuery, filterColumn };
  /** Skip the next filter effect run when the project-id effect just fetched (avoids duplicate requests). */
  const skipUnitsFilterEffectOnceRef = useRef(true);

  const rowRefsMap = useRef<Map<string, HTMLTableRowElement>>(new Map());

  const scrollTableToTop = useCallback(() => {
    tableScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const scrollTableToBottom = useCallback(() => {
    const el = tableScrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);
  const rowCellRefs = useRef<Map<string, React.RefObject<EditableCellRef | null>[]>>(new Map());

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(UPM_HIDDEN_COLUMNS_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        if (Array.isArray(parsed)) setHiddenColumns(new Set(parsed.filter((c) => ALL_COLS.includes(c as (typeof ALL_COLS)[number]))));
      }
    } catch {
      // ignore invalid stored data
    }
  }, []);

  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem(UPM_HIDDEN_COLUMNS_KEY, JSON.stringify([...hiddenColumns]));
      }
    } catch {
      // ignore
    }
  }, [hiddenColumns]);

  useEffect(() => {
    if (searchDebounceTimerRef.current) {
      clearTimeout(searchDebounceTimerRef.current);
    }
    searchDebounceTimerRef.current = setTimeout(() => {
      searchDebounceTimerRef.current = null;
      setDebouncedFilterQuery(filterQueryRef.current);
    }, FIELD_TRACKER_SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchDebounceTimerRef.current) {
        clearTimeout(searchDebounceTimerRef.current);
        searchDebounceTimerRef.current = null;
      }
    };
  }, [filterQuery]);

  useEffect(() => {
    commitSearchNow();
  }, [filterColumn, commitSearchNow]);

  const toggleColumnVisibility = useCallback((col: string) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col);
      else {
        if (prev.size >= ALL_COLS.length - 1) return prev; // keep at least one visible
        next.add(col);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!showColumnPicker) return;
    const handleClick = (e: MouseEvent) => {
      if (columnPickerRef.current && !columnPickerRef.current.contains(e.target as Node)) setShowColumnPicker(false);
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [showColumnPicker]);

  useEffect(() => {
    if (showAddRows) {
      // Defer focus so the textarea is in the DOM and ready to receive paste
      const id = requestAnimationFrame(() => {
        addRowsPasteRef.current?.focus();
      });
      return () => cancelAnimationFrame(id);
    }
  }, [showAddRows]);

  useEffect(() => {
    if (!showAddRowForm) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowAddRowForm(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [showAddRowForm]);

  const visibleCols = useMemo(() => ALL_COLS.filter((c) => !hiddenColumns.has(c)), [hiddenColumns]);
  /** Editable-only subset of visible columns — used for bulk-update selector. */
  const visibleEditableCols = useMemo(
    () => EDITABLE_COLS.filter((c) => !hiddenColumns.has(c)),
    [hiddenColumns]
  );
  /** Text-only subset of visible columns — Find & Replace operates on text fields only. */
  const visibleTextCols = useMemo(
    () => TEXT_COLS.filter((c) => !hiddenColumns.has(c)),
    [hiddenColumns]
  );

  useEffect(() => {
    const first = visibleEditableCols[0];
    if (first && !visibleEditableCols.includes(bulkColumn as (typeof EDITABLE_COLS)[number])) setBulkColumn(first);
  }, [visibleEditableCols, bulkColumn]);

  // findReplaceCol must stay within TEXT_COLS because Find & Replace only operates on text fields.
  useEffect(() => {
    const first = visibleTextCols[0];
    if (first && !visibleTextCols.includes(findReplaceCol as (typeof TEXT_COLS)[number])) setFindReplaceCol(first);
  }, [visibleTextCols, findReplaceCol]);

  const getCellRefs = useCallback((rowId: string) => {
    if (!rowCellRefs.current.has(rowId)) {
      rowCellRefs.current.set(
        rowId,
        Array.from({ length: NUM_EDITABLE }, () => ({ current: null } as React.MutableRefObject<EditableCellRef | null>))
      );
    }
    return rowCellRefs.current.get(rowId)!;
  }, []);

  const focusCell = useCallback((rowId: string, colIndex: number) => {
    const refs = rowCellRefs.current.get(rowId);
    const idx = ((colIndex % NUM_EDITABLE) + NUM_EDITABLE) % NUM_EDITABLE;
    refs?.[idx]?.current?.focus();
  }, []);

  /** Full project, all pages — does not apply `search` (used for export and post-mutation refresh). */
  const fetchAllProjectRowsNoSearch = useCallback(async (): Promise<ProjectRowUnit[]> => {
    const accumulated: ProjectRowUnit[] = [];
    let cursor: string | null = null;
    let more = true;
    while (more) {
      const params = new URLSearchParams({ limit: String(FIELD_TRACKER_UNITS_PAGE_LIMIT) });
      if (cursor) params.set("cursor", cursor);
      const res = await fetch(`/api/projects/${project.id}/units?${params}`);
      if (!res.ok) throw new Error("Failed to load units");
      const json = await res.json();
      const batch = (json.units ?? []) as ProjectRowUnit[];
      accumulated.push(...batch);
      more = json.hasMore === true;
      cursor = (json.nextCursor as string | null) ?? null;
      if (!more) break;
      if (more && !cursor) break;
    }
    return accumulated;
  }, [project.id]);

  /** Load every page (used after mutations). Replaces table state with full project rows. */
  const fetchAllUnitsPages = useCallback(async (): Promise<ProjectRowUnit[]> => {
    const accumulated = await fetchAllProjectRowsNoSearch();
    setUnits(accumulated);
    setHasMoreRows(false);
    setNextCursor(null);
    setTotalRowCount(accumulated.length);
    setLoadMoreError(null);
    return accumulated;
  }, [fetchAllProjectRowsNoSearch]);

  const loadNextPage = useCallback(async () => {
    if (!hasMoreRows || nextCursor == null || loadingMoreRef.current || unitsRefreshing) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const params = new URLSearchParams({
        limit: String(FIELD_TRACKER_UNITS_PAGE_LIMIT),
        cursor: nextCursor,
      });
      const q = debouncedFilterQuery.trim();
      if (filterColumn === "all" && q) {
        params.set("search", q);
      }
      const res = await fetch(`/api/projects/${project.id}/units?${params}`);
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      const batch = (json.units ?? []) as ProjectRowUnit[];
      setUnits((prev) => [...prev, ...batch]);
      setHasMoreRows(json.hasMore === true);
      setNextCursor((json.nextCursor as string | null) ?? null);
    } catch (e) {
      setLoadMoreError(e instanceof Error ? e.message : String(e));
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [project.id, hasMoreRows, nextCursor, debouncedFilterQuery, filterColumn, unitsRefreshing]);

  const fetchLookups = useCallback(async () => {
    const res = await fetch("/api/lookups");
    if (!res.ok) throw new Error("Failed to load lookups");
    const json = await res.json();
    setLookups(json);
  }, []);

  useEffect(() => {
    skipUnitsFilterEffectOnceRef.current = true;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setUnitsRefreshing(false);
    setUnits([]);
    setHasMoreRows(false);
    setNextCursor(null);
    setTotalRowCount(null);
    setLoadMoreError(null);
    (async () => {
      try {
        const params = new URLSearchParams({ limit: String(FIELD_TRACKER_UNITS_PAGE_LIMIT) });
        const { debouncedFilterQuery: dq, filterColumn: fc } = unitsFilterRef.current;
        const q = dq.trim();
        if (fc === "all" && q) {
          params.set("search", q);
        }
        const res = await fetch(`/api/projects/${project.id}/units?${params}`);
        if (!res.ok) throw new Error("Failed to load units");
        const json = await res.json();
        if (cancelled) return;
        setUnits((json.units ?? []) as ProjectRowUnit[]);
        setHasMoreRows(json.hasMore === true);
        setNextCursor((json.nextCursor as string | null) ?? null);
        if (typeof json.total === "number") setTotalRowCount(json.total);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load units");
          setLoading(false);
        }
        return;
      }
      try {
        await fetchLookups();
      } catch {
        if (!cancelled) {
          setLookups({
            scopeTypes: [],
            locationTypes: [],
            costTypes: [],
            installTeams: [],
            uomTypes: [],
          });
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [project.id, fetchLookups]);

  useEffect(() => {
    if (skipUnitsFilterEffectOnceRef.current) {
      skipUnitsFilterEffectOnceRef.current = false;
      return;
    }
    let cancelled = false;
    setUnitsRefreshing(true);
    setLoadMoreError(null);
    (async () => {
      try {
        const params = new URLSearchParams({ limit: String(FIELD_TRACKER_UNITS_PAGE_LIMIT) });
        const q = debouncedFilterQuery.trim();
        if (filterColumn === "all" && q) {
          params.set("search", q);
        }
        const res = await fetch(`/api/projects/${project.id}/units?${params}`);
        if (!res.ok) throw new Error("Failed to load units");
        const json = await res.json();
        if (cancelled) return;
        setUnits((json.units ?? []) as ProjectRowUnit[]);
        setHasMoreRows(json.hasMore === true);
        setNextCursor((json.nextCursor as string | null) ?? null);
        if (typeof json.total === "number") setTotalRowCount(json.total);
      } catch {
        if (!cancelled) {
          toast.error(t("fieldTrackerReloadFailed"));
        }
        return;
      } finally {
        if (!cancelled) setUnitsRefreshing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedFilterQuery, filterColumn, project.id, t]);

  useEffect(() => {
    const root = tableScrollRef.current;
    const el = tableLoadSentinelRef.current;
    if (!root || !el || loading || unitsRefreshing || !hasMoreRows || nextCursor == null) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (
          entries.some((e) => e.isIntersecting) &&
          !loadingMoreRef.current &&
          !loadingMore &&
          !loadMoreError &&
          !unitsRefreshing
        ) {
          void loadNextPage();
        }
      },
      { root, rootMargin: "160px", threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loading, unitsRefreshing, hasMoreRows, nextCursor, loadingMore, loadMoreError, loadNextPage, debouncedFilterQuery, filterColumn]);

  const handleCellChange = useCallback(
    async (rowId: string, field: string, value: string | number | null) => {
      if (!canWrite) return;
      if (isLbRequiredFieldEmpty(field, value)) {
        const colKey = COL_KEYS[field] ?? field;
        toast.error(t("requiredFieldCannotBeEmpty", { field: t(`columns.${colKey}` as "columns.unitType") }));
        return;
      }
      setSavingId(rowId);
      try {
        const payload: Record<string, unknown> = {};
        // FK columns: send code string for auto-upsert on the server
        if (field === "scopeType") payload.scopeTypeCode = value;
        else if (field === "locationType") payload.locationTypeCode = value;
        else if (field === "costType") payload.costTypeCode = value;
        else if (field === "installer") payload.installerCode = value;
        else if (field === "uom") payload.uomCode = value;
        else payload[field] = value;

        const res = await fetch(`/api/projects/${project.id}/units/${rowId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Update failed");
        const updated = await res.json();
        setUnits((prev) =>
          prev.map((u) => (u.id === rowId ? { ...u, ...updated } : u))
        );
        setJustSavedIds((prev) => new Set(prev).add(rowId));
        toast.success(t("valueUpdated"));
        if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
        savedTimeoutRef.current = setTimeout(() => {
          setJustSavedIds((prev) => {
            const next = new Set(prev);
            next.delete(rowId);
            return next;
          });
          savedTimeoutRef.current = null;
        }, 1500);
      } catch {
        setError("Failed to save change");
        toast.error(t("failedToSave"));
      } finally {
        setSavingId(null);
      }
    },
    [project.id, canWrite, t]
  );

  const handleInstallerChange = useCallback(
    async (rowId: string, subId: string | null, displayName?: string | null): Promise<boolean> => {
      if (!canWrite) return false;
      setSavingId(rowId);
      // Capture previous value from the latest-ref (pure read, not inside the state updater)
      const prevSubId = latestUnitsRef.current.find((u) => u.id === rowId)?.unifierSubId ?? null;
      setUnits((prev) => prev.map((u) => (u.id === rowId ? { ...u, unifierSubId: subId } : u)));
      try {
        const body: Record<string, unknown> = { unifierSubId: subId };
        if (displayName?.trim()) {
          body.subcontractorDisplayName = displayName.trim();
        }
        const res = await fetch(`/api/projects/${project.id}/units/${rowId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("Update failed");
        const updated = await res.json();
        setUnits((prev) => prev.map((u) => (u.id === rowId ? { ...u, ...updated } : u)));
        setJustSavedIds((prev) => new Set(prev).add(rowId));
        toast.success(t("valueUpdated"));
        if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
        savedTimeoutRef.current = setTimeout(() => {
          setJustSavedIds((prev) => {
            const next = new Set(prev);
            next.delete(rowId);
            return next;
          });
          savedTimeoutRef.current = null;
        }, 1500);
        return true;
      } catch {
        // Restore previous value rather than unconditionally clearing to null
        setUnits((prev) => prev.map((u) => (u.id === rowId ? { ...u, unifierSubId: prevSubId } : u)));
        toast.error(t("failedToSave"));
        return false;
      } finally {
        setSavingId(null);
      }
    },
    [project.id, canWrite, t]
  );

  useEffect(() => () => {
    if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
  }, []);

  const filteredAndSortedUnits = useMemo(() => {
    const serverGlobalSearch =
      filterColumn === "all" && debouncedFilterQuery.trim().length > 0;
    let result = units.filter((row) => {
      const columnOk = matchesColumnFilters(row, columnFilters);
      if (serverGlobalSearch) {
        return columnOk;
      }
      return matchesGlobalSearch(row, filterQuery, filterColumn) && columnOk;
    });
    if (sortColumn) {
      result = [...result].sort((a, b) => {
        const aVal = getCellDisplayValue(a, sortColumn);
        const bVal = getCellDisplayValue(b, sortColumn);
        const aNum = parseFloat(aVal);
        const bNum = parseFloat(bVal);
        const useNumeric = !Number.isNaN(aNum) && !Number.isNaN(bNum);
        let cmp: number;
        if (useNumeric) {
          cmp = aNum - bNum;
        } else {
          cmp = aVal.localeCompare(bVal, undefined, { numeric: true });
        }
        return sortDirection === "asc" ? cmp : -cmp;
      });
    }
    return result;
  }, [units, filterQuery, filterColumn, columnFilters, sortColumn, sortDirection, debouncedFilterQuery]);

  /** Denominator for "X of Y rows" when filters/search apply — API match total for global search, else loaded row count. */
  const fieldTrackerFilteredTotalCount = useMemo(() => {
    const serverGlobalSearch =
      filterColumn === "all" && debouncedFilterQuery.trim().length > 0;
    if (serverGlobalSearch && totalRowCount != null) {
      return totalRowCount;
    }
    return units.length;
  }, [filterColumn, debouncedFilterQuery, totalRowCount, units.length]);

  const setColumnFilter = useCallback((col: string, value: string) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      if (value.trim()) next[col] = value;
      else delete next[col];
      return next;
    });
  }, []);

  const hasColumnFilters = Object.keys(columnFilters).some((k) => columnFilters[k]?.trim());

  const handleSort = useCallback((col: string) => {
    setSortColumn(col);
    setSortDirection((prev) => (sortColumn === col ? (prev === "asc" ? "desc" : "asc") : "asc"));
  }, [sortColumn]);

  const toggleRowSelection = useCallback((rowId: string) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }, []);

  const selectAllFiltered = useCallback(() => {
    setSelectedRowIds(new Set(filteredAndSortedUnits.map((r) => r.id)));
  }, [filteredAndSortedUnits]);

  const clearSelection = useCallback(() => setSelectedRowIds(new Set()), []);

  const handleBulkUpdate = useCallback(async () => {
    if (!canWrite || selectedRowIds.size === 0) return;
    const ids = Array.from(selectedRowIds);
    setBulkUpdating(true);
    try {
      const value = bulkUpdateFieldValue(bulkColumn, bulkValue);
      if (isLbRequiredFieldEmpty(bulkColumn, value)) {
        const colKey = COL_KEYS[bulkColumn] ?? bulkColumn;
        toast.error(t("requiredFieldCannotBeEmpty", { field: t(`columns.${colKey}` as "columns.unitType") }));
        return;
      }
      const payload: Record<string, unknown> = {};
      // FK columns: send code string for auto-upsert on the server
      if (bulkColumn === "scopeType") payload.scopeTypeCode = value;
      else if (bulkColumn === "locationType") payload.locationTypeCode = value;
      else if (bulkColumn === "costType") payload.costTypeCode = value;
      else if (bulkColumn === "installer") payload.installerCode = value;
      else if (bulkColumn === "uom") payload.uomCode = value;
      else payload[bulkColumn] = value;

      const BATCH = 10;
      for (let i = 0; i < ids.length; i += BATCH) {
        const batch = ids.slice(i, i + BATCH);
        await Promise.all(
          batch.map((rowId) =>
            fetch(`/api/projects/${project.id}/units/${rowId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            })
          )
        );
      }
      await fetchAllUnitsPages();
      setSelectedRowIds(new Set());
      setBulkValue("");
      setJustSavedIds(new Set(ids));
      toast.success(ids.length === 1 ? t("updatedRows", { count: 1 }) : t("updatedRowsPlural", { count: ids.length }));
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
      savedTimeoutRef.current = setTimeout(() => {
        setJustSavedIds(new Set());
        savedTimeoutRef.current = null;
      }, 1500);
    } catch {
      setError("Failed to bulk update");
      toast.error(t("failedBulkUpdate"));
    } finally {
      setBulkUpdating(false);
    }
  }, [canWrite, selectedRowIds, bulkColumn, bulkValue, project.id, fetchAllUnitsPages, t]);

  const [deletingRows, setDeletingRows] = useState(false);

  const handleDeleteSelected = useCallback(async () => {
    if (!canWrite || selectedRowIds.size === 0) return;
    const ids = Array.from(selectedRowIds);
    setDeletingRows(true);
    try {
      const BATCH = 10;
      for (let i = 0; i < ids.length; i += BATCH) {
        const batch = ids.slice(i, i + BATCH);
        await Promise.all(
          batch.map((rowId) =>
            fetch(`/api/projects/${project.id}/units/${rowId}`, { method: "DELETE" })
          )
        );
      }
      await fetchAllUnitsPages();
      setSelectedRowIds(new Set());
      toast.success(ids.length === 1 ? t("deletedRows", { count: 1 }) : t("deletedRowsPlural", { count: ids.length }));
    } catch {
      toast.error(t("failedToDeleteRows"));
    } finally {
      setDeletingRows(false);
    }
  }, [canWrite, selectedRowIds, project.id, fetchAllUnitsPages, t]);

  const openAddRowForm = useCallback(() => {
    if (!canWrite) return;
    setAddRowFormValues({});
    setShowAddRowForm(true);
  }, [canWrite]);

  const buildApiRowFromForm = useCallback((): Record<string, string> => {
    const row: Record<string, string> = {};
    for (const col of EDITABLE_COLS) {
      const apiKey = COL_TO_API_KEY[col] ?? col;
      // FK columns now store code strings directly — no ID-to-code conversion needed
      row[apiKey] = addRowFormValues[col] ?? "";
    }
    return row;
  }, [addRowFormValues]);

  const handleAddRowFormSubmit = useCallback(async () => {
    if (!canWrite) return;
    const missing = LB_REQUIRED_FIELDS.filter((col) => isLbRequiredFieldEmpty(col, addRowFormValues[col] ?? ""));
    if (missing.length > 0) {
      const labels = missing.map((col) => t(`columns.${COL_KEYS[col]}` as "columns.unitType"));
      toast.error(t("requiredFieldsMissing", { fields: labels.join(", ") }));
      return;
    }
    const row = buildApiRowFromForm();
    setAddingRows(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/units`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: [row], mode: "add" }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Failed to add row");
      }
      const prevCount = units.length;
      const newUnits = await fetchAllUnitsPages();
      setShowAddRowForm(false);
      setAddRowFormValues({});
      const newRow = newUnits.find((u) => u.rowIndex >= prevCount) ?? newUnits[newUnits.length - 1];
      if (newRow) {
        setLastUndoable({ type: "add", rowIds: [newRow.id] });
        setJustAddedRowId(newRow.id);
        setTimeout(() => {
          const tr = rowRefsMap.current.get(newRow.id);
          tr?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 100);
        setTimeout(() => setJustAddedRowId(null), 2500);
      }
      toast.success(t("rowAdded"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("failedToAddRow"));
    } finally {
      setAddingRows(false);
    }
  }, [canWrite, project.id, fetchAllUnitsPages, buildApiRowFromForm, units.length, addRowFormValues, t]);

  const loadExistingRowsForPreview = useCallback(async (): Promise<Record<string, string>[]> => {
    setPreviewExistingLoading(true);
    try {
      const needsFullFetch =
        hasMoreRows || (totalRowCount != null && units.length < totalRowCount);
      const sourceRows = needsFullFetch ? await fetchAllProjectRowsNoSearch() : units;
      return sourceRows.map(fieldTrackerRecordFromProjectRow);
    } catch {
      return units.map(fieldTrackerRecordFromProjectRow);
    } finally {
      setPreviewExistingLoading(false);
    }
  }, [hasMoreRows, totalRowCount, units, fetchAllProjectRowsNoSearch]);

  const openUploadPreview = useCallback(
    async (preview: Omit<UploadPreviewState, never>) => {
      setPreviewExistingRows([]);
      setUploadPreview(preview);
      const existing = await loadExistingRowsForPreview();
      setPreviewExistingRows(existing);
    },
    [loadExistingRowsForPreview],
  );

  const handleUploadPreviewCellEdit = useCallback((rowIndex: number, col: string, value: string) => {
    setUploadPreview((prev) => {
      if (!prev) return prev;
      const nextRows = prev.rows.map((row, i) => (i === rowIndex ? { ...row, [col]: value } : row));
      return {
        ...prev,
        rows: nextRows,
        validationErrors: validateUPMRows(prev.headers, nextRows),
      };
    });
  }, []);

  const commitAppendRows = useCallback(
    async (rows: Record<string, string>[], source: "upload" | "paste" | "drop") => {
      if (!canWrite || rows.length === 0) return;
      appendCancelRequestedRef.current = false;
      setAddingRows(true);
      setAppendRowsProgress({ phase: "uploading", completed: 0, total: rows.length });
      try {
        const apiSource = source === "drop" ? "upload" : source;
        const data = await appendProjectRowsInBatches({
          projectId: project.id,
          rows,
          source: apiSource,
          onProgress: setAppendRowsProgress,
          isCancelled: () => appendCancelRequestedRef.current,
        });
        setAppendRowsProgress({ phase: "refreshing", completed: rows.length, total: rows.length });
        await fetchAllUnitsPages();
        setShowAddRows(false);
        setAddRowsPaste("");
        setUploadPreview(null);
        if (data.added > 0) {
          setLastUndoable({ type: "add", rowIds: data.addedRowIds });
          const msg =
            data.added === 1 ? t("addedRows", { count: 1 }) : t("addedRowsPlural", { count: data.added });
          toast.success(data.skipped > 0 ? `${msg} (${data.skipped} skipped)` : msg);
        } else {
          toast.success(t("allRowsAlreadyExist"));
        }
        if (data.unlinkedScopeTypes.length > 0) {
          setPendingUnlinkedScopes(data.unlinkedScopeTypes);
        }
      } catch (err) {
        if (err instanceof AppendRowsCancelledError) {
          setAppendRowsProgress({
            phase: "cancelling",
            completed: err.addedRowIds.length,
            total: rows.length,
          });
          try {
            if (err.addedRowIds.length > 0) {
              await revertAppendedRowsInBatches(project.id, err.addedRowIds);
            }
            await fetchAllUnitsPages();
            setPendingUnlinkedScopes([]);
            if (err.addedRowIds.length > 0) {
              toast.success(
                err.addedRowIds.length === 1
                  ? t("appendUploadCancelledOne")
                  : t("appendUploadCancelled", { count: err.addedRowIds.length }),
              );
            } else {
              toast.success(t("appendUploadCancelledNone"));
            }
          } catch (revertErr) {
            toast.error(revertErr instanceof Error ? revertErr.message : t("appendUploadCancelRevertFailed"));
          }
          return;
        }
        toast.error(err instanceof Error ? err.message : t("failedToAddRows"));
      } finally {
        setAddingRows(false);
        setAppendRowsProgress(null);
        appendCancelRequestedRef.current = false;
      }
    },
    [canWrite, project.id, fetchAllUnitsPages, t],
  );

  const handleCancelAppend = useCallback(() => {
    if (!addingRows || appendRowsProgress?.phase !== "uploading") return;
    appendCancelRequestedRef.current = true;
    setAppendRowsProgress((prev) =>
      prev ? { ...prev, phase: "cancelling", completed: prev.completed } : prev,
    );
  }, [addingRows, appendRowsProgress?.phase]);

  const handleOpenUploadPreviewFromFile = useCallback(
    async (file: File, source: "upload" | "drop") => {
      if (!canWrite) return;
      setIsParsingUpload(true);
      setParsingSpreadsheetName(file.name);
      try {
        const parsed = await parseUPMFromFile(file);
        if (parsed.error) {
          toast.error(parsed.error);
          return;
        }
        if (parsed.rows.length === 0) {
          toast.error(t("noValidRowsInFile"));
          return;
        }
        await openUploadPreview({
          headers: parsed.headers,
          rows: parsed.rows,
          validationErrors: parsed.validationErrors,
          fileName: file.name,
          source,
        });
      } finally {
        setIsParsingUpload(false);
        setParsingSpreadsheetName(null);
      }
    },
    [canWrite, openUploadPreview, t],
  );

  const handleAddFromPaste = useCallback(async () => {
    if (!canWrite || !addRowsPaste.trim()) return;
    const parsed = parseUPM(addRowsPaste);
    if (parsed.error || parsed.rows.length === 0) {
      toast.error(parsed.error ?? t("noValidRows"));
      return;
    }
    await openUploadPreview({
      headers: parsed.headers,
      rows: parsed.rows,
      validationErrors: parsed.validationErrors,
      fileName: null,
      source: "paste",
    });
  }, [canWrite, addRowsPaste, openUploadPreview, t]);

  const handleConfirmUploadPreview = useCallback(() => {
    if (!uploadPreview) return;
    void commitAppendRows(uploadPreview.rows, uploadPreview.source);
  }, [uploadPreview, commitAppendRows]);

  const handleCloseUploadPreview = useCallback(() => {
    if (addingRows) return;
    setUploadPreview(null);
    setPreviewExistingRows([]);
  }, [addingRows]);

  const handleDownloadFieldTracker = useCallback(async () => {
    const exportNeedsFullProject =
      hasMoreRows || (filterColumn === "all" && debouncedFilterQuery.trim().length > 0);
    let data = units;
    if (exportNeedsFullProject) {
      try {
        data = await fetchAllProjectRowsNoSearch();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("fieldTrackerExportLoadFailed"));
        return;
      }
    }
    if (data.length === 0) return;
    const records = [...data]
      .sort((a, b) => a.rowIndex - b.rowIndex)
      .map(fieldTrackerRecordFromProjectRow);
    downloadFieldTrackerXlsx(records, project.projectName);
  }, [
    units,
    hasMoreRows,
    filterColumn,
    debouncedFilterQuery,
    fetchAllProjectRowsNoSearch,
    project.projectName,
    t,
  ]);

  const handleUndo = useCallback(async () => {
    if (!canWrite || !lastUndoable || undoing) return;
    setUndoing(true);
    try {
      if (lastUndoable.type === "add") {
        const res = await fetch(`/api/projects/${project.id}/units/bulk-delete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rowIds: lastUndoable.rowIds }),
        });
        if (!res.ok) throw new Error("Failed to undo");
        await fetchAllUnitsPages();
        toast.success(t("undoComplete"));
      } else {
        const res = await fetch(`/api/projects/${project.id}/units`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: lastUndoable.previousRows, mode: "overwrite" }),
        });
        if (!res.ok) throw new Error("Failed to undo");
        await fetchAllUnitsPages();
        toast.success(t("undoComplete"));
      }
      setLastUndoable(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("undoFailed"));
    } finally {
      setUndoing(false);
    }
  }, [canWrite, project.id, fetchAllUnitsPages, lastUndoable, undoing, t]);

  const handleFindReplace = useCallback(async () => {
    if (!canWrite || !findText.trim()) return;
    const find = findText.trim();
    const replace = replaceText.trim();
    const matching = filteredAndSortedUnits.filter((row) => {
      const val = getCellDisplayValue(row, findReplaceCol);
      return val.includes(find);
    });
    if (matching.length === 0) return;
    setBulkUpdating(true);
    try {
      const BATCH = 10;
      for (let i = 0; i < matching.length; i += BATCH) {
        const batch = matching.slice(i, i + BATCH);
        await Promise.all(
          batch.map((row) => {
            const current = getCellDisplayValue(row, findReplaceCol);
            const newVal = current.replace(find, replace);
            const payload: Record<string, unknown> = { [findReplaceCol]: newVal };
            return fetch(`/api/projects/${project.id}/units/${row.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
          })
        );
      }
      await fetchAllUnitsPages();
      setFindText("");
      setReplaceText("");
      const updatedIds = new Set(matching.map((r) => r.id));
      setJustSavedIds(updatedIds);
      toast.success(matching.length === 1 ? t("updatedRows", { count: 1 }) : t("updatedRowsPlural", { count: matching.length }));
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
      savedTimeoutRef.current = setTimeout(() => {
        setJustSavedIds(new Set());
        savedTimeoutRef.current = null;
      }, 1500);
    } catch {
      setError("Failed to find & replace");
      toast.error(t("failedFindReplace"));
    } finally {
      setBulkUpdating(false);
    }
  }, [canWrite, findText, replaceText, findReplaceCol, filteredAndSortedUnits, project.id, fetchAllUnitsPages, t]);

  const handleSpreadsheetDrop = useCallback(
    (files: File[]) => {
      const file = files[0];
      if (!file) return;
      void handleOpenUploadPreviewFromFile(file, "drop");
    },
    [handleOpenUploadPreviewFromFile],
  );

  const handleSpreadsheetDropRejected = useCallback(() => {
    toast.error(t("dropSpreadsheetRejected"));
  }, [t]);

  const { dropHandlers } = useFileDrop({
    onFiles: handleSpreadsheetDrop,
    onRejected: handleSpreadsheetDropRejected,
    accept: ".xlsx,.xls,.csv",
    multiple: false,
    disabled: !canWrite || isParsingUpload,
  });

  if (error) {
    return (
      <div
        style={{
          padding: "var(--space-6)",
          color: "var(--error-600)",
          fontSize: "var(--text-body)",
        }}
      >
        {error}
      </div>
    );
  }

  return (
    <>
    {pendingUnlinkedScopes.length > 0 && canManage && (
      <ScopeLinkingModal
        unlinkedScopeTypes={pendingUnlinkedScopes}
        onComplete={() => setPendingUnlinkedScopes([])}
      />
    )}
    {isParsingUpload ? (
      <LocationBuilderSpreadsheetParsingOverlay fileName={parsingSpreadsheetName} />
    ) : null}
    {uploadPreview && (
      <LocationBuilderUploadPreviewModal
        fileName={uploadPreview.fileName}
        newHeaders={uploadPreview.headers}
        newRows={uploadPreview.rows}
        validationErrors={uploadPreview.validationErrors}
        existingHeaders={FIELD_TRACKER_IMPORT_HEADERS}
        existingRows={previewExistingRows}
        existingRowsLoading={previewExistingLoading}
        isSubmitting={addingRows}
        appendProgress={appendRowsProgress}
        onCancelAppend={handleCancelAppend}
        onCellEdit={handleUploadPreviewCellEdit}
        onConfirm={handleConfirmUploadPreview}
        onClose={handleCloseUploadPreview}
      />
    )}
    <div
      className="flex flex-col"
      style={{
        height: "100%",
        padding: "var(--space-6)",
        gap: "var(--space-6)",
        position: "relative",
      }}
      onDragEnter={dropHandlers.onDragEnter}
      onDragOver={dropHandlers.onDragOver}
      onDragLeave={dropHandlers.onDragLeave}
      onDrop={dropHandlers.onDrop}
    >
      <FileDropOverlay
        disabled={!canWrite}
        hint={t("dropSpreadsheetHint")}
      />
      {/* Back link */}
      <Link
        href="/projects"
        className="flex items-center gap-2"
        style={{
          fontSize: "var(--text-caption)",
          color: "var(--primary-500)",
          textDecoration: "none",
          width: "fit-content",
        }}
      >
        <ArrowLeft size={16} />
        {t("backToProjects")}
      </Link>

      {/* Project header + Unifier documents — side-by-side on tablet/desktop, stacked on mobile */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--space-6)",
          alignItems: "flex-start",
        }}
      >
        {/* Title card — compact single-row layout */}
        <div
          style={{
            flex: "1 1 280px",
            padding: "var(--space-4) var(--space-5)",
            backgroundColor: "var(--neutral-0)",
            border: "1px solid var(--neutral-200)",
            borderRadius: "var(--radius-md)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--space-4)",
            flexWrap: "wrap",
          }}
        >
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                <Skeleton style={{ width: 210, height: 24 }} />
                <Skeleton style={{ width: 80, height: 16 }} />
              </div>
              <div style={{ display: "flex", gap: "var(--space-4)" }}>
                <Skeleton style={{ width: 108, height: 12 }} />
                <Skeleton style={{ width: 84, height: 12 }} />
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-3)", flexWrap: "wrap" }}>
                <h1
                  style={{
                    fontSize: "var(--text-heading)",
                    fontWeight: 600,
                    color: "var(--neutral-900)",
                    margin: 0,
                    whiteSpace: "nowrap",
                  }}
                >
                  {project.projectName}
                </h1>
                {project.siteLocation && (
                  <span
                    style={{
                      fontSize: "var(--text-body)",
                      color: "var(--neutral-500)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {project.siteLocation}
                  </span>
                )}
              </div>
              <div
                className="flex flex-wrap gap-4"
                style={{
                  fontSize: "var(--text-caption)",
                  color: "var(--neutral-500)",
                  marginTop: 2,
                }}
              >
                {project.unifierProjectNumber && (
                  <span>Unifier #: {project.unifierProjectNumber}</span>
                )}
                {project.startDate && (
                  <span>Start: {new Date(project.startDate + "T00:00:00").toLocaleDateString("en-US")}</span>
                )}
                {project.projectManagerName && (
                  <span>PM: {project.projectManagerName}</span>
                )}
                {project.installManagerName && (
                  <span>IM: {project.installManagerName}</span>
                )}
              </div>
              {project.clonedFromProjectId && (
                <ProjectCloneSubtitle clonedFromProjectName={project.clonedFromProjectName} />
              )}
            </div>
          )}
        </div>

        {/* Unifier documents — fixed width on desktop, full-width when wrapped */}
        {project.unifierPid && (
          <div style={{ flex: "0 0 320px", minWidth: "260px" }}>
            <ProjectDocuments
              unifierPid={project.unifierPid}
              unifierProjectNumber={project.unifierProjectNumber ?? null}
              unifierBaseUrl={unifierBaseUrl}
            />
          </div>
        )}
      </div>

      {/* Units table */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          backgroundColor: "var(--neutral-0)",
          border: "1px solid var(--neutral-200)",
          borderRadius: "var(--radius-md)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "var(--space-4)",
            borderBottom: "1px solid var(--neutral-200)",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "var(--space-4)",
          }}
        >
          <span
            style={{
              fontWeight: 600,
              fontSize: "var(--text-body)",
              color: "var(--neutral-800)",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {loading ? (
              t("unitPlanMatrixRows", { count: 0 })
            ) : unitsRefreshing ? (
              <>
                <Loader2 size={16} className="animate-spin shrink-0" aria-hidden />
                <span aria-live="polite">{t("fieldTrackerTableUpdating")}</span>
              </>
            ) : (filterQuery || hasColumnFilters) ? (
              t("unitPlanMatrixRowsFiltered", {
                count: filteredAndSortedUnits.length,
                total: fieldTrackerFilteredTotalCount,
              })
            ) : totalRowCount != null && units.length < totalRowCount ? (
              t("unitPlanMatrixRowsPartial", { loaded: units.length, total: totalRowCount })
            ) : (
              t("unitPlanMatrixRows", { count: filteredAndSortedUnits.length })
            )}
          </span>
          {units.length > 0 && (
            <button
              type="button"
              onClick={handleDownloadFieldTracker}
              aria-label={t("downloadFieldTrackerAria")}
              title={t("downloadFieldTrackerTitle")}
              style={{
                padding: "var(--space-2) var(--space-3)",
                border: "1px solid var(--neutral-300)",
                borderRadius: "var(--radius-sm)",
                fontSize: "var(--text-caption)",
                backgroundColor: "var(--neutral-0)",
                color: "var(--neutral-900)",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--space-2)",
              }}
            >
              <Download size={14} aria-hidden />
              {t("downloadFieldTracker")}
            </button>
          )}
          {canWrite && (
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <button
                type="button"
                onClick={openAddRowForm}
                disabled={addingRows}
                aria-label={t("addNewRowAria")}
                style={{
                  padding: "var(--space-2) var(--space-3)",
                  border: "1px solid var(--neutral-300)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "var(--text-caption)",
                  backgroundColor: "var(--neutral-0)",
                  color: "var(--neutral-900)",
                  cursor: addingRows ? "not-allowed" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                }}
              >
                <Plus size={14} aria-hidden />
                {t("addRow")}
              </button>
              <button
                type="button"
                onClick={() => setShowAddRows((s) => !s)}
                aria-expanded={showAddRows}
                style={{
                  padding: "var(--space-2) var(--space-3)",
                  border: "1px solid var(--neutral-300)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "var(--text-caption)",
                  backgroundColor: showAddRows ? "var(--neutral-100)" : "var(--neutral-0)",
                  color: "var(--neutral-900)",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                }}
              >
                <ClipboardPaste size={14} aria-hidden />
                {t("pasteRows")}
              </button>
              {lastUndoable && (
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={undoing || addingRows}
                  aria-label={t("undoLast")}
                  title={t("undoLast")}
                  style={{
                    padding: "var(--space-2) var(--space-3)",
                    border: "1px solid var(--neutral-300)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "var(--text-caption)",
                    backgroundColor: "var(--neutral-0)",
                    color: "var(--neutral-700)",
                    cursor: undoing || addingRows ? "not-allowed" : "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                  }}
                >
                  {undoing ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Undo2 size={14} aria-hidden />}
                  {t("undo")}
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleOpenUploadPreviewFromFile(f, "upload");
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={addingRows || isParsingUpload}
                aria-label={t("uploadSpreadsheetAria")}
                title={t("uploadSpreadsheetTitle")}
                style={{
                  padding: "var(--space-2) var(--space-3)",
                  border: "1px solid var(--neutral-300)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "var(--text-caption)",
                  backgroundColor: "var(--neutral-0)",
                  color: "var(--neutral-900)",
                  cursor: addingRows || isParsingUpload ? "not-allowed" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                }}
              >
                <Upload size={14} aria-hidden />
                {t("uploadFile")}
              </button>
            </div>
          )}
          {units.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <button
                type="button"
                onClick={scrollTableToTop}
                aria-label={t("scrollToTop")}
                title={t("scrollToTop")}
                style={{
                  padding: "var(--space-2)",
                  border: "1px solid var(--neutral-300)",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "var(--neutral-0)",
                  color: "var(--neutral-900)",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ChevronUp size={16} aria-hidden />
              </button>
              <button
                type="button"
                onClick={scrollTableToBottom}
                aria-label={t("scrollToBottom")}
                title={t("scrollToBottom")}
                style={{
                  padding: "var(--space-2)",
                  border: "1px solid var(--neutral-300)",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "var(--neutral-0)",
                  color: "var(--neutral-900)",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ChevronDown size={16} aria-hidden />
              </button>
            </div>
          )}
          {/* View mode toggle: Grid | Breakdown */}
          <div
            role="group"
            aria-label={t("viewModeAria")}
            style={{
              display: "flex",
              border: "1px solid var(--neutral-300)",
              borderRadius: "var(--radius-sm)",
              overflow: "hidden",
            }}
          >
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              aria-pressed={viewMode === "grid"}
              title={t("gridView")}
              aria-label={t("gridView")}
              style={{
                padding: "var(--space-2) var(--space-3)",
                border: "none",
                fontSize: "var(--text-caption)",
                fontWeight: viewMode === "grid" ? 600 : 400,
                backgroundColor: viewMode === "grid" ? "var(--primary-600)" : "var(--neutral-0)",
                color: viewMode === "grid" ? "white" : "var(--neutral-700)",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--space-2)",
              }}
            >
              <Table2 size={14} aria-hidden />
              {t("gridView")}
            </button>
            <button
              type="button"
              onClick={() => setViewMode("breakdown")}
              aria-pressed={viewMode === "breakdown"}
              title={t("breakdownView")}
              aria-label={t("breakdownView")}
              style={{
                padding: "var(--space-2) var(--space-3)",
                border: "none",
                fontSize: "var(--text-caption)",
                fontWeight: viewMode === "breakdown" ? 600 : 400,
                backgroundColor: viewMode === "breakdown" ? "var(--primary-600)" : "var(--neutral-0)",
                color: viewMode === "breakdown" ? "white" : "var(--neutral-700)",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--space-2)",
              }}
            >
              <BarChart3 size={14} aria-hidden />
              {t("breakdownView")}
            </button>
            {canManage && (
              <button
                type="button"
                onClick={() => setViewMode("scope-setup")}
                aria-pressed={viewMode === "scope-setup"}
                title={t("scopeSetupView")}
                aria-label={t("scopeSetupView")}
                style={{
                  padding: "var(--space-2) var(--space-3)",
                  border: "none",
                  fontSize: "var(--text-caption)",
                  fontWeight: viewMode === "scope-setup" ? 600 : 400,
                  backgroundColor: viewMode === "scope-setup" ? "var(--primary-600)" : "var(--neutral-0)",
                  color: viewMode === "scope-setup" ? "white" : "var(--neutral-700)",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                }}
              >
                <Link2 size={14} aria-hidden />
                {t("scopeSetupView")}
              </button>
            )}
          </div>

          <div ref={columnPickerRef} style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setShowColumnPicker((s) => !s)}
              aria-expanded={showColumnPicker}
              aria-haspopup="true"
              aria-label={t("chooseColumns")}
              title={t("columnsLabel")}
              style={{
                padding: "var(--space-2) var(--space-3)",
                border: "1px solid var(--neutral-300)",
                borderRadius: "var(--radius-sm)",
                fontSize: "var(--text-caption)",
                backgroundColor: "var(--neutral-0)",
                color: "var(--neutral-900)",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--space-2)",
              }}
            >
              <Columns3 size={16} aria-hidden />
              {t("columnsLabel")}
            </button>
            {showColumnPicker && (
              <div
                role="menu"
                aria-label={t("columnVisibility")}
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  marginTop: 4,
                  padding: "var(--space-2)",
                  backgroundColor: "var(--neutral-0)",
                  border: "1px solid var(--neutral-200)",
                  borderRadius: "var(--radius-sm)",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                  zIndex: 50,
                  maxHeight: 320,
                  overflowY: "auto",
                  minWidth: 180,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--neutral-500)", marginBottom: "var(--space-2)", textTransform: "uppercase" }}>
                  {t("showHideColumns")}
                </div>
                {ALL_COLS.map((col) => (
                  <label
                    key={col}
                    role="menuitemcheckbox"
                    aria-checked={!hiddenColumns.has(col)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--space-2)",
                      padding: "var(--space-1) 0",
                      cursor: "pointer",
                      fontSize: "var(--text-caption)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!hiddenColumns.has(col)}
                      onChange={() => toggleColumnVisibility(col)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    {colLabel(col) ?? col}
                  </label>
                ))}
                <button
                  type="button"
                  onClick={() => setHiddenColumns(new Set())}
                  style={{
                    marginTop: "var(--space-2)",
                    padding: "var(--space-1) var(--space-2)",
                    fontSize: 11,
                    border: "none",
                    background: "transparent",
                    color: "var(--primary-600)",
                    cursor: "pointer",
                  }}
                >
                  {t("showAll")}
                </button>
              </div>
            )}
          </div>
          {canWrite && showAddRows && (
            <div
              style={{
                padding: "var(--space-3)",
                borderBottom: "1px solid var(--neutral-200)",
                backgroundColor: "var(--neutral-50)",
                display: "flex",
                flexWrap: "wrap",
                alignItems: "flex-end",
                gap: "var(--space-3)",
              }}
            >
              <div style={{ flex: 1, minWidth: 200 }}>
                <label htmlFor="add-rows-paste" style={{ fontSize: 11, fontWeight: 600, color: "var(--neutral-600)", display: "block", marginBottom: 4 }}>
                  {t("pasteFromSpreadsheet")}
                </label>
                <textarea
                  ref={addRowsPasteRef}
                  id="add-rows-paste"
                  value={addRowsPaste}
                  onChange={(e) => setAddRowsPaste(e.target.value)}
                  placeholder={t("pastePlaceholder")}
                  rows={4}
                  style={{
                    width: "100%",
                    padding: "var(--space-2)",
                    border: "1px solid var(--neutral-300)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "var(--text-caption)",
                    fontFamily: "ui-monospace, monospace",
                    backgroundColor: "var(--neutral-0)",
                    color: "var(--neutral-900)",
                  }}
                />
              </div>
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <button
                  type="button"
                  onClick={handleAddFromPaste}
                  disabled={addingRows || !addRowsPaste.trim()}
                  style={{
                    padding: "var(--space-2) var(--space-4)",
                    backgroundColor: "var(--primary-600)",
                    color: "white",
                    border: "none",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "var(--text-caption)",
                    fontWeight: 600,
                    cursor: addingRows || !addRowsPaste.trim() ? "not-allowed" : "pointer",
                  }}
                >
                  {addingRows ? t("adding") : t("addRows")}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAddRows(false); setAddRowsPaste(""); }}
                  style={{
                    padding: "var(--space-2) var(--space-4)",
                    border: "1px solid var(--neutral-300)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "var(--text-caption)",
                    backgroundColor: "var(--neutral-0)",
                    cursor: "pointer",
                  }}
                >
                  {tCommon("cancel")}
                </button>
              </div>
            </div>
          )}
          <div
            style={{
              flex: 1,
              minWidth: 200,
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
            }}
          >
            <Search size={16} style={{ color: "var(--neutral-500)", flexShrink: 0 }} aria-hidden />
            <select
              value={filterColumn}
              onChange={(e) => setFilterColumn(e.target.value as string | "all")}
              aria-label={t("filterByColumn")}
              style={{
                padding: "var(--space-2) var(--space-4)",
                border: "1px solid var(--neutral-300)",
                borderRadius: "var(--radius-sm)",
                fontSize: "var(--text-caption)",
                backgroundColor: "var(--neutral-0)",
                color: "var(--neutral-700)",
              }}
            >
              <option value="all">{t("allColumns")}</option>
              {ALL_COLS.map((col) => (
                <option key={col} value={col}>
                  {colLabel(col) ?? col}
                </option>
              ))}
            </select>
            <input
              type="search"
              id="field-tracker-search"
              placeholder={filterColumn === "all" ? t("searchAllColumns") : t("searchColumn", { column: colLabel(filterColumn) })}
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitSearchNow();
                }
              }}
              onBlur={() => {
                if (filterQueryRef.current === debouncedFilterQueryRef.current) return;
                commitSearchNow();
              }}
              title={t("searchFieldTrackerHint")}
              aria-label={t("searchTable")}
              aria-describedby="field-tracker-search-hint"
              style={{
                flex: 1,
                minWidth: 0,
                padding: "var(--space-2) var(--space-4)",
                border: "1px solid var(--neutral-300)",
                borderRadius: "var(--radius-sm)",
                fontSize: "var(--text-caption)",
                outline: "none",
              }}
            />
            <span id="field-tracker-search-hint" className="sr-only">
              {t("searchFieldTrackerHint")}
            </span>
            {filterQuery && (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                }}
                onClick={() => {
                  if (searchDebounceTimerRef.current) {
                    clearTimeout(searchDebounceTimerRef.current);
                    searchDebounceTimerRef.current = null;
                  }
                  setFilterQuery("");
                  setDebouncedFilterQuery("");
                }}
                aria-label={t("clearSearch")}
                style={{
                  padding: "var(--space-2)",
                  border: "none",
                  background: "transparent",
                  color: "var(--neutral-500)",
                  cursor: "pointer",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Bulk update bar — when rows selected */}
        {canWrite && selectedRowIds.size > 0 && visibleEditableCols.length > 0 && (
          <div
            style={{
              padding: "var(--space-3) var(--space-4)",
              backgroundColor: "var(--primary-50)",
              borderBottom: "1px solid var(--primary-200)",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "var(--space-3)",
            }}
          >
            <span style={{ fontWeight: 600, fontSize: "var(--text-caption)", color: "var(--primary-800)" }}>
              {selectedRowIds.size === 1 ? t("rowSelected", { count: 1 }) : t("rowsSelected", { count: selectedRowIds.size })}
            </span>
            <span style={{ color: "var(--neutral-600)", fontSize: "var(--text-caption)" }}>{t("set")}</span>
            <select
              value={bulkColumn}
              onChange={(e) => setBulkColumn(e.target.value)}
              style={{
                padding: "var(--space-2) var(--space-4)",
                border: "1px solid var(--neutral-300)",
                borderRadius: "var(--radius-sm)",
                fontSize: "var(--text-caption)",
                backgroundColor: "var(--neutral-0)",
              }}
            >
              {visibleEditableCols.map((col) => (
                  <option key={col} value={col}>{colLabel(col) ?? col}</option>
                ))}
            </select>
            <span style={{ color: "var(--neutral-600)", fontSize: "var(--text-caption)" }}>{t("to")}</span>
            {FK_COLS.includes(bulkColumn as (typeof FK_COLS)[number]) ? (
              <input
                type="text"
                value={bulkValue}
                onChange={(e) => setBulkValue(e.target.value)}
                placeholder="Type value…"
                style={{
                  padding: "var(--space-2) var(--space-4)",
                  border: "1px solid var(--neutral-300)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "var(--text-caption)",
                  minWidth: 140,
                }}
              />
            ) : DATE_COLS.includes(bulkColumn as (typeof DATE_COLS)[number]) ? (
              <input
                type="date"
                value={bulkValue}
                onChange={(e) => setBulkValue(e.target.value)}
                style={{
                  padding: "var(--space-2) var(--space-4)",
                  border: "1px solid var(--neutral-300)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "var(--text-caption)",
                }}
              />
            ) : NUMBER_COLS.includes(bulkColumn as (typeof NUMBER_COLS)[number]) ? (
              <input
                type="number"
                step="any"
                value={bulkValue}
                onChange={(e) => setBulkValue(e.target.value)}
                placeholder={t("number")}
                style={{
                  padding: "var(--space-2) var(--space-4)",
                  border: "1px solid var(--neutral-300)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "var(--text-caption)",
                  width: 100,
                }}
              />
            ) : (
              <input
                type="text"
                value={bulkValue}
                onChange={(e) => setBulkValue(e.target.value)}
                placeholder={t("value")}
                style={{
                  padding: "var(--space-2) var(--space-4)",
                  border: "1px solid var(--neutral-300)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "var(--text-caption)",
                  minWidth: 120,
                }}
              />
            )}
            <button
              type="button"
              onClick={handleBulkUpdate}
              disabled={bulkUpdating}
              style={{
                padding: "var(--space-2) var(--space-4)",
                backgroundColor: "var(--primary-600)",
                color: "white",
                border: "none",
                borderRadius: "var(--radius-sm)",
                fontSize: "var(--text-caption)",
                fontWeight: 600,
                cursor: bulkUpdating ? "not-allowed" : "pointer",
              }}
            >
              {bulkUpdating ? t("updating") : tCommon("apply")}
            </button>
            <button type="button" onClick={clearSelection} style={{ padding: "var(--space-2)", border: "none", background: "transparent", color: "var(--neutral-600)", cursor: "pointer", fontSize: "var(--text-caption)" }}>
              {t("clearSelection")}
            </button>
            <button
              type="button"
              onClick={handleDeleteSelected}
              disabled={deletingRows}
              aria-label={selectedRowIds.size === 1 ? t("deleteSelectedRowAria", { count: 1 }) : t("deleteSelectedRowsAria", { count: selectedRowIds.size })}
              style={{
                padding: "var(--space-2) var(--space-4)",
                border: "1px solid var(--error-300, #fca5a5)",
                borderRadius: "var(--radius-sm)",
                fontSize: "var(--text-caption)",
                backgroundColor: "var(--error-50, #fef2f2)",
                color: "var(--error-700, #b91c1c)",
                cursor: deletingRows ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--space-2)",
              }}
            >
              <Trash2 size={14} aria-hidden />
              {deletingRows ? t("deleting") : tCommon("delete")}
            </button>
          </div>
        )}

        {/* Find & Replace bar */}
        {canWrite && (
          <div
            style={{
              padding: "var(--space-2) var(--space-4)",
              borderBottom: "1px solid var(--neutral-200)",
              backgroundColor: "var(--neutral-50)",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "var(--space-2)",
            }}
          >
            <button
              type="button"
              onClick={() => setShowFindReplace((s) => !s)}
              style={{
                padding: "var(--space-2) var(--space-4)",
                border: "1px solid var(--neutral-300)",
                borderRadius: "var(--radius-sm)",
                fontSize: "var(--text-caption)",
                backgroundColor: "var(--neutral-0)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
              }}
            >
              <Replace size={14} />
              {t("findReplace")}
            </button>
            {showFindReplace && (
              <>
                <span style={{ fontSize: "var(--text-caption)", color: "var(--neutral-600)" }}>{t("in")}</span>
                <select
                  value={
                    visibleCols.includes(findReplaceCol as (typeof ALL_COLS)[number])
                      ? findReplaceCol
                      : (TEXT_COLS.find((c) => visibleCols.includes(c)) ?? visibleCols[0] ?? "building")
                  }
                  onChange={(e) => setFindReplaceCol(e.target.value)}
                  style={{ padding: "4px 8px", border: "1px solid var(--neutral-300)", borderRadius: 4, fontSize: "var(--text-caption)" }}
                >
                  {TEXT_COLS.filter((c) => visibleCols.includes(c)).map((col) => (
                    <option key={col} value={col}>{colLabel(col) ?? col}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={findText}
                  onChange={(e) => setFindText(e.target.value)}
                  placeholder={t("find")}
                  style={{ padding: "4px 8px", border: "1px solid var(--neutral-300)", borderRadius: 4, fontSize: "var(--text-caption)", width: 100 }}
                />
                <span style={{ color: "var(--neutral-500)" }}>→</span>
                <input
                  type="text"
                  value={replaceText}
                  onChange={(e) => setReplaceText(e.target.value)}
                  placeholder={t("replaceWith")}
                  style={{ padding: "4px 8px", border: "1px solid var(--neutral-300)", borderRadius: 4, fontSize: "var(--text-caption)", width: 120 }}
                />
                <button
                  type="button"
                  onClick={handleFindReplace}
                  disabled={bulkUpdating || !findText.trim()}
                  style={{
                    padding: "4px 12px",
                    backgroundColor: "var(--primary-600)",
                    color: "white",
                    border: "none",
                    borderRadius: 4,
                    fontSize: "var(--text-caption)",
                    cursor: bulkUpdating ? "not-allowed" : "pointer",
                  }}
                >
                  {bulkUpdating ? "…" : t("replaceAll")}
                </button>
              </>
            )}
          </div>
        )}

        {/* Breakdown view — rendered outside the paginated grid scroll container */}
        {viewMode === "breakdown" && !loading && (
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <LocationProgressBreakdown units={units} />
          </div>
        )}

        {/* Scope Setup panel — lets CONTROLS_MANAGER/ADMIN map scope codes to canonical names per project */}
        {viewMode === "scope-setup" && !loading && (
          <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
            <ScopeSetupPanel
              projectId={project.id}
              onMappingChanged={() => {
                void fetchAllUnitsPages();
              }}
            />
          </div>
        )}

        {(viewMode === "grid" || loading) && (
        <div
          ref={tableScrollRef}
          style={{
            flex: 1,
            overflow: "auto",
            position: "relative",
          }}
          aria-busy={unitsRefreshing}
        >
          {loading ? (
            <div style={{ padding: "var(--space-2) 0" }}>
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-4)",
                    padding: "var(--space-3) var(--space-4)",
                    borderBottom: "1px solid var(--neutral-100)",
                  }}
                >
                  <Skeleton style={{ width: 16, height: 14, flexShrink: 0 }} />
                  <Skeleton style={{ width: 28, height: 14, flexShrink: 0 }} />
                  <Skeleton style={{ width: `${28 + (i * 11) % 32}px`, height: 14 }} />
                  <Skeleton style={{ width: `${18 + (i * 7) % 20}px`, height: 14 }} />
                  <Skeleton style={{ width: `${18 + (i * 13) % 22}px`, height: 14 }} />
                  <Skeleton style={{ width: `${18 + (i * 9) % 24}px`, height: 14 }} />
                  <Skeleton style={{ width: `${18 + (i * 5) % 22}px`, height: 14 }} />
                  <Skeleton style={{ width: `${70 + (i * 17) % 110}px`, height: 14 }} />
                  <Skeleton style={{ width: `${50 + (i * 11) % 60}px`, height: 14 }} />
                  <Skeleton style={{ width: `${30 + (i * 3) % 50}px`, height: 14 }} />
                  <Skeleton style={{ width: `${38 + (i * 7) % 42}px`, height: 14 }} />
                </div>
              ))}
            </div>
          ) : (
            <>
              {unitsRefreshing ? (
                <div
                  role="status"
                  aria-live="polite"
                  style={{
                    position: "absolute",
                    inset: 0,
                    zIndex: 5,
                    backgroundColor: "rgba(255, 255, 255, 0.72)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "column",
                    gap: "var(--space-3)",
                    pointerEvents: "none",
                  }}
                >
                  <Loader2 size={28} className="animate-spin" aria-hidden style={{ color: "var(--primary-600)" }} />
                  <span style={{ fontSize: "var(--text-caption)", color: "var(--neutral-600)" }}>
                    {t("fieldTrackerTableUpdating")}
                  </span>
                </div>
              ) : null}
              {units.length === 0 && !unitsRefreshing ? (
            <div
              style={{
                padding: "var(--space-8)",
                textAlign: "center",
                color: "var(--neutral-500)",
                fontSize: "var(--text-body)",
              }}
            >
              {t("noUnitRows")}
            </div>
          ) : units.length === 0 ? null : (
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "var(--text-caption)",
              }}
            >
              <thead style={{ position: "sticky", top: 0, backgroundColor: "var(--neutral-50)", zIndex: 10 }}>
                <tr style={{ borderBottom: "1px solid var(--neutral-200)" }}>
                  {canWrite && (
                    <th style={{ padding: "var(--space-2) var(--space-4)", width: 40, verticalAlign: "middle" }}>
                      <input
                        type="checkbox"
                        checked={filteredAndSortedUnits.length > 0 && filteredAndSortedUnits.every((r) => selectedRowIds.has(r.id))}
                        onChange={(e) => (e.target.checked ? selectAllFiltered() : clearSelection())}
                        aria-label={t("selectAll")}
                        style={{ cursor: "pointer" }}
                      />
                    </th>
                  )}
                  <th style={{ padding: "var(--space-2) var(--space-4)", textAlign: "left", fontWeight: 600, color: "var(--neutral-700)", minWidth: 40 }}>#</th>
                  {visibleCols.map((col) => {
                    const isSorted = sortColumn === col;
                    return (
                      <th
                        key={col}
                        scope="col"
                        className="hover:bg-neutral-100 transition-colors"
                        style={{
                          padding: "var(--space-2) var(--space-4)",
                          textAlign: "left",
                          fontWeight: 600,
                          color: "var(--neutral-700)",
                          whiteSpace: "nowrap",
                          cursor: "pointer",
                          userSelect: "none",
                        }}
                        onClick={() => handleSort(col)}
                        title={`Sort by ${colLabel(col) ?? col}`}
                      >
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          {colLabel(col) ?? col}
                          {isSorted ? (
                            sortDirection === "asc" ? (
                              <ArrowUp size={14} style={{ flexShrink: 0, opacity: 0.8 }} aria-hidden />
                            ) : (
                              <ArrowDown size={14} style={{ flexShrink: 0, opacity: 0.8 }} aria-hidden />
                            )
                          ) : (
                            <ArrowUpDown size={14} style={{ flexShrink: 0, opacity: 0.4 }} aria-hidden />
                          )}
                        </span>
                      </th>
                    );
                  })}
                </tr>
                <tr style={{ borderBottom: "2px solid var(--neutral-200)", backgroundColor: "var(--neutral-50)" }}>
                  {canWrite && <th style={{ padding: "var(--space-1) var(--space-4)", width: 40 }} />}
                  <th style={{ padding: "var(--space-1) var(--space-4)", verticalAlign: "middle" }}>
                    {hasColumnFilters && (
                      <button
                        type="button"
                        onClick={() => setColumnFilters({})}
                        aria-label="Clear all column filters"
                        title="Clear column filters"
                        style={{
                          padding: 2,
                          border: "none",
                          background: "transparent",
                          color: "var(--neutral-500)",
                          cursor: "pointer",
                        }}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </th>
                  {visibleCols.map((col) => (
                    <th key={col} style={{ padding: "var(--space-1) var(--space-2)", verticalAlign: "middle" }}>
                      <input
                        type="text"
                        value={columnFilters[col] ?? ""}
                        onChange={(e) => setColumnFilter(col, e.target.value)}
                        placeholder={`Filter ${colLabel(col) ?? col}`}
                        aria-label={`Filter by ${colLabel(col) ?? col}`}
                        style={{
                          width: "100%",
                          minWidth: 60,
                          padding: "4px 6px",
                          border: "1px solid var(--neutral-300)",
                          borderRadius: "var(--radius-sm)",
                          fontSize: "11px",
                          outline: "none",
                          backgroundColor: "var(--neutral-0)",
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredAndSortedUnits.length === 0 ? (
                  <tr>
                    <td
                      colSpan={(canWrite ? 1 : 0) + 1 + visibleCols.length}
                      style={{
                        padding: "var(--space-8)",
                        textAlign: "center",
                        color: "var(--neutral-500)",
                        fontSize: "var(--text-body)",
                      }}
                    >
                      {t("noRowsMatch")}
                      {(filterQuery || hasColumnFilters) && t("tryAdjusting")}
                    </td>
                  </tr>
                ) : (
                filteredAndSortedUnits.map((row) => (
                  <tr
                    key={row.id}
                    ref={(el) => {
                      if (el) rowRefsMap.current.set(row.id, el);
                      else rowRefsMap.current.delete(row.id);
                    }}
                    style={{
                      borderBottom: "1px solid var(--neutral-100)",
                      backgroundColor: savingId === row.id
                        ? "var(--primary-50)"
                        : justAddedRowId === row.id
                          ? "var(--success-50, #ecfdf5)"
                          : justSavedIds.has(row.id)
                            ? "var(--success-50, #ecfdf5)"
                            : selectedRowIds.has(row.id)
                              ? "var(--primary-50)"
                              : undefined,
                      transition: "background-color 0.4s ease, box-shadow 0.3s ease",
                      boxShadow: justAddedRowId === row.id ? "inset 0 0 0 2px var(--success-600, #16a34a)" : undefined,
                    }}
                  >
                    {canWrite && (
                      <td style={{ padding: "var(--space-2) var(--space-4)", verticalAlign: "middle" }} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedRowIds.has(row.id)}
                          onChange={() => toggleRowSelection(row.id)}
                          aria-label={`Select row ${row.rowIndex + 1}`}
                          style={{ cursor: "pointer" }}
                        />
                      </td>
                    )}
                    <td style={{ padding: "var(--space-2) var(--space-4)", color: "var(--neutral-500)", fontFamily: "ui-monospace, monospace" }}>
                      {row.rowIndex + 1}
                    </td>
                    {TEXT_COLS.filter((c) => visibleCols.includes(c)).map((col) => {
                      const idx = visibleEditableCols.indexOf(col);
                      const nextCol = visibleEditableCols[idx + 1] ?? visibleEditableCols[0];
                      const prevCol = visibleEditableCols[idx - 1] ?? visibleEditableCols[visibleEditableCols.length - 1];
                      return (
                        <EditableTextCell
                          key={col}
                          ref={getCellRefs(row.id)[COL_INDEX[col]]}
                          value={String(row[col as keyof ProjectRowUnit] ?? "")}
                          disabled={!canWrite}
                          onSave={(v) => handleCellChange(row.id, col, v)}
                          onTabNext={() => focusCell(row.id, COL_INDEX[nextCol])}
                          onTabPrev={() => focusCell(row.id, COL_INDEX[prevCol])}
                        />
                      );
                    })}
                    {FK_COLS.filter((c) => visibleCols.includes(c)).map((col) => {
                      if (col === "installer") {
                        const idx = visibleEditableCols.indexOf(col);
                        const nextCol = visibleEditableCols[idx + 1] ?? visibleEditableCols[0];
                        const prevCol = visibleEditableCols[idx - 1] ?? visibleEditableCols[visibleEditableCols.length - 1];
                        return (
                          <td
                            key={col}
                            style={{
                              padding: "var(--space-2) var(--space-4)",
                              verticalAlign: "middle",
                              whiteSpace: "nowrap",
                            }}
                          >
                            <SubcontractorPicker
                              ref={getCellRefs(row.id)[COL_INDEX[col]] as React.Ref<SubcontractorPickerRef>}
                              value={row.unifierSubId}
                              readOnly={!canWrite}
                              disabled={savingId === row.id}
                              onChange={(id, displayName) => handleInstallerChange(row.id, id, displayName)}
                              onTabNext={() => focusCell(row.id, COL_INDEX[nextCol])}
                              onTabPrev={() => focusCell(row.id, COL_INDEX[prevCol])}
                              projectId={project.id}
                              userId={currentUserId}
                            />
                          </td>
                        );
                      }
                      const idx = visibleEditableCols.indexOf(col);
                      const nextCol = visibleEditableCols[idx + 1] ?? visibleEditableCols[0];
                      const prevCol = visibleEditableCols[idx - 1] ?? visibleEditableCols[visibleEditableCols.length - 1];
                      return (
                        <EditableDropdownCell
                          key={col}
                          ref={getCellRefs(row.id)[COL_INDEX[col]]}
                          value={row[col as keyof ProjectRowUnit] as { id: string; code: string; name: string } | null}
                          options={col === "scopeType" ? lookups?.scopeTypes : col === "locationType" ? lookups?.locationTypes : col === "costType" ? lookups?.costTypes : lookups?.uomTypes}
                          disabled={!canWrite}
                          onSave={(v) => handleCellChange(row.id, col, v)}
                          onTabNext={() => focusCell(row.id, COL_INDEX[nextCol])}
                          onTabPrev={() => focusCell(row.id, COL_INDEX[prevCol])}
                        />
                      );
                    })}
                    {NUMBER_COLS.filter((c) => visibleCols.includes(c)).map((col) => {
                      const idx = visibleEditableCols.indexOf(col);
                      const nextCol = visibleEditableCols[idx + 1] ?? visibleEditableCols[0];
                      const prevCol = visibleEditableCols[idx - 1] ?? visibleEditableCols[visibleEditableCols.length - 1];
                      return (
                        <EditableNumberCell
                          key={col}
                          ref={getCellRefs(row.id)[COL_INDEX[col]]}
                          value={row[col as keyof ProjectRowUnit] as number | null}
                          disabled={!canWrite}
                          onSave={(v) => handleCellChange(row.id, col, v)}
                          onTabNext={() => focusCell(row.id, COL_INDEX[nextCol])}
                          onTabPrev={() => focusCell(row.id, COL_INDEX[prevCol])}
                        />
                      );
                    })}
                    {DATE_COLS.filter((c) => visibleCols.includes(c)).map((col) => {
                      const idx = visibleEditableCols.indexOf(col);
                      const nextCol = visibleEditableCols[idx + 1] ?? visibleEditableCols[0];
                      const prevCol = visibleEditableCols[idx - 1] ?? visibleEditableCols[visibleEditableCols.length - 1];
                      return (
                        <EditableDateCell
                          key={col}
                          ref={getCellRefs(row.id)[COL_INDEX[col]]}
                          value={row[col as keyof ProjectRowUnit] as string | null}
                          disabled={!canWrite}
                          onSave={(v) => handleCellChange(row.id, col, v)}
                          onTabNext={() => focusCell(row.id, COL_INDEX[nextCol])}
                          onTabPrev={() => focusCell(row.id, COL_INDEX[prevCol])}
                        />
                      );
                    })}
                    {/* Read-only progress columns */}
                    {PROGRESS_COLS.filter((c) => visibleCols.includes(c as (typeof ALL_COLS)[number])).map((col) => {
                      let badgeContent: React.ReactNode;
                      if (col === "installCompletePct") {
                        const pct = unitQtyInstallCompletePercent(
                          row.subScopeInstances.length > 0
                            ? row.subScopeInstances.map((inst) => ({
                                qty: inst.qty,
                                scopeStage: inst.scopeStage,
                                scopeStatus: inst.scopeStatus,
                                subScopeInstances: [],
                              }))
                            : [
                                {
                                  qty: row.qty,
                                  scopeStage: row.scopeStage,
                                  scopeStatus: row.scopeStatus,
                                  subScopeInstances: [],
                                },
                              ]
                        );
                        const barColor =
                          pct >= 100
                            ? "var(--success-600)"
                            : pct > 0
                              ? "var(--primary-500)"
                              : "var(--neutral-300)";
                        badgeContent = (
                          <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 80 }}>
                            <div
                              aria-hidden
                              style={{
                                width: 44,
                                height: 5,
                                backgroundColor: "var(--neutral-200)",
                                borderRadius: 3,
                                overflow: "hidden",
                                flexShrink: 0,
                              }}
                            >
                              <div
                                style={{
                                  width: `${pct}%`,
                                  height: "100%",
                                  backgroundColor: barColor,
                                }}
                              />
                            </div>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: "var(--neutral-700)",
                                minWidth: 28,
                                textAlign: "right",
                              }}
                            >
                              {pct}%
                            </span>
                          </div>
                        );
                      } else if (col === "scopeStage") {
                        const v = row.scopeStage;
                        const sc = v ? (STAGE_COLORS[v] ?? { bg: "var(--neutral-100)", color: "var(--neutral-700)" }) : null;
                        badgeContent = sc ? (
                          <span style={{ ...BADGE_BASE_STYLE, backgroundColor: sc.bg, color: sc.color }}>{v}</span>
                        ) : (
                          <span style={{ color: "var(--neutral-400)", fontSize: 11 }}>—</span>
                        );
                      } else if (col === "scopeStatus") {
                        const v = row.scopeStatus;
                        const sc = v ? (STATUS_COLORS[v] ?? { bg: "var(--neutral-100)", color: "var(--neutral-700)" }) : null;
                        badgeContent = sc ? (
                          <span style={{ ...BADGE_BASE_STYLE, backgroundColor: sc.bg, color: sc.color }}>
                            {v!.replace(/_/g, " ")}
                          </span>
                        ) : (
                          <span style={{ color: "var(--neutral-400)", fontSize: 11 }}>—</span>
                        );
                      } else {
                        const v = row.inspectionStatus;
                        const sc = v ? (INSP_COLORS[v] ?? { bg: "var(--neutral-100)", color: "var(--neutral-700)" }) : null;
                        badgeContent = sc ? (
                          <span style={{ ...BADGE_BASE_STYLE, backgroundColor: sc.bg, color: sc.color }}>{v}</span>
                        ) : (
                          <span style={{ color: "var(--neutral-400)", fontSize: 11 }}>—</span>
                        );
                      }
                      return (
                        <td
                          key={col}
                          style={{
                            padding: "var(--space-2) var(--space-4)",
                            verticalAlign: "middle",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {badgeContent}
                        </td>
                      );
                    })}
                  </tr>
                ))
                )}
              </tbody>
            </table>
          )}
            </>
          )}
          {(hasMoreRows || loadingMore || loadMoreError) && units.length > 0 ? (
            <>
              <LoadingRowsToast
                show
                progressText={
                  totalRowCount != null && (hasMoreRows || loadingMore)
                    ? t("tableRowsLoadedProgress", { loaded: units.length, total: totalRowCount })
                    : null
                }
                loading={loadingMore}
                loadingLabel={t("tableLoadingMoreRows")}
                errorMessage={loadMoreError ? t("tableLoadMoreError", { error: loadMoreError }) : null}
                onRetry={() => void loadNextPage()}
                retryLabel={t("tableLoadMoreRetry")}
                testId="field-tracker-loading-rows-toast"
              />
              {hasMoreRows && nextCursor != null ? (
                <div
                  ref={tableLoadSentinelRef}
                  data-testid="field-tracker-table-load-sentinel"
                  style={{ height: 1, width: "100%" }}
                  aria-hidden
                />
              ) : null}
            </>
          ) : null}
        </div>
        )}
      </div>

      {/* Add Row modal */}
      {showAddRowForm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-row-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.4)",
          }}
          onClick={(e) => e.target === e.currentTarget && setShowAddRowForm(false)}
        >
          <div
            style={{
              backgroundColor: "var(--neutral-0)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--neutral-200)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
              maxWidth: 560,
              width: "90%",
              maxHeight: "85vh",
              overflow: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: "var(--space-6)", borderBottom: "1px solid var(--neutral-200)" }}>
              <h2 id="add-row-title" style={{ margin: 0, fontSize: "var(--text-heading)", fontWeight: 600, color: "var(--neutral-900)" }}>
                {t("addNewRow")}
              </h2>
              <p style={{ margin: "var(--space-2) 0 0", fontSize: "var(--text-caption)", color: "var(--neutral-600)" }}>
                {t("addNewRowDescription")}
              </p>
            </div>
            <form
              onSubmit={(e) => { e.preventDefault(); handleAddRowFormSubmit(); }}
              style={{
                padding: "var(--space-6)",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                gap: "var(--space-4)",
              }}
            >
              {TEXT_COLS.map((col) => (
                <div key={col}>
                  <label htmlFor={`add-${col}`} style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--neutral-600)", marginBottom: 4 }}>
                    {colLabel(col)}
                  </label>
                  <input
                    id={`add-${col}`}
                    type="text"
                    value={addRowFormValues[col] ?? ""}
                    onChange={(e) => setAddRowFormValues((v) => ({ ...v, [col]: e.target.value }))}
                    style={{
                      width: "100%",
                      padding: "var(--space-2) var(--space-3)",
                      border: "1px solid var(--neutral-300)",
                      borderRadius: "var(--radius-sm)",
                      fontSize: "var(--text-caption)",
                    }}
                  />
                </div>
              ))}
              {FK_COLS.map((col) => (
                <div key={col}>
                  <label htmlFor={`add-${col}`} style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--neutral-600)", marginBottom: 4 }}>
                    {colLabel(col)}
                  </label>
                  <input
                    id={`add-${col}`}
                    type="text"
                    value={addRowFormValues[col] ?? ""}
                    onChange={(e) => setAddRowFormValues((v) => ({ ...v, [col]: e.target.value }))}
                    placeholder="Type value…"
                    style={{
                      width: "100%",
                      padding: "var(--space-2) var(--space-3)",
                      border: "1px solid var(--neutral-300)",
                      borderRadius: "var(--radius-sm)",
                      fontSize: "var(--text-caption)",
                    }}
                  />
                </div>
              ))}
              {NUMBER_COLS.map((col) => (
                <div key={col}>
                  <label htmlFor={`add-${col}`} style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--neutral-600)", marginBottom: 4 }}>
                    {colLabel(col)}
                  </label>
                  <input
                    id={`add-${col}`}
                    type="number"
                    step="any"
                    value={addRowFormValues[col] ?? ""}
                    onChange={(e) => setAddRowFormValues((v) => ({ ...v, [col]: e.target.value }))}
                    style={{
                      width: "100%",
                      padding: "var(--space-2) var(--space-3)",
                      border: "1px solid var(--neutral-300)",
                      borderRadius: "var(--radius-sm)",
                      fontSize: "var(--text-caption)",
                    }}
                  />
                </div>
              ))}
              {DATE_COLS.map((col) => (
                <div key={col}>
                  <label htmlFor={`add-${col}`} style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--neutral-600)", marginBottom: 4 }}>
                    {colLabel(col)}
                  </label>
                  <input
                    id={`add-${col}`}
                    type="date"
                    value={addRowFormValues[col] ?? ""}
                    onChange={(e) => setAddRowFormValues((v) => ({ ...v, [col]: e.target.value }))}
                    style={{
                      width: "100%",
                      padding: "var(--space-2) var(--space-3)",
                      border: "1px solid var(--neutral-300)",
                      borderRadius: "var(--radius-sm)",
                      fontSize: "var(--text-caption)",
                    }}
                  />
                </div>
              ))}
              <div style={{ padding: "var(--space-4) var(--space-6)", borderTop: "1px solid var(--neutral-200)", display: "flex", justifyContent: "flex-end", gap: "var(--space-2)" }}>
                <button
                  type="button"
                  onClick={() => setShowAddRowForm(false)}
                  style={{
                    padding: "var(--space-2) var(--space-4)",
                    border: "1px solid var(--neutral-300)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "var(--text-caption)",
                    backgroundColor: "var(--neutral-0)",
                    cursor: "pointer",
                  }}
                >
                  {tCommon("cancel")}
                </button>
                <button
                  type="submit"
                  disabled={addingRows}
                  style={{
                    padding: "var(--space-2) var(--space-4)",
                    backgroundColor: "var(--primary-600)",
                    color: "white",
                    border: "none",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "var(--text-caption)",
                    fontWeight: 600,
                    cursor: addingRows ? "not-allowed" : "pointer",
                  }}
                >
                  {addingRows ? t("adding") : t("addRow")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
    </>
  );
}

const EditableTextCell = forwardRef<EditableCellRef, {
  value: string;
  disabled: boolean;
  onSave: (v: string) => void;
  onTabNext?: () => void;
  onTabPrev?: () => void;
}>(function EditableTextCell({ value, disabled, onSave, onTabNext, onTabPrev }, ref) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value);

  useImperativeHandle(ref, () => ({ focus: () => setEditing(true) }), []);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  const saveAndBlur = useCallback(() => {
    setEditing(false);
    if (local !== value) onSave(local);
  }, [local, value, onSave]);

  if (editing && !disabled) {
    return (
      <td style={{ padding: 2, verticalAlign: "middle" }}>
        <input
          type="text"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={saveAndBlur}
          onKeyDown={(e) => {
            if (e.key === "Tab") {
              e.preventDefault();
              saveAndBlur();
              (e.shiftKey ? onTabPrev : onTabNext)?.();
            } else if (e.key === "Enter") {
              saveAndBlur();
            }
          }}
          autoFocus
          style={{
            width: "100%",
            minWidth: 80,
            padding: "4px 8px",
            border: "1px solid var(--primary-500)",
            borderRadius: "var(--radius-sm)",
            fontSize: "var(--text-caption)",
            outline: "none",
          }}
        />
      </td>
    );
  }

  return (
    <td
      style={{
        padding: "var(--space-2) var(--space-4)",
        cursor: disabled ? "default" : "pointer",
      }}
      onClick={() => !disabled && setEditing(true)}
    >
      {value || "—"}
    </td>
  );
});

const EditableNumberCell = forwardRef<EditableCellRef, {
  value: number | null;
  disabled: boolean;
  onSave: (v: number | null) => void;
  onTabNext?: () => void;
  onTabPrev?: () => void;
}>(function EditableNumberCell({ value, disabled, onSave, onTabNext, onTabPrev }, ref) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value?.toString() ?? "");

  useImperativeHandle(ref, () => ({ focus: () => setEditing(true) }), []);

  useEffect(() => {
    queueMicrotask(() => setLocal(value?.toString() ?? ""));
  }, [value]);

  const saveAndBlur = useCallback(() => {
    setEditing(false);
    const n = local === "" ? null : parseFloat(local);
    if (Number.isNaN(n as number) && local !== "") return;
    if (n !== value) onSave(local === "" ? null : (n as number));
  }, [local, value, onSave]);

  const saveOnEnter = useCallback(() => {
    setEditing(false);
    const n = local === "" ? null : parseFloat(local);
    if (!Number.isNaN(n as number) || local === "") onSave(local === "" ? null : (n as number));
  }, [local, onSave]);

  if (editing && !disabled) {
    return (
      <td style={{ padding: 2, verticalAlign: "middle" }}>
        <input
          type="number"
          step="any"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={saveAndBlur}
          onKeyDown={(e) => {
            if (e.key === "Tab") {
              e.preventDefault();
              saveAndBlur();
              (e.shiftKey ? onTabPrev : onTabNext)?.();
            } else if (e.key === "Enter") {
              saveOnEnter();
            }
          }}
          autoFocus
          style={{
            width: "100%",
            minWidth: 70,
            padding: "4px 8px",
            border: "1px solid var(--primary-500)",
            borderRadius: "var(--radius-sm)",
            fontSize: "var(--text-caption)",
            outline: "none",
          }}
        />
      </td>
    );
  }

  return (
    <td
      style={{
        padding: "var(--space-2) var(--space-4)",
        fontFamily: "ui-monospace, monospace",
        cursor: disabled ? "default" : "pointer",
      }}
      onClick={() => !disabled && setEditing(true)}
    >
      {value != null ? String(value) : "—"}
    </td>
  );
});

const EditableDateCell = forwardRef<EditableCellRef, {
  value: string | null;
  disabled: boolean;
  onSave: (v: string | null) => void;
  onTabNext?: () => void;
  onTabPrev?: () => void;
}>(function EditableDateCell({ value, disabled, onSave, onTabNext, onTabPrev }, ref) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value ?? "");

  useImperativeHandle(ref, () => ({ focus: () => setEditing(true) }), []);

  useEffect(() => {
    queueMicrotask(() => setLocal(value ?? ""));
  }, [value]);

  const saveAndBlur = useCallback(() => {
    setEditing(false);
    const v = local || null;
    if (v !== value) onSave(v);
  }, [local, value, onSave]);

  if (editing && !disabled) {
    return (
      <td style={{ padding: 2, verticalAlign: "middle" }}>
        <input
          type="date"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={saveAndBlur}
          onKeyDown={(e) => {
            if (e.key === "Tab") {
              e.preventDefault();
              saveAndBlur();
              (e.shiftKey ? onTabPrev : onTabNext)?.();
            } else if (e.key === "Enter") {
              saveAndBlur();
            }
          }}
          autoFocus
          style={{
            width: "100%",
            minWidth: 110,
            padding: "4px 8px",
            border: "1px solid var(--primary-500)",
            borderRadius: "var(--radius-sm)",
            fontSize: "var(--text-caption)",
            outline: "none",
          }}
        />
      </td>
    );
  }

  return (
    <td
      style={{
        padding: "var(--space-2) var(--space-4)",
        fontFamily: "ui-monospace, monospace",
        cursor: disabled ? "default" : "pointer",
      }}
      onClick={() => !disabled && setEditing(true)}
    >
      {value ? new Date(value + "T00:00:00").toLocaleDateString("en-US") : "—"}
    </td>
  );
});

const EditableDropdownCell = forwardRef<EditableCellRef, {
  value: { id: string; code: string; name: string } | null;
  options: LookupItem[] | undefined;
  disabled: boolean;
  onSave: (v: string | null) => void;
  onTabNext?: () => void;
  onTabPrev?: () => void;
}>(function EditableDropdownCell({ value, options, disabled, onSave, onTabNext, onTabPrev }, ref) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value?.code ?? "");

  useImperativeHandle(ref, () => ({ focus: () => setEditing(true) }), []);

  useEffect(() => {
    queueMicrotask(() => setLocal(value?.code ?? ""));
  }, [value]);

  const saveAndBlur = useCallback(() => {
    setEditing(false);
    const trimmed = local.trim() || null;
    const currentCode = value?.code ?? null;
    if (trimmed !== currentCode) onSave(trimmed);
  }, [local, value, onSave]);

  const hasOptions = options && options.length > 0;

  if (editing && !disabled) {
    return (
      <td style={{ padding: 2, verticalAlign: "middle" }}>
        {hasOptions ? (
          <select
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            onBlur={saveAndBlur}
            onKeyDown={(e) => {
              if (e.key === "Tab") {
                e.preventDefault();
                saveAndBlur();
                (e.shiftKey ? onTabPrev : onTabNext)?.();
              } else if (e.key === "Enter") {
                saveAndBlur();
              }
            }}
            autoFocus
            style={{
              width: "100%",
              minWidth: 120,
              padding: "4px 8px",
              border: "1px solid var(--primary-500)",
              borderRadius: "var(--radius-sm)",
              fontSize: "var(--text-caption)",
              outline: "none",
              backgroundColor: "var(--neutral-0)",
            }}
          >
            <option value="">— clear —</option>
            {options.map((o) => (
              <option key={o.id} value={o.code}>
                {o.name || o.code}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            onBlur={saveAndBlur}
            onKeyDown={(e) => {
              if (e.key === "Tab") {
                e.preventDefault();
                saveAndBlur();
                (e.shiftKey ? onTabPrev : onTabNext)?.();
              } else if (e.key === "Enter") {
                saveAndBlur();
              }
            }}
            autoFocus
            placeholder="Type value…"
            style={{
              width: "100%",
              minWidth: 100,
              padding: "4px 8px",
              border: "1px solid var(--primary-500)",
              borderRadius: "var(--radius-sm)",
              fontSize: "var(--text-caption)",
              outline: "none",
            }}
          />
        )}
      </td>
    );
  }

  return (
    <td
      style={{
        padding: "var(--space-2) var(--space-4)",
        cursor: disabled ? "default" : "pointer",
      }}
      onClick={() => !disabled && setEditing(true)}
    >
      {value ? (value.name || value.code) : "—"}
    </td>
  );
});
