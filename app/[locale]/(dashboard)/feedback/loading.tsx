import { Skeleton } from "@/components/ui/skeleton";

const CARD_TITLE_WIDTHS = ["55%", "70%", "45%", "65%", "50%"] as const;

export default function FeedbackLoading() {
  return (
    <div
      style={{
        maxWidth: 768,
        margin: "0 auto",
        padding: "var(--page-padding-x)",
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      {/* Page header */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Skeleton style={{ width: 160, height: 26 }} />
        <Skeleton style={{ width: 260, height: 14 }} />
      </div>

      {/* Filter chips — All / Open / In Progress / Resolved */}
      <div
        style={{
          display: "flex",
          gap: 8,
          padding: "4px",
          backgroundColor: "var(--neutral-100)",
          borderRadius: "var(--radius-md)",
          width: "fit-content",
        }}
      >
        {[72, 56, 90, 80].map((w, i) => (
          <Skeleton
            key={i}
            style={{ width: w, height: 30, borderRadius: "var(--radius-md)" }}
          />
        ))}
      </div>

      {/* Feedback card stack */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {CARD_TITLE_WIDTHS.map((titleW, i) => (
          <div
            key={i}
            style={{
              border: "1px solid var(--neutral-200)",
              borderRadius: "var(--radius-md)",
              padding: "14px 16px",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            {/* Type icon */}
            <Skeleton style={{ width: 32, height: 32, borderRadius: "var(--radius-md)", flexShrink: 0 }} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
              {/* ID + title */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Skeleton style={{ width: 56, height: 13, borderRadius: 999 }} />
                <Skeleton style={{ width: titleW, height: 14 }} />
              </div>
              {/* Status badge + meta */}
              <div style={{ display: "flex", gap: 8 }}>
                <Skeleton style={{ width: 72, height: 18, borderRadius: 999 }} />
                <Skeleton style={{ width: 100, height: 13 }} />
              </div>
            </div>
            {/* Expand chevron */}
            <Skeleton style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
