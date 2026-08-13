"use client";

import { Droplet } from "lucide-react";
import type { UnitGypcreteGridStatus } from "@/lib/inspections/unit-gypcrete-grid-display";
import { gypcreteGridDropletFillColor } from "@/lib/inspections/unit-gypcrete-grid-display";

export function GypcreteGridDropletIcon({
  status,
  ariaLabel,
}: {
  status: Exclude<UnitGypcreteGridStatus, undefined>;
  ariaLabel: string;
}) {
  const fill = gypcreteGridDropletFillColor(status);

  return (
    <span
      role="img"
      aria-label={ariaLabel}
      title={ariaLabel}
      style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}
    >
      <Droplet
        size={12}
        color={fill}
        fill={fill}
        strokeWidth={0}
        aria-hidden
      />
    </span>
  );
}
