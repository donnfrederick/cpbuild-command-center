"use client";

/**
 * Shared layout primitives for inspection record + retry fill views.
 * Uses --inspection-report-card-* tokens from globals.css.
 */

import { type ReactNode } from "react";
import { ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type InspectionReportTone = "fail" | "pass" | "neutral";

function toneClass(base: string, tone: InspectionReportTone): string {
  return tone === "neutral" ? base : `${base} ${base}--${tone}`;
}

// ── Collapsible panel (Open deficiencies / Review remaining) ─────────────────

export function InspectionReportPanel({
  tone,
  title,
  status,
  icon: Icon,
  open,
  onToggle,
  children,
  layout = "card",
  stickySectionHeader = false,
}: {
  tone: InspectionReportTone;
  title: string;
  status: string;
  icon?: LucideIcon;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  /** card = white rounded panel; bleed = full-width tinted section (retry) */
  layout?: "card" | "bleed";
  /** Pin section header while scrolling its body (retry open deficiencies). */
  stickySectionHeader?: boolean;
}) {
  const ResolvedIcon =
    Icon ?? (layout === "card" && tone === "pass" ? CheckCircle2 : undefined);
  const bleedClass =
    layout === "bleed"
      ? tone === "fail"
        ? " inspection-report-panel--bleed-fail"
        : tone === "pass"
          ? " inspection-report-panel--bleed-pass"
          : ""
      : "";

  return (
    <section
      className={`${toneClass("inspection-report-panel", tone)}${open ? "" : " inspection-report-panel--collapsed"}${bleedClass}${stickySectionHeader ? " inspection-report-panel--sticky-header" : ""}`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="inspection-report-panel__header"
        aria-expanded={open}
      >
        {ResolvedIcon && (
          <ResolvedIcon size={17} aria-hidden className="inspection-report-panel__icon" />
        )}
        <h3 className="inspection-report-panel__title">{title}</h3>
        <span className="inspection-report-panel__status">{status}</span>
        {open ? (
          <ChevronUp size={16} aria-hidden className="inspection-report-panel__chevron" />
        ) : (
          <ChevronDown size={16} aria-hidden className="inspection-report-panel__chevron" />
        )}
      </button>
      {open && <div className="inspection-report-panel__body">{children}</div>}
    </section>
  );
}

// ── Category card (LAYOUT, TRIM, …) ───────────────────────────────────────────

export function InspectionReportCategory({
  tone,
  children,
}: {
  tone: InspectionReportTone;
  children: ReactNode;
}) {
  return <div className={toneClass("inspection-report-category", tone)}>{children}</div>;
}

export function InspectionReportCategoryHeader({
  tone,
  title,
  status,
  outcome,
}: {
  tone: InspectionReportTone;
  title: string;
  status: string;
  /** Fail / Pass status label — sits next to the section title */
  outcome?: ReactNode;
}) {
  return (
    <div className={toneClass("inspection-report-category__header", tone)}>
      <div className="inspection-report-category__title-group">
        <h4 className="inspection-report-category__title">{title}</h4>
        {outcome && (
          <div className="inspection-report-category__outcome">{outcome}</div>
        )}
      </div>
      {status ? (
        <span className={toneClass("inspection-report-category__badge", tone)}>{status}</span>
      ) : null}
    </div>
  );
}

export function InspectionReportCategoryBody({ children }: { children: ReactNode }) {
  return <div className="inspection-report-category__body">{children}</div>;
}

// ── Question block inside a category ────────────────────────────────────────

export function InspectionReportQuestionBlock({
  title,
  required,
  children,
  compactTitle = false,
  outcome,
}: {
  title: ReactNode;
  required?: boolean;
  children: ReactNode;
  /** Retry view — question text subordinate under section header */
  compactTitle?: boolean;
  /** Pass / Fail label — inline with the question title */
  outcome?: ReactNode;
}) {
  return (
    <div className="inspection-report-question">
      <div className="inspection-report-question__head">
        <p
          className={`inspection-report-question__title${compactTitle ? " inspection-report-question__title--compact" : ""}`}
        >
          {title}
          {required && (
            <span className="inspection-report-question__required" aria-hidden>
              *
            </span>
          )}
        </p>
        {outcome && <div className="inspection-report-question__outcome">{outcome}</div>}
      </div>
      {children}
    </div>
  );
}

// ── Passed-item row (read-only, green rail) ───────────────────────────────────

export function InspectionReportPassedRow({
  title,
  children,
}: {
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="inspection-report-passed-row">
      <CheckCircle2 size={14} aria-hidden className="inspection-report-passed-row__icon" />
      <div className="inspection-report-passed-row__content">
        <p className="inspection-report-passed-row__title">{title}</p>
        {children}
      </div>
    </div>
  );
}

// ── Deficiency list wrapper ───────────────────────────────────────────────────

export function InspectionReportDeficiencyList({ children }: { children: ReactNode }) {
  return <div className="inspection-report-deficiency-list">{children}</div>;
}

export function InspectionReportDeficiencySlot({ children }: { children: ReactNode }) {
  return <div className="inspection-report-deficiency-slot">{children}</div>;
}
