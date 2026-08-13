"use client";

/**
 * DevToolsPanel
 *
 * Right-anchored panel opened via the AccountMenu "Dev Tools" row or the
 * mobile bottom nav Dev tab. Contains multiple tabs for design tokens,
 * schema diffing, server logs, debugger, release checklists, and more.
 *
 * Development tool only — not part of the application UI.
 */

import { useState, useEffect, useCallback, useRef, Component, type ErrorInfo, type ReactNode } from "react";
import { SlidersHorizontal, Palette, X, Table2, Terminal, Bug, ClipboardList, RefreshCw, Sparkles, CheckSquare, FlaskConical, Clapperboard, Network, Map, AlertTriangle, Database } from "lucide-react";
import { DesignSystemTabContent } from "./DesignSystemTabContent";
import { DataVisualizer } from "./DataVisualizer";
import { TestPlanVisualizer } from "./TestPlanVisualizer";
import { ServerLogs } from "./ServerLogs";
import { FrontendDebugger } from "./FrontendDebugger";
import { UnifierExplorerPanel } from "./UnifierExplorerPanel";
import { TestRunner } from "./TestRunner";
import { ErrorWrapUp } from "./ErrorWrapUp";
import { ReleaseChecklist } from "./ReleaseChecklist";
import { ReleaseTourBuilder } from "./ReleaseTourBuilder";
import { SiteTourInspector } from "./SiteTourInspector";
import { TestDataSeedPanel } from "./TestDataSeedPanel";
import { DevToolsProvider } from "./DevToolsContext";

// ── Persisted crash storage ───────────────────────────────────────────────────
const CRASH_KEY = "devtools-last-crash";
interface PersistedCrash { message: string; stack: string; tab: string; ts: number }

function saveTabCrash(tabId: string, error: Error) {
  try {
    const entry: PersistedCrash = {
      message: error.message,
      stack: error.stack ?? "",
      tab: tabId,
      ts: Date.now(),
    };
    localStorage.setItem(CRASH_KEY, JSON.stringify(entry));
  } catch { /* localStorage unavailable */ }
}

function loadTabCrash(): PersistedCrash | null {
  try {
    const raw = localStorage.getItem(CRASH_KEY);
    return raw ? (JSON.parse(raw) as PersistedCrash) : null;
  } catch { return null; }
}

function clearTabCrash() {
  try { localStorage.removeItem(CRASH_KEY); } catch { /* ignore */ }
}

// ── Error boundary for individual tab content ─────────────────────────────────
// Catches render errors in any tab component. Persists the error to localStorage
// so it survives navigation (the panel unmounting) and is still readable next
// time DevTools is opened.
interface TabErrorState { error: Error | null }
class TabErrorBoundary extends Component<{ children: ReactNode; activeTab: string; onReset: () => void; onCrash: (c: PersistedCrash) => void }, TabErrorState> {
  state: TabErrorState = { error: null };
  static getDerivedStateFromError(error: Error): TabErrorState { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    // Persist so the message survives any navigation that unmounts the panel.
    saveTabCrash(this.props.activeTab, error);
    // Also update parent state immediately so the banner shows without page reload.
    const crash = loadTabCrash();
    if (crash) this.props.onCrash(crash);
    console.error("[DevTools tab crash]", error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#dc2626" }}>
            <AlertTriangle size={16} />
            <strong style={{ fontSize: 13 }}>Tab crashed — error saved, reopen DevTools to review</strong>
          </div>
          <pre style={{ margin: 0, padding: "12px 14px", borderRadius: 6, backgroundColor: "#fef2f2", border: "1px solid #fecaca", fontSize: 11, color: "#7f1d1d", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 300, overflowY: "auto", width: "100%", boxSizing: "border-box" }}>
            {this.state.error.message}
            {"\n\n"}
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => { clearTabCrash(); this.setState({ error: null }); this.props.onReset(); }}
            style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #dc2626", backgroundColor: "#fff", color: "#dc2626", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            Dismiss &amp; reset tab
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

type Tab = "design-system" | "data" | "unifier-explorer" | "test-plan" | "test-runner" | "server-logs" | "debugger" | "error-wrap-up" | "release-checklist" | "release-tour-builder" | "site-tour-inspector" | "test-data-seed";

const ALL_TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "design-system",      label: "Design System",      icon: <Palette size={14} /> },
  { id: "data",               label: "Data",               icon: <Table2 size={14} /> },
  { id: "unifier-explorer",  label: "Unifier Explorer",   icon: <Network size={14} /> },
  { id: "test-plan",          label: "Test Plan",          icon: <ClipboardList size={14} /> },
  { id: "test-runner",        label: "Test Runner",        icon: <RefreshCw size={14} /> },
  { id: "server-logs",        label: "Server Logs",        icon: <Terminal size={14} /> },
  { id: "debugger",           label: "Debugger",           icon: <Bug size={14} /> },
  { id: "error-wrap-up",      label: "Error Wrap-Up",      icon: <Sparkles size={14} /> },
  { id: "release-checklist",  label: "Release Checklist",  icon: <CheckSquare size={14} /> },
  { id: "release-tour-builder", label: "Tour Builder",     icon: <Clapperboard size={14} /> },
  { id: "site-tour-inspector",  label: "Site Tour",        icon: <Map size={14} /> },
  { id: "test-data-seed",       label: "Test Data Seed",   icon: <Database size={14} /> },
];

// Tabs that contribute to the error badge
const ERROR_TABS: Tab[] = ["server-logs", "debugger", "test-runner"];

/**
 * Tabs that only function in local development (npm run dev).
 * They are hidden in any deployed environment (Railway dev or prod) because they:
 *   design-system — aesthetic token editor, no persistent effect on deployed builds
 *   test-runner   — spawns child_process; Railway blocks it explicitly
 *   test-plan     — reads coverage/ filesystem artifacts that don't exist on Railway
 *
 * Note: release-checklist is intentionally NOT in this set — it works in all environments.
 */
const DEPLOYED_HIDDEN_TABS = new Set<Tab>(["design-system", "test-runner", "test-plan"]);

interface DevToolsPanelProps {
  /**
   * The APP_ENV value from the server (e.g. "dev", "production").
   * Undefined means local development — all tabs are shown.
   */
  appEnv?: string;
}

export function DevToolsPanel({ appEnv }: DevToolsPanelProps) {
  // Local = no APP_ENV set (plain `npm run dev`). Show every tab.
  // Deployed = any APP_ENV value (Railway dev, Railway prod). Hide local-only tabs.
  const isLocal = !appEnv;
  const TABS = isLocal ? ALL_TABS : ALL_TABS.filter((t) => !DEPLOYED_HIDDEN_TABS.has(t.id));
  const defaultTab: Tab = isLocal ? "design-system" : "debugger";
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);
  // Crash banner: load any persisted crash from localStorage on mount so the
  // error survives navigation that unmounts the panel before it can be read.
  const [savedCrash, setSavedCrash] = useState<PersistedCrash | null>(null);
  useEffect(() => {
    const crash = loadTabCrash();
    if (crash) setSavedCrash(crash);
  }, []);
  // If the active tab is not available in the current environment (e.g. persisted
  // "design-system" from local dev, now opened in a deployed build), fall back to debugger.
  const effectiveTab: Tab = TABS.some((t) => t.id === activeTab) ? activeTab : "debugger";

  // Unseen error counts per tab (reset when that tab is viewed)
  const [unseenCounts, setUnseenCounts] = useState<Record<Tab, number>>({
    "design-system": 0,
    "data": 0,
    "unifier-explorer": 0,
    "test-plan": 0,
    "test-runner": 0,
    "server-logs": 0,
    "debugger": 0,
    "error-wrap-up": 0,
    "release-checklist": 0,
    "release-tour-builder": 0,
    "site-tour-inspector": 0,
    "test-data-seed": 0,
  });

  // Sandbox mode — when active, MSW intercepts all API calls so nothing is saved to the real DB
  const [sandboxMode, setSandboxMode] = useState(false);

  // Total badge shown on the floating button
  const totalUnseen = ERROR_TABS.reduce((sum, t) => sum + (unseenCounts[t] ?? 0), 0);

  // Listen for error events dispatched by ServerLogs and FrontendDebugger
  const handleNewError = useCallback(
    (event: Event) => {
      const { count = 1 } = (event as CustomEvent<{ count: number }>).detail ?? {};
      // Determine which tab the event came from via a second custom detail field,
      // fallback: attribute to whichever error-producing tab is NOT active.
      const fromTab: Tab =
        (event as CustomEvent<{ tab?: Tab }>).detail?.tab ??
        (effectiveTab === "server-logs" ? "debugger" : effectiveTab === "debugger" ? "server-logs" : "debugger");

      // Only increment the badge if the panel is closed or the tab is not active
      const shouldCount = !isOpen || effectiveTab !== fromTab;
      if (shouldCount) {
        setUnseenCounts((prev) => ({
          ...prev,
          [fromTab]: (prev[fromTab] ?? 0) + count,
        }));
      }
    },
    [isOpen, effectiveTab]
  );

  useEffect(() => {
    window.addEventListener("devtools:new-error", handleNewError);
    return () => window.removeEventListener("devtools:new-error", handleNewError);
  }, [handleNewError]);

  // Open panel from profile dropdown (dispatched by AccountMenu / TopBar)
  useEffect(() => {
    function onOpen() { handleOpenPanel(); }
    window.addEventListener("devtools:open", onOpen);
    return () => window.removeEventListener("devtools:open", onOpen);
  // handleOpenPanel is stable across renders (no deps that change), safe to omit
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear unseen count for the active tab when switching to it
  const handleTabSwitch = (tab: Tab) => {
    setActiveTab(tab);
    setUnseenCounts((prev) => ({ ...prev, [tab]: 0 }));
  };

  // Clear all unseen counts when opening the panel
  const handleOpenPanel = () => {
    setIsOpen(true);
    setUnseenCounts((prev) => ({ ...prev, [effectiveTab]: 0 }));
  };

  // ── Panel width — resizable, persisted ────────────────────────────────────
  const PANEL_WIDTH_KEY = "devtools:panel-width";
  const PANEL_MIN = 340;
  const PANEL_MAX = 1400;
  const PANEL_DEFAULT = PANEL_MAX;

  const [panelWidth, setPanelWidth] = useState<number>(() => {
    try { return parseInt(localStorage.getItem(PANEL_WIDTH_KEY) ?? String(PANEL_DEFAULT), 10) || PANEL_DEFAULT; }
    catch { return PANEL_DEFAULT; }
  });

  const resizeDragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizeDragRef.current = { startX: e.clientX, startWidth: panelWidth };

    function onMove(ev: MouseEvent) {
      if (!resizeDragRef.current) return;
      // Panel is right-anchored: dragging left → larger width
      const delta = resizeDragRef.current.startX - ev.clientX;
      const next = Math.min(PANEL_MAX, Math.max(PANEL_MIN, resizeDragRef.current.startWidth + delta));
      setPanelWidth(next);
    }
    function onUp() {
      resizeDragRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [panelWidth]);

  // Persist final width after drag ends
  useEffect(() => {
    if (!resizeDragRef.current) {
      try { localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidth)); }
      catch { /* ignore */ }
    }
  }, [panelWidth]);

  const currentTab = TABS.find((t) => t.id === effectiveTab)!;

  return (
    <>
      {/* ── Panel (overlay or docked rail) ── */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setIsOpen(false)}
            onWheel={(e) => {
              if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
                e.preventDefault();
              }
            }}
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              zIndex: 10000,
            }}
            aria-hidden="true"
          />

          {/* Panel */}
          <div
            className="flex flex-col"
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              width: `${panelWidth}px`,
              maxWidth: "100vw",
              height: "100vh",
              backgroundColor: "var(--neutral-0)",
              zIndex: 10001,
              boxShadow: "-4px 0 24px rgba(0, 0, 0, 0.18)",
            }}
            role="dialog"
            aria-label="Dev Tools Panel"
            onWheel={(e) => {
              // Prevent horizontal wheel events anywhere inside the panel from
              // triggering the macOS Chrome swipe-to-navigate browser gesture.
              // We only suppress deltaX-dominant events so vertical scrolling
              // in tab content areas is unaffected.
              if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
                e.preventDefault();
              }
            }}
          >
            {/* ── Resize handle (drag left edge) ── */}
            <div
              onMouseDown={onResizeStart}
              title="Drag to resize panel"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: 5,
                height: "100%",
                cursor: "col-resize",
                zIndex: 1,
                backgroundColor: "transparent",
                transition: "background-color 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(124,58,237,0.35)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            />
            {/* ── Panel header ── */}
            <header
              className="flex-shrink-0"
              style={{
                backgroundColor: "var(--dev-purple)",
                color: "#FFFFFF",
                borderBottom: "1px solid rgba(255,255,255,0.15)",
              }}
            >
              {/* Title row */}
              <div
                className="flex items-center justify-between"
                style={{ padding: "0 var(--space-6)", height: "64px" }}
              >
                <div className="flex items-center gap-3">
                  <SlidersHorizontal size={22} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    <h2 style={{ fontSize: "var(--text-subheading)", fontWeight: "var(--font-weight-semibold)", lineHeight: 1.2, margin: 0 }}>
                      Dev Tools
                    </h2>
                    <p style={{ fontSize: "var(--text-caption)", opacity: 0.85, lineHeight: 1.3, margin: 0 }}>
                      {currentTab.label} — Dev-only tool
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {/* Close button */}
                  <button
                    onClick={() => setIsOpen(false)}
                    className="transition-colors duration-150"
                    style={{
                      width: "var(--button-height)",
                      height: "var(--button-height)",
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: "rgba(255,255,255,0.15)",
                      color: "#FFFFFF",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.3)")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.15)")}
                    aria-label="Close dev tools"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Tab bar — always horizontally scrollable so no tabs are hidden */}
              <div
                role="tablist"
                aria-label="DevTools tabs"
                onWheel={(e) => {
                  // Stop the wheel event from reaching the panel container's handler.
                  // This lets the tab bar scroll normally; overscrollBehaviorX:contain
                  // below prevents the overscroll from chaining to browser navigation.
                  e.stopPropagation();
                }}
                style={{
                  display: "flex",
                  paddingLeft: "var(--space-6)",
                  gap: "var(--space-2)",
                  overflowX: "auto",
                  scrollbarWidth: "none",
                  overscrollBehaviorX: "contain",
                }}
              >
                {TABS.map((tab) => {
                  const isActive = tab.id === effectiveTab;
                  const tabUnseen = unseenCounts[tab.id] ?? 0;

                  return (
                    <button
                      key={tab.id}
                      id={`devtools-tab-${tab.id}`}
                      onClick={() => handleTabSwitch(tab.id)}
                      className="flex items-center gap-2.5 transition-all duration-150"
                      style={{
                        padding: "var(--space-2) var(--space-6)",
                        borderRadius: "var(--radius-sm) var(--radius-sm) 0 0",
                        backgroundColor: isActive ? "var(--neutral-0)" : "rgba(255,255,255,0.1)",
                        color: isActive ? "var(--dev-purple)" : "rgba(255,255,255,0.85)",
                        fontSize: "var(--text-body)",
                        fontWeight: isActive ? "var(--font-weight-semibold)" : "var(--font-weight-medium)",
                        border: "none",
                        cursor: "pointer",
                        borderBottom: isActive ? "2px solid var(--neutral-0)" : "2px solid transparent",
                        marginBottom: "-1px",
                        position: "relative",
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.2)";
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)";
                      }}
                      aria-selected={isActive}
                      role="tab"
                    >
                      {tab.icon}
                      {tab.label}

                      {/* Per-tab unseen error badge */}
                      {tabUnseen > 0 && (
                        <span
                          style={{
                            minWidth: 16,
                            height: 16,
                            borderRadius: 8,
                            backgroundColor: "#dc2626",
                            color: "#fff",
                            fontSize: 10,
                            fontWeight: 700,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "0 4px",
                            lineHeight: 1,
                          }}
                        >
                          {tabUnseen > 99 ? "99+" : tabUnseen}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </header>

            {/* ── Sandbox mode banner ── */}
            {sandboxMode && (
              <div
                style={{
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "var(--space-3)",
                  padding: "6px var(--space-6)",
                  backgroundColor: "#fef3c7",
                  borderBottom: "1px solid #fde68a",
                  color: "#92400e",
                  fontSize: "var(--text-caption)",
                  fontWeight: 600,
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <FlaskConical size={13} />
                  Sandbox mode active — API calls are mocked. Nothing will be saved.
                </span>
                <button
                  onClick={() => setSandboxMode(false)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#92400e",
                    cursor: "pointer",
                    fontSize: "var(--text-caption)",
                    fontWeight: 600,
                    padding: 0,
                    textDecoration: "underline",
                  }}
                >
                  Disable
                </button>
              </div>
            )}

            {/* ── Crash banner — shows the last persisted tab crash so it survives navigation ── */}
            {savedCrash && (
              <div
                style={{
                  flexShrink: 0,
                  padding: "10px 16px",
                  backgroundColor: "#fef2f2",
                  borderBottom: "1px solid #fecaca",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#dc2626" }}>
                    <AlertTriangle size={14} />
                    <strong style={{ fontSize: 12 }}>
                      Last crash ({savedCrash.tab} tab) — {new Date(savedCrash.ts).toLocaleTimeString()}
                    </strong>
                  </div>
                  <button
                    onClick={() => { clearTabCrash(); setSavedCrash(null); }}
                    style={{ fontSize: 11, color: "#dc2626", background: "none", cursor: "pointer", padding: "2px 6px", borderRadius: 4, border: "1px solid #fecaca" }}
                  >
                    Dismiss
                  </button>
                </div>
                <pre
                  style={{ margin: 0, fontSize: 10.5, color: "#7f1d1d", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 120, overflowY: "auto", userSelect: "text", cursor: "text" }}
                >
                  {savedCrash.message}
                  {savedCrash.stack ? `\n\n${savedCrash.stack}` : ""}
                </pre>
              </div>
            )}

            {/* ── Tab content ── */}
            <DevToolsProvider>
              <TabErrorBoundary activeTab={effectiveTab} onReset={() => handleTabSwitch(effectiveTab)} onCrash={setSavedCrash}>
              <div className="flex flex-1 overflow-hidden" role="tabpanel" aria-labelledby={`devtools-tab-${effectiveTab}`}>
                {effectiveTab === "design-system"    && <DesignSystemTabContent />}
                {effectiveTab === "data"             && <DataVisualizer />}
                {effectiveTab === "unifier-explorer" && <UnifierExplorerPanel />}
                {effectiveTab === "test-plan"        && <TestPlanVisualizer />}
                {effectiveTab === "test-runner"      && <TestRunner />}
                {effectiveTab === "server-logs"      && <ServerLogs />}
                {effectiveTab === "debugger"         && <FrontendDebugger />}
                {effectiveTab === "error-wrap-up"    && <ErrorWrapUp />}
                {effectiveTab === "release-checklist" && (
                  <ReleaseChecklist
                    appEnv={appEnv}
                    onClose={() => setIsOpen(false)}
                    sandboxMode={sandboxMode}
                    onSandboxToggle={setSandboxMode}
                  />
                )}
                {effectiveTab === "release-tour-builder" && <ReleaseTourBuilder />}
                {effectiveTab === "site-tour-inspector"  && <SiteTourInspector onClose={() => setIsOpen(false)} />}
                {effectiveTab === "test-data-seed"       && <TestDataSeedPanel />}
              </div>
              </TabErrorBoundary>
            </DevToolsProvider>
          </div>
        </>
      )}
    </>
  );
}
