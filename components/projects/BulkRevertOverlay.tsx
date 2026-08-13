"use client";

import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";

export interface BulkRevertOverlayProps {
  open: boolean;
  title: string;
  description?: string;
}

export function BulkRevertOverlay({ open, title, description }: BulkRevertOverlayProps) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-busy="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 570,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        paddingBottom: "max(24px, env(safe-area-inset-bottom, 0px))",
        backgroundColor: "var(--overlay-bg, rgba(0,0,0,0.45))",
        backdropFilter: "blur(2px)",
        WebkitBackdropFilter: "blur(2px)",
        pointerEvents: "auto",
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 340,
          borderRadius: 16,
          padding: "24px 20px",
          backgroundColor: "var(--neutral-0)",
          boxShadow: "var(--shadow-2)",
          border: "1px solid var(--neutral-200)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
        }}
      >
        <Loader2
          size={36}
          strokeWidth={2}
          aria-hidden
          className="animate-spin"
          style={{ color: "var(--primary-600)" }}
        />
        <p
          id="bulk-revert-overlay-title"
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 700,
            color: "var(--neutral-900)",
            textAlign: "center",
          }}
        >
          {title}
        </p>
        {description ? (
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: "var(--neutral-600)",
              textAlign: "center",
              lineHeight: 1.45,
            }}
          >
            {description}
          </p>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
