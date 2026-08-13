"use client";

import { Skeleton } from "@/components/ui/skeleton";

const LEVEL_ROW_COUNT = 5;

export function MediaLocationsSkeleton({ loadingLabel }: { loadingLabel: string }) {
  return (
    <div
      aria-busy="true"
      role="status"
      style={{ paddingBottom: 8 }}
    >
      <span
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0, 0, 0, 0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        {loadingLabel}
      </span>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderBottom: "1px solid var(--neutral-200)",
          background: "var(--neutral-50)",
        }}
      >
        <Skeleton
          style={{
            width: 3,
            alignSelf: "stretch",
            minHeight: 20,
            borderRadius: 2,
            flexShrink: 0,
          }}
        />
        <Skeleton style={{ width: 14, height: 14, borderRadius: "var(--radius-sm)", flexShrink: 0 }} />
        <Skeleton style={{ flex: 1, maxWidth: 160, height: 14 }} />
        <Skeleton style={{ width: 72, height: 13, flexShrink: 0 }} />
        <Skeleton style={{ width: 32, height: 32, borderRadius: 6, flexShrink: 0 }} />
      </div>

      {Array.from({ length: LEVEL_ROW_COUNT }, (_, index) => (
        <div
          key={index}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            borderBottom: index < LEVEL_ROW_COUNT - 1 ? "1px solid var(--neutral-100)" : undefined,
          }}
        >
          <Skeleton style={{ width: 28, height: 14, flexShrink: 0 }} />
          <Skeleton style={{ flex: 1, maxWidth: 56, height: 13, marginLeft: "auto" }} />
          <Skeleton style={{ width: 16, height: 16, borderRadius: "var(--radius-sm)", flexShrink: 0 }} />
        </div>
      ))}
    </div>
  );
}
