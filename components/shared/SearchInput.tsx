"use client";

import { Search, X } from "lucide-react";

type SearchInputVariant = "surface" | "canvas" | "dark";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  /** Use canvas on gray/app backgrounds, surface on cards/panels, dark on navy headers. */
  variant?: SearchInputVariant;
  /** Height in px. Defaults to 40. */
  height?: number;
  /** Font size in px. Defaults to 14. */
  fontSize?: number;
  clearLabel?: string;
  className?: string;
}

/**
 * Shared search bar pill used across all toolbar / page-level search inputs.
 *
 * Design tokens:
 *   surface:       var(--control-bg)             (no border)
 *   canvas:        var(--control-canvas-bg) + shadow for gray app backgrounds
 *   dark:          var(--control-dark-bg) for navy headers
 *   border-radius: var(--radius-pill)             (full pill)
 *   focus ring:    var(--focus-ring)
 *
 * Rules:
 *   - NEVER add a border — background provides visual affordance.
 *   - Focus ring lives on the WRAPPER so the inner input gets no-focus-ring.
 *   - Use -webkit-appearance: none to prevent iOS Safari's default blue ring.
 */
export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  ariaLabel,
  variant = "surface",
  height = 40,
  fontSize = 14,
  clearLabel = "Clear search",
  className,
}: SearchInputProps) {
  const isCanvas = variant === "canvas";
  const isDark = variant === "dark";
  const backgroundColor = isDark
    ? "var(--control-dark-bg)"
    : isCanvas
      ? "var(--control-canvas-bg)"
      : "var(--control-bg)";
  const foregroundColor = isDark ? "var(--control-dark-fg)" : "var(--control-fg)";
  const iconColor = isDark ? "var(--control-dark-icon)" : "var(--control-icon)";
  const baseShadow = isCanvas ? "var(--control-canvas-shadow)" : "none";
  const focusShadow = isCanvas ? "var(--control-canvas-shadow), var(--focus-ring)" : "var(--focus-ring)";

  return (
    <div
      className={className}
      data-search-variant={variant}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        width: "100%",
        height,
        padding: "0 12px 0 10px",
        borderRadius: "var(--radius-pill)",
        backgroundColor,
        boxShadow: baseShadow,
        boxSizing: "border-box",
      }}
      onFocus={(e) => (e.currentTarget.style.boxShadow = focusShadow)}
      onBlur={(e) => (e.currentTarget.style.boxShadow = baseShadow)}
    >
      <Search
        style={{ width: 15, height: 15, color: iconColor, flexShrink: 0 }}
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className="search-input-field no-focus-ring"
        style={{
          flex: 1,
          border: "none",
          outline: "none",
          fontSize,
          color: foregroundColor,
          backgroundColor: "transparent",
          minWidth: 0,
          WebkitAppearance: "none",
          appearance: "none",
        }}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label={clearLabel}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 18,
            height: 18,
            borderRadius: "50%",
            border: "none",
            backgroundColor: "var(--color-text-disabled)",
            color: "var(--color-text-inverse)",
            cursor: "pointer",
            flexShrink: 0,
            padding: 0,
          }}
        >
          <X size={10} aria-hidden />
        </button>
      )}
    </div>
  );
}
