import { Skeleton } from "@/components/ui/skeleton";
import { ProjectPageScrollArea } from "@/components/projects/ProjectPageScrollArea";

const cardStyle: React.CSSProperties = {
  backgroundColor: "var(--color-surface)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-card)",
  padding: "var(--space-3)",
};

function HubCardSkeleton({ rowWidths }: { rowWidths: [string, string] }) {
  return (
    <div style={cardStyle}>
      <Skeleton style={{ width: "55%", height: 14, marginBottom: 12, borderRadius: "var(--radius-pill)" }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rowWidths.map((width) => (
          <div
            key={width}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "8px 0",
              borderTop: "1px solid var(--neutral-100)",
            }}
          >
            <Skeleton style={{ width, height: 12, borderRadius: "var(--radius-sm)" }} />
            <Skeleton style={{ width: 48, height: 12, borderRadius: "var(--radius-sm)", flexShrink: 0 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProjectOverviewSkeleton({ loadingLabel }: { loadingLabel?: string }) {
  return (
    <ProjectPageScrollArea>
      <div
        style={{
          padding: "var(--space-3) var(--space-4)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
          maxWidth: 960,
        }}
        aria-busy="true"
        aria-live="polite"
        role="status"
      >
        {loadingLabel ? (
          <span className="sr-only">{loadingLabel}</span>
        ) : null}

        {/* Summary card */}
        <div style={cardStyle}>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <Skeleton style={{ width: "72%", height: 22, borderRadius: "var(--radius-md)" }} />
            <Skeleton style={{ width: "48%", height: 12, borderRadius: "var(--radius-sm)" }} />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) 1px minmax(0, 1fr)",
                alignItems: "center",
                gap: "var(--space-1)",
                backgroundColor: "var(--project-summary-assignment-bg)",
                borderRadius: "var(--radius-lg)",
                padding: "var(--space-2)",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <Skeleton style={{ width: 64, height: 8, borderRadius: "var(--radius-pill)" }} />
                <Skeleton style={{ width: "80%", height: 14, borderRadius: "var(--radius-sm)" }} />
              </div>
              <div style={{ width: 1, height: 26, backgroundColor: "var(--project-summary-assignment-divider)" }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <Skeleton style={{ width: 64, height: 8, borderRadius: "var(--radius-pill)" }} />
                <Skeleton style={{ width: "70%", height: 14, borderRadius: "var(--radius-sm)" }} />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <Skeleton style={{ width: 72, height: 18, borderRadius: "var(--radius-pill)" }} />
              <Skeleton style={{ width: 64, height: 18, borderRadius: "var(--radius-pill)" }} />
            </div>
            <Skeleton style={{ width: 140, height: 10, borderRadius: "var(--radius-pill)" }} />
          </div>
        </div>

        <HubCardSkeleton rowWidths={["62%", "54%"]} />
        <HubCardSkeleton rowWidths={["58%", "46%"]} />

        {/* Install complete hero */}
        <div style={cardStyle}>
          <Skeleton style={{ width: 160, height: 10, marginBottom: 12, borderRadius: "var(--radius-pill)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
            <Skeleton style={{ width: 88, height: 64, borderRadius: "var(--radius-md)", flexShrink: 0 }} />
            <div style={{ flex: "1 1 200px", minWidth: 0 }}>
              <Skeleton style={{ width: "100%", height: 14, borderRadius: "var(--radius-pill)" }} />
              <Skeleton style={{ width: "55%", height: 12, marginTop: 8, borderRadius: "var(--radius-sm)" }} />
            </div>
          </div>
        </div>

        {/* Scope breakdown */}
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, gap: 8 }}>
            <Skeleton style={{ width: 120, height: 10, borderRadius: "var(--radius-pill)" }} />
            <Skeleton style={{ width: 100, height: 28, borderRadius: "var(--radius-pill)" }} />
          </div>
          {["78%", "52%"].map((barWidth) => (
            <div key={barWidth} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <Skeleton style={{ width: 72, height: 12, borderRadius: "var(--radius-sm)" }} />
                <div style={{ flex: 1, height: 5, borderRadius: "var(--radius-pill)", backgroundColor: "var(--neutral-100)", overflow: "hidden" }}>
                  <div style={{ width: barWidth, height: "100%", backgroundColor: "var(--neutral-200)" }} />
                </div>
                <Skeleton style={{ width: 28, height: 11, borderRadius: "var(--radius-sm)", flexShrink: 0 }} />
              </div>
            </div>
          ))}
        </div>

        {/* Clear inspections */}
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <Skeleton style={{ width: 110, height: 10, borderRadius: "var(--radius-pill)" }} />
            <Skeleton style={{ width: 40, height: 10, borderRadius: "var(--radius-pill)" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
            {[0, 1, 2].map((i) => (
              <Skeleton
                key={i}
                style={{ height: 72, borderRadius: "var(--radius-lg)" }}
              />
            ))}
          </div>
        </div>
      </div>
    </ProjectPageScrollArea>
  );
}
