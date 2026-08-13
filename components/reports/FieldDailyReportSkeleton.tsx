import { Skeleton } from "@/components/ui/skeleton";

function ProjectReportCardSkeleton({
  nameWidth,
  showPct = true,
}: {
  nameWidth: string;
  showPct?: boolean;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--neutral-200)",
        borderRadius: "var(--radius-lg)",
        backgroundColor: "var(--color-surface)",
        overflow: "hidden",
        boxShadow: "var(--shadow-1)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
        }}
      >
        <Skeleton
          style={{ width: 18, height: 18, borderRadius: "var(--radius-sm)", flexShrink: 0 }}
        />
        <Skeleton
          style={{
            width: nameWidth,
            height: 14,
            borderRadius: "var(--radius-sm)",
            flex: 1,
            maxWidth: "72%",
          }}
        />
        {showPct ? (
          <Skeleton
            style={{ width: 32, height: 13, borderRadius: "var(--radius-sm)", flexShrink: 0 }}
          />
        ) : null}
      </div>
    </div>
  );
}

interface FieldDailyReportSkeletonProps {
  loadingLabel: string;
}

/** Placeholder while the global field daily report payload loads. */
export function FieldDailyReportSkeleton({ loadingLabel }: FieldDailyReportSkeletonProps) {
  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
      aria-busy="true"
      aria-live="polite"
      role="status"
      aria-label={loadingLabel}
    >
      <span className="sr-only">{loadingLabel}</span>
      <ProjectReportCardSkeleton nameWidth="68%" />
      <ProjectReportCardSkeleton nameWidth="54%" showPct={false} />
      <ProjectReportCardSkeleton nameWidth="76%" />
    </div>
  );
}
