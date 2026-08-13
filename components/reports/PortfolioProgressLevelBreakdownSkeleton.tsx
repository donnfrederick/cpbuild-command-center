import { Skeleton } from "@/components/ui/skeleton";

const LEVEL_ROW_COUNT = 9;
const SCOPE_COLUMN_COUNT = 3;

function SkeletonCell({ width = "100%" }: { width?: string }) {
  return (
    <Skeleton
      style={{
        width,
        height: 14,
        borderRadius: "var(--radius-sm)",
      }}
    />
  );
}

interface PortfolioProgressLevelBreakdownSkeletonProps {
  loadingLabel: string;
}

/** Full-height grid placeholder while level breakdown detail loads. */
export function PortfolioProgressLevelBreakdownSkeleton({
  loadingLabel,
}: PortfolioProgressLevelBreakdownSkeletonProps) {
  return (
    <div
      className="portfolio-progress-level-breakdown-skeleton"
      aria-busy="true"
      aria-live="polite"
      role="status"
      aria-label={loadingLabel}
    >
      <span className="sr-only">{loadingLabel}</span>

      <div className="portfolio-progress-level-breakdown-skeleton-grand">
        <Skeleton
          style={{
            width: 108,
            height: 28,
            borderRadius: "var(--radius-sm)",
          }}
        />
        <Skeleton
          style={{
            width: 52,
            height: 24,
            borderRadius: "var(--radius-sm)",
          }}
        />
      </div>

      <Skeleton
        className="portfolio-progress-level-breakdown-skeleton-building"
        style={{
          width: "100%",
          height: 28,
          borderRadius: "var(--radius-sm)",
        }}
      />

      <div className="portfolio-progress-level-breakdown-skeleton-header">
        <SkeletonCell width="72%" />
        {Array.from({ length: SCOPE_COLUMN_COUNT }, (_, index) => (
          <SkeletonCell key={index} width="88%" />
        ))}
      </div>

      <div className="portfolio-progress-level-breakdown-skeleton-rows">
        {Array.from({ length: LEVEL_ROW_COUNT }, (_, rowIndex) => (
          <div key={rowIndex} className="portfolio-progress-level-breakdown-skeleton-row">
            <SkeletonCell width="64%" />
            {Array.from({ length: SCOPE_COLUMN_COUNT }, (_, colIndex) => (
              <SkeletonCell key={colIndex} width={colIndex === 0 ? "48%" : "72%"} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
