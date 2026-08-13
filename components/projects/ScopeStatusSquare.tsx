"use client";

import {
  AlertTriangle,
  Clipboard,
  ClipboardCheck,
  Copy,
  Hammer,
  Minus,
  Package,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  getScopeSquareStyle,
  scopeAbbrevFromRow,
  subScopeDotColor,
  type ScopeRowStyleInput,
  type ScopeSquareSemantic,
} from "@/lib/scope-square-style";
import { ScopeInspectionShieldIcon, GRID_SCOPE_TILE_ICON_SIZE, GRID_SCOPE_TILE_ABBREV_FONT_SIZE } from "@/components/projects/ScopeInspectionShieldIcon";
import type { ScopeStatus } from "@/lib/unit-scope-progress";

function semanticDetail(
  t: ReturnType<typeof useTranslations<"units">>,
  semantic: ScopeSquareSemantic
): string {
  switch (semantic) {
    case "failed_inspection":
      return t("scopeSquareSemantic_failed_inspection");
    case "blocked":
      return t("scopeSquareSemantic_blocked");
    case "assembly":
      return t("scopeSquareSemantic_assembly");
    case "install_in_progress":
      return t("scopeSquareSemantic_install_in_progress");
    case "inspection_ready":
      return t("scopeSquareSemantic_inspection_ready");
    case "inspection_passed":
      return t("scopeSquareSemantic_inspection_passed");
    case "install_complete":
      return t("scopeSquareSemantic_install_complete");
    case "staging_assembly_progress":
      return t("scopeSquareSemantic_staging_assembly_progress");
    case "not_started":
      return t("scopeSquareSemantic_not_started");
    default:
      return t("scopeSquareSemantic_neutral");
  }
}

export interface ScopeStatusSquareScope {
  id: string;
  scopeType: {
    code: string;
    name: string;
    canonicalScopeType?: { id: string; code: string; displayName: string } | null;
  } | null;
  description: string;
  scopeStage: ScopeRowStyleInput["scopeStage"];
  scopeStatus: ScopeRowStyleInput["scopeStatus"];
  inspectionStatus: ScopeRowStyleInput["inspectionStatus"];
  /** Latest inspection category for type-aware grid shields (derived at read time). */
  latestInspectionCategory?: ScopeRowStyleInput["latestInspectionCategory"];
  /** Individual status of each sub-scope instance — drives dot colors. */
  subScopeStatuses?: ScopeStatus[];
  /** Whether this scope (or any of its sub-scopes) has an open issue. */
  hasIssue?: boolean;
  /** True if at least one of the open issues is a blocking issue (drives red vs orange). */
  hasBlockingIssue?: boolean;
  /** Per-instance issue flag (parallel to subScopeStatuses) — forces that dot red. */
  subScopeHasIssue?: boolean[];
}

export function ScopeStatusSquare({
  scope,
  layout = "inline",
}: {
  scope: ScopeStatusSquareScope;
  /** `grid`: fills a grid cell with a square tile (Location Builder unit grid). */
  layout?: "inline" | "grid";
}) {
  const t = useTranslations("units");
  // Prefer canonical code/displayName for consistent abbreviation and tooltip.
  const canonical = scope.scopeType?.canonicalScopeType;
  const abbrev = canonical?.code
    ? canonical.code.toUpperCase()
    : scopeAbbrevFromRow(scope.scopeType, scope.description);
  const input: ScopeRowStyleInput = {
    scopeStage: scope.scopeStage,
    scopeStatus: scope.scopeStatus,
    inspectionStatus: scope.inspectionStatus,
    latestInspectionCategory: scope.latestInspectionCategory ?? null,
  };
  const style = getScopeSquareStyle(input);
  const fullName = canonical?.displayName?.trim() || scope.scopeType?.name?.trim() || scope.description.trim() || "—";

  const isGrid = layout === "grid";
  const stripeH = isGrid ? 2 : 3;
  const fontSize = isGrid ? GRID_SCOPE_TILE_ABBREV_FONT_SIZE : 9;

  const DOT = isGrid ? 7 : 10;
  const DOT_GAP = 2;
  const PAD = 3;
  const MAX_BOTTOM = 4;

  const statuses = isGrid ? (scope.subScopeStatuses ?? []) : [];
  const subCount = statuses.length;
  const hasDots = subCount > 0;
  const bottomCount = Math.min(subCount, MAX_BOTTOM);
  const leftCount = subCount - bottomCount;
  const hasIssue = scope.hasIssue ?? false;
  const subScopeHasIssue = scope.subScopeHasIssue ?? [];
  const detail = hasIssue ? t("scopeSquareSemantic_issue_flagged") : semanticDetail(t, style.semantic);
  const ariaLabel = t("scopeSquareAria", { name: fullName, abbrev, detail });

  const effectiveBorderColor = style.borderColor;
  const visualIcon = hasIssue ? "alert" : style.icon;
  const visualBackground = hasIssue ? "var(--scope-tile-issue-bg)" : style.backgroundColor;
  const visualForeground = hasIssue ? "var(--scope-tile-issue-fg)" : style.foregroundColor;
  const abbrevColor = style.invertText && !hasIssue ? "var(--color-text-inverse)" : visualForeground;
  const Icon =
    visualIcon === "package" ? Package :
    visualIcon === "stack" ? Copy :
    visualIcon === "hammer" ? Hammer :
    visualIcon === "clipboard" ? Clipboard :
    visualIcon === "clipboard-check" ? ClipboardCheck :
    visualIcon === "alert" ? AlertTriangle :
    Minus;
  const showSubDots = hasDots && isGrid && visualIcon !== "shield-label" && !hasIssue;

  return (
    <span
      role="img"
      aria-label={ariaLabel}
      title={`${fullName} (${abbrev})`}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxSizing: "border-box",
        ...(isGrid
          ? {
              width: "100%",
              minWidth: 0,
              maxWidth: "100%",
              minHeight: 46,
              padding: "5px 4px",
              flexDirection: "column",
              gap: 3,
            }
          : {
              minWidth: 28,
              height: 28,
              padding: "0 4px",
              flexShrink: 0,
            }),
        fontSize,
        fontWeight: 800,
        letterSpacing: "var(--tracking-ui)",
        color: abbrevColor,
        backgroundColor: visualBackground,
        border: `${style.borderWidth}px ${style.borderStyle} ${effectiveBorderColor}`,
        borderRadius: isGrid ? "var(--scope-tile-radius)" : 4,
        lineHeight: 1,
        overflow: "hidden",
      }}
    >
      {isGrid ? (
        <>
          {visualIcon === "shield-label" ? (
            <ScopeInspectionShieldIcon
              inspectionLabel={style.shieldLabel ?? "CI"}
              color={visualForeground}
              strokeColor={style.shieldStrokeColor}
              fillColor={style.shieldFillColor}
              width={GRID_SCOPE_TILE_ICON_SIZE}
              height={GRID_SCOPE_TILE_ICON_SIZE}
              compact
            />
          ) : (
            <Icon aria-hidden size={GRID_SCOPE_TILE_ICON_SIZE} strokeWidth={2.4} style={{ color: visualForeground, flexShrink: 0 }} />
          )}
          <span style={{ fontSize, fontWeight: 900, color: abbrevColor, lineHeight: 1, letterSpacing: "var(--tracking-ui)", textTransform: "uppercase" }}>
            {abbrev}
          </span>
          {showSubDots ? (
            <span
              aria-hidden
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: DOT_GAP,
                flexShrink: 0,
                minHeight: DOT,
              }}
            >
              {statuses.slice(0, bottomCount).map((status, i) => (
                <span
                  key={i}
                  style={{
                    width: DOT,
                    height: DOT,
                    borderRadius: 2,
                    backgroundColor: subScopeHasIssue[i]
                      ? "var(--error-600)"
                      : subScopeDotColor(scope.scopeStage, scope.scopeStatus, status),
                    flexShrink: 0,
                    display: "block",
                  }}
                />
              ))}
            </span>
          ) : null}
        </>
      ) : (
        <span
          style={{
            position: "relative",
            zIndex: 1,
          }}
        >
          {abbrev}
        </span>
      )}

      {/* Left-side overflow dots (5+ sub-scopes) — top-left so they never cover abbrev/shield */}
      {leftCount > 0 && showSubDots && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: PAD,
            left: PAD,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: DOT_GAP,
            zIndex: 1,
          }}
        >
          {statuses.slice(bottomCount).map((status, i) => {
            const origIdx = bottomCount + i;
            return (
              <span
                key={i}
                style={{
                  width: DOT,
                  height: DOT,
                  borderRadius: 2,
                  backgroundColor: subScopeHasIssue[origIdx]
                    ? "var(--error-600)"
                    : subScopeDotColor(scope.scopeStage, scope.scopeStatus, status),
                  flexShrink: 0,
                  display: "block",
                }}
              />
            );
          })}
        </span>
      )}

      {style.inspectionStripeColor ? (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: stripeH,
            backgroundColor: style.inspectionStripeColor,
          }}
        />
      ) : null}
    </span>
  );
}
