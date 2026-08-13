import { Skeleton } from "@/components/ui/skeleton";

const CARD_WIDTHS = ["55%", "70%", "45%", "65%"] as const;

export function AppPageSkeleton() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24,
        padding: "var(--page-padding-x)",
        flex: 1,
        minHeight: 0,
      }}
      aria-busy="true"
      aria-live="polite"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Skeleton style={{ width: 180, height: 26 }} />
        <Skeleton style={{ width: 280, height: 14 }} />
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {[88, 72, 96].map((w, i) => (
          <Skeleton key={i} style={{ width: w, height: 32, borderRadius: "var(--radius-md)" }} />
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {CARD_WIDTHS.map((titleW, i) => (
          <div
            key={i}
            style={{
              border: "1px solid var(--neutral-200)",
              borderRadius: "var(--radius-md)",
              padding: "14px 16px",
              backgroundColor: "var(--neutral-0)",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <Skeleton style={{ width: titleW, height: 16 }} />
            <Skeleton style={{ width: "40%", height: 12 }} />
            <Skeleton style={{ width: "65%", height: 12 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
