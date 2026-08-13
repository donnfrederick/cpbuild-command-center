"use client";

interface ActivityListCountSummaryProps {
  filtered: number;
  total: number;
  label: string;
}

/** Compact count above an activity/event list — highlights when filtered < total. */
export function ActivityListCountSummary({
  filtered,
  total,
  label,
}: ActivityListCountSummaryProps) {
  if (total <= 0) return null;
  const isFiltered = filtered < total;
  return (
    <div
      data-testid="activity-list-count"
      role="status"
      aria-live="polite"
      style={{
        padding: "var(--space-2) var(--space-3)",
        fontSize: "var(--text-caption)",
        fontWeight: "var(--font-weight-semibold)",
        color: isFiltered ? "var(--primary-700)" : "var(--neutral-600)",
        borderBottom: "1px solid var(--neutral-200)",
        backgroundColor: isFiltered ? "var(--primary-50)" : "var(--neutral-50)",
        flexShrink: 0,
      }}
    >
      {label}
    </div>
  );
}
