import { Skeleton } from "@/components/ui/skeleton";

function SectionSkeleton({ rowCount }: { rowCount: number }) {
  return (
    <section
      style={{
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
        border: "1px solid var(--neutral-200)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--neutral-100)" }}>
        <Skeleton style={{ width: "42%", height: 12, borderRadius: "var(--radius-sm)" }} />
      </div>
      <div style={{ padding: "10px 12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        {Array.from({ length: rowCount }, (_, i) => (
          <Skeleton
            key={i}
            style={{
              width: i === rowCount - 1 ? "58%" : "88%",
              height: 12,
              borderRadius: "var(--radius-sm)",
            }}
          />
        ))}
      </div>
    </section>
  );
}

interface FieldDailyReportSheetSkeletonProps {
  loadingLabel: string;
}

/** Placeholder sections inside the project hub daily report sheet while slice data loads. */
export function FieldDailyReportSheetSkeleton({ loadingLabel }: FieldDailyReportSheetSkeletonProps) {
  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 10 }}
      aria-busy="true"
      aria-live="polite"
      role="status"
      aria-label={loadingLabel}
    >
      <span className="sr-only">{loadingLabel}</span>
      <SectionSkeleton rowCount={3} />
      <SectionSkeleton rowCount={2} />
      <SectionSkeleton rowCount={2} />
    </div>
  );
}
