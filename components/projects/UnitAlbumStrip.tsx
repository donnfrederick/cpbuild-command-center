"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useOfflineStatus } from "@/hooks/use-offline-status";
import { LightboxCaptureMetadata } from "@/components/shared/LightboxCaptureMetadata";
import { parseStatusDisplayFromStatusUpdateLabel } from "@/lib/media/album-scope-tags";
import type { AlbumItem, AlbumSourceType } from "@/lib/media/album-types";

export const SOURCE_COLORS: Record<AlbumSourceType, string> = {
  observation: "var(--primary-600)",
  observation_comment: "var(--primary-400)",
  issue: "var(--error-600)",
  issue_comment: "var(--error-400)",
  inspection: "var(--success-700)",
  general: "var(--neutral-500)",
  status_update: "var(--success-600)",
};

export function SourceBadge({ type }: { type: AlbumSourceType }) {
  const t = useTranslations("units.album");
  const labelMap: Record<AlbumSourceType, string> = {
    observation: t("sourceObservation"),
    observation_comment: t("sourceObservationComment"),
    issue: t("sourceIssue"),
    issue_comment: t("sourceIssueComment"),
    inspection: t("sourceInspection"),
    general: t("sourceGeneral"),
    status_update: t("sourceStatusUpdate"),
  };
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color: "var(--neutral-0)",
        backgroundColor: SOURCE_COLORS[type],
        borderRadius: 3,
        padding: "2px 6px",
        lineHeight: 1.4,
      }}
    >
      {labelMap[type]}
    </span>
  );
}

function ScopePills({ codes }: { codes: string[] }) {
  if (codes.length === 0) return null;
  const visible = codes.slice(0, 2);
  const extra = codes.length - visible.length;
  return (
    <span
      style={{
        position: "absolute",
        top: 3,
        right: 3,
        display: "flex",
        flexWrap: "wrap",
        gap: 2,
        justifyContent: "flex-end",
        maxWidth: "70%",
        pointerEvents: "none",
      }}
    >
      {visible.map((code) => (
        <span
          key={code}
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.03em",
            textTransform: "uppercase",
            color: "var(--neutral-0)",
            backgroundColor: "var(--neutral-700)",
            borderRadius: 3,
            padding: "1px 4px",
            lineHeight: 1.3,
          }}
        >
          {code}
        </span>
      ))}
      {extra > 0 ? (
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: "var(--neutral-0)",
            backgroundColor: "var(--neutral-600)",
            borderRadius: 3,
            padding: "1px 4px",
            lineHeight: 1.3,
          }}
        >
          +{extra}
        </span>
      ) : null}
    </span>
  );
}

function StatusUpdateLabelPill({ label }: { label: string }) {
  return (
    <span
      title={label}
      style={{
        display: "block",
        maxWidth: "100%",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.02em",
        color: "var(--neutral-0)",
        backgroundColor: "var(--success-700)",
        borderRadius: 3,
        padding: "1px 5px",
        lineHeight: 1.3,
        boxSizing: "border-box",
      }}
    >
      {label}
    </span>
  );
}

interface AlbumThumbProps {
  item: AlbumItem;
  onClick: () => void;
  /** Fixed width for horizontal strip; omit for grid fill. */
  width?: number;
}

export function AlbumThumb({ item, onClick, width }: AlbumThumbProps) {
  const t = useTranslations("units.album");
  const [failed, setFailed] = useState(false);
  const { isOnline } = useOfflineStatus();
  const statusUpdateLabel =
    item.source.type === "status_update"
      ? parseStatusDisplayFromStatusUpdateLabel(item.source.label)
      : null;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: "relative",
        width: width ?? "100%",
        flexShrink: width ? 0 : undefined,
        aspectRatio: "4 / 3",
        borderRadius: 6,
        overflow: "hidden",
        border: "none",
        padding: 0,
        cursor: "pointer",
        backgroundColor: "var(--neutral-100)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      aria-label={item.caption ?? item.source.label ?? t("photo")}
    >
      {failed || !isOnline ? (
        <span style={{ fontSize: 10, color: "var(--neutral-400)", padding: 4, textAlign: "center" }}>
          —
        </span>
      ) : item.mimeType.startsWith("image/") ? (
        <img
          src={item.storageUrl}
          alt={item.caption ?? ""}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <video
          src={item.storageUrl}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          muted
          playsInline
          onError={() => setFailed(true)}
        />
      )}
      {statusUpdateLabel ? (
        <span
          style={{
            position: "absolute",
            bottom: 3,
            left: 3,
            right: 3,
            pointerEvents: "none",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 2,
            maxWidth: "calc(100% - 6px)",
          }}
        >
          <SourceBadge type={item.source.type} />
          <StatusUpdateLabelPill label={statusUpdateLabel} />
        </span>
      ) : (
        <span
          style={{
            position: "absolute",
            bottom: 3,
            left: 3,
            pointerEvents: "none",
          }}
        >
          <SourceBadge type={item.source.type} />
        </span>
      )}
      {item.source.scopeCodes?.length ? (
        <ScopePills codes={item.source.scopeCodes} />
      ) : null}
    </button>
  );
}

export function AlbumLightbox({
  items,
  initialIndex,
  onClose,
}: {
  items: AlbumItem[];
  initialIndex: number;
  onClose: () => void;
}) {
  const t = useTranslations("units.album");
  const [idx, setIdx] = useState(initialIndex);
  const item = items[idx];
  const total = items.length;
  const statusUpdateLabel =
    item.source.type === "status_update"
      ? parseStatusDisplayFromStatusUpdateLabel(item.source.label)
      : null;

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
      aria-label={t("photoViewerLabel")}
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
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
          {idx + 1} {t("of")} {total}
        </span>
        <button
          type="button"
          onClick={onClose}
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
        style={{
          maxWidth: "min(90vw, 800px)",
          maxHeight: "70vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {item.mimeType.startsWith("image/") ? (
          <img
            key={item.id}
            src={item.storageUrl}
            alt={item.caption ?? ""}
            style={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain", borderRadius: 6 }}
          />
        ) : (
          <video
            key={item.id}
            src={item.storageUrl}
            controls
            style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: 6 }}
          />
        )}
      </div>

      {(item.caption || item.source.label || item.source.scopeCodes?.length) && (
        <div style={{ marginTop: 12, textAlign: "center", padding: "0 24px" }}>
          {item.caption ? (
            <p style={{ fontSize: 13, color: "var(--neutral-0)", margin: "0 0 4px" }}>{item.caption}</p>
          ) : null}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
            <SourceBadge type={item.source.type} />
            {statusUpdateLabel ? (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "var(--neutral-0)",
                  backgroundColor: "var(--success-700)",
                  borderRadius: 3,
                  padding: "2px 6px",
                }}
              >
                {statusUpdateLabel}
              </span>
            ) : null}
            {item.source.scopeCodes?.map((code) => (
              <span
                key={code}
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "var(--neutral-0)",
                  backgroundColor: "var(--neutral-600)",
                  borderRadius: 3,
                  padding: "2px 6px",
                }}
              >
                {code}
              </span>
            ))}
          </div>
          {item.source.label ? (
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", display: "block", marginTop: 4 }}>
              {item.source.label}
            </span>
          ) : null}
        </div>
      )}

      <div
        style={{
          marginTop: 8,
          maxWidth: "min(90vw, 800px)",
          width: "100%",
          padding: "0 16px 16px",
          overflowY: "auto",
          maxHeight: "min(28vh, 240px)",
        }}
      >
        <LightboxCaptureMetadata captureContext={item.captureContext} />
      </div>

      {total > 1 ? (
        <>
          <button
            type="button"
            onClick={prev}
            aria-label={t("previous")}
            style={{
              position: "absolute",
              left: 8,
              top: "50%",
              transform: "translateY(-50%)",
              background: "rgba(0,0,0,0.4)",
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
            onClick={next}
            aria-label={t("next")}
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              background: "rgba(0,0,0,0.4)",
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
    </div>
  );
}

interface UnitAlbumHorizontalStripProps {
  items: AlbumItem[];
  emptyMessage?: string;
}

export function UnitAlbumHorizontalStrip({ items, emptyMessage }: UnitAlbumHorizontalStripProps) {
  const t = useTranslations("units.album");
  const tMedia = useTranslations("units.mediaView");
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  if (items.length === 0) {
    return (
      <p style={{ fontSize: 12, color: "var(--neutral-400)", margin: "8px 0 0", padding: "0 12px" }}>
        {emptyMessage ?? t("empty")}
      </p>
    );
  }

  return (
    <>
      <div
        role="list"
        aria-label={tMedia("stripAria")}
        style={{
          display: "flex",
          gap: 8,
          overflowX: "auto",
          padding: "8px 12px 12px",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {items.map((item, i) => (
          <div key={item.id} role="listitem">
            <AlbumThumb item={item} width={120} onClick={() => setLightboxIdx(i)} />
          </div>
        ))}
      </div>
      {lightboxIdx !== null ? (
        <AlbumLightbox
          items={items}
          initialIndex={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      ) : null}
    </>
  );
}
