"use client";

import { Fragment } from "react";
import { useTranslations } from "next-intl";
import type { LevelUnitExpandModel } from "@/lib/reports/level-scope-unit-groups";

const GRID_GAP = 6;

type ScopeColumnKind = "pct" | "delta" | "start" | "end";

function scopeBandClass(scopeIndex: number): string {
  return `level-scope-band--${scopeIndex % 2}`;
}

function expandCellClass(
  scopeIndex: number | undefined,
  kind?: ScopeColumnKind,
  opts?: { left?: boolean; scopeEnd?: boolean; spanDates?: boolean },
): string {
  const parts = ["level-scope-cell", "level-scope-unit-expand-cell"];
  if (opts?.left) parts.push("level-scope-cell--left");
  if (opts?.scopeEnd) parts.push("level-scope-cell--scope-end");
  if (opts?.spanDates) parts.push("level-scope-unit-expand-cell--span-dates");
  if (scopeIndex !== undefined && kind) {
    parts.push(scopeBandClass(scopeIndex));
  }
  return parts.join(" ");
}

function StackLine({ children }: { children: React.ReactNode }) {
  return <div className="level-scope-unit-stack-line">{children}</div>;
}

function Blank({ label }: { label: string }) {
  return (
    <span className="level-scope-unit-stack-blank" aria-hidden>
      {label}
    </span>
  );
}

export interface LevelScopeUnitExpandRowProps {
  gridCols: string;
  scopes: string[];
  showScopeDeltas: boolean;
  model: LevelUnitExpandModel;
  noChangeLabel: string;
}

/**
 * Shared unit stack in the Level column; scope columns align to the same rows.
 * Δ = highlighted unit # if changed; Start+End merged = subcontractor.
 */
export function LevelScopeUnitExpandRow({
  gridCols,
  scopes,
  showScopeDeltas,
  model,
  noChangeLabel,
}: LevelScopeUnitExpandRowProps) {
  const t = useTranslations("levelScopeReport");
  const { unitOrder, byScope } = model;

  if (unitOrder.length === 0) return null;

  return (
    <div
      className="level-scope-unit-expand-panel"
      style={{
        display: "grid",
        gridTemplateColumns: gridCols,
        gap: GRID_GAP,
        alignItems: "start",
      }}
      aria-label={t("levelUnitExpandRowLabel")}
    >
      <div className={expandCellClass(undefined, undefined, { left: true })}>
        <div className="level-scope-unit-stack">
          {unitOrder.map((unitLabel) => (
            <StackLine key={unitLabel}>
              <span className="level-scope-unit-stack-label">{unitLabel}</span>
            </StackLine>
          ))}
        </div>
      </div>
      {scopes.map((scope, sIdx) => {
        const scopeMap = byScope[scope] ?? {};
        const isLastScope = sIdx === scopes.length - 1;
        return (
          <Fragment key={`expand-${scope}`}>
            <div className={expandCellClass(sIdx, "pct")}>
              <div className="level-scope-unit-stack">
                {unitOrder.map((unitLabel) => {
                  const line = scopeMap[unitLabel];
                  return (
                    <StackLine key={`${scope}-pct-${unitLabel}`}>
                      {line && line.verifiedPct >= 100 ? (
                        <span className="level-scope-unit-stack-complete">✓</span>
                      ) : line && line.verifiedPct > 0 ? (
                        <span className="level-scope-unit-stack-partial">{line.verifiedPct}%</span>
                      ) : (
                        <Blank label={noChangeLabel} />
                      )}
                    </StackLine>
                  );
                })}
              </div>
            </div>
            {showScopeDeltas && (
              <div className={expandCellClass(sIdx, "delta")}>
                <div className="level-scope-unit-stack">
                  {unitOrder.map((unitLabel) => {
                    const line = scopeMap[unitLabel];
                    return (
                      <StackLine key={`${scope}-delta-${unitLabel}`}>
                        {line?.updatedThisPeriod ? (
                          <span className="level-scope-unit-stack-updated">{unitLabel}</span>
                        ) : (
                          <Blank label={noChangeLabel} />
                        )}
                      </StackLine>
                    );
                  })}
                </div>
              </div>
            )}
            <div
              className={expandCellClass(sIdx, "start", {
                scopeEnd: !isLastScope,
                spanDates: true,
              })}
              style={{ gridColumn: "span 2" }}
            >
              <div className="level-scope-unit-stack">
                {unitOrder.map((unitLabel) => {
                  const line = scopeMap[unitLabel];
                  return (
                    <StackLine key={`${scope}-sub-${unitLabel}`}>
                      {line?.subcontractor ? (
                        <span className="level-scope-unit-stack-sub">{line.subcontractor}</span>
                      ) : (
                        <Blank label={noChangeLabel} />
                      )}
                    </StackLine>
                  );
                })}
              </div>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
