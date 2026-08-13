"use client";

/**
 * UnifierProjectView
 *
 * Project-centric view for the Unifier Explorer DevTools tab.
 * Shows all Unifier PDS table data connected to a selected project,
 * grouped into collapsible domain sections. Each section lazy-loads
 * its data from /api/devtools/unifier-explore only when first expanded.
 *
 * Layout:
 *   Left sidebar  — searchable list of all Unifier project shells
 *   Right panel   — selected project header + domain section accordion
 */

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  Search,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Database,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  Users,
  Calendar,
  FileText,
  DollarSign,
  BarChart2,
  Truck,
  ClipboardCheck,
  MapPin,
  GitBranch,
  Package,
  Layers,
  Activity,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

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

type FetchStatus = "idle" | "loading" | "loaded" | "error";

interface TableState {
  status: FetchStatus;
  rows: Record<string, unknown>[];
  columns: string[];
  total: number;
  mockMode?: boolean;
  error?: string;
}

interface SectionTableDef {
  tableName: string;
  displayName: string;
  defaultLimit?: number;
}

interface DomainSectionDef {
  id: string;
  label: string;
  icon: React.ReactNode;
  tables: SectionTableDef[];
}

interface UnifierProjectViewProps {
  /** Called when user clicks "Open in Table Explorer" for a section table */
  onJumpToTable: (tableName: string, projectId: string) => void;
}

// ── Styles ─────────────────────────────────────────────────────────────────

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

function firstNonEmpty(rows: Record<string, unknown>[], key: string): string | null {
  for (const row of rows) {
    const value = row[key];
    if (value == null || value === "") continue;
    const trimmed = String(value).trim();
    if (trimmed) return trimmed;
  }
  return null;
}

// ── Domain sections configuration ──────────────────────────────────────────

const DOMAIN_SECTIONS: DomainSectionDef[] = [
  {
    id: "system-info",
    label: "System Info",
    icon: <Database size={13} />,
    tables: [
      { tableName: "UNIFIER_SYS_PROJECT_INFO", displayName: "Project Info (System)", defaultLimit: 50 },
    ],
  },
  {
    id: "team",
    label: "Team",
    icon: <Users size={13} />,
    tables: [
      { tableName: "UNIFIER_UXPT", displayName: "Project Team", defaultLimit: 100 },
    ],
  },
  {
    id: "schedule",
    label: "Schedule",
    icon: <Calendar size={13} />,
    tables: [
      { tableName: "UNIFIER_P6_ACTIVITY", displayName: "P6 Activities", defaultLimit: 200 },
    ],
  },
  {
    id: "contracts",
    label: "Contracts",
    icon: <FileText size={13} />,
    tables: [
      { tableName: "UNIFIER_UXUECON", displayName: "Contracts", defaultLimit: 100 },
      { tableName: "UNIFIER_UXUECON_LINEITEM", displayName: "Line Items", defaultLimit: 200 },
    ],
  },
  {
    id: "change-orders",
    label: "Change Orders",
    icon: <Activity size={13} />,
    tables: [
      { tableName: "UNIFIER_UXPCO", displayName: "Potential Change Orders", defaultLimit: 100 },
    ],
  },
  {
    id: "purchase-orders",
    label: "Purchase Orders",
    icon: <Package size={13} />,
    tables: [
      { tableName: "UNIFIER_UXUEPO", displayName: "General POs", defaultLimit: 100 },
    ],
  },
  {
    id: "budget",
    label: "Budget",
    icon: <BarChart2 size={13} />,
    tables: [
      { tableName: "UNIFIER_BUDGET", displayName: "Budgets", defaultLimit: 50 },
      { tableName: "UNIFIER_BUDGETITEM", displayName: "Budget Items", defaultLimit: 200 },
      { tableName: "UNIFIER_BUDGETROW", displayName: "Budget Rows", defaultLimit: 200 },
    ],
  },
  {
    id: "subcontractor-pos",
    label: "Subcontractor POs",
    icon: <DollarSign size={13} />,
    tables: [
      { tableName: "UNIFIER_UXPOS", displayName: "Purchase Orders", defaultLimit: 100 },
      { tableName: "UNIFIER_UXPOS_LINEITEM", displayName: "Line Items", defaultLimit: 200 },
    ],
  },
  {
    id: "pay-applications",
    label: "Pay Applications",
    icon: <DollarSign size={13} />,
    tables: [
      { tableName: "UNIFIER_UXSUM", displayName: "Pay Applications", defaultLimit: 100 },
      { tableName: "UNIFIER_UXSUM_LINEITEM", displayName: "Line Items", defaultLimit: 200 },
    ],
  },
  {
    id: "material-approvals",
    label: "Material Approvals",
    icon: <Layers size={13} />,
    tables: [
      { tableName: "UNIFIER_UXMA", displayName: "Material Approvals", defaultLimit: 100 },
      { tableName: "UNIFIER_UXMA_LINEITEM", displayName: "Line Items", defaultLimit: 200 },
    ],
  },
  {
    id: "shop-drawings",
    label: "Shop Drawings",
    icon: <FileText size={13} />,
    tables: [
      { tableName: "UNIFIER_UXBSDR", displayName: "Build SD Requests", defaultLimit: 100 },
      { tableName: "UNIFIER_UXFLSDR", displayName: "Flooring SD Requests", defaultLimit: 100 },
      { tableName: "UNIFIER_UXBREVP", displayName: "Build Reviews", defaultLimit: 100 },
      { tableName: "UNIFIER_UXFSDREV", displayName: "Floor Reviews", defaultLimit: 100 },
      { tableName: "UNIFIER_UXBREVP_LINEITEM", displayName: "Build Review Line Items", defaultLimit: 200 },
    ],
  },
  {
    id: "inspections",
    label: "Inspections",
    icon: <ClipboardCheck size={13} />,
    tables: [
      { tableName: "UNIFIER_UXTACIN", displayName: "Turn-Around Inspections", defaultLimit: 200 },
      { tableName: "UNIFIER_UXCLEARI", displayName: "Clearance Inspections", defaultLimit: 200 },
    ],
  },
  {
    id: "reporting",
    label: "Reporting",
    icon: <BarChart2 size={13} />,
    tables: [
      { tableName: "UNIFIER_UXPSR", displayName: "Status Reports", defaultLimit: 50 },
      { tableName: "UNIFIER_UXUEDR", displayName: "Daily Activity Reports", defaultLimit: 50 },
    ],
  },
  {
    id: "locations",
    label: "Locations",
    icon: <MapPin size={13} />,
    tables: [
      { tableName: "UNIFIER_UXLOC", displayName: "Locations", defaultLimit: 200 },
    ],
  },
  {
    id: "workflow",
    label: "Workflow",
    icon: <GitBranch size={13} />,
    tables: [
      { tableName: "UNIFIER_SYS_PROCESS", displayName: "Processes", defaultLimit: 100 },
      { tableName: "UNIFIER_SYS_TASK", displayName: "Tasks", defaultLimit: 100 },
    ],
  },
  {
    id: "build-shipping",
    label: "Build & Shipping",
    icon: <Truck size={13} />,
    tables: [
      { tableName: "UNIFIER_UXBLDSP", displayName: "Build Shipping", defaultLimit: 100 },
      { tableName: "UNIFIER_UXFLDVER", displayName: "Field Verification", defaultLimit: 100 },
      { tableName: "UNIFIER_UXWORKO", displayName: "Flooring POs", defaultLimit: 100 },
    ],
  },
  {
    id: "documents",
    label: "Documents",
    icon: <FileText size={13} />,
    tables: [
      { tableName: "BP_DM_FILE_VIEW", displayName: "Files", defaultLimit: 100 },
      { tableName: "BP_DM_NODE_VIEW", displayName: "Nodes", defaultLimit: 100 },
    ],
  },
];

// ── Shell status badge color helper ────────────────────────────────────────

function shellStatusStyle(status: string | null | undefined) {
  if (!status) return {};
  const s = String(status).toLowerCase();
  if (s.includes("active")) return { backgroundColor: "#dcfce7", color: "#15803d", border: "1px solid #bbf7d0" };
  if (s.includes("complet") || s.includes("close")) return { backgroundColor: "#f1f5f9", color: "#475569", border: "1px solid #cbd5e1" };
  if (s.includes("cancel")) return { backgroundColor: "#fee2e2", color: "#b91c1c", border: "1px solid #fecaca" };
  return { backgroundColor: "rgba(124,58,237,0.07)", color: "#7C3AED", border: "1px solid rgba(124,58,237,0.25)" };
}

// ── Mini data grid ─────────────────────────────────────────────────────────

const ROWS_PER_PAGE = 20;

interface MiniGridProps {
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
  mockMode?: boolean;
}

function MiniGrid({ columns, rows, total, mockMode }: MiniGridProps) {
  const [page, setPage] = useState(1);
  const [copiedCell, setCopiedCell] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalPages = Math.ceil(rows.length / ROWS_PER_PAGE);
  const pagedRows = rows.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);

  const copyCell = (val: string, key: string) => {
    navigator.clipboard.writeText(val).catch(() => {});
    setCopiedCell(key);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopiedCell(null), 1200);
  };

  if (mockMode) {
    return (
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, backgroundColor: "#fef3c7", border: "1px solid #fde68a", borderRadius: "var(--radius-sm)", padding: "var(--space-3)", color: "#92400e", fontSize: "var(--text-caption)", margin: "var(--space-2) 0" }}>
        <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1, color: "#d97706" }} />
        <span>
          <strong>Mock mode active</strong> — <code style={{ fontFamily: "ui-monospace, monospace" }}>UNIFIER_MOCK=true</code> is set. Set a valid <code style={{ fontFamily: "ui-monospace, monospace" }}>UNIFIER_PASSWORD</code> to see live data.
        </span>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p style={{ fontSize: "var(--text-caption)", color: "var(--neutral-400)", margin: "var(--space-2) 0", fontStyle: "italic" }}>
        No data for this project.
      </p>
    );
  }

  return (
    <div>
      {/* Row count + pagination */}
      <div className="flex items-center justify-between" style={{ marginBottom: "var(--space-2)" }}>
        <span style={{ fontSize: "var(--text-caption)", color: "var(--neutral-500)" }}>
          {rows.length.toLocaleString()} rows
          {rows.length < total ? ` of ${total.toLocaleString()} (limit reached)` : ""}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <span style={{ fontSize: 11, color: "var(--neutral-400)" }}>{page}/{totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              style={{ padding: "2px 6px", border: "1px solid var(--neutral-300)", borderRadius: "var(--radius-sm)", backgroundColor: "var(--neutral-0)", cursor: page <= 1 ? "not-allowed" : "pointer", opacity: page <= 1 ? 0.5 : 1, fontSize: 11 }}
              aria-label="Previous page"
            >
              ‹
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              style={{ padding: "2px 6px", border: "1px solid var(--neutral-300)", borderRadius: "var(--radius-sm)", backgroundColor: "var(--neutral-0)", cursor: page >= totalPages ? "not-allowed" : "pointer", opacity: page >= totalPages ? 0.5 : 1, fontSize: 11 }}
              aria-label="Next page"
            >
              ›
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div style={{ border: "1px solid var(--neutral-200)", borderRadius: "var(--radius-sm)", overflow: "auto", maxWidth: "100%", maxHeight: 360 }}>
        <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "collapse", fontSize: "var(--text-caption)" }}>
          <thead>
            <tr style={{ backgroundColor: "var(--neutral-100)" }}>
              {columns.map((col) => (
                <th
                  key={col}
                  style={{
                    padding: "5px var(--space-2)",
                    textAlign: "left",
                    fontWeight: 600,
                    color: "var(--neutral-700)",
                    borderBottom: "1px solid var(--neutral-200)",
                    whiteSpace: "nowrap",
                    minWidth: 80,
                    position: "sticky",
                    top: 0,
                    backgroundColor: "var(--neutral-100)",
                    fontSize: 11,
                    fontFamily: "ui-monospace, monospace",
                  }}
                >
                  {col}
                </th>
              ))}
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
                {columns.map((col) => {
                  const rawVal = row[col];
                  const isNull = rawVal == null;
                  const cellKey = `${i}-${col}`;
                  const isCopied = copiedCell === cellKey;
                  return (
                    <td
                      key={col}
                      style={{
                        padding: "4px var(--space-2)",
                        maxWidth: 200,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        color: isNull ? "var(--neutral-400)" : "var(--neutral-800)",
                        fontStyle: isNull ? "italic" : "normal",
                      }}
                    >
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
                          gap: 3,
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
                          {isNull ? "NULL" : truncate(rawVal)}
                        </span>
                        {isCopied ? (
                          <Check size={9} style={{ flexShrink: 0, color: "#16a34a" }} />
                        ) : !isNull ? (
                          <Copy size={8} className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ flexShrink: 0, color: "var(--neutral-400)" }} />
                        ) : null}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function UnifierProjectView({ onJumpToTable }: UnifierProjectViewProps) {
  // ── Project list state ──────────────────────────────────────────────────
  const [projects, setProjects] = useState<Record<string, unknown>[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [projectsFetched, setProjectsFetched] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");

  // ── Selected project ────────────────────────────────────────────────────
  const [selectedPid, setSelectedPid] = useState<string | null>(null);

  // ── Section state ───────────────────────────────────────────────────────
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [activeTabs, setActiveTabs] = useState<Record<string, string>>({});
  const [tableStates, setTableStates] = useState<Record<string, TableState>>({});
  const fetchedRef = useRef<Set<string>>(new Set());

  // ── Fetch project list ──────────────────────────────────────────────────
  const fetchProjects = useCallback(async () => {
    setProjectsLoading(true);
    setProjectsError(null);
    try {
      const params = new URLSearchParams({ table: "UNIFIER_US_XPRJ", limit: "200" });
      const res = await fetch(`/api/devtools/unifier-explore?${params}`, { credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
      setProjects((json as ExploreResponse).rows ?? []);
      setProjectsFetched(true);
    } catch (err) {
      setProjectsError(err instanceof Error ? err.message : String(err));
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  // Load projects on mount
  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // ── Fetch a single table for a project ─────────────────────────────────
  const fetchTableData = useCallback(async (tableName: string, pid: string, limit: number) => {
    const key = `${pid}::${tableName}`;
    if (fetchedRef.current.has(key)) return;
    fetchedRef.current.add(key);

    setTableStates((prev) => ({
      ...prev,
      [tableName]: { status: "loading", rows: [], columns: [], total: 0 },
    }));
    try {
      const params = new URLSearchParams({ table: tableName, limit: String(limit), projectId: pid });
      const res = await fetch(`/api/devtools/unifier-explore?${params}`, { credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
      const data = json as ExploreResponse;
      setTableStates((prev) => ({
        ...prev,
        [tableName]: {
          status: "loaded",
          rows: data.rows,
          columns: data.columns,
          total: data.total,
          mockMode: data.mockMode,
        },
      }));
    } catch (err) {
      // Allow retry on error by removing from fetched set
      fetchedRef.current.delete(key);
      setTableStates((prev) => ({
        ...prev,
        [tableName]: {
          status: "error",
          rows: [],
          columns: [],
          total: 0,
          error: err instanceof Error ? err.message : String(err),
        },
      }));
    }
  }, []);

  // ── Project selection ───────────────────────────────────────────────────
  const selectProject = useCallback((pid: string) => {
    if (pid === selectedPid) return;
    setSelectedPid(pid);
    setExpandedSections(new Set());
    setActiveTabs({});
    setTableStates({});
    fetchedRef.current.clear();
  }, [selectedPid]);

  // ── Section toggle ──────────────────────────────────────────────────────
  const toggleSection = useCallback((sectionId: string, section: DomainSectionDef, pid: string) => {
    const isExpanding = !expandedSections.has(sectionId);
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });

    if (isExpanding) {
      // Determine active tab — use existing or default to first
      const currentTab = activeTabs[sectionId] ?? section.tables[0]?.tableName;
      if (currentTab) {
        if (!activeTabs[sectionId]) {
          setActiveTabs((prev) => ({ ...prev, [sectionId]: currentTab }));
        }
        const tableDef = section.tables.find((t) => t.tableName === currentTab);
        fetchTableData(currentTab, pid, tableDef?.defaultLimit ?? 100);
      }
    }
  }, [expandedSections, activeTabs, fetchTableData]);

  // ── Sub-tab switch ──────────────────────────────────────────────────────
  const switchTab = useCallback((sectionId: string, tableDef: SectionTableDef, pid: string) => {
    setActiveTabs((prev) => ({ ...prev, [sectionId]: tableDef.tableName }));
    fetchTableData(tableDef.tableName, pid, tableDef.defaultLimit ?? 100);
  }, [fetchTableData]);

  // The project header shows team owner fields, so load the team table once per selected project.
  useEffect(() => {
    if (!selectedPid) return;
    fetchTableData("UNIFIER_UXPT", selectedPid, 100);
  }, [fetchTableData, selectedPid]);

  // ── Filtered project list ───────────────────────────────────────────────
  const filteredProjects = useMemo(() => {
    if (!projectSearch.trim()) return projects;
    const q = projectSearch.toLowerCase();
    return projects.filter((p) => {
      const name = String(p["UE_PRJ_PROJNAMESSN"] ?? "").toLowerCase();
      const num = String(p["UE_PRJ_PROJNUMSSN"] ?? "").toLowerCase();
      const pid = String(p["PID"] ?? "").toLowerCase();
      return name.includes(q) || num.includes(q) || pid.includes(q);
    });
  }, [projects, projectSearch]);

  // ── Selected project row ────────────────────────────────────────────────
  const selectedProject = useMemo(
    () => (selectedPid ? projects.find((p) => String(p["PID"]) === selectedPid) ?? null : null),
    [projects, selectedPid],
  );

  const selectedProjectTeamRows = tableStates["UNIFIER_UXPT"]?.status === "loaded"
    ? tableStates["UNIFIER_UXPT"].rows
    : [];
  const selectedProjectManagerName =
    firstNonEmpty(selectedProjectTeamRows, "CP_GEN_PROJMANAGER_NAME") ??
    (selectedProject?.["CP_GEN_PROJMANAGER_NAME"] ? String(selectedProject["CP_GEN_PROJMANAGER_NAME"]).trim() : null);
  const selectedInstallManagerName =
    firstNonEmpty(selectedProjectTeamRows, "CP_GEN_INSTALLMANAGER_NAME") ??
    (selectedProject?.["CP_GEN_INSTALLMANAGER_NAME"] ? String(selectedProject["CP_GEN_INSTALLMANAGER_NAME"]).trim() : null);

  // ── Computed section row counts for badge display ───────────────────────
  const getSectionBadge = (section: DomainSectionDef): string | null => {
    const firstTable = section.tables[0];
    if (!firstTable) return null;
    const state = tableStates[firstTable.tableName];
    if (!state || state.status === "idle" || state.status === "loading") return null;
    if (state.status === "error") return "!";
    const total = section.tables.reduce((sum, t) => {
      const s = tableStates[t.tableName];
      return sum + (s?.status === "loaded" ? s.rows.length : 0);
    }, 0);
    return total === 0 ? "0" : total.toLocaleString();
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-1 overflow-hidden">

      {/* ── Left sidebar: project list ── */}
      <div
        className="flex-shrink-0 flex flex-col"
        style={{ width: 240, borderRight: "1px solid var(--neutral-200)", backgroundColor: "var(--neutral-50)" }}
      >
        {/* Sidebar header */}
        <div style={{ padding: "var(--space-3)", borderBottom: "1px solid var(--neutral-200)", flexShrink: 0 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: "var(--space-2)" }}>
            <h3 style={{ fontSize: "var(--text-body)", fontWeight: 600, color: "var(--neutral-800)", margin: 0 }}>
              Projects
            </h3>
            <button
              onClick={fetchProjects}
              disabled={projectsLoading}
              title="Reload project list"
              style={{
                padding: 4,
                background: "none",
                border: "none",
                cursor: projectsLoading ? "not-allowed" : "pointer",
                color: "var(--neutral-400)",
                borderRadius: "var(--radius-sm)",
                opacity: projectsLoading ? 0.5 : 1,
              }}
              aria-label="Reload project list"
            >
              <RefreshCw size={12} className={projectsLoading ? "animate-spin" : ""} />
            </button>
          </div>
          <div style={{ position: "relative" }}>
            <Search size={12} style={{ position: "absolute", left: 7, top: "50%", transform: "translateY(-50%)", color: "var(--neutral-400)", pointerEvents: "none" }} />
            <input
              type="text"
              placeholder="Search projects…"
              value={projectSearch}
              onChange={(e) => setProjectSearch(e.target.value)}
              style={{ ...inputStyle, width: "100%", paddingLeft: 24, boxSizing: "border-box" }}
              aria-label="Search projects"
            />
          </div>
          {projectsFetched && !projectsLoading && (
            <p style={{ margin: "var(--space-2) 0 0", fontSize: 11, color: "var(--neutral-400)" }}>
              {filteredProjects.length} of {projects.length} projects
            </p>
          )}
        </div>

        {/* Project list */}
        <div className="flex-1 overflow-auto" style={{ padding: "var(--space-1)" }}>
          {projectsLoading ? (
            <div className="flex items-center gap-2" style={{ padding: "var(--space-4)", color: "var(--neutral-500)", fontSize: "var(--text-caption)" }}>
              <RefreshCw size={12} className="animate-spin" />
              Loading projects…
            </div>
          ) : projectsError ? (
            <div style={{ padding: "var(--space-3)", color: "var(--error-600)", fontSize: "var(--text-caption)" }}>
              <AlertCircle size={12} style={{ display: "inline", marginRight: 4 }} />
              {projectsError}
            </div>
          ) : filteredProjects.length === 0 ? (
            <p style={{ padding: "var(--space-3)", color: "var(--neutral-400)", fontSize: "var(--text-caption)", margin: 0 }}>
              {projectSearch ? "No projects match." : "No projects found."}
            </p>
          ) : (
            filteredProjects.map((p) => {
              const pid = String(p["PID"] ?? "");
              const name = String(p["UE_PRJ_PROJNAMESSN"] ?? "—");
              const num = String(p["UE_PRJ_PROJNUMSSN"] ?? "");
              const status = p["UUU_SHELL_STATUS"] ? String(p["UUU_SHELL_STATUS"]) : null;
              const isActive = selectedPid === pid;
              return (
                <button
                  key={pid}
                  onClick={() => selectProject(pid)}
                  className="w-full text-left transition-colors"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    padding: "var(--space-2)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "var(--text-caption)",
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
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: isActive ? 600 : 400 }}>
                    {name}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {num && (
                      <span style={{ fontSize: 10, fontFamily: "ui-monospace, monospace", color: isActive ? "rgba(124,58,237,0.7)" : "var(--neutral-400)" }}>
                        #{num}
                      </span>
                    )}
                    {status && (
                      <span style={{
                        fontSize: 9,
                        fontWeight: 700,
                        padding: "1px 5px",
                        borderRadius: 100,
                        whiteSpace: "nowrap",
                        textTransform: "uppercase",
                        letterSpacing: "0.02em",
                        ...shellStatusStyle(status),
                      }}>
                        {status}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: isActive ? "rgba(124,58,237,0.5)" : "var(--neutral-300)", fontFamily: "ui-monospace, monospace" }}>
                    PID: {pid}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedPid ? (
          /* Empty state */
          <div
            className="flex flex-col items-center justify-center gap-3"
            style={{ flex: 1, color: "var(--neutral-500)", fontSize: "var(--text-body)" }}
          >
            <Database size={40} style={{ opacity: 0.3 }} />
            <p style={{ margin: 0 }}>Select a project to explore its data</p>
            <p style={{ margin: 0, fontSize: "var(--text-caption)", color: "var(--neutral-400)", textAlign: "center", maxWidth: 300 }}>
              {projectsFetched
                ? `${projects.length} Unifier projects loaded. Choose one on the left.`
                : "Loading projects from Unifier…"}
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-auto">

            {/* ── Project header ── */}
            {selectedProject && (
              <div
                style={{
                  padding: "var(--space-4)",
                  borderBottom: "1px solid var(--neutral-200)",
                  backgroundColor: "rgba(124,58,237,0.03)",
                  flexShrink: 0,
                }}
              >
                {/* Title row */}
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 4 }}>
                      <h3 style={{ fontSize: "var(--text-body)", fontWeight: 700, color: "var(--neutral-800)", margin: 0 }}>
                        {String(selectedProject["UE_PRJ_PROJNAMESSN"] ?? "Unnamed Project")}
                      </h3>
                      {selectedProject["UUU_SHELL_STATUS"] != null && selectedProject["UUU_SHELL_STATUS"] !== "" && (
                        <span style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: 100,
                          textTransform: "uppercase",
                          letterSpacing: "0.03em",
                          ...shellStatusStyle(String(selectedProject["UUU_SHELL_STATUS"])),
                        }}>
                          {String(selectedProject["UUU_SHELL_STATUS"])}
                        </span>
                      )}
                    </div>
                    <p style={{ margin: 0, fontSize: "var(--text-caption)", fontFamily: "ui-monospace, monospace", color: "var(--neutral-500)" }}>
                      PID: {selectedPid}
                    </p>
                  </div>
                  <button
                    onClick={() => onJumpToTable("UNIFIER_US_XPRJ", selectedPid)}
                    title="Open in Table Explorer"
                    style={{
                      flexShrink: 0,
                      height: 26,
                      padding: "0 10px",
                      border: "1px solid rgba(124,58,237,0.3)",
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: "rgba(124,58,237,0.07)",
                      color: "#7C3AED",
                      fontSize: "var(--text-caption)",
                      fontWeight: 500,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <ExternalLink size={11} />
                    Table Explorer
                  </button>
                </div>

                {/* Key fields grid */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                    gap: "var(--space-2)",
                    marginTop: "var(--space-3)",
                  }}
                >
                  {[
                    { label: "Project Number", key: "UE_PRJ_PROJNUMSSN" },
                    { label: "Project Phase", key: "CP_PROJECT_PHASEPD" },
                    { label: "Stage", key: "CP_OP_STAGE_PD" },
                    { label: "Project Type", key: "CP_OP_PROJECTTYPE_PD" },
                    { label: "Project Manager", value: selectedProjectManagerName || "Unassigned" },
                    { label: "Install Manager", value: selectedInstallManagerName || "Unassigned" },
                    { label: "Client Name", key: "CP_CL_CLIENTNAME_TB50" },
                    { label: "Location", key: "UUU_LOCATION" },
                    { label: "State", key: "CP_GEN_STATE_PD" },
                    { label: "Field Due Date", key: "CP_OP_FDD_DOP" },
                    { label: "Project Track", key: "CP_OP_PROJECTTRACK_PD" },
                  ].map(({ label, key, value }) => {
                    const val = value ?? (key ? selectedProject[key] : null);
                    if (val == null || val === "") return null;
                    return (
                      <div key={key ?? label} style={{ fontSize: "var(--text-caption)" }}>
                        <div style={{ color: "var(--neutral-500)", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
                          {label}
                        </div>
                        <div style={{ color: "var(--neutral-800)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {truncate(val)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Domain sections accordion ── */}
            <div style={{ padding: "var(--space-3)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {DOMAIN_SECTIONS.map((section) => {
                const isExpanded = expandedSections.has(section.id);
                const activeTabName = activeTabs[section.id] ?? section.tables[0]?.tableName;
                const badge = getSectionBadge(section);
                const firstTableState = tableStates[section.tables[0]?.tableName ?? ""];
                const isLoading = firstTableState?.status === "loading" ||
                  section.tables.some((t) => tableStates[t.tableName]?.status === "loading");

                return (
                  <div
                    key={section.id}
                    style={{
                      border: "1px solid var(--neutral-200)",
                      borderRadius: "var(--radius-md)",
                      backgroundColor: "var(--neutral-0)",
                      overflow: "hidden",
                    }}
                  >
                    {/* Section header */}
                    <button
                      onClick={() => selectedPid && toggleSection(section.id, section, selectedPid)}
                      aria-expanded={isExpanded}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        width: "100%",
                        padding: "var(--space-2) var(--space-3)",
                        backgroundColor: isExpanded ? "rgba(124,58,237,0.04)" : "var(--neutral-0)",
                        border: "none",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "background-color 0.1s",
                      }}
                      onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.backgroundColor = "var(--neutral-50)"; }}
                      onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.backgroundColor = isExpanded ? "rgba(124,58,237,0.04)" : "var(--neutral-0)"; }}
                    >
                      <span style={{ color: "#7C3AED", flexShrink: 0 }}>{section.icon}</span>
                      <span style={{ fontSize: "var(--text-caption)", fontWeight: 600, color: "var(--neutral-800)", flex: 1 }}>
                        {section.label}
                      </span>
                      <span style={{ fontSize: 10, color: "var(--neutral-400)", fontFamily: "ui-monospace, monospace" }}>
                        {section.tables.map((t) => t.tableName).join(", ")}
                      </span>

                      {/* Loading spinner */}
                      {isLoading && (
                        <RefreshCw size={11} className="animate-spin" style={{ color: "#7C3AED", flexShrink: 0 }} />
                      )}

                      {/* Row count badge (shown after loading) */}
                      {badge !== null && !isLoading && (
                        <span style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "1px 6px",
                          borderRadius: 100,
                          backgroundColor: badge === "!" ? "#fee2e2" : badge === "0" ? "var(--neutral-100)" : "rgba(124,58,237,0.1)",
                          color: badge === "!" ? "#b91c1c" : badge === "0" ? "var(--neutral-400)" : "#7C3AED",
                          border: `1px solid ${badge === "!" ? "#fecaca" : badge === "0" ? "var(--neutral-200)" : "rgba(124,58,237,0.2)"}`,
                          flexShrink: 0,
                        }}>
                          {badge}
                        </span>
                      )}

                      {isExpanded
                        ? <ChevronDown size={13} style={{ color: "#7C3AED", flexShrink: 0 }} />
                        : <ChevronRight size={13} style={{ color: "var(--neutral-400)", flexShrink: 0 }} />
                      }
                    </button>

                    {/* Section body */}
                    {isExpanded && (
                      <div style={{ borderTop: "1px solid var(--neutral-100)", padding: "var(--space-3)" }}>

                        {/* Sub-tabs (only for multi-table sections) */}
                        {section.tables.length > 1 && (
                          <div
                            className="flex items-center gap-1 flex-wrap"
                            role="tablist"
                            aria-label={`${section.label} sub-tables`}
                            style={{ marginBottom: "var(--space-3)", borderBottom: "1px solid var(--neutral-200)", paddingBottom: "var(--space-2)" }}
                          >
                            {section.tables.map((tableDef) => {
                              const isActiveTab = activeTabName === tableDef.tableName;
                              const tabState = tableStates[tableDef.tableName];
                              const tabRowCount = tabState?.status === "loaded" ? tabState.rows.length : null;
                              return (
                                <button
                                  key={tableDef.tableName}
                                  role="tab"
                                  aria-selected={isActiveTab}
                                  onClick={() => selectedPid && switchTab(section.id, tableDef, selectedPid)}
                                  style={{
                                    height: 26,
                                    padding: "0 10px",
                                    border: `1px solid ${isActiveTab ? "#7C3AED" : "var(--neutral-200)"}`,
                                    borderRadius: "var(--radius-sm)",
                                    backgroundColor: isActiveTab ? "rgba(124,58,237,0.08)" : "var(--neutral-0)",
                                    color: isActiveTab ? "#7C3AED" : "var(--neutral-600)",
                                    fontSize: "var(--text-caption)",
                                    fontWeight: isActiveTab ? 600 : 400,
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 5,
                                  }}
                                >
                                  {tableDef.displayName}
                                  {tabState?.status === "loading" && (
                                    <RefreshCw size={9} className="animate-spin" />
                                  )}
                                  {tabRowCount !== null && (
                                    <span style={{
                                      fontSize: 9,
                                      padding: "1px 4px",
                                      borderRadius: 100,
                                      backgroundColor: isActiveTab ? "rgba(124,58,237,0.15)" : "var(--neutral-100)",
                                      color: isActiveTab ? "#7C3AED" : "var(--neutral-500)",
                                    }}>
                                      {tabRowCount}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Active table content */}
                        {(() => {
                          const activeTableDef = section.tables.find((t) => t.tableName === activeTabName) ?? section.tables[0];
                          if (!activeTableDef) return null;
                          const state = tableStates[activeTableDef.tableName];

                          if (!state || state.status === "idle") {
                            return (
                              <p style={{ fontSize: "var(--text-caption)", color: "var(--neutral-400)", margin: 0, fontStyle: "italic" }}>
                                Loading…
                              </p>
                            );
                          }

                          if (state.status === "loading") {
                            return (
                              <div className="flex items-center gap-2" style={{ padding: "var(--space-2) 0", color: "var(--neutral-500)", fontSize: "var(--text-caption)" }}>
                                <RefreshCw size={12} className="animate-spin" />
                                Fetching data from Unifier…
                              </div>
                            );
                          }

                          if (state.status === "error") {
                            return (
                              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "var(--space-3)", backgroundColor: "var(--error-50)", border: "1px solid var(--error-200)", borderRadius: "var(--radius-sm)", color: "var(--error-700)", fontSize: "var(--text-caption)" }}>
                                <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
                                <div style={{ flex: 1 }}>
                                  <strong>Error:</strong> {state.error}
                                  <button
                                    onClick={() => {
                                      if (!selectedPid) return;
                                      const key = `${selectedPid}::${activeTableDef.tableName}`;
                                      fetchedRef.current.delete(key);
                                      fetchTableData(activeTableDef.tableName, selectedPid, activeTableDef.defaultLimit ?? 100);
                                    }}
                                    style={{ marginLeft: 8, fontSize: "var(--text-caption)", color: "var(--error-600)", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}
                                  >
                                    Retry
                                  </button>
                                </div>
                              </div>
                            );
                          }

                          // Loaded
                          return (
                            <div>
                              <MiniGrid
                                columns={state.columns}
                                rows={state.rows}
                                total={state.total}
                                mockMode={state.mockMode}
                              />
                              {/* Jump to Table Explorer link */}
                              <button
                                onClick={() => selectedPid && onJumpToTable(activeTableDef.tableName, selectedPid)}
                                style={{
                                  marginTop: "var(--space-2)",
                                  fontSize: "var(--text-caption)",
                                  color: "#7C3AED",
                                  background: "none",
                                  border: "none",
                                  cursor: "pointer",
                                  padding: 0,
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 4,
                                  opacity: 0.8,
                                }}
                              >
                                <ExternalLink size={10} />
                                Open in Table Explorer (with filters, sorting, AI analysis)
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
