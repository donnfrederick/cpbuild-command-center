import { Skeleton } from "@/components/ui/skeleton";

export default function UnitsLoading() {
  const levelRows = ["78%", "62%", "44%", "72%", "26%"];

  return (
    <div style={{ padding: "var(--space-4) var(--page-padding-x) 0" }}>
      <style>{`
        .units-loading-toolbar {
          display: flex;
          align-items: center;
          gap: 8px;
          padding-bottom: 12px;
        }
        .units-loading-search {
          flex: 1;
          min-width: 0;
          height: 44px;
          border-radius: var(--radius-lg);
        }
        .units-loading-action {
          width: 44px;
          height: 44px;
          flex-shrink: 0;
          border-radius: 14px;
        }
        @media (min-width: 768px) {
          .units-loading-search,
          .units-loading-action {
            height: 36px;
          }
          .units-loading-action {
            width: 36px;
          }
        }
      `}</style>

      <div className="units-loading-toolbar" aria-hidden>
        <Skeleton className="units-loading-search" />
        <Skeleton className="units-loading-action" />
        <Skeleton className="units-loading-action" />
        <Skeleton className="units-loading-action" />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-3)", gap: 12 }}>
          <Skeleton style={{ width: 96, height: 13, borderRadius: "var(--radius-pill)" }} />
          <Skeleton style={{ width: 132, height: 13, borderRadius: "var(--radius-pill)" }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "var(--space-3)" }}>
          <Skeleton style={{ width: 118, height: 30, borderRadius: "var(--radius-pill)" }} />
        </div>

        {levelRows.map((width, index) => (
          <div key={width} style={{ marginBottom: 8 }}>
            <div
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                minHeight: 44,
                padding: "10px 10px 20px 12px",
                borderRadius: "var(--radius-lg)",
                backgroundColor: "var(--level-card-collapsed-bg)",
                border: "none",
                boxShadow: "var(--shadow-card)",
                boxSizing: "border-box",
                overflow: "hidden",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: 0,
                  width: 7,
                  borderRadius: "var(--radius-lg) 0 0 var(--radius-lg)",
                  backgroundColor: "var(--building-north)",
                  opacity: 0.9,
                }}
              />
              <Skeleton style={{ width: 36, height: 28, marginLeft: 6, borderRadius: "var(--radius-pill)", flexShrink: 0 }} />
              <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0, marginLeft: 4, marginRight: 4 }}>
                <div style={{ flex: 1, height: 5, borderRadius: "var(--radius-pill)", backgroundColor: "var(--level-card-collapsed-track)", overflow: "hidden" }}>
                  <div style={{ width, height: "100%", borderRadius: "var(--radius-pill)", backgroundColor: "var(--color-success)", opacity: 0.2 }} />
                </div>
                <Skeleton style={{ width: 28, height: 11, borderRadius: "var(--radius-sm)", flexShrink: 0 }} />
              </div>
              <Skeleton style={{ width: index % 2 === 0 ? 78 : 64, height: 12, borderRadius: "var(--radius-pill)", flexShrink: 0 }} />
              <Skeleton style={{ width: 18, height: 18, borderRadius: "var(--radius-sm)", flexShrink: 0 }} />
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 7, display: "flex", justifyContent: "center", gap: 5 }}>
                {[0, 1, 2].map((dot) => (
                  <span key={dot} style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: "var(--color-text-disabled)", opacity: 0.55 }} />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
