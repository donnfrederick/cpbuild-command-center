"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

export interface FieldNotePhotoAttachment {
  id: string;
  storageUrl: string;
  mimeType?: string | null;
  caption?: string | null;
}

const DEFAULT_MAX_VISIBLE = 5;

function isImageAttachment(a: FieldNotePhotoAttachment): boolean {
  if (!a.storageUrl?.trim()) return false;
  if (!a.mimeType) return true;
  return a.mimeType.startsWith("image/");
}

function FieldNotePhotoLightbox({
  images,
  initialIndex,
  onClose,
}: {
  images: FieldNotePhotoAttachment[];
  initialIndex: number;
  onClose: () => void;
}) {
  const tAlbum = useTranslations("units.album");
  const tReport = useTranslations("fieldDailyReport");
  const [idx, setIdx] = useState(initialIndex);
  const item = images[idx];
  const total = images.length;

  const prev = useCallback(() => setIdx((i) => (i - 1 + total) % total), [total]);
  const next = useCallback(() => setIdx((i) => (i + 1) % total), [total]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, prev, next]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={tAlbum("photoViewerLabel")}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        backgroundColor: "var(--overlay-bg, color-mix(in srgb, var(--color-surface-dark) 88%, transparent))",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
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
        onClick={(e) => e.stopPropagation()}
      >
        <span style={{ fontSize: 12, color: "var(--color-text-inverse)" }}>
          {idx + 1} {tAlbum("of")} {total}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={tReport("close")}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--color-text-inverse)",
            padding: 4,
            display: "flex",
            alignItems: "center",
          }}
        >
          <X size={22} aria-hidden />
        </button>
      </div>

      <div
        style={{
          maxWidth: "min(90vw, 800px)",
          maxHeight: "70vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={item.id}
          src={item.storageUrl}
          alt={item.caption ?? ""}
          style={{
            maxWidth: "100%",
            maxHeight: "70vh",
            objectFit: "contain",
            borderRadius: "var(--radius-sm)",
          }}
        />
      </div>
    </div>
  );
}

/** Up to five image thumbnails in one mobile row; tap to expand. */
export function FieldNotePhotoStrip({
  attachments,
  maxVisible = DEFAULT_MAX_VISIBLE,
}: {
  attachments: FieldNotePhotoAttachment[];
  maxVisible?: number;
}) {
  const tReport = useTranslations("fieldDailyReport");
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const images = (attachments ?? []).filter(isImageAttachment);
  if (images.length === 0) return null;

  const visible = images.slice(0, maxVisible);
  const overflow = images.length - maxVisible;

  return (
    <>
      <div className="field-note-photo-strip">
        {visible.map((a, idx) => {
          const isLast = idx === maxVisible - 1 && overflow > 0;
          return (
            <div key={a.id} className="field-note-photo-strip__thumb-wrap">
              <button
                type="button"
                className="field-note-photo-strip__thumb-btn"
                aria-label={tReport("viewPhoto", { n: idx + 1 })}
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIdx(idx);
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.storageUrl} alt="" className="field-note-photo-strip__thumb" />
                {isLast && (
                  <span className="field-note-photo-strip__overflow" aria-hidden>
                    +{overflow}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>
      {lightboxIdx !== null && (
        <FieldNotePhotoLightbox
          images={images}
          initialIndex={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}
    </>
  );
}
