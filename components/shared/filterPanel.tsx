"use client";

import {
  useCallback,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from "react";
import { ChevronDown, Search, X } from "lucide-react";

export type FilterChipVariant = "default" | "blocking" | "nonblocking";

// ── Shell ─────────────────────────────────────────────────────────────────────

export function FilterPanelShell({
  title,
  subtitle,
  closeAriaLabel,
  onClose,
  summary,
  footer,
  children,
  backdropClassName,
}: {
  title: string;
  subtitle?: string;
  closeAriaLabel: string;
  onClose: () => void;
  summary?: ReactNode;
  footer: ReactNode | ((close: () => void) => ReactNode);
  children: ReactNode;
  backdropClassName?: string;
}) {
  const titleId = useId();
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const close = useCallback(() => {
    setClosing(true);
    setVisible(false);
  }, []);

  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(onClose, 260);
    return () => clearTimeout(timer);
  }, [closing, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className={`filter-panel-backdrop${visible ? " filter-panel-backdrop--visible" : ""}${backdropClassName ? ` ${backdropClassName}` : ""}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="document"
        className={`filter-panel-sheet${visible ? " filter-panel-sheet--visible" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="filter-panel-handle" aria-hidden="true" />

        <header className="filter-panel-header">
          <div className="filter-panel-header__row">
            <div>
              <h2 id={titleId} className="filter-panel-header__title">
                {title}
              </h2>
              {subtitle ? (
                <p className="filter-panel-header__subtitle">{subtitle}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={close}
              aria-label={closeAriaLabel}
              className="filter-panel-header__close"
            >
              <X size={18} aria-hidden />
            </button>
          </div>
          {summary}
        </header>

        <div className="filter-panel-body">{children}</div>

        <footer className="filter-panel-footer">
          {typeof footer === "function" ? footer(close) : footer}
        </footer>
      </div>
    </div>
  );
}

// ── Summary bar ───────────────────────────────────────────────────────────────

export function FilterPanelSummary({ children }: { children: ReactNode }) {
  return <div className="filter-panel-summary">{children}</div>;
}

/** One cohesive "X of Y labels" stat — pill styling only when filtered < total. */
export function FilterPanelSummaryStat({
  filtered,
  total,
  label,
}: {
  filtered: number;
  total: number;
  label: string;
}) {
  const isFiltered = filtered < total;
  return (
    <span
      className={`filter-panel-summary__stat${isFiltered ? " filter-panel-summary__stat--filtered" : ""}`}
    >
      {label}
    </span>
  );
}

export function FilterPanelSummaryDivider() {
  return <span className="filter-panel-summary__divider" aria-hidden>·</span>;
}

export function FilterPanelSummaryItem({
  highlight,
  children,
}: {
  highlight?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`filter-panel-summary__item${highlight ? " filter-panel-summary__item--highlight" : ""}`}
    >
      {children}
    </span>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────

export function FilterPanelSection({
  label,
  children,
  collapsible = false,
  defaultExpanded,
  activeCount = 0,
}: {
  label: string;
  children: ReactNode;
  /** When true, section body toggles via the header button. */
  collapsible?: boolean;
  /** Collapsible only — defaults to false (collapsed). Ignored when not collapsible. */
  defaultExpanded?: boolean;
  /** Collapsible only — badge shown on the header when collapsed and > 0. */
  activeCount?: number;
}) {
  const [expanded, setExpanded] = useState(
    collapsible ? (defaultExpanded ?? false) : true,
  );

  if (!collapsible) {
    return (
      <section className="filter-panel-section">
        <p className="filter-panel-section__label">{label}</p>
        {children}
      </section>
    );
  }

  return (
    <section className="filter-panel-section filter-panel-section--collapsible">
      <button
        type="button"
        className="filter-panel-section__toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((open) => !open)}
      >
        <span className="filter-panel-section__label">{label}</span>
        <span className="filter-panel-section__spacer" aria-hidden />
        {activeCount > 0 && !expanded ? (
          <span className="filter-panel-section__count">{activeCount}</span>
        ) : null}
        <ChevronDown
          size={15}
          aria-hidden
          className={`filter-panel-section__chevron${expanded ? " filter-panel-section__chevron--open" : ""}`}
        />
      </button>
      {expanded ? <div className="filter-panel-section__body">{children}</div> : null}
    </section>
  );
}

// ── Chip / pill ───────────────────────────────────────────────────────────────

export function FilterChip({
  label,
  active,
  onClick,
  variant = "default",
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  variant?: FilterChipVariant;
}) {
  const variantClass =
    variant === "blocking"
      ? " filter-panel-chip--blocking"
      : variant === "nonblocking"
        ? " filter-panel-chip--nonblocking"
        : "";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`filter-panel-chip${active ? " filter-panel-chip--active" : ""}${variantClass}`}
    >
      {label}
    </button>
  );
}

export function FilterPreviewChips({ labels, max = 2 }: { labels: string[]; max?: number }) {
  if (labels.length === 0) return null;
  const shown = labels.slice(0, max);
  const overflow = labels.length - max;
  return (
    <div className="filter-panel-preview-chips">
      {shown.map((l) => (
        <span key={l} className="filter-panel-preview-chips__chip">
          {l}
        </span>
      ))}
      {overflow > 0 && (
        <span className="filter-panel-preview-chips__more">+{overflow}</span>
      )}
    </div>
  );
}

// ── Accordion card ────────────────────────────────────────────────────────────

export function FilterAccordionCard({
  label,
  expanded,
  onToggle,
  activeCount,
  previewLabels,
  children,
  leadingIcon,
}: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
  activeCount: number;
  previewLabels: string[];
  children: ReactNode;
  leadingIcon?: ReactNode;
}) {
  const anyActive = activeCount > 0;
  return (
    <div
      className={`filter-panel-accordion${anyActive ? " filter-panel-accordion--active" : ""}`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="filter-panel-accordion__toggle"
      >
        {leadingIcon}
        <span className="filter-panel-accordion__label">{label}</span>
        {anyActive && !expanded && <FilterPreviewChips labels={previewLabels} />}
        <span className="filter-panel-accordion__spacer" />
        {anyActive && expanded && (
          <span className="filter-panel-accordion__count">{activeCount}</span>
        )}
        <ChevronDown
          size={15}
          aria-hidden
          className={`filter-panel-accordion__chevron${expanded ? " filter-panel-accordion__chevron--open" : ""}`}
        />
      </button>
      {expanded && <div className="filter-panel-accordion__body">{children}</div>}
    </div>
  );
}

// ── Footer actions ────────────────────────────────────────────────────────────

export function FilterPanelFooterActions({
  clearLabel,
  applyLabel,
  onClear,
  onApply,
  clearDisabled,
}: {
  clearLabel: string;
  applyLabel: string;
  onClear: () => void;
  onApply: () => void;
  clearDisabled?: boolean;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onClear}
        disabled={clearDisabled}
        className="filter-panel-footer__clear"
      >
        {clearLabel}
      </button>
      <button type="button" onClick={onApply} className="filter-panel-footer__apply">
        {applyLabel}
      </button>
    </>
  );
}

// ── Form fields (reports / structured filters) ────────────────────────────────

export function FilterField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="filter-panel-field">
      <span className="filter-panel-field__label">{label}</span>
      {children}
    </label>
  );
}

export function FilterFieldGrid({ children }: { children: ReactNode }) {
  return <div className="filter-panel-field-grid">{children}</div>;
}

export function FilterPillGroup({ children }: { children: ReactNode }) {
  return <div className="filter-panel-pill-group">{children}</div>;
}

export function FilterPill({
  label,
  active,
  onClick,
  variant = "default",
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  variant?: FilterChipVariant;
}) {
  const variantClass =
    variant === "blocking"
      ? " filter-panel-pill--blocking"
      : variant === "nonblocking"
        ? " filter-panel-pill--nonblocking"
        : "";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`filter-panel-pill${active ? " filter-panel-pill--active" : ""}${variantClass}`}
    >
      {label}
    </button>
  );
}

export function FilterPanelAccordionStack({ children }: { children: ReactNode }) {
  return <div className="filter-panel-accordion-stack">{children}</div>;
}

export function FilterPanelCheckboxRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className={`filter-panel-checkbox-row${checked ? " is-checked" : ""}`}
    >
      <span className="filter-panel-checkbox-row__box" aria-hidden>
        {checked && (
          <svg width="10" height="7" viewBox="0 0 10 7" fill="none">
            <path
              d="M1 3.5L3.5 6L9 1"
              stroke="var(--color-text-inverse)"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      <span className="filter-panel-checkbox-row__label">{label}</span>
    </button>
  );
}

export function FilterPanelInlineSearch({
  value,
  onChange,
  placeholder,
  clearAriaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  clearAriaLabel: string;
}) {
  return (
    <div className="filter-panel-inline-search">
      <Search size={14} className="filter-panel-inline-search__icon" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="filter-panel-inline-search__input"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label={clearAriaLabel}
          className="filter-panel-inline-search__clear"
        >
          <X size={13} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

export function FilterPanelMetaLine({ children }: { children: ReactNode }) {
  return <p className="filter-panel-meta-line">{children}</p>;
}

export function FilterPanelScrollList({
  children,
  maxHeight = 240,
}: {
  children: ReactNode;
  maxHeight?: number;
}) {
  return (
    <div className="filter-panel-scroll-list" style={{ maxHeight }}>
      {children}
    </div>
  );
}

export function FilterPanelListRow({
  label,
  active,
  onClick,
  leading,
  style,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  leading?: ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`filter-panel-list-row${active ? " is-active" : ""}`}
      style={style}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
        {leading}
        <span className="filter-panel-list-row__label">{label}</span>
      </span>
      {active ? (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="filter-panel-list-row__check"
          aria-hidden
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : null}
    </button>
  );
}

export function FilterPanelEmptyState({ children }: { children: ReactNode }) {
  return <p className="filter-panel-empty-state">{children}</p>;
}

export const filterPanelInputClass = "filter-panel-input";
export const filterPanelSelectClass = "filter-panel-select";
