"use client";

/** Shield badge icon used on scope-card inspection result pills. */
export function InspectionBadgeIcon({
  kind = "neutral",
  size = 16,
  markColor = "var(--color-text-inverse)",
}: {
  kind?: "check" | "x" | "neutral";
  size?: number;
  /** Circle overlay mark color (check/x strokes). */
  markColor?: string;
}) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ color: "currentColor", flexShrink: 0, overflow: "visible" }}
    >
      <path
        d="M10.5 2.35 2.9 5.15v6.15c0 4.3 3.05 7.55 7.6 9.45 4.55-1.9 7.6-5.15 7.6-9.45V5.15L10.5 2.35Z"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      {kind !== "neutral" ? (
        <>
          <circle cx="17.25" cy="16.75" r="5.1" fill="currentColor" />
          {kind === "check" ? (
            <path
              d="m14.7 16.75 1.55 1.55 3.35-3.55"
              stroke={markColor}
              strokeWidth="2.15"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            <path
              d="m15.15 14.65 4.2 4.2m0-4.2-4.2 4.2"
              stroke={markColor}
              strokeWidth="2.15"
              strokeLinecap="round"
            />
          )}
        </>
      ) : null}
    </svg>
  );
}
