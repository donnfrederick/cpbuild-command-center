"use client";

/**
 * StatusUpdatePhotoPrompt
 *
 * Shown after a user selects a new scope status but BEFORE the patch is saved
 * (online). Gives three choices:
 *   – Skip       → status saves without any photos
 *   – Add Photos → opens CameraCapture; on capture the photos are uploaded to
 *                  the unit album tagged as a "status_update", then status saves
 *   – Cancel     → status change is discarded entirely
 *
 * Offline: status is saved immediately (auto-default, no photo prompt gate).
 * Optional photos are queued in IDB + mutation queue and sync on reconnect.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, X } from "lucide-react";
import { useSyncExternalStore } from "react";
import { useIsBrowser } from "@/hooks/use-is-browser";
import { useOfflineStatus } from "@/hooks/use-offline-status";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CameraCapture } from "@/components/projects/CameraCapture";
import type { CapturedFile } from "@/components/projects/CameraCapture";
import { SubcontractorPicker } from "@/components/projects/SubcontractorPicker";
import type { BurnLocation } from "@/lib/image-utils";
import { enqueueStatusPhotoMutation } from "@/lib/offline/status-photo-queue";
import { invalidateUnitAlbumClientCache } from "@/lib/media/unit-album-client-cache";
import { MAX_PHOTOS_PER_CAPTURE_SESSION } from "@/lib/media-attachment-limits";
import type { CaptureClientMetadata } from "@/lib/media/capture-context-schema";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StatusUpdatePhotoAssignment {
  unifierSubId: string;
  subcontractorDisplayName?: string;
}

export interface StatusUpdatePhotoPromptProps {
  /** Display name for the scope (e.g. "Framing") */
  scopeName: string;
  /** Human-readable status label (e.g. "In Progress") */
  statusDisplayLabel: string;
  projectId: string;
  unitRef: string;
  /** Forwarded to CameraCapture for watermark burning */
  location?: BurnLocation;
  /** When true, user must pick a subcontractor before saving Install Complete-Verified. */
  requireSubcontractorAssignment?: boolean;
  /** Current subcontractor on the scope row (if any). */
  initialSubcontractorId?: string | null;
  currentUserId?: string;
  /** Persist the pending scope status (PATCH or offline queue). */
  onSaveStatus: (assignment?: StatusUpdatePhotoAssignment) => void;
  /** Close the prompt after save (and optional photos). */
  onDone: () => void;
  /** Discard the pending pick without saving (online only). */
  onCancel: () => void;
}

type PromptState = "prompt" | "camera" | "uploading";

// ── Device detection (mirrors UnitCards internal hooks) ───────────────────────

function useIsDesktop() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(min-width: 768px)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(min-width: 768px)").matches,
    () => false,
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function UploadingState({ label }: { label: string }) {
  return (
    <div className="status-photo-prompt-uploading">
      <div
        className="animate-spin"
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          border: "3px solid var(--neutral-200)",
          borderTopColor: "var(--color-surface-dark)",
        }}
        aria-hidden
      />
      <span className="status-photo-prompt-uploading__label">{label}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function StatusUpdatePhotoPrompt({
  scopeName,
  statusDisplayLabel,
  projectId,
  unitRef,
  location,
  requireSubcontractorAssignment = false,
  initialSubcontractorId = null,
  currentUserId,
  onSaveStatus,
  onDone,
  onCancel,
}: StatusUpdatePhotoPromptProps) {
  const t = useTranslations("statusPhotoPrompt");
  const tInsp = useTranslations("inspections");
  const tUnits = useTranslations("units");
  const { isOnline } = useOfflineStatus();
  const isBrowser = useIsBrowser();
  const isDesktop = useIsDesktop();
  const titleId = useId();
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState<PromptState>("prompt");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [statusSavedOffline, setStatusSavedOffline] = useState(false);
  const [selectedSubcontractorId, setSelectedSubcontractorId] = useState<string | null>(
    initialSubcontractorId ?? null,
  );
  const [selectedSubcontractorName, setSelectedSubcontractorName] = useState<string | null>(null);
  const autoSavedRef = useRef(false);
  const prevInitialSubcontractorIdRef = useRef(initialSubcontractorId);
  if (prevInitialSubcontractorIdRef.current !== initialSubcontractorId) {
    prevInitialSubcontractorIdRef.current = initialSubcontractorId;
    setSelectedSubcontractorId(initialSubcontractorId ?? null);
  }

  const isOfflineFlow = !isOnline || statusSavedOffline;
  const needsSubcontractor =
    requireSubcontractorAssignment && !selectedSubcontractorId?.trim();
  const sourceLabel = `${scopeName} · ${statusDisplayLabel}`;
  const albumUrl = `/api/projects/${projectId}/album?unitRef=${encodeURIComponent(unitRef)}`;

  const buildAssignment = useCallback((): StatusUpdatePhotoAssignment | undefined => {
    if (!requireSubcontractorAssignment || !selectedSubcontractorId?.trim()) return undefined;
    return {
      unifierSubId: selectedSubcontractorId.trim(),
      subcontractorDisplayName: selectedSubcontractorName?.trim() || undefined,
    };
  }, [requireSubcontractorAssignment, selectedSubcontractorId, selectedSubcontractorName]);

  // Offline auto-default: save status without photos as soon as the prompt mounts.
  useEffect(() => {
    if (isOnline || autoSavedRef.current) return;
    if (requireSubcontractorAssignment && !initialSubcontractorId?.trim()) return;
    autoSavedRef.current = true;
    onSaveStatus(buildAssignment());
    queueMicrotask(() => setStatusSavedOffline(true));
  }, [isOnline, onSaveStatus, requireSubcontractorAssignment, initialSubcontractorId, buildAssignment]);

  // Animate in
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const handleClose = useCallback(() => {
    setVisible(false);
    window.setTimeout(isOfflineFlow ? onDone : onCancel, 260);
  }, [isOfflineFlow, onDone, onCancel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state === "prompt") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClose, state]);

  /** Upload a single File to storage then link it to the unit album as a status_update. */
  const uploadAndLinkOnline = useCallback(
    async (file: File, captureMetadata?: CaptureClientMetadata): Promise<void> => {
      const form = new FormData();
      form.append("file", file);
      form.append("type", "album");
      form.append("projectId", projectId);
      if (captureMetadata) {
        form.append("captureMetadata", JSON.stringify(captureMetadata));
      }
      const uploadRes = await fetch("/api/upload/field-media", { method: "POST", body: form });
      if (!uploadRes.ok) throw new Error("upload failed");
      const uploadData = await uploadRes.json() as {
        storageKey: string;
        storageUrl: string;
        mimeType: string;
        fileSizeBytes: number;
      };

      const linkRes = await fetch(albumUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storageKey: uploadData.storageKey,
          storageUrl: uploadData.storageUrl,
          mimeType: uploadData.mimeType,
          fileSizeBytes: uploadData.fileSizeBytes,
          caption: null,
          sourceType: "status_update",
          sourceLabel,
        }),
      });
      if (!linkRes.ok) throw new Error("link failed");
    },
    [albumUrl, projectId, sourceLabel],
  );

  const queueOfflinePhotos = useCallback(
    async (captured: CapturedFile[]): Promise<boolean> => {
      let queued = 0;
      for (const c of captured) {
        try {
          await enqueueStatusPhotoMutation({
            albumUrl,
            sourceLabel,
            file: c.file,
          });
          queued += 1;
        } catch {
          // continue — partial queue is better than losing all
        }
      }
      return queued > 0;
    },
    [albumUrl, sourceLabel],
  );

  const handleCameraCapture = useCallback(
    async (captured: CapturedFile[]) => {
      setState("uploading");
      setUploadError(null);

      if (isOfflineFlow) {
        const queued = await queueOfflinePhotos(captured);
        if (queued) {
          toast.success(t("offlinePhotosQueued"));
        } else {
          toast.error(t("offlinePhotosQueueFailed"));
          setUploadError(t("offlinePhotosQueueFailed"));
          setState("prompt");
          return;
        }
        setVisible(false);
        window.setTimeout(onDone, 10);
        return;
      }

      let hasError = false;
      for (const c of captured) {
        try {
          await uploadAndLinkOnline(c.file, c.captureMetadata);
        } catch {
          hasError = true;
        }
      }
      if (hasError) {
        setUploadError(t("uploadError"));
        setState("prompt");
        return;
      }
      invalidateUnitAlbumClientCache(projectId, unitRef);
      onSaveStatus(buildAssignment());
      setVisible(false);
      window.setTimeout(onDone, 10);
    },
    [isOfflineFlow, queueOfflinePhotos, uploadAndLinkOnline, onSaveStatus, onDone, t, buildAssignment, projectId, unitRef],
  );

  const handleSkipOrDone = useCallback(() => {
    if (needsSubcontractor) return;
    setVisible(false);
    window.setTimeout(() => {
      if (!isOfflineFlow) {
        onSaveStatus(buildAssignment());
      }
      onDone();
    }, 10);
  }, [needsSubcontractor, isOfflineFlow, onSaveStatus, onDone, buildAssignment]);

  if (!isBrowser) return null;

  // Camera is full-screen — render outside the sheet when active
  if (state === "camera") {
    return (
      <CameraCapture
        projectId={projectId}
        location={location}
        burnOptions={{ scopeName, statusLabel: statusDisplayLabel }}
        maxItems={MAX_PHOTOS_PER_CAPTURE_SESSION}
        onCapture={handleCameraCapture}
        onClose={() => setState("prompt")}
      />
    );
  }

  const headerContent = (
    <header className="status-photo-prompt-header">
      <div className="status-photo-prompt-header__row">
        <div style={{ minWidth: 0 }}>
          <h2 id={titleId} className="status-photo-prompt-header__title">
            {isOfflineFlow ? t("offlineTitle") : t("title")}
          </h2>
          <p className="status-photo-prompt-header__subtitle">
            {scopeName} — {statusDisplayLabel}
          </p>
        </div>
        <button
          type="button"
          onClick={handleClose}
          aria-label={t("closeAria")}
          className="status-photo-prompt-header__close"
        >
          <X size={20} aria-hidden />
        </button>
      </div>
    </header>
  );

  const bodyContent = state === "uploading" ? (
    <UploadingState label={isOfflineFlow ? t("offlineSavingPhotos") : t("uploading")} />
  ) : (
    <div className="status-photo-prompt-body">
      {uploadError && (
        <p role="alert" className="status-photo-prompt-body__error">
          {uploadError}
        </p>
      )}
      <p className="status-photo-prompt-body__text">
        {isOfflineFlow ? t("offlineBody") : t("body")}
      </p>

      {requireSubcontractorAssignment && (
        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              marginBottom: 6,
              fontSize: 11,
              fontWeight: 700,
              color: needsSubcontractor ? "var(--error-600)" : "var(--neutral-500)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            {needsSubcontractor
              ? tInsp("clearInspectionSubcontractorRequired")
              : tUnits("subcontractorLabel")}
          </div>
          <SubcontractorPicker
            value={selectedSubcontractorId}
            readOnly={false}
            projectId={projectId}
            userId={currentUserId}
            fullWidth
            onChange={(id, displayName) => {
              setSelectedSubcontractorId(id);
              setSelectedSubcontractorName(displayName?.trim() || null);
            }}
          />
        </div>
      )}

      {isOfflineFlow ? (
        <>
          <button
            type="button"
            onClick={handleSkipOrDone}
            disabled={needsSubcontractor}
            className="status-photo-prompt__primary"
          >
            {t("offlineDone")}
          </button>
          <button
            type="button"
            onClick={() => setState("camera")}
            disabled={needsSubcontractor}
            className="status-photo-prompt__secondary"
          >
            <Camera size={18} aria-hidden />
            {t("offlineAddPhotos")}
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setState("camera")}
            disabled={needsSubcontractor}
            className="status-photo-prompt__primary"
          >
            <Camera size={18} aria-hidden />
            {t("addPhotos")}
          </button>
          <button
            type="button"
            onClick={handleSkipOrDone}
            disabled={needsSubcontractor}
            className="status-photo-prompt__secondary"
          >
            {t("skip")}
          </button>
          <div className="status-photo-prompt__divider" aria-hidden />
          <button type="button" onClick={handleClose} className="status-photo-prompt__ghost">
            {t("cancel")}
          </button>
        </>
      )}
    </div>
  );

  if (isDesktop) {
    return createPortal(
      <div
        className="status-photo-prompt-modal-backdrop"
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget && state !== "uploading") handleClose();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="status-photo-prompt-modal"
          onClick={(e) => e.stopPropagation()}
        >
          {headerContent}
          {bodyContent}
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      role="presentation"
      className={`status-photo-prompt-backdrop${visible ? " status-photo-prompt-backdrop--visible" : ""}`}
      onClick={(e) => {
        if (e.target === e.currentTarget && state !== "uploading") handleClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`status-photo-prompt-sheet${visible ? " status-photo-prompt-sheet--visible" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="status-photo-prompt-handle" aria-hidden />
        {headerContent}
        {bodyContent}
      </div>
    </div>,
    document.body,
  );
}
