"use client";

interface MediaBulkAlbumLoadBannerProps {
  completed: number;
  total: number;
  label: string;
}

export function MediaBulkAlbumLoadBanner({
  completed,
  total,
  label,
}: MediaBulkAlbumLoadBannerProps) {
  const safeTotal = Math.max(total, 1);
  const pct = Math.min(100, Math.round((completed / safeTotal) * 100));

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={completed < total}
      style={{
        position: "sticky",
        top: 0,
        zIndex: 2,
        padding: "10px 12px",
        borderBottom: "1px solid var(--primary-200)",
        background: "var(--primary-50)",
      }}
    >
      <p
        style={{
          margin: "0 0 8px",
          fontSize: 13,
          fontWeight: 600,
          color: "var(--primary-800)",
        }}
      >
        {label}
      </p>
      <div
        aria-hidden
        style={{
          height: 6,
          borderRadius: 999,
          background: "var(--primary-100)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            borderRadius: 999,
            background: "var(--primary-600)",
            transition: "width 0.2s ease",
          }}
        />
      </div>
    </div>
  );
}
