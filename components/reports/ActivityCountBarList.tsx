"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ActivityCountRow, ActivityCountSort } from "@/lib/reports/activity-count-shared";
import { maxActivityCount } from "@/lib/reports/activity-count-shared";

export function ActivityCountBarList({
  rows,
  sort,
  onSortToggle,
  nameColumnLabel,
  activityColumnLabel,
  sortActivityAria,
  countLabel,
}: {
  rows: ActivityCountRow[];
  sort: ActivityCountSort;
  onSortToggle: () => void;
  nameColumnLabel: string;
  activityColumnLabel: string;
  sortActivityAria: string;
  countLabel: (count: number) => string;
}) {
  const maxCount = maxActivityCount(rows);
  const SortIcon = sort === "most" ? ArrowDown : ArrowUp;

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 0 6px",
          borderBottom: "1px solid var(--neutral-200)",
        }}
      >
        <div
          style={{
            flex: "1 1 120px",
            minWidth: 0,
            fontSize: "var(--text-caption, 12px)",
            fontWeight: 600,
            color: "var(--neutral-500)",
            textTransform: "uppercase",
            letterSpacing: "0.03em",
          }}
        >
          {nameColumnLabel}
        </div>
        <div
          style={{
            flex: "2 1 160px",
            minWidth: 80,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 4,
          }}
        >
          <button
            type="button"
            onClick={onSortToggle}
            aria-label={sortActivityAria}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "2px 4px",
              margin: 0,
              border: "none",
              background: "none",
              cursor: "pointer",
              fontSize: "var(--text-caption, 12px)",
              fontWeight: 600,
              color: "var(--neutral-500)",
              textTransform: "uppercase",
              letterSpacing: "0.03em",
            }}
          >
            {activityColumnLabel}
            {rows.length > 1 ? (
              <SortIcon size={14} style={{ flexShrink: 0, opacity: 0.7 }} aria-hidden />
            ) : (
              <ArrowUpDown size={14} style={{ flexShrink: 0, opacity: 0.35 }} aria-hidden />
            )}
          </button>
        </div>
      </div>

      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {rows.map((row) => {
          const widthPct = maxCount > 0 ? (row.count / maxCount) * 100 : 0;
          return (
            <li
              key={row.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 0",
                borderBottom: "1px solid var(--neutral-200)",
              }}
            >
              <div style={{ flex: "1 1 120px", minWidth: 0 }}>
                <div
                  style={{
                    fontSize: "var(--text-body, 14px)",
                    fontWeight: 600,
                    color: "var(--neutral-900)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.name}
                </div>
                {row.subtitle ? (
                  <div
                    style={{
                      marginTop: 2,
                      fontSize: "var(--text-caption, 12px)",
                      color: "var(--neutral-500)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.subtitle}
                  </div>
                ) : null}
              </div>

              <div
                style={{
                  flex: "2 1 160px",
                  minWidth: 80,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <div
                  aria-hidden
                  style={{
                    flex: 1,
                    height: 8,
                    borderRadius: "var(--radius-sm, 6px)",
                    backgroundColor: "var(--neutral-100)",
                    overflow: "hidden",
                  }}
                >
                  {row.count > 0 && (
                    <div
                      style={{
                        width: `${widthPct}%`,
                        height: "100%",
                        borderRadius: "var(--radius-sm, 6px)",
                        backgroundColor: "var(--primary-500)",
                        minWidth: 4,
                      }}
                    />
                  )}
                </div>
                <span
                  style={{
                    flexShrink: 0,
                    minWidth: 32,
                    textAlign: "right",
                    fontSize: "var(--text-caption, 12px)",
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                    color: row.count > 0 ? "var(--neutral-700)" : "var(--neutral-400)",
                  }}
                >
                  {countLabel(row.count)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
