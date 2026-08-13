"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useIsBrowser } from "@/hooks/use-is-browser";
import type { ActivityMediaPreview } from "@/lib/activity-media-previews";

interface FieldMediaLightboxProps {
  items: ActivityMediaPreview[];
  initialIndex: number;
  onClose: () => void;
}

export function FieldMediaLightbox({ items, initialIndex, onClose }: FieldMediaLightboxProps) {
  const t = useTranslations("units.album");
  const isBrowser = useIsBrowser();
  const [idx, setIdx] = useState(initialIndex);
  const item = items[idx];
  const total = items.length;

  const prev = useCallback(() => setIdx((i) => (i - 1 + total) % total), [total]);
  const next = useCallback(() => setIdx((i) => (i + 1) % total), [total]);

  useEffect(() => {
    setIdx(initialIndex);
  }, [initialIndex]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, prev, next]);

  if (!isBrowser || !item) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("photoViewerLabel")}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        backgroundColor: "var(--overlay-bg, rgba(0,0,0,0.88))",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          padding: "12px 16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: 12, color: "var(--neutral-300)" }}>
          {idx + 1} {t("of")} {total}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label={t("close")}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--neutral-0)",
            padding: 4,
            display: "flex",
            alignItems: "center",
          }}
        >
          <X size={22} aria-hidden />
        </button>
      </div>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "min(90vw, 800px)",
          maxHeight: "70vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={item.id}
          src={item.storageUrl}
          alt=""
          style={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain", borderRadius: 6 }}
        />
      </div>

      {total > 1 ? (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            aria-label={t("previous")}
            style={{
              position: "absolute",
              left: 8,
              top: "50%",
              transform: "translateY(-50%)",
              background: "var(--overlay-bg, rgba(0,0,0,0.4))",
              border: "none",
              borderRadius: "50%",
              width: 40,
              height: 40,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--neutral-0)",
            }}
          >
            <ChevronLeft size={20} aria-hidden />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            aria-label={t("next")}
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              background: "var(--overlay-bg, rgba(0,0,0,0.4))",
              border: "none",
              borderRadius: "50%",
              width: 40,
              height: 40,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--neutral-0)",
            }}
          >
            <ChevronRight size={20} aria-hidden />
          </button>
        </>
      ) : null}
    </div>,
    document.body,
  );
}
