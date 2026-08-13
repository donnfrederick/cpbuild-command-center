"use client";

import { useState } from "react";
import { BadgeCheck, BarChart3, ChevronDown, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import type { OverviewStats, ScopeStats } from "@/lib/overview-stats";
import { PROJECT_HUB_CARD_STYLE, ProjectHubCardHeader } from "@/components/projects/ProjectHubCardHeader";

// ─── Shared card style ────────────────────────────────────────────────────────

const card: React.CSSProperties = PROJECT_HUB_CARD_STYLE;

// ─── Hero: Overall % Install Complete ────────────────────────────────────────

const sectionLabel: React.CSSProperties = {
  margin: "0 0 8px",
  fontSize: 10,
  fontWeight: 700,
  color: "var(--neutral-400)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

function HeroCard({
  title,
  pct,
  installCompleteEntries,
  totalScopes,
}: {
  title: string;
  pct: number;
  installCompleteEntries: number;
  totalScopes: number;
}) {
  return (
    <div style={card}>
      <ProjectHubCardHeader icon={BadgeCheck} title={title} />
      <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
        <span
          style={{
            fontSize: 64,
            fontWeight: 800,
            color: "var(--neutral-900)",
            lineHeight: 1,
            flexShrink: 0,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {pct}%
        </span>
        <div style={{ flex: "1 1 200px", minWidth: 0 }}>
          <div style={{ height: 14, borderRadius: 7, backgroundColor: "var(--neutral-100)", overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${pct}%`,
                borderRadius: 7,
                transition: "width 0.6s ease",
                backgroundColor: pct === 0 ? "transparent" : "#16a34a",
              }}
            />
          </div>
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--neutral-500)" }}>
            {installCompleteEntries.toLocaleString()} of {totalScopes.toLocaleString()} scopes verified
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Project-level Clear Inspections ─────────────────────────────────────────

function ProjectClearInspections({
  title,
  clearInspections,
  projectId,
}: {
  title: string;
  clearInspections: { passed: number; failed: number };
  projectId: string;
}) {
  const total = clearInspections.passed + clearInspections.failed;
  const passRate = total === 0 ? 0 : Math.round((clearInspections.passed / total) * 100);

  const locationsBase = `/projects/${projectId}/units`;

  return (
    <div style={card}>
      <ProjectHubCardHeader
        icon={ShieldCheck}
        title={title}
        actions={
          <span style={{ fontSize: "var(--text-caption)", color: "var(--neutral-500)", fontVariantNumeric: "tabular-nums" }}>
            {total.toLocaleString()} total
          </span>
        }
      />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {/* Passed — clickable, navigates to Locations filtered to PASSED */}
        <a
          href={`${locationsBase}?inspectionStatus=PASSED`}
          style={{
            backgroundColor: "#f0fdf4",
            border: "none",
            borderRadius: 12,
            padding: "12px 10px",
            textAlign: "center",
            textDecoration: "none",
            display: "block",
            cursor: clearInspections.passed > 0 ? "pointer" : "default",
            transition: "box-shadow 0.15s",
          }}
          onMouseEnter={(e) => {
            if (clearInspections.passed === 0) return;
            (e.currentTarget as HTMLAnchorElement).style.boxShadow = "var(--shadow-1)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.boxShadow = "none";
          }}
          onClick={(e) => { if (clearInspections.passed === 0) e.preventDefault(); }}
          aria-label={`View ${clearInspections.passed} passed locations`}
        >
          <p
            style={{
              margin: 0,
              fontSize: 32,
              fontWeight: 800,
              lineHeight: 1,
              color: "#166534",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {clearInspections.passed.toLocaleString()}
          </p>
          <p style={{ margin: "5px 0 0", fontSize: 11, fontWeight: 600, color: "#16a34a", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Passed
          </p>
        </a>

        {/* Failed — clickable, navigates to Locations filtered to FAILED */}
        <a
          href={`${locationsBase}?inspectionStatus=FAILED`}
          style={{
            backgroundColor: "#fef2f2",
            border: "none",
            borderRadius: 12,
            padding: "12px 10px",
            textAlign: "center",
            textDecoration: "none",
            display: "block",
            cursor: clearInspections.failed > 0 ? "pointer" : "default",
            transition: "box-shadow 0.15s",
          }}
          onMouseEnter={(e) => {
            if (clearInspections.failed === 0) return;
            (e.currentTarget as HTMLAnchorElement).style.boxShadow = "var(--shadow-1)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.boxShadow = "none";
          }}
          onClick={(e) => { if (clearInspections.failed === 0) e.preventDefault(); }}
          aria-label={`View ${clearInspections.failed} failed locations`}
        >
          <p
            style={{
              margin: 0,
              fontSize: 32,
              fontWeight: 800,
              lineHeight: 1,
              color: "#991b1b",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {clearInspections.failed.toLocaleString()}
          </p>
          <p style={{ margin: "5px 0 0", fontSize: 11, fontWeight: 600, color: "#dc2626", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Failed
          </p>
        </a>

        {/* Pass rate — informational only, not a link */}
        <div
          style={{
            backgroundColor: "var(--neutral-50)",
            border: "none",
            borderRadius: 12,
            padding: "12px 10px",
            textAlign: "center",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 32,
              fontWeight: 800,
              lineHeight: 1,
              color: "var(--neutral-900)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {passRate}%
          </p>
          <p style={{ margin: "5px 0 0", fontSize: 11, fontWeight: 600, color: "var(--neutral-500)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Pass Rate
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Scope detail cards (expandable accordion) ────────────────────────────────

// Colors match the scope square styles on the Locations page exactly
const PIPELINE_STAGES = [
  { key: "notStarted" as const,           label: "Not Started",              color: "#d1d5db" },
  { key: "staging" as const,              label: "In Staging",               color: "#60a5fa" },
  { key: "assembly" as const,             label: "In Assembly",              color: "#60a5fa" },
  { key: "installInProgress" as const,    label: "Install In Progress",      color: "#ffedd5" },
  { key: "installCompleteSub" as const,   label: "Install Complete-Unverified",     color: "#86efac" },
  { key: "installComplete" as const,      label: "Install Complete-Verified", color: "#16a34a" },
] as const;

function getStageCount(
  stages: Partial<ScopeStats["stages"]>,
  key: keyof ScopeStats["stages"],
): number {
  return stages[key] ?? 0;
}

/** Clean pipeline stage list — no redundant bar */
function PipelineList({
  stages,
  totalEntries,
}: {
  stages: Partial<ScopeStats["stages"]>;
  totalEntries: number;
}) {
  const stageTotal = PIPELINE_STAGES.reduce((sum, { key }) => sum + getStageCount(stages, key), 0);
  const displayTotal = totalEntries || stageTotal;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {PIPELINE_STAGES.map(({ key, label, color }) => {
        const count = getStageCount(stages, key);
        const isEmpty = count === 0;
        return (
          <div
            key={key}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "5px 0",
              opacity: isEmpty ? 0.3 : 1,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: "var(--neutral-600)" }}>{label}</span>
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: isEmpty ? "var(--neutral-400)" : "var(--neutral-900)" }}>
              {count.toLocaleString()}
            </span>
          </div>
        );
      })}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 5,
          padding: "8px 0 0",
          borderTop: "1px solid var(--neutral-100)",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 800, color: "var(--neutral-800)" }}>
          Total
        </span>
        <span style={{ fontSize: 13, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: "var(--neutral-900)" }}>
          {displayTotal.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

export function computeInstallCompleteStackedBarPercentages(
  scope: ScopeStats,
): { verifiedPct: number; subPct: number } {
  if (scope.totalEntries === 0) {
    return { verifiedPct: 0, subPct: 0 };
  }

  const installCompleteSub = getStageCount(
    scope.stages,
    "installCompleteSub",
  );
  const verifiedPct = Math.round(
    (scope.installCompleteEntries / scope.totalEntries) * 100,
  );
  const subPct = Math.min(
    100 - verifiedPct,
    Math.round((installCompleteSub / scope.totalEntries) * 100),
  );
  return { verifiedPct, subPct };
}

function ScopeRow({
  scope,
  isLast,
}: {
  scope: ScopeStats;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const ciTotal = scope.clearInspections.passed + scope.clearInspections.failed;
  const ciPassRate = ciTotal === 0 ? 0 : Math.round((scope.clearInspections.passed / ciTotal) * 100);
  const hasClearInspections = ciTotal > 0;

  // Both install-complete statuses use count basis so the stacked bar segments align.
  const { verifiedPct, subPct } =
    computeInstallCompleteStackedBarPercentages(scope);
  const installCompleteSub = getStageCount(scope.stages, "installCompleteSub");

  return (
    <div style={{ borderBottom: isLast ? "none" : "1px solid var(--neutral-100)" }}>
      {/* Header row — always visible */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "14px 0 10px",
          textAlign: "left",
        }}
      >
        <span
          style={{
            width: 64,
            fontSize: 13,
            fontWeight: 600,
            color: "var(--neutral-800)",
            flexShrink: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            paddingTop: 1,
          }}
          title={scope.name}
        >
          {scope.name}
        </span>

        {/* Bar + sub-label as a single unit */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Stacked bar: verified (dark green) + SUB (light green) */}
          <div style={{ height: 10, borderRadius: 5, backgroundColor: "var(--neutral-100)", overflow: "hidden", display: "flex" }}>
            {verifiedPct > 0 && (
              <div style={{
                width: `${verifiedPct}%`, height: "100%",
                backgroundColor: "#16a34a",
                borderRadius: subPct === 0 ? 5 : "5px 0 0 5px",
              }} />
            )}
            {subPct > 0 && (
              <div style={{ width: `${subPct}%`, height: "100%", backgroundColor: "#86efac" }} />
            )}
          </div>
          {/* Legend sits directly under the bar — clearly belongs to it */}
          <div style={{ display: "flex", gap: 10, marginTop: 5, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, color: "var(--neutral-500)", display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 7, height: 7, borderRadius: 1, backgroundColor: "#86efac", display: "inline-block" }} />
              <span>{installCompleteSub.toLocaleString()} unverified</span>
            </span>
            <span style={{ fontSize: 10, color: "var(--neutral-500)", display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 7, height: 7, borderRadius: 1, backgroundColor: "#16a34a", display: "inline-block" }} />
              <span>{scope.installCompleteEntries.toLocaleString()} verified</span>
            </span>
          </div>
        </div>

        <span style={{
          width: 48,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 2,
          textAlign: "right",
          flexShrink: 0,
          paddingTop: 1,
        }}>
          <span style={{
            fontSize: 13,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            color: scope.pct === 0 ? "var(--neutral-400)" : scope.pct < 75 ? "#15803d" : "#14532d",
          }}>
            {scope.pct}%
          </span>
          <span style={{ fontSize: 10, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "var(--neutral-400)", whiteSpace: "nowrap" }}>
            {scope.totalEntries.toLocaleString()} total
          </span>
        </span>

        <ChevronDown
          size={15}
          style={{ flexShrink: 0, color: expanded ? "#16a34a" : "var(--neutral-400)", transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.18s ease", marginTop: 2 }}
          aria-hidden
        />
      </button>

      {/* Expanded — pipeline breakdown */}
      {expanded && (
        <div style={{ paddingBottom: 14 }}>
          <div style={{ borderTop: "1px solid var(--neutral-100)", paddingTop: 10, marginBottom: 4 }}>
            <p style={{ margin: "0 0 6px", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--neutral-400)" }}>
              Pipeline Breakdown
            </p>
            <PipelineList stages={scope.stages} totalEntries={scope.totalEntries} />
          </div>

          {/* Clear inspections */}
          {hasClearInspections && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--neutral-150, #ececec)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <p style={{ ...sectionLabel, margin: 0 }}>Clear Inspections</p>
                <span style={{ fontSize: 11, color: "var(--neutral-400)", fontVariantNumeric: "tabular-nums" }}>{ciTotal.toLocaleString()} total</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {[
                  { label: "Passed", color: "#22c55e", val: scope.clearInspections.passed },
                  { label: "Failed", color: "#ef4444", val: scope.clearInspections.failed },
                  { label: "Pass rate", color: "#a3a3a3", val: `${ciPassRate}%` },
                ].map(({ label, color, val }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, color: "var(--neutral-600)" }}>{label}</span>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--neutral-900)" }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScopeDetailCards({
  title,
  byScope,
  reportTrigger,
}: {
  title: string;
  byScope: ScopeStats[];
  reportTrigger?: React.ReactNode;
}) {
  return (
    <div style={card}>
      <ProjectHubCardHeader icon={BarChart3} title={title} actions={reportTrigger} marginBottom={0} />
      <div>
        {byScope.map((scope, i) => (
          <ScopeRow
            key={scope.name}
            scope={scope}
            isLast={i === byScope.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Root export ──────────────────────────────────────────────────────────────

export function ProjectOverviewStats({
  stats,
  projectId,
  reportTrigger,
}: {
  stats: OverviewStats;
  projectId: string;
  reportTrigger?: React.ReactNode;
}) {
  const t = useTranslations("projects");
  const { overall, byScope, clearInspections, totalScopes } = stats;
  const hasInspections = clearInspections.passed + clearInspections.failed > 0;

  if (totalScopes === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <HeroCard
        title={t("hubStatsInstallCompleteTitle")}
        pct={overall.pct}
        installCompleteEntries={overall.installCompleteEntries}
        totalScopes={totalScopes}
      />

      {byScope.length > 0 && (
        <ScopeDetailCards
          title={t("hubStatsScopeProgressTitle")}
          byScope={byScope}
          reportTrigger={reportTrigger}
        />
      )}

      {hasInspections && (
        <ProjectClearInspections
          title={t("hubStatsClearInspectionsTitle")}
          clearInspections={clearInspections}
          projectId={projectId}
        />
      )}
    </div>
  );
}
