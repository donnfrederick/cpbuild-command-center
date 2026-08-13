"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { FieldMediaLightbox } from "@/components/shared/FieldMediaLightbox";
import {
  ACTIVITY_MEDIA_PREVIEW_LIMIT,
  readActivityMediaPreviews,
  type ActivityMediaPreview,
} from "@/lib/activity-media-previews";

const THUMB_SIZE = 52;

interface ActivityMediaStripProps {
  metadata: Record<string, unknown>;
  /** Override previews when already parsed (optional). */
  previews?: ActivityMediaPreview[];
}

export function ActivityMediaStrip({ metadata, previews }: ActivityMediaStripProps) {
  const tUnits = useTranslations("units");
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const images = previews ?? readActivityMediaPreviews(metadata);
  if (images.length === 0) return null;

  const visible = images.slice(0, ACTIVITY_MEDIA_PREVIEW_LIMIT);
  const overflow = images.length - ACTIVITY_MEDIA_PREVIEW_LIMIT;

  return (
    <>
      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
        {visible.map((attachment, idx) => {
          const isLast = idx === ACTIVITY_MEDIA_PREVIEW_LIMIT - 1 && overflow > 0;
          return (
            <button
              key={attachment.id}
              type="button"
              aria-label={tUnits("viewPhotoAria")}
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIdx(idx);
              }}
              style={{
                position: "relative",
                flexShrink: 0,
                width: THUMB_SIZE,
                height: THUMB_SIZE,
                borderRadius: 8,
                border: "none",
                padding: 0,
                cursor: "pointer",
                overflow: "hidden",
                backgroundColor: "var(--neutral-100)",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={attachment.storageUrl}
                alt=""
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />
              {isLast && (
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: 8,
                    backgroundColor: "var(--overlay-bg, rgba(0,0,0,0.45))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--neutral-0)",
                    fontSize: 12,
                    fontWeight: 700,
                    pointerEvents: "none",
                  }}
                >
                  +{overflow}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {lightboxIdx !== null ? (
        <FieldMediaLightbox
          items={images}
          initialIndex={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      ) : null}
    </>
  );
}
