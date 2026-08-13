import { Skeleton } from "@/components/ui/skeleton";

function MemberRowSkeleton() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
      }}
    >
      {/* Avatar */}
      <Skeleton style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0 }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        <Skeleton style={{ width: "40%", height: 13 }} />
        <Skeleton style={{ width: "55%", height: 12 }} />
      </div>
      {/* Role badge */}
      <Skeleton style={{ width: 64, height: 20, borderRadius: 999 }} />
    </div>
  );
}

function CardSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div
      style={{
        border: "1px solid var(--neutral-200)",
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
      }}
    >
      {/* Card header */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--neutral-100)",
        }}
      >
        <Skeleton style={{ width: 160, height: 15 }} />
      </div>
      {/* Rows */}
      <div>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} style={{ borderBottom: i < rows - 1 ? "1px solid var(--neutral-100)" : undefined }}>
            <MemberRowSkeleton />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function UsersLoading() {
  return (
    <div
      style={{
        maxWidth: 960,
        margin: "0 auto",
        padding: "var(--page-padding-x)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--section-gap, 24px)",
      }}
    >
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Skeleton style={{ width: 80, height: 22 }} />
          <Skeleton style={{ width: 220, height: 14 }} />
        </div>
        {/* Invite button placeholder */}
        <Skeleton style={{ width: 110, height: 36, borderRadius: "var(--radius-md)" }} />
      </div>

      {/* Members card */}
      <CardSkeleton rows={4} />

      {/* Pending invites card */}
      <CardSkeleton rows={2} />
    </div>
  );
}
