import { Skeleton } from "@/components/ui/skeleton";

function SectionBlockSkeleton({ titleWidth = 140, lines = 3 }: { titleWidth?: number; lines?: number }) {
  return (
    <div
      style={{
        border: "1px solid var(--neutral-200)",
        borderRadius: "var(--radius-md)",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <Skeleton style={{ width: titleWidth, height: 15 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton
            key={i}
            style={{ width: i === lines - 1 ? "60%" : "90%", height: 13 }}
          />
        ))}
      </div>
    </div>
  );
}

export default function MorningBriefingLoading() {
  return (
    <div
      style={{
        padding: "var(--space-6, 24px)",
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      {/* Page header */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Skeleton style={{ width: 160, height: 26 }} />
        <Skeleton style={{ width: 300, height: 14 }} />
      </div>

      {/* Tab bar — Today / Archive / Analysis */}
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: "4px",
          backgroundColor: "var(--neutral-100)",
          borderRadius: "var(--radius-md)",
          width: "fit-content",
        }}
      >
        {[72, 80, 84].map((w, i) => (
          <Skeleton
            key={i}
            style={{ width: w, height: 32, borderRadius: "var(--radius-md)" }}
          />
        ))}
      </div>

      {/* Today tab content — section cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SectionBlockSkeleton titleWidth={160} lines={4} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <SectionBlockSkeleton titleWidth={120} lines={3} />
          <SectionBlockSkeleton titleWidth={100} lines={3} />
        </div>
        <SectionBlockSkeleton titleWidth={140} lines={5} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <SectionBlockSkeleton titleWidth={130} lines={3} />
          <SectionBlockSkeleton titleWidth={110} lines={3} />
        </div>
      </div>
    </div>
  );
}
