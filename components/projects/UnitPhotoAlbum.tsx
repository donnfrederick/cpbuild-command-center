"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Camera, Images } from "lucide-react";
import { resolveClientMime as resolveClientMimeUtil } from "@/lib/image-utils";
import type { BurnLocation } from "@/lib/image-utils";
import { invalidateUnitAlbumClientCache, UNIT_ALBUM_UPDATED_EVENT } from "@/lib/media/unit-album-client-cache";
import { markUnitAlbumTouched } from "@/lib/offline/album-warm-session";
import { useOfflineStatus } from "@/hooks/use-offline-status";
import { useFileDrop } from "@/hooks/use-file-drop";
import { FileDropOverlay } from "@/components/ui/FileDropOverlay";
import { CameraCapture } from "@/components/projects/CameraCapture";
import { MAX_MEDIA_ATTACHMENTS_PER_ENTITY } from "@/lib/media-attachment-limits";
import type { CapturedFile } from "@/components/projects/CameraCapture";
import type { AlbumItem } from "@/lib/media/album-types";
import { AlbumLightbox, AlbumThumb } from "@/components/projects/UnitAlbumStrip";

const ALBUM_MEDIA_ACCEPT = "image/*,image/heic,image/heif,video/*";

interface UnitPhotoAlbumProps {
  projectId: string;
  unitRef: string;
  location?: BurnLocation;
  onCountChange?: (count: number) => void;
}

export function UnitPhotoAlbum({ projectId, unitRef, location, onCountChange }: UnitPhotoAlbumProps) {
  const t = useTranslations("units.album");
  const tCommon = useTranslations("common");
  const { isOnline } = useOfflineStatus();

  const [items, setItems] = useState<AlbumItem[] | null>(null);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (items) onCountChange?.(items.length);
  }, [items, onCountChange]);

  const loadAlbum = useCallback(async (signal?: AbortSignal): Promise<void> => {
    try {
      const res = await fetch(
        `/api/projects/${projectId}/album?unitRef=${encodeURIComponent(unitRef)}`,
        { cache: isOnline ? "no-store" : "default", signal },
      );
      if (!res.ok) {
        setItems([]);
        return;
      }
      const data = (await res.json()) as { items: AlbumItem[] };
      setItems(data.items);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setItems([]);
    }
  }, [projectId, unitRef, isOnline]);

  useEffect(() => {
    markUnitAlbumTouched(projectId, unitRef);
    const ctrl = new AbortController();
    void Promise.resolve().then(() => loadAlbum(ctrl.signal));
    return () => ctrl.abort();
  }, [loadAlbum]);

  useEffect(() => {
    function handleInspectionUpdated() {
      void loadAlbum();
    }
    window.addEventListener("inspections:updated", handleInspectionUpdated);
    return () => window.removeEventListener("inspections:updated", handleInspectionUpdated);
  }, [loadAlbum]);

  useEffect(() => {
    function handleAlbumUpdated(event: Event) {
      const detail = (event as CustomEvent<{ projectId: string; unitRef: string }>).detail;
      if (detail?.projectId === projectId && detail?.unitRef === unitRef) {
        void loadAlbum();
      }
    }
    window.addEventListener(UNIT_ALBUM_UPDATED_EVENT, handleAlbumUpdated);
    return () => window.removeEventListener(UNIT_ALBUM_UPDATED_EVENT, handleAlbumUpdated);
  }, [projectId, unitRef, loadAlbum]);

  const uploadAndLink = useCallback(async (file: File): Promise<void> => {
    const form = new FormData();
    form.append("file", file);
    form.append("type", "album");
    const uploadRes = await fetch("/api/upload/field-media", { method: "POST", body: form });
    if (!uploadRes.ok) throw new Error("upload failed");
    const uploadData = (await uploadRes.json()) as {
      storageKey: string;
      storageUrl: string;
      mimeType: string;
      fileSizeBytes: number;
    };

    const linkRes = await fetch(`/api/projects/${projectId}/album?unitRef=${encodeURIComponent(unitRef)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storageKey: uploadData.storageKey,
        storageUrl: uploadData.storageUrl,
        mimeType: uploadData.mimeType,
        fileSizeBytes: uploadData.fileSizeBytes,
        caption: null,
      }),
    });
    if (!linkRes.ok) throw new Error("link failed");
    const { item } = (await linkRes.json()) as { item: AlbumItem };
    invalidateUnitAlbumClientCache(projectId, unitRef);
    setItems((prev) => (prev ? [item, ...prev] : [item]));
  }, [projectId, unitRef]);

  const handleFileSelect = useCallback(async (files: FileList | File[] | null) => {
    if (!files || (Array.isArray(files) ? files.length === 0 : files.length === 0)) return;
    setUploadError(null);
    setUploading(true);

    for (const file of Array.from(files)) {
      const mime = resolveClientMimeUtil(file);
      if (!mime.startsWith("image/") && !mime.startsWith("video/")) continue;
      try {
        await uploadAndLink(file);
      } catch {
        setUploadError(t("uploadError"));
      }
    }

    setUploading(false);
  }, [uploadAndLink, t]);

  const handleMediaDropRejected = useCallback(() => {
    setUploadError(tCommon("dropRejectedFileType"));
  }, [tCommon]);

  const { dropHandlers } = useFileDrop({
    onFiles: (files) => { void handleFileSelect(files); },
    onRejected: handleMediaDropRejected,
    accept: ALBUM_MEDIA_ACCEPT,
    disabled: uploading || !isOnline,
  });

  const handleCameraCapture = useCallback(async (captured: CapturedFile[]) => {
    setShowCamera(false);
    if (captured.length === 0) return;
    setUploadError(null);
    setUploading(true);

    for (const c of captured) {
      try {
        await uploadAndLink(c.file);
      } catch {
        setUploadError(t("uploadError"));
      }
    }

    setUploading(false);
  }, [uploadAndLink, t]);

  if (items === null) {
    return (
      <div style={{ padding: "16px 0", textAlign: "center" }}>
        <span style={{ fontSize: 12, color: "var(--neutral-400)" }}>…</span>
      </div>
    );
  }

  return (
    <div style={{ paddingTop: 8 }}>
      {isOnline && (
        <div style={{ marginBottom: 12, position: "relative" }} {...dropHandlers}>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              disabled={uploading}
              onClick={() => setShowCamera(true)}
              style={{
                flex: 1,
                minHeight: "var(--button-height)",
                borderRadius: "var(--radius-md)",
                border: "none",
                backgroundColor: "var(--control-active-bg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "var(--inline-gap)",
                fontSize: "var(--text-body)",
                fontWeight: "var(--font-weight-extrabold)",
                color: "var(--control-active-fg)",
                cursor: uploading ? "not-allowed" : "pointer",
                opacity: uploading ? 0.6 : 1,
                fontFamily: "inherit",
              }}
            >
              <Camera size={14} aria-hidden />
              {uploading ? t("uploading") : t("camera")}
            </button>
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              style={{
                flex: 1,
                minHeight: "var(--button-height)",
                borderRadius: "var(--radius-md)",
                border: "none",
                backgroundColor: "var(--control-bg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "var(--inline-gap)",
                fontSize: "var(--text-body)",
                fontWeight: "var(--font-weight-extrabold)",
                color: "var(--control-fg)",
                cursor: uploading ? "not-allowed" : "pointer",
                opacity: uploading ? 0.6 : 1,
                fontFamily: "inherit",
              }}
            >
              <Images size={14} aria-hidden />
              {t("library")}
            </button>
          </div>
          {uploadError ? (
            <span style={{ fontSize: 11, color: "var(--error-600)", marginTop: 4, display: "block" }} role="alert">
              {uploadError}
            </span>
          ) : null}
          <input
            ref={fileInputRef}
            type="file"
            accept={ALBUM_MEDIA_ACCEPT}
            multiple
            style={{ display: "none" }}
            onChange={(e) => { handleFileSelect(e.target.files); if (e.target) e.target.value = ""; }}
          />
          <FileDropOverlay disabled={uploading || !isOnline} />
        </div>
      )}

      {!items ? null : items.length === 0 ? (
        <div style={{ padding: "20px 0", textAlign: "center" }}>
          <p style={{ fontSize: "var(--text-body)", fontWeight: "var(--font-weight-medium)", color: "var(--color-text-tertiary)", margin: "0 0 4px" }}>{t("empty")}</p>
          <p style={{ fontSize: "var(--text-caption)", color: "var(--color-text-disabled)", margin: 0, maxWidth: 240, marginLeft: "auto", marginRight: "auto" }}>
            {t("emptyHint")}
          </p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 6,
          }}
        >
          {items.map((item, i) => (
            <AlbumThumb key={item.id} item={item} onClick={() => setLightboxIdx(i)} />
          ))}
        </div>
      )}

      {lightboxIdx !== null && !!items ? (
        <AlbumLightbox
          items={items}
          initialIndex={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      ) : null}

      {showCamera ? (
        <CameraCapture
          projectId={projectId}
          maxItems={MAX_MEDIA_ATTACHMENTS_PER_ENTITY}
          onCapture={handleCameraCapture}
          onClose={() => setShowCamera(false)}
          location={location}
        />
      ) : null}
    </div>
  );
}
