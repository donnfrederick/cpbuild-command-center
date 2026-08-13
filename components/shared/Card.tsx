import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Canonical app card surface.
 *
 * Design tokens (enforced via .app-card in globals.css):
 *   background:    var(--color-surface)
 *   border-radius: var(--radius-lg)
 *   box-shadow:    var(--shadow-card)
 *   border:        none  ← NEVER add a border to a card
 *
 * Usage:
 *   <Card>…</Card>                          default padding (var(--card-padding))
 *   <Card style={{ padding: "20px" }}>…</Card>  custom padding
 *   <Card className="…">…</Card>            additional Tailwind / className overrides
 */

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Inner padding. Defaults to var(--card-padding). Pass a CSS string for custom values. */
  padding?: string | number;
}

export function Card({ padding, className, style, children, ...props }: CardProps) {
  return (
    <div
      className={cn("app-card", className)}
      style={{
        padding: padding ?? "var(--card-padding)",
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}
