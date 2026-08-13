import { Skeleton } from "@/components/ui/skeleton";

function StatusCardSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div
      style={{
        border: "1px solid var(--neutral-200)",
        borderRadius: "var(--radius-md)",
        padding: "var(--card-padding, 16px)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {/* Card title */}
      <Skeleton style={{ width: 130, height: 16 }} />
      {/* Row list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <Skeleton style={{ width: "40%", height: 13 }} />
            <Skeleton style={{ width: "30%", height: 13 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StatusLoading() {
  return (
    <div
      style={{
        padding: "var(--space-4, 16px)",
        maxWidth: 1200,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Skeleton style={{ width: 180, height: 22 }} />
          <Skeleton style={{ width: 280, height: 14 }} />
        </div>
        {/* Refresh button */}
        <Skeleton style={{ width: 96, height: 36, borderRadius: "var(--radius-md)" }} />
      </div>

      {/* 2×2 card grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
        }}
      >
        <StatusCardSkeleton rows={5} />
        <StatusCardSkeleton rows={5} />
        <StatusCardSkeleton rows={4} />
        <StatusCardSkeleton rows={4} />
      </div>
    </div>
  );
}
