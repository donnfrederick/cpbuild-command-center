"use client";

import { Skeleton } from "@/components/ui/skeleton";

const GROUP_ROW_COUNTS = [3, 2] as const;

function FieldLogRowSkeleton() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "12px 16px",
        borderBottom: "1px solid var(--neutral-100)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Skeleton style={{ width: 72, height: 20, borderRadius: 6, flexShrink: 0 }} />
          <Skeleton style={{ flex: 1, maxWidth: "72%", height: 14 }} />
        </div>
        <Skeleton style={{ width: "46%", height: 12, marginTop: 8 }} />
      </div>
      <Skeleton style={{ width: 14, height: 14, borderRadius: "var(--radius-sm)", flexShrink: 0, marginTop: 4 }} />
    </div>
  );
}

function FieldLogGroupSkeleton({ rowCount, expanded = true }: { rowCount: number; expanded?: boolean }) {
  return (
    <div
      style={{
        borderRadius: 10,
        overflow: "hidden",
        border: "1px solid var(--neutral-200)",
        marginBottom: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "11px 14px",
          backgroundColor: "var(--neutral-50)",
          borderBottom: expanded ? "1px solid var(--neutral-200)" : undefined,
        }}
      >
        <Skeleton style={{ width: 15, height: 15, borderRadius: "var(--radius-sm)", flexShrink: 0 }} />
        <Skeleton style={{ flex: 1, maxWidth: 140, height: 14 }} />
        <Skeleton style={{ width: 28, height: 18, borderRadius: 99, flexShrink: 0 }} />
      </div>
      {expanded ? (
        <div>
          {Array.from({ length: rowCount }, (_, index) => (
            <FieldLogRowSkeleton key={index} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

interface FieldLogListSkeletonProps {
  loadingLabel: string;
  embeddedInFieldReports?: boolean;
  showStandaloneChrome?: boolean;
}

export function FieldLogListSkeleton({
  loadingLabel,
  embeddedInFieldReports = false,
  showStandaloneChrome = false,
}: FieldLogListSkeletonProps) {
  return (
    <div
      aria-busy="true"
      role="status"
      style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}
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

      {showStandaloneChrome ? (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "14px 16px 12px",
              borderBottom: "1px solid var(--neutral-200)",
              flexShrink: 0,
              backgroundColor: "var(--neutral-0)",
            }}
          >
            <Skeleton style={{ width: 17, height: 17, borderRadius: "var(--radius-sm)", flexShrink: 0 }} />
            <Skeleton style={{ flex: 1, maxWidth: 160, height: 16 }} />
          </div>
          <div
            style={{
              display: "flex",
              borderBottom: "1px solid var(--neutral-200)",
              backgroundColor: "var(--neutral-0)",
              flexShrink: 0,
              padding: "0 8px",
              gap: 8,
            }}
          >
            <Skeleton style={{ flex: 1, height: 42, borderRadius: 0 }} />
            <Skeleton style={{ flex: 1, height: 42, borderRadius: 0 }} />
          </div>
        </>
      ) : null}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "8px var(--page-padding-x, 12px)",
          borderBottom: "1px solid var(--neutral-100)",
          backgroundColor: "var(--neutral-0)",
          flexShrink: 0,
          gap: 6,
        }}
      >
        {embeddedInFieldReports ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1, minWidth: 0 }}>
              {[0, 1, 2].map((index) => (
                <Skeleton
                  key={index}
                  style={{ width: index === 0 ? 68 : index === 1 ? 84 : 52, height: 28, borderRadius: 999 }}
                />
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} style={{ width: 34, height: 34, borderRadius: 14 }} />
              ))}
            </div>
          </>
        ) : (
          <>
            <Skeleton style={{ width: 108, height: 30, borderRadius: 8 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} style={{ width: 34, height: 34, borderRadius: 14 }} />
              ))}
            </div>
          </>
        )}
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px var(--page-padding-x, 12px) calc(env(safe-area-inset-bottom, 0px) + 32px)",
        }}
      >
        {GROUP_ROW_COUNTS.map((rowCount, index) => (
          <FieldLogGroupSkeleton key={index} rowCount={rowCount} expanded={index === 0} />
        ))}
      </div>
    </div>
  );
}
