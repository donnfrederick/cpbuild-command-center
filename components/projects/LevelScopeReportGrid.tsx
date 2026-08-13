"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { LevelScopeUnitExpandRow } from "@/components/projects/LevelScopeUnitExpandRow";
import { BuildingStripeBadge } from "@/components/shared/BuildingStripeBadge";
import {
  buildLevelUnitExpandModel,
  maxTotalQtyForLevel,
  unitLabelsForLevelKey,
} from "@/lib/reports/level-scope-unit-groups";
import { resolveLevelUnitRows } from "@/lib/reports/synthesize-level-unit-details";
import {
  comparePeriodHeaderLines,
  comparePeriodShortLabel,
  defaultComparePeriod,
  type ComparePeriodState,
} from "@/lib/reports/portfolio-progress-period";
import type { LevelScopeCellData, LevelScopeReportData } from "@/lib/level-scope-report";
import { formatReportDate } from "@/lib/format-report-date";
import { buildingStripeForKey } from "@/lib/media/media-location-list";
import {
  formatLevelScopeBuildingHeaderLabel,
  levelScopeBuildingStripeCssVar,
} from "@/lib/reports/level-scope-building-display";
import { computeLevelScopeModalScrollTailPadding } from "@/lib/reports/level-scope-modal-scroll-tail";
import {
  pctFromQty,
  sumQtyForScope,
  sumQtyGrandTotal,
  sumUnitDeltaForScopeInLevels,
  verifiedDeltaForScopeInLevels,
} from "@/lib/reports/level-scope-qty";
import {
  formatPortfolioProgressDeltaPct,
  isPortfolioProgressPositiveDelta,
  portfolioProgressDeltaColor,
} from "@/lib/reports/portfolio-progress-display";

/** Heatmap pill colors — matches Level Progress Report modal (install-complete green scale). */
export function levelScopeHeatmap(pct: number): { bg: string; color: string } {
  if (pct === 0) return { bg: "var(--neutral-100)", color: "var(--neutral-400)" };
  if (pct < 25) return { bg: "var(--success-50)", color: "var(--success-600)" };
  if (pct < 50) return { bg: "var(--success-100)", color: "var(--success-600)" };
  if (pct < 75) return { bg: "var(--success-300)", color: "var(--success-700)" };
  if (pct < 100) return { bg: "var(--success-500)", color: "var(--neutral-0)" };
  return { bg: "var(--success-600)", color: "var(--neutral-0)" };
}

/** Roomier column widths — this is a full report, not a compact widget. */
const ROW_HEIGHT = 40;
const GRID_GAP = 6;
const LEVEL_COL = 108;
const SCOPE_COL = 112;
const PCT_COL = 112;
const PCT_COL_WITH_UNITS = 120;
const DELTA_COL = 104;
const DATE_COL = 92;
const OVERALL_COL = 120;
const DIVIDER_COL = 20;

function Pill({ pct, bold = false, cell = true }: { pct: number; bold?: boolean; cell?: boolean }) {
  const { bg, color } = levelScopeHeatmap(pct);
  return (
    <div
      className="level-scope-pill"
      style={{
        backgroundColor: pct === 0 ? "var(--neutral-100)" : bg,
      }}
    >
      {cell ? (
        <span
          style={{
            fontSize: bold ? 13 : 12,
            fontWeight: bold ? 800 : 700,
            fontVariantNumeric: "tabular-nums",
            color: pct === 0 ? "var(--neutral-400)" : color,
          }}
        >
          {pct}%
        </span>
      ) : (
        <span style={{ color: "var(--neutral-400)", fontSize: 12 }}>—</span>
      )}
    </div>
  );
}

function reportHasUnitCounts(report: LevelScopeReportData): boolean {
  for (const lk of report.levels) {
    const row = report.data[lk];
    if (!row) continue;
    for (const scope of report.scopes) {
      if ((row[scope]?.totalQty ?? 0) > 0) return true;
    }
  }
  return false;
}

function sumQtyForLevel(
  lk: string,
  scopes: string[],
  data: LevelScopeReportData["data"],
  levelOverallUnits?: LevelScopeReportData["levelOverallUnits"],
): { installedQty: number; totalQty: number } {
  if (levelOverallUnits?.[lk]) {
    return levelOverallUnits[lk];
  }
  let installedQty = 0;
  let totalQty = 0;
  for (const scope of scopes) {
    const cell = data[lk]?.[scope];
    if (!cell || cell.totalQty <= 0) continue;
    installedQty += cell.installedQty;
    totalQty += cell.totalQty;
  }
  return { installedQty, totalQty };
}

function TruncatedUnitCount({
  installedQty,
  totalQty,
  unitsTitle,
}: {
  installedQty: number;
  totalQty: number;
  unitsTitle: string;
}) {
  const displayText = `${installedQty}/${totalQty}`;
  const tooltipText = unitsTitle.trim() || displayText;
  const textRef = useRef<HTMLSpanElement>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches,
  );
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);

  const checkTruncation = useCallback(() => {
    const el = textRef.current;
    if (!el) return;
    setIsTruncated(el.scrollWidth > el.clientWidth);
  }, []);

  useLayoutEffect(() => {
    checkTruncation();
  }, [displayText, checkTruncation]);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    if (typeof ResizeObserver === "undefined") {
      checkTruncation();
      return;
    }
    const ro = new ResizeObserver(() => checkTruncation());
    ro.observe(el);
    return () => ro.disconnect();
  }, [checkTruncation]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = () => setIsMobile(mq.matches);
    handler();
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const closeTooltip = useCallback(() => {
    setTooltipPos(null);
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!tooltipPos) return;
    const dismiss = () => closeTooltip();
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [tooltipPos, closeTooltip]);

  const openTooltip = useCallback((autoDismiss: boolean) => {
    const el = textRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setTooltipPos({ top: rect.top, left: rect.left + rect.width / 2 });
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = null;
    if (autoDismiss) {
      dismissTimerRef.current = setTimeout(() => {
        setTooltipPos(null);
        dismissTimerRef.current = null;
      }, 3000);
    }
  }, []);

  const handleMouseEnter = () => {
    checkTruncation();
    if (!isMobile) openTooltip(false);
  };

  const handleMouseLeave = () => {
    if (!isMobile) closeTooltip();
  };

  const handleClick = () => {
    if (!isMobile) return;
    if (tooltipPos) {
      closeTooltip();
    } else {
      openTooltip(true);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (!isMobile) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleClick();
    }
  };

  return (
    <span className="level-scope-units-wrap">
      <span
        ref={textRef}
        className="level-scope-units"
        aria-label={isTruncated ? tooltipText : undefined}
        role={isMobile && isTruncated ? "button" : undefined}
        tabIndex={isMobile && isTruncated ? 0 : undefined}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        {displayText}
      </span>
      {tooltipPos &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            role="tooltip"
            className="level-scope-units-tooltip"
            style={{ top: tooltipPos.top, left: tooltipPos.left }}
          >
            {tooltipText}
          </span>,
          document.body,
        )}
    </span>
  );
}

function PctWithUnits({
  pct,
  installedQty,
  totalQty,
  bold = false,
  cell = true,
  showUnits,
  unitsTitle,
}: {
  pct: number;
  installedQty: number;
  totalQty: number;
  bold?: boolean;
  cell?: boolean;
  showUnits: boolean;
  unitsTitle: string;
}) {
  const showCount = showUnits && cell && totalQty > 0;
  return (
    <div className="level-scope-pct-cell">
      <Pill pct={pct} bold={bold} cell={cell} />
      {showCount ? (
        <TruncatedUnitCount
          installedQty={installedQty}
          totalQty={totalQty}
          unitsTitle={unitsTitle}
        />
      ) : (
        <span className="level-scope-units" aria-hidden />
      )}
    </div>
  );
}

type ScopeColumnKind = "pct" | "delta" | "start" | "lastUpdated" | "end";

function scopeBandClass(scopeIndex: number): string {
  return `level-scope-band--${scopeIndex % 2}`;
}

function dataCellClass(
  scopeIndex: number | undefined,
  kind?: ScopeColumnKind,
  opts?: { left?: boolean; scopeEnd?: boolean },
): string {
  const parts = ["level-scope-cell"];
  if (opts?.left) parts.push("level-scope-cell--left");
  if (opts?.scopeEnd) parts.push("level-scope-cell--scope-end");
  if (scopeIndex !== undefined && kind) {
    parts.push(scopeBandClass(scopeIndex));
  }
  return parts.join(" ");
}

function headCellClass(
  scopeIndex: number | undefined,
  kind: ScopeColumnKind | "scope" | "level" | "overall" | "building",
  opts?: { left?: boolean; scopeEnd?: boolean },
): string {
  const parts = ["level-scope-head"];
  if (kind === "building") {
    parts.push("level-scope-head--left");
    parts.push("level-scope-head--building");
    return parts.join(" ");
  }
  if (kind === "level") {
    parts.push("level-scope-head--left");
    parts.push("level-scope-head--level");
    return parts.join(" ");
  }
  if (kind === "overall") {
    parts.push("level-scope-head--left");
    parts.push("level-scope-head--pct");
    return parts.join(" ");
  }
  if (kind === "scope") {
    parts.push("level-scope-head--scope");
    if (scopeIndex !== undefined) parts.push(scopeBandClass(scopeIndex));
    if (opts?.scopeEnd) parts.push("level-scope-cell--scope-end");
    return parts.join(" ");
  }
  parts.push(`level-scope-head--${kind}`);
  if (scopeIndex !== undefined) parts.push(scopeBandClass(scopeIndex));
  if (opts?.scopeEnd) parts.push("level-scope-cell--scope-end");
  return parts.join(" ");
}

function GridCell({
  children,
  scopeIndex,
  kind,
  left,
  scopeEnd,
}: {
  children: ReactNode;
  scopeIndex?: number;
  kind?: ScopeColumnKind;
  left?: boolean;
  scopeEnd?: boolean;
}) {
  return (
    <div className={dataCellClass(scopeIndex, kind, { left, scopeEnd })} style={{ height: ROW_HEIGHT }}>
      {children}
    </div>
  );
}

function LevelLabel({ children }: { children: ReactNode }) {
  return (
    <span
      className="level-scope-level-label"
      style={{
        fontSize: 13,
        fontWeight: 600,
        color: "var(--neutral-700)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {children}
    </span>
  );
}

function handleExpandableRowKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  onToggle: () => void,
): void {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onToggle();
  }
}

function DeltaCell({
  delta,
  unitDelta,
  title,
  unitTitle,
  unitsInlineLabel,
}: {
  delta: number | null | undefined;
  unitDelta?: number | null;
  title: string;
  unitTitle?: (count: number) => string;
  /** e.g. "(6 units)" — locations verified complete this period. */
  unitsInlineLabel?: (count: number) => string;
}) {
  const pctLabel = formatPortfolioProgressDeltaPct(delta);
  const unitCount =
    unitDelta !== null && unitDelta !== undefined ? Math.abs(unitDelta) : 0;
  const showUnits =
    isPortfolioProgressPositiveDelta(delta) &&
    unitCount > 0 &&
    unitsInlineLabel !== undefined;

  return (
    <span
      title={
        showUnits && unitTitle
          ? `${title} — ${unitTitle(unitCount)}`
          : title
      }
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 3,
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: portfolioProgressDeltaColor(delta),
        }}
      >
        {pctLabel}
      </span>
      {showUnits && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 500,
            color: "var(--neutral-600)",
          }}
        >
          {unitsInlineLabel(unitCount)}
        </span>
      )}
    </span>
  );
}

function DateCell({
  iso,
  locale,
  title,
}: {
  iso: string | null | undefined;
  locale: string;
  title: string;
}) {
  return (
    <span
      title={title}
      style={{
        fontSize: 12,
        fontWeight: 500,
        fontVariantNumeric: "tabular-nums",
        color: iso ? "var(--neutral-700)" : "var(--neutral-400)",
        whiteSpace: "nowrap",
      }}
    >
      {formatReportDate(iso, locale)}
    </span>
  );
}

function ScopeDataCells({
  cell,
  locale,
  startedLabel,
  lastUpdatedLabel,
  completedLabel,
  changeLabel,
  unitChangeLabel,
  unitsInlineLabel,
  unitCountLabel,
  showDelta,
  showUnits,
  isLastScope,
  scopeIndex,
}: {
  cell: LevelScopeCellData | undefined;
  locale: string;
  startedLabel: string;
  lastUpdatedLabel: string;
  completedLabel: string;
  changeLabel: string;
  unitChangeLabel: (count: number) => string;
  unitsInlineLabel: (count: number) => string;
  unitCountLabel: (installed: number, total: number) => string;
  showDelta: boolean;
  showUnits: boolean;
  isLastScope: boolean;
  scopeIndex: number;
}) {
  const hasCell = !!cell;
  const pct = cell?.pct ?? 0;
  const installedQty = cell?.installedQty ?? 0;
  const totalQty = cell?.totalQty ?? 0;

  return (
    <>
      <GridCell scopeIndex={scopeIndex} kind="pct">
        <PctWithUnits
          pct={pct}
          installedQty={installedQty}
          totalQty={totalQty}
          cell={hasCell}
          showUnits={showUnits}
          unitsTitle={unitCountLabel(installedQty, totalQty)}
        />
      </GridCell>
      {showDelta && (
        <GridCell scopeIndex={scopeIndex} kind="delta">
          {hasCell ? (
            <DeltaCell
              delta={cell.verifiedDelta}
              unitDelta={cell.verifiedUnitDelta}
              title={changeLabel}
              unitTitle={unitChangeLabel}
              unitsInlineLabel={unitsInlineLabel}
            />
          ) : (
            <span style={{ color: "var(--neutral-400)", fontSize: 12 }}>—</span>
          )}
        </GridCell>
      )}
      <GridCell scopeIndex={scopeIndex} kind="start">
        {hasCell ? (
          <DateCell iso={cell.startedOn} locale={locale} title={startedLabel} />
        ) : (
          <span style={{ color: "var(--neutral-400)", fontSize: 12 }}>—</span>
        )}
      </GridCell>
      <GridCell scopeIndex={scopeIndex} kind="lastUpdated">
        {hasCell ? (
          <DateCell iso={cell.lastUpdatedOn} locale={locale} title={lastUpdatedLabel} />
        ) : (
          <span style={{ color: "var(--neutral-400)", fontSize: 12 }}>—</span>
        )}
      </GridCell>
      <GridCell scopeIndex={scopeIndex} kind="end" scopeEnd={!isLastScope}>
        {hasCell ? (
          // Only show finish date when the level×scope is currently 100% verified complete
          <DateCell iso={pct >= 100 ? cell.completedOn : null} locale={locale} title={completedLabel} />
        ) : (
          <span style={{ color: "var(--neutral-400)", fontSize: 12 }}>—</span>
        )}
      </GridCell>
    </>
  );
}

function Divider() {
  return <div className="level-scope-scope-divider" style={{ height: ROW_HEIGHT }} />;
}

function DeltaColumnHeader({
  timeframe,
  dates,
  title,
}: {
  timeframe: string;
  dates: string | null;
  title: string;
}) {
  return (
    <div className="level-scope-head-delta-stack" title={title}>
      <span className="level-scope-head-delta-timeframe">{timeframe}</span>
      {dates && <span className="level-scope-head-delta-period">{dates}</span>}
    </div>
  );
}

export interface LevelScopeReportGridProps {
  report: LevelScopeReportData;
  showGrandTotal?: boolean;
  /** Optional action on the grand-total row (e.g. Open locations link). */
  grandTotalAction?: ReactNode;
  /** Per-scope % + start + end columns (default: true when any cell has dates). */
  showScopeDates?: boolean;
  /** Per-scope Δ column for compare-period change (default: true when any cell has verifiedDelta). */
  showScopeDeltas?: boolean;
  /** Show installed/total unit count beside % (default: true when any cell has totalQty > 0). */
  showUnitCounts?: boolean;
  /** Short compare window beside Δ headers (e.g. "wk of 5/27–6/2"). Defaults to current 1-week window. */
  deltaPeriodLabel?: string;
  /** When set, drives the two-line Δ column header (preset label + date range). */
  comparePeriod?: ComparePeriodState;
  /** Drill-down rows for unit × scope on a level (off by default — level summary only). */
  enableLevelUnitExpand?: boolean;
  /** `modal` uses a split scroll frame; omits the scope-header spacer stripe in modal layout. */
  scrollContext?: "page" | "modal";
}

function reportHasScopeDates(report: LevelScopeReportData): boolean {
  for (const lk of report.levels) {
    const row = report.data[lk];
    if (!row) continue;
    for (const scope of report.scopes) {
      const cell = row[scope];
      if (cell?.startedOn || cell?.completedOn) return true;
    }
  }
  return false;
}

function reportHasScopeDeltas(report: LevelScopeReportData): boolean {
  if (report.overallDeltaByScope) {
    for (const delta of Object.values(report.overallDeltaByScope)) {
      if (delta !== null && delta !== undefined) return true;
    }
  }
  for (const lk of report.levels) {
    const row = report.data[lk];
    if (!row) continue;
    for (const scope of report.scopes) {
      const delta = row[scope]?.verifiedDelta;
      if (delta !== null && delta !== undefined) return true;
    }
  }
  return false;
}

function scopeHeaderBandColumn(sIdx: number, scopeSpan: number): string {
  const start = 2 + sIdx * scopeSpan;
  return `${start} / span ${scopeSpan}`;
}

function scopeDividerColumn(scopesCount: number, scopeSpan: number): number {
  return 2 + scopesCount * scopeSpan;
}

function scopeOverallColumn(scopesCount: number, scopeSpan: number): number {
  return 3 + scopesCount * scopeSpan;
}

function colsPerScope(withDates: boolean, withDeltas: boolean): number {
  if (!withDates) return 1;
  return withDeltas ? 5 : 4;
}

function pctColWidth(withUnits: boolean): number {
  return withUnits ? PCT_COL_WITH_UNITS : PCT_COL;
}

function scopeColumnsTemplate(
  scopes: string[],
  withDates: boolean,
  withDeltas: boolean,
  withUnits: boolean,
): string {
  if (!withDates) {
    const w = withUnits ? PCT_COL_WITH_UNITS : SCOPE_COL;
    return `${LEVEL_COL}px repeat(${scopes.length}, ${w}px) ${DIVIDER_COL}px ${OVERALL_COL}px`;
  }
  const pctW = pctColWidth(withUnits);
  const perScope = scopes
    .map(() => {
      const parts = [`${pctW}px`];
      if (withDeltas) parts.push(`${DELTA_COL}px`);
      parts.push(`${DATE_COL}px`, `${DATE_COL}px`, `${DATE_COL}px`);
      return parts.join(" ");
    })
    .join(" ");
  return `${LEVEL_COL}px ${perScope} ${DIVIDER_COL}px ${OVERALL_COL}px`;
}

function gridMinWidth(
  scopes: string[],
  withDates: boolean,
  withDeltas: boolean,
  withUnits: boolean,
): number {
  const perScopeCols = colsPerScope(withDates, withDeltas);
  const colCount = 1 + scopes.length * perScopeCols + 2;
  const pctW = withDates ? pctColWidth(withUnits) : withUnits ? PCT_COL_WITH_UNITS : SCOPE_COL;
  const colSum = withDates
    ? LEVEL_COL +
      scopes.length * (pctW + (withDeltas ? DELTA_COL : 0) + DATE_COL + DATE_COL + DATE_COL) +
      DIVIDER_COL +
      OVERALL_COL
    : LEVEL_COL + scopes.length * pctW + DIVIDER_COL + OVERALL_COL;
  return colSum + (colCount - 1) * GRID_GAP;
}

/**
 * Install-complete % grid by building, level, and scope — shared by the project
 * Level Progress Report modal and portfolio report expand view.
 */
export function LevelScopeReportGrid({
  report,
  showGrandTotal = false,
  grandTotalAction,
  showScopeDates: showScopeDatesProp,
  showScopeDeltas: showScopeDeltasProp,
  showUnitCounts: showUnitCountsProp,
  deltaPeriodLabel: deltaPeriodLabelProp,
  comparePeriod: comparePeriodProp,
  enableLevelUnitExpand = true,
  scrollContext = "page",
}: LevelScopeReportGridProps) {
  const locale = useLocale();
  const t = useTranslations("levelScopeReport");
  const comparePeriod = comparePeriodProp ?? defaultComparePeriod();
  const headerLabels = useMemo(
    () => ({
      weekOf: t("deltaCompareWeekOf"),
      preset2w: t("period2w"),
      preset30d: t("period30d"),
      presetAll: t("periodAll"),
      presetCustom: t("periodCustom"),
      shortCustom: t("periodShortCustom"),
    }),
    [t],
  );
  const defaultDeltaPeriodLabel = useMemo(
    () =>
      comparePeriodShortLabel(
        comparePeriod,
        {
          formatWeekOf: (range) => t("periodWeekOf", { range }),
          shortAll: t("periodShortAll"),
          shortCustom: t("periodShortCustom"),
        },
        locale,
      ),
    [comparePeriod, locale, t],
  );
  const deltaPeriodLabel = deltaPeriodLabelProp ?? defaultDeltaPeriodLabel;
  const deltaChangeTitle = t("deltaChangeWithPeriod", { period: deltaPeriodLabel });
  const deltaHeader = useMemo(
    () => comparePeriodHeaderLines(comparePeriod, headerLabels, locale),
    [comparePeriod, headerLabels, locale],
  );
  const {
    levels,
    scopes,
    data,
    overallByLevel,
    overallByScope,
    overallDeltaByScope,
    overallUnitDeltaByScope,
    grandTotalPct,
    buildings,
    levelToBuilding,
    levelUnitDetails,
    levelOverallUnits,
  } = report;

  const [expandedLevelKeys, setExpandedLevelKeys] = useState<Set<string>>(() => new Set());
  const modalFrameRef = useRef<HTMLDivElement>(null);
  const modalFooterRef = useRef<HTMLDivElement>(null);
  const lastBuildingSectionRef = useRef<HTMLDivElement>(null);
  const [modalScrollTailPadding, setModalScrollTailPadding] = useState(0);

  const toggleLevelExpanded = useCallback((levelKey: string) => {
    setExpandedLevelKeys((prev) => {
      const next = new Set(prev);
      if (next.has(levelKey)) next.delete(levelKey);
      else next.add(levelKey);
      return next;
    });
  }, []);

  const showScopeDates = showScopeDatesProp ?? reportHasScopeDates(report);
  const showScopeDeltas =
    showScopeDates && (showScopeDeltasProp ?? reportHasScopeDeltas(report));
  const showUnitCounts = showUnitCountsProp ?? reportHasUnitCounts(report);
  const modalScroll = scrollContext === "modal";

  const syncModalScrollTailPadding = useCallback(() => {
    if (!modalScroll) {
      setModalScrollTailPadding(0);
      return;
    }
    const frame = modalFrameRef.current;
    const lastSection = lastBuildingSectionRef.current;
    const footer = modalFooterRef.current;
    if (!frame || !lastSection) {
      setModalScrollTailPadding(0);
      return;
    }
    const head = lastSection.querySelector(".level-scope-building-sticky-head");
    const levelsEl = lastSection.querySelector(".level-scope-building-levels");
    setModalScrollTailPadding(
      computeLevelScopeModalScrollTailPadding(
        frame.clientHeight,
        head?.getBoundingClientRect().height ?? 0,
        levelsEl?.getBoundingClientRect().height ?? 0,
        footer?.getBoundingClientRect().height ?? 0,
      ),
    );
  }, [modalScroll]);

  useLayoutEffect(() => {
    if (!modalScroll) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- measures DOM after layout; ResizeObserver reuses the same sync
    syncModalScrollTailPadding();
    if (typeof ResizeObserver === "undefined") return;

    const frame = modalFrameRef.current;
    const lastSection = lastBuildingSectionRef.current;
    const footer = modalFooterRef.current;
    if (!frame || !lastSection) return;

    const ro = new ResizeObserver(() => syncModalScrollTailPadding());
    ro.observe(frame);
    ro.observe(lastSection);
    if (footer) ro.observe(footer);
    return () => ro.disconnect();
  }, [
    modalScroll,
    syncModalScrollTailPadding,
    buildings.length,
    levels.length,
    expandedLevelKeys,
    showScopeDates,
    showScopeDeltas,
    showUnitCounts,
  ]);

  if (levels.length === 0 || scopes.length === 0) {
    return null;
  }

  const scopeSpan = colsPerScope(showScopeDates, showScopeDeltas);
  const gridCols = scopeColumnsTemplate(scopes, showScopeDates, showScopeDeltas, showUnitCounts);
  const minWidth = gridMinWidth(scopes, showScopeDates, showScopeDeltas, showUnitCounts);
  const noChangeLabel = t("noChange");
  const levelUnitExpandEnabled =
    enableLevelUnitExpand && levelUnitDetails !== undefined && showScopeDates;

  return (
    <div
      className={modalScroll ? "level-scope-grid level-scope-grid--modal" : "level-scope-grid"}
    >
      {showGrandTotal && (
        <div className="level-scope-grid-sticky-overall-rail" aria-hidden={false}>
          <div className="level-scope-grid-grand-total-summary">
            <span className="level-scope-grid-grand-total-label">{t("overall")}</span>
            <span
              className="level-scope-overall-badge"
              style={{
                color: grandTotalPct > 0 ? "var(--success-600)" : "var(--neutral-300)",
              }}
            >
              {grandTotalPct}%
            </span>
          </div>
        </div>
      )}
      {grandTotalAction ? (
        <div className="level-scope-grid-grand-total-action">{grandTotalAction}</div>
      ) : null}
      <div ref={modalScroll ? modalFrameRef : undefined} className={modalScroll ? "level-scope-grid-modal-frame" : undefined}>
        <div
          style={{ minWidth }}
          className={modalScroll ? "level-scope-grid-modal-frame-inner" : undefined}
        >
          <div className={modalScroll ? "level-scope-grid-modal-rows-scroll" : undefined}>
        {buildings.map((building, bIdx) => {
          const buildingLevels = levels.filter((lk) => levelToBuilding[lk] === building);
          const buildingStripe = buildingStripeForKey(building, buildings);
          const buildingBadgeLabel = formatLevelScopeBuildingHeaderLabel(building);
          return (
            <div
              key={building}
              ref={bIdx === buildings.length - 1 ? lastBuildingSectionRef : undefined}
              className="level-scope-building-section level-scope-building-section--divided"
              style={{
                ...levelScopeBuildingStripeCssVar(buildingStripe),
                marginBottom: bIdx < buildings.length - 1 ? 12 : 0,
                paddingBottom:
                  modalScroll && bIdx === buildings.length - 1 ? modalScrollTailPadding : undefined,
              }}
            >
              <div className="level-scope-building-sticky-head">
                {showScopeDates ? (
                  <div
                    className="level-scope-building-header-grid"
                    style={{
                      display: "grid",
                      gridTemplateColumns: gridCols,
                      gridTemplateRows: "auto auto",
                      gap: GRID_GAP,
                      marginBottom: 8,
                    }}
                  >
                    <div
                      className={`${headCellClass(undefined, "building")} level-scope-building-header-anchor`}
                      style={{
                        gridRow: "1 / 3",
                        gridColumn: 1,
                        ...levelScopeBuildingStripeCssVar(buildingStripe),
                      }}
                    >
                      <BuildingStripeBadge
                        label={buildingBadgeLabel}
                        buildingStripe={buildingStripe}
                        iconSize={11}
                        truncateLabel={false}
                        className="level-scope-building-badge level-scope-building-badge--header"
                      />
                    </div>
                    {scopes.map((scope, sIdx) => (
                      <div
                        key={scope}
                        className={headCellClass(sIdx, "scope", {
                          scopeEnd: sIdx < scopes.length - 1,
                        })}
                        style={{ gridRow: 1, gridColumn: scopeHeaderBandColumn(sIdx, scopeSpan) }}
                      >
                        {scope}
                      </div>
                    ))}
                    <div
                      aria-hidden
                      style={{ gridRow: 1, gridColumn: scopeDividerColumn(scopes.length, scopeSpan) }}
                    />
                    <div
                      aria-hidden
                      style={{ gridRow: 1, gridColumn: scopeOverallColumn(scopes.length, scopeSpan) }}
                    />
                    {scopes.map((scope, sIdx) => {
                      const baseCol = 2 + sIdx * scopeSpan;
                      let col = baseCol;
                      return (
                        <Fragment key={`${scope}-sub`}>
                          <div
                            className={headCellClass(sIdx, "pct")}
                            style={{ gridRow: 2, gridColumn: col++ }}
                          >
                            {t("colPct")}
                          </div>
                          {showScopeDeltas && (
                            <div
                              className={headCellClass(sIdx, "delta")}
                              style={{ gridRow: 2, gridColumn: col++ }}
                            >
                              <DeltaColumnHeader
                                timeframe={deltaHeader.timeframe}
                                dates={deltaHeader.dates}
                                title={deltaChangeTitle}
                              />
                            </div>
                          )}
                          <div
                            className={headCellClass(sIdx, "start")}
                            style={{ gridRow: 2, gridColumn: col++ }}
                          >
                            {t("colStart")}
                          </div>
                          <div
                            className={headCellClass(sIdx, "lastUpdated")}
                            style={{ gridRow: 2, gridColumn: col++ }}
                          >
                            {t("colLastUpdated")}
                          </div>
                          <div
                            className={headCellClass(sIdx, "end", {
                              scopeEnd: sIdx < scopes.length - 1,
                            })}
                            style={{ gridRow: 2, gridColumn: col++ }}
                          >
                            {t("colEnd")}
                          </div>
                        </Fragment>
                      );
                    })}
                    <div
                      aria-hidden
                      style={{ gridRow: 2, gridColumn: scopeDividerColumn(scopes.length, scopeSpan) }}
                    />
                    <div
                      className={headCellClass(undefined, "overall")}
                      style={{ gridRow: 2, gridColumn: scopeOverallColumn(scopes.length, scopeSpan) }}
                    >
                      {t("overall")}
                    </div>
                  </div>
                ) : (
                  <div
                    className="level-scope-building-header-row level-scope-building-header-row--columns"
                    style={{
                      display: "grid",
                      gridTemplateColumns: gridCols,
                      gap: GRID_GAP,
                      marginBottom: 8,
                    }}
                  >
                    <div className={headCellClass(undefined, "building")}>
                      <BuildingStripeBadge
                        label={buildingBadgeLabel}
                        buildingStripe={buildingStripe}
                        iconSize={11}
                        truncateLabel={false}
                        className="level-scope-building-badge level-scope-building-badge--header"
                      />
                    </div>
                    {scopes.map((scope, sIdx) => (
                      <div key={scope} className={headCellClass(sIdx, "scope")}>
                        {scope}
                      </div>
                    ))}
                    <div aria-hidden />
                    <div className={headCellClass(undefined, "overall")}>{t("overall")}</div>
                  </div>
                )}
              </div>

              <div className="level-scope-building-levels">
                {buildingLevels.map((lk) => {
                  const overallPct = overallByLevel[lk] ?? 0;
                  const levelQty = sumQtyForLevel(lk, scopes, data, levelOverallUnits);
                  const levelLabel = lk.includes(" › ") ? lk.split(" › ")[1] : lk;
                  const unitRows = resolveLevelUnitRows(lk, scopes, data[lk], levelUnitDetails?.[lk]);
                  const levelTotalQty =
                    levelOverallUnits[lk]?.totalQty ?? maxTotalQtyForLevel(lk, scopes, data);
                  const canExpandLevel = levelUnitExpandEnabled && levelTotalQty > 0;
                  const levelExpanded = expandedLevelKeys.has(lk);
                  const expandModel =
                    levelExpanded && canExpandLevel
                      ? buildLevelUnitExpandModel(
                          unitRows,
                          scopes,
                          unitLabelsForLevelKey(lk, levelTotalQty),
                        )
                      : null;
                  return (
                    <div key={lk} className="level-scope-level-block">
                    <div
                      className={[
                        "level-scope-grid-row",
                        canExpandLevel ? "level-scope-grid-row--expandable" : "",
                        levelExpanded ? "level-scope-grid-row--expanded" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      role={canExpandLevel ? "button" : undefined}
                      tabIndex={canExpandLevel ? 0 : undefined}
                      aria-expanded={canExpandLevel ? levelExpanded : undefined}
                      aria-label={
                        canExpandLevel
                          ? `${levelExpanded ? t("collapseLevel") : t("expandLevel")}: ${levelLabel}`
                          : undefined
                      }
                      onClick={canExpandLevel ? () => toggleLevelExpanded(lk) : undefined}
                      onKeyDown={
                        canExpandLevel
                          ? (event) => handleExpandableRowKeyDown(event, () => toggleLevelExpanded(lk))
                          : undefined
                      }
                      style={{
                        display: "grid",
                        gridTemplateColumns: gridCols,
                        gap: GRID_GAP,
                        alignItems: "center",
                      }}
                    >
                      <GridCell left>
                        <LevelLabel>{levelLabel}</LevelLabel>
                      </GridCell>
                      {showScopeDates ? (
                        scopes.map((scope, sIdx) => (
                          <ScopeDataCells
                            key={scope}
                            scopeIndex={sIdx}
                            cell={data[lk]?.[scope]}
                            locale={locale}
                            startedLabel={t("dateStarted")}
                            lastUpdatedLabel={t("dateLastUpdated")}
                            completedLabel={t("dateCompleted")}
                            changeLabel={deltaChangeTitle}
                            unitChangeLabel={(count) => t("deltaUnitCount", { count })}
                            unitsInlineLabel={(count) => t("deltaUnitsInline", { count })}
                            unitCountLabel={(installed, total) =>
                              t("unitCount", { installed, total })
                            }
                            showDelta={showScopeDeltas}
                            showUnits={showUnitCounts}
                            isLastScope={sIdx === scopes.length - 1}
                          />
                        ))
                      ) : (
                        scopes.map((scope, sIdx) => {
                          const cell = data[lk]?.[scope];
                          return (
                            <GridCell key={scope} scopeIndex={sIdx} kind="pct">
                              <PctWithUnits
                                pct={cell?.pct ?? 0}
                                installedQty={cell?.installedQty ?? 0}
                                totalQty={cell?.totalQty ?? 0}
                                cell={!!cell}
                                showUnits={showUnitCounts}
                                unitsTitle={t("unitCount", {
                                  installed: cell?.installedQty ?? 0,
                                  total: cell?.totalQty ?? 0,
                                })}
                              />
                            </GridCell>
                          );
                        })
                      )}
                      <Divider />
                      <GridCell>
                        <PctWithUnits
                          pct={overallPct}
                          installedQty={levelQty.installedQty}
                          totalQty={levelQty.totalQty}
                          bold
                          cell={levelQty.totalQty > 0}
                          showUnits={showUnitCounts}
                          unitsTitle={t("unitCount", {
                            installed: levelQty.installedQty,
                            total: levelQty.totalQty,
                          })}
                        />
                      </GridCell>
                    </div>
                    {levelExpanded && expandModel && showScopeDates && (
                      <LevelScopeUnitExpandRow
                        gridCols={gridCols}
                        scopes={scopes}
                        showScopeDeltas={showScopeDeltas}
                        model={expandModel}
                        noChangeLabel={noChangeLabel}
                      />
                    )}
                    </div>
                  );
                })}
                {(() => {
                  if (buildings.length <= 1) return null;
                  const buildingQty = sumQtyGrandTotal(
                    buildingLevels,
                    scopes,
                    data,
                    levelOverallUnits,
                  );
                  const buildingOverallPct = pctFromQty(
                    buildingQty.installedQty,
                    buildingQty.totalQty,
                  );
                  return (
                    <div className="level-scope-grid-row level-scope-grid-row--building-total">
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: gridCols,
                          gap: GRID_GAP,
                          alignItems: "center",
                        }}
                      >
                        <GridCell left>
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color: "var(--neutral-600)",
                            }}
                          >
                            {t("buildingTotal")}
                          </span>
                        </GridCell>
                        {showScopeDates ? (
                          scopes.map((scope, sIdx) => {
                            const scopeQty = sumQtyForScope(scope, buildingLevels, data);
                            const scopePct = pctFromQty(scopeQty.installedQty, scopeQty.totalQty);
                            return (
                              <Fragment key={`${building}-total-${scope}`}>
                                <GridCell scopeIndex={sIdx} kind="pct">
                                  <PctWithUnits
                                    pct={scopePct}
                                    installedQty={scopeQty.installedQty}
                                    totalQty={scopeQty.totalQty}
                                    bold
                                    cell={scopeQty.totalQty > 0}
                                    showUnits={showUnitCounts}
                                    unitsTitle={t("unitCount", {
                                      installed: scopeQty.installedQty,
                                      total: scopeQty.totalQty,
                                    })}
                                  />
                                </GridCell>
                                {showScopeDeltas && (
                                  <GridCell scopeIndex={sIdx} kind="delta">
                                    <DeltaCell
                                      delta={verifiedDeltaForScopeInLevels(scope, buildingLevels, data)}
                                      unitDelta={sumUnitDeltaForScopeInLevels(scope, buildingLevels, data)}
                                      title={deltaChangeTitle}
                                      unitTitle={(count) => t("deltaUnitCount", { count })}
                                      unitsInlineLabel={(count) => t("deltaUnitsInline", { count })}
                                    />
                                  </GridCell>
                                )}
                                <GridCell scopeIndex={sIdx} kind="start">
                                  <span style={{ color: "var(--neutral-300)", fontSize: 12 }}>—</span>
                                </GridCell>
                                <GridCell scopeIndex={sIdx} kind="lastUpdated">
                                  <span style={{ color: "var(--neutral-300)", fontSize: 12 }}>—</span>
                                </GridCell>
                                <GridCell
                                  scopeIndex={sIdx}
                                  kind="end"
                                  scopeEnd={sIdx < scopes.length - 1}
                                >
                                  <span style={{ color: "var(--neutral-300)", fontSize: 12 }}>—</span>
                                </GridCell>
                              </Fragment>
                            );
                          })
                        ) : (
                          scopes.map((scope, sIdx) => {
                            const scopeQty = sumQtyForScope(scope, buildingLevels, data);
                            const scopePct = pctFromQty(scopeQty.installedQty, scopeQty.totalQty);
                            return (
                              <GridCell key={`${building}-total-${scope}`} scopeIndex={sIdx} kind="pct">
                                <PctWithUnits
                                  pct={scopePct}
                                  installedQty={scopeQty.installedQty}
                                  totalQty={scopeQty.totalQty}
                                  bold
                                  cell={scopeQty.totalQty > 0}
                                  showUnits={showUnitCounts}
                                  unitsTitle={t("unitCount", {
                                    installed: scopeQty.installedQty,
                                    total: scopeQty.totalQty,
                                  })}
                                />
                              </GridCell>
                            );
                          })
                        )}
                        <Divider />
                        <GridCell>
                          <PctWithUnits
                            pct={buildingOverallPct}
                            installedQty={buildingQty.installedQty}
                            totalQty={buildingQty.totalQty}
                            bold
                            cell={buildingQty.totalQty > 0}
                            showUnits={showUnitCounts}
                            unitsTitle={t("unitCount", {
                              installed: buildingQty.installedQty,
                              total: buildingQty.totalQty,
                            })}
                          />
                        </GridCell>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          );
        })}

        <div
          ref={modalScroll ? modalFooterRef : undefined}
          className={
            modalScroll
              ? "level-scope-grid-row level-scope-grid-row--footer level-scope-grid-modal-footer"
              : "level-scope-grid-row level-scope-grid-row--footer"
          }
        >
          <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: GRID_GAP, alignItems: "center" }}>
            <GridCell left>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--neutral-600)" }}>{t("allLevels")}</span>
            </GridCell>
            {showScopeDates ? (
              scopes.map((scope, sIdx) => {
                const scopeQty = sumQtyForScope(scope, levels, data);
                return (
                <Fragment key={`all-${scope}`}>
                  <GridCell scopeIndex={sIdx} kind="pct">
                    <PctWithUnits
                      pct={overallByScope[scope] ?? 0}
                      installedQty={scopeQty.installedQty}
                      totalQty={scopeQty.totalQty}
                      bold
                      cell={scopeQty.totalQty > 0}
                      showUnits={showUnitCounts}
                      unitsTitle={t("unitCount", {
                        installed: scopeQty.installedQty,
                        total: scopeQty.totalQty,
                      })}
                    />
                  </GridCell>
                  {showScopeDeltas && (
                    <GridCell scopeIndex={sIdx} kind="delta">
                      <DeltaCell
                        delta={overallDeltaByScope?.[scope]}
                        unitDelta={overallUnitDeltaByScope?.[scope]}
                        title={deltaChangeTitle}
                        unitTitle={(count) => t("deltaUnitCount", { count })}
                        unitsInlineLabel={(count) => t("deltaUnitsInline", { count })}
                      />
                    </GridCell>
                  )}
                  <GridCell scopeIndex={sIdx} kind="start">
                    <span style={{ color: "var(--neutral-300)", fontSize: 12 }}>—</span>
                  </GridCell>
                  <GridCell scopeIndex={sIdx} kind="lastUpdated">
                    <span style={{ color: "var(--neutral-300)", fontSize: 12 }}>—</span>
                  </GridCell>
                  <GridCell scopeIndex={sIdx} kind="end" scopeEnd={sIdx < scopes.length - 1}>
                    <span style={{ color: "var(--neutral-300)", fontSize: 12 }}>—</span>
                  </GridCell>
                </Fragment>
              );
              })
            ) : (
              scopes.map((scope, sIdx) => {
                const scopeQty = sumQtyForScope(scope, levels, data);
                return (
                  <GridCell key={scope} scopeIndex={sIdx} kind="pct">
                    <PctWithUnits
                      pct={overallByScope[scope] ?? 0}
                      installedQty={scopeQty.installedQty}
                      totalQty={scopeQty.totalQty}
                      bold
                      cell={scopeQty.totalQty > 0}
                      showUnits={showUnitCounts}
                      unitsTitle={t("unitCount", {
                        installed: scopeQty.installedQty,
                        total: scopeQty.totalQty,
                      })}
                    />
                  </GridCell>
                );
              })
            )}
            <Divider />
            <GridCell>
              {(() => {
                let installedQty = 0;
                let totalQty = 0;
                for (const lk of levels) {
                  const q = sumQtyForLevel(lk, scopes, data, levelOverallUnits);
                  installedQty += q.installedQty;
                  totalQty += q.totalQty;
                }
                return (
                  <PctWithUnits
                    pct={grandTotalPct}
                    installedQty={installedQty}
                    totalQty={totalQty}
                    bold
                    cell={totalQty > 0}
                    showUnits={showUnitCounts}
                    unitsTitle={t("unitCount", { installed: installedQty, total: totalQty })}
                  />
                );
              })()}
            </GridCell>
          </div>
        </div>
          </div>
      </div>
      </div>
    </div>
  );
}
