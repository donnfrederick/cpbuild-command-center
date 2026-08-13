"use client";

import { Skeleton } from "@/components/ui/skeleton";

const THUMB_COUNT = 3;
const THUMB_WIDTH = 120;
const THUMB_HEIGHT = 90;

interface UnitAlbumStripSkeletonProps {
  /** Visible + screen-reader label while album rows load. */
  label: string;
}

export function UnitAlbumStripSkeleton({ label }: UnitAlbumStripSkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      style={{
        padding: "8px 12px 10px",
      }}
    >
      <div
        aria-hidden
        style={{
          display: "flex",
          gap: 8,
          overflowX: "hidden",
          marginBottom: 8,
        }}
      >
        {Array.from({ length: THUMB_COUNT }, (_, index) => (
          <Skeleton
            key={index}
            style={{
              width: THUMB_WIDTH,
              height: THUMB_HEIGHT,
              borderRadius: "var(--radius-sm)",
              flexShrink: 0,
            }}
          />
        ))}
      </div>
      <p
        style={{
          margin: 0,
          fontSize: 12,
          color: "var(--neutral-500)",
        }}
      >
        {label}
      </p>
    </div>
  );
}
