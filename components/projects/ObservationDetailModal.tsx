"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useIsBrowser } from "@/hooks/use-is-browser";
import { createPortal } from "react-dom";
import { X, Paperclip, Pencil, ChevronLeft, ChevronRight, Loader2, FileDown, Camera, Images, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import type { ObsSummary, ObsAttachment } from "@/components/projects/UnitCards";
import type { UnitContext, ObservationScope } from "@/components/projects/AddObservationModal";
import { CommentThread } from "@/components/projects/CommentThread";
import { ImageAnnotationEditor } from "@/components/projects/ImageAnnotationEditor";
import { ImageAnnotationOverlay } from "@/components/projects/ImageAnnotationOverlay";
import { LightboxCaptureMetadata } from "@/components/shared/LightboxCaptureMetadata";
import { ImgWithOfflineFallback, VideoWithOfflineFallback } from "@/components/projects/MediaWithOfflineFallback";
import type { ImageAnnotationPayload } from "@/lib/image-annotation-schema";
import { parseImageAnnotation } from "@/lib/image-annotation-schema";
import { formatPdfExportErrorToast } from "@/lib/format-pdf-export-error-toast";
import { formatFieldNotesLocationDisplay } from "@/lib/field-notes-scope";
import { useFieldNotesLocationLabels, useFieldNotesBuilderTagDisplayLabels } from "@/components/projects/useFieldNotesLocationLabels";
import { useOfflineStatus } from "@/hooks/use-offline-status";
import { canEditObservation } from "@/lib/offline/observation-edit-eligibility";
import { useObservationCatalog } from "@/lib/observations/use-observation-catalog";
import { resolveObservationTypeBadgeMeta } from "@/lib/observations/observationDisplay";
import { saveObservationEditOffline } from "@/lib/offline/observation-offline-save";
import { enrichBodyWithActivityLocation } from "@/lib/activity/enrich-body-with-activity-location";
import { CameraCapture } from "@/components/projects/CameraCapture";
import type { CapturedFile } from "@/components/projects/CameraCapture";
import { uploadWithRetry } from "@/lib/upload-with-retry";
import { MAX_MEDIA_ATTACHMENTS_PER_ENTITY } from "@/lib/media-attachment-limits";
import { processLibraryMediaFile } from "@/lib/stage-library-field-media";
import { resolveClientMime as resolveClientMimeUtil, isFieldMediaImageFile } from "@/lib/image-utils";
import {
  FieldNotesEditLocationSection,
  fieldNotesEditLocationFromRecord,
  unitRefFromEditLocation,
  type FieldNotesEditLocationState,
} from "@/components/projects/FieldNotesEditLocationSection";

const VIDEO_SIZE_LIMIT = 50 * 1024 * 1024;

interface EditStagedItem {
  clientId: string;
  file: File;
  localUrl: string;
  mimeType: string;
}

// ── CSS ───────────────────────────────────────────────────────────────────────

const SHEET_CSS = `
  .odm-backdrop { position: fixed; inset: 0; z-index: 400; display: flex; align-items: flex-end; background: rgba(0,0,0,0); transition: background-color 0.26s ease; }
  .odm-backdrop.odm-visible { background: rgba(0,0,0,0.5); }
  .odm-sheet { position: relative; width: 100%; max-height: 94dvh; border-radius: 20px 20px 0 0; background: var(--neutral-0); transform: translateY(105%); transition: transform 0.3s cubic-bezier(0.32,0.72,0,1); display: flex; flex-direction: column; box-shadow: 0 -4px 40px rgba(0,0,0,0.18); }
  .odm-sheet.odm-visible { transform: translateY(0); }
  .odm-handle { width: 36px; height: 4px; background: var(--neutral-300); border-radius: 99px; margin: 10px auto 4px; flex-shrink: 0; }
  .odm-body { flex: 1; overflow-y: auto; padding: 0 var(--page-padding-x) calc(env(safe-area-inset-bottom, 0px) + 32px); }
  .odm-lightbox { position: fixed; inset: 0; z-index: 600; background: rgba(0,0,0,0.95); display: flex; align-items: center; justify-content: center; }
  @keyframes odm-spin { to { transform: rotate(360deg); } }
  .odm-spin { animation: odm-spin 1s linear infinite; }
  @media (min-width: 768px) {
    .odm-backdrop { align-items: stretch; justify-content: flex-end; }
    .odm-sheet { width: min(560px, 100vw); max-height: none; height: 100%; border-radius: 0; transform: translateX(105%); box-shadow: -4px 0 32px rgba(0,0,0,0.18); }
    .odm-sheet.odm-visible { transform: translateX(0); }
    .odm-handle { display: none; }
    .odm-body { padding-bottom: 32px; }
  }
`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}


// ── Media grid + lightbox ─────────────────────────────────────────────────────

function MediaGrid({
  attachments,
  projectId,
  observationId,
  canAnnotate,
  onVersionSaved,
}: {
  attachments: ObsAttachment[];
  projectId: string;
  observationId: string;
  canAnnotate: boolean;
  onVersionSaved?: (obs: ObsSummary) => void;
}) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [transcribing, setTranscribing] = useState<Record<string, boolean>>({});
  const [transcripts, setTranscripts] = useState<Record<string, string>>({});
  const [annotatingIdx, setAnnotatingIdx] = useState<number | null>(null);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});

  const photos = attachments.filter((a) => a.mimeType.startsWith("image/") || a.mimeType.startsWith("video/"));
  const audios = attachments.filter((a) => a.mimeType.startsWith("audio/"));

  async function handleTranscribe(a: ObsAttachment) {
    setTranscribing((p) => ({ ...p, [a.id]: true }));
    try {
      const res = await fetch(`/api/upload/field-media/${a.id}/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceLang: "es" }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json() as { transcriptEnglish?: string };
      setTranscripts((p) => ({ ...p, [a.id]: data.transcriptEnglish ?? "" }));
      toast.success("Transcription complete.");
    } catch {
      toast.error("Transcription failed. Please try again.");
    } finally {
      setTranscribing((p) => ({ ...p, [a.id]: false }));
    }
  }

  async function handleAnnotationSave(imageIdx: number, result: { kind: "layered"; annotation: ImageAnnotationPayload }) {
    setAnnotatingIdx(null);
    const original = photos[imageIdx];
    if (!original) return;

    setUploading((p) => ({ ...p, [original.id]: true }));
    try {
      const patch = await fetch(`/api/projects/${projectId}/observations/${observationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updateAttachmentAnnotation: {
            attachmentId: original.id,
            imageAnnotation: result.annotation,
          },
        }),
      });
      if (!patch.ok) {
        const err = await patch.text().catch(() => "");
        throw new Error(err || `HTTP ${patch.status}`);
      }
      const updated = (await patch.json()) as ObsSummary;
      const refreshed = await fetch(`/api/projects/${projectId}/observations/${observationId}`);
      if (refreshed.ok) {
        onVersionSaved?.((await refreshed.json()) as ObsSummary);
      } else {
        onVersionSaved?.(updated);
      }
      toast.success("Markup saved.");
    } catch {
      toast.error("Failed to save markup.");
    } finally {
      setUploading((p) => ({ ...p, [original.id]: false }));
    }
  }

  if (attachments.length === 0) return null;

  return (
    <>
      {photos.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginTop: 12 }}>
          {photos.map((a, idx) => (
            <div key={a.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {/* Wrapper: natural aspect ratio, no crop */}
              <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", backgroundColor: "var(--neutral-100)" }}>
                <button
                  type="button"
                  onClick={() => setLightboxIdx(idx)}
                  aria-label="View photo"
                  style={{
                    display: "block", width: "100%",
                    border: "none", padding: 0, cursor: "pointer",
                    backgroundColor: "transparent",
                  }}
                >
                  {a.mimeType.startsWith("image/") ? (
                    <ImageAnnotationOverlay
                      src={a.storageUrl}
                      annotation={parseImageAnnotation(a.imageAnnotation)}
                      alt={a.caption ?? ""}
                      style={{ width: "100%", height: "auto", display: "block" }}
                    />
                  ) : (
                    <VideoWithOfflineFallback src={a.storageUrl} style={{ width: "100%", height: "auto", display: "block" }} muted playsInline />
                  )}
                </button>
                {/* Annotate button (images only) */}
                {a.mimeType.startsWith("image/") && canAnnotate && onVersionSaved && (
                  <button
                    type="button"
                    aria-label="Annotate"
                    onClick={() => setAnnotatingIdx(idx)}
                    disabled={!!uploading[a.id]}
                    style={{
                      position: "absolute", bottom: 8, right: 8,
                      width: 40, height: 40, minWidth: 40, minHeight: 40, borderRadius: 99,
                      backgroundColor: "rgba(0,0,0,0.6)", border: "none",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: "pointer", padding: 0,
                    }}
                  >
                    {uploading[a.id]
                      ? <Loader2 size={16} style={{ color: "#fff" }} className="odm-spin" />
                      : <Pencil size={16} style={{ color: "#fff" }} />
                    }
                  </button>
                )}
              </div>
              {a.caption && (
                <p style={{ fontSize: 11, color: "var(--neutral-500)", margin: 0, lineHeight: 1.4 }}>{a.caption}</p>
              )}
              {a.lastMarkedBy && a.lastMarkedAt && (
                <p style={{ fontSize: 10, color: "var(--neutral-400)", margin: "2px 0 0", lineHeight: 1.3 }}>
                  Last marked by {a.lastMarkedBy.name ?? a.lastMarkedBy.email.split("@")[0]} · {formatDate(a.lastMarkedAt)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {audios.map((a) => (
        <div key={a.id} style={{ marginTop: 10 }}>
          <div style={{ borderRadius: 10, overflow: "hidden", backgroundColor: "var(--neutral-50)", border: "1px solid var(--neutral-200)" }}>
            { }
            <audio src={a.storageUrl} controls style={{ width: "100%", display: "block" }} />
          </div>
          {(transcripts[a.id] ?? a.transcriptEnglish) ? (
            <p style={{ fontSize: 12, color: "var(--neutral-700)", backgroundColor: "var(--neutral-50)", padding: "6px 10px", borderRadius: 8, margin: "4px 0 0" }}>
              {transcripts[a.id] ?? a.transcriptEnglish}
            </p>
          ) : (
            <button type="button" onClick={() => handleTranscribe(a)} disabled={transcribing[a.id]}
              style={{ marginTop: 4, fontSize: 11, fontWeight: 600, color: "var(--primary-600)", background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
              {transcribing[a.id] && <Loader2 size={11} className="odm-spin" />}
              {transcribing[a.id] ? "Transcribing…" : "Transcribe"}
            </button>
          )}
          {a.caption && <p style={{ fontSize: 11, color: "var(--neutral-500)", margin: "2px 0 0" }}>{a.caption}</p>}
        </div>
      ))}

      {/* Lightbox */}
      {lightboxIdx !== null && createPortal(
        (() => {
          const lbPhoto = photos[lightboxIdx];
          return (
        <div className="odm-lightbox" onClick={() => setLightboxIdx(null)}>
          <button type="button" aria-label="Close" onClick={() => setLightboxIdx(null)}
            style={{ position: "absolute", top: "calc(env(safe-area-inset-top,0px) + 12px)", right: 16, width: 40, height: 40, borderRadius: 99, border: "none", backgroundColor: "rgba(255,255,255,0.15)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={20} style={{ color: "#fff" }} />
          </button>
          {photos.length > 1 && (
            <button type="button" aria-label="Previous photo" onClick={(e) => {
              e.stopPropagation();
              const cur = lightboxIdx ?? 0;
              setLightboxIdx((cur - 1 + photos.length) % photos.length);
            }}
              style={{ position: "absolute", left: 8, top: "50%", marginTop: -22, width: 44, height: 44, borderRadius: 99, border: "none", backgroundColor: "rgba(255,255,255,0.15)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ChevronLeft size={24} style={{ color: "#fff" }} />
            </button>
          )}
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: "100vw", maxHeight: "90dvh", padding: "0 56px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            {lbPhoto.mimeType.startsWith("image/") ? (
              <div
                style={{
                  maxWidth: "100%",
                  maxHeight: "85dvh",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ImageAnnotationOverlay
                  src={lbPhoto.storageUrl}
                  annotation={parseImageAnnotation(lbPhoto.imageAnnotation)}
                  alt=""
                  style={{ maxWidth: "100%", maxHeight: "85dvh", borderRadius: 8 }}
                />
              </div>
            ) : (
              <VideoWithOfflineFallback src={lbPhoto.storageUrl} controls autoPlay playsInline style={{ maxWidth: "100%", maxHeight: "85dvh", width: "auto", height: "auto", borderRadius: 8, display: "block" }} />
            )}
            {lbPhoto.caption && (
              <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, marginTop: 10, textAlign: "center" }}>{lbPhoto.caption}</p>
            )}
            <LightboxCaptureMetadata captureContext={lbPhoto.captureContext} />
          </div>
          {photos.length > 1 && (
            <button type="button" aria-label="Next photo" onClick={(e) => {
              e.stopPropagation();
              const cur = lightboxIdx ?? 0;
              setLightboxIdx((cur + 1) % photos.length);
            }}
              style={{ position: "absolute", right: 8, top: "50%", marginTop: -22, width: 44, height: 44, borderRadius: 99, border: "none", backgroundColor: "rgba(255,255,255,0.15)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ChevronRight size={24} style={{ color: "#fff" }} />
            </button>
          )}
          {photos.length > 1 && (
            <div style={{ position: "absolute", bottom: "calc(env(safe-area-inset-bottom,0px) + 16px)", left: "50%", transform: "translateX(-50%)", color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: 600 }}>
              Photo {(lightboxIdx ?? 0) + 1} / {photos.length}
            </div>
          )}
        </div>
          );
        })(),
        document.body,
      )}

      {/* Annotation editor (post-submit) */}
      {annotatingIdx !== null && photos[annotatingIdx] && (
        <ImageAnnotationEditor
          src={photos[annotatingIdx].storageUrl}
          exportMode="layered"
          initialAnnotation={photos[annotatingIdx].imageAnnotation}
          onSave={(result) => {
            if ("kind" in result && result.kind === "layered") {
              void handleAnnotationSave(annotatingIdx, result);
            }
          }}
          onClose={() => setAnnotatingIdx(null)}
        />
      )}
    </>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export interface ObservationDetailModalProps {
  obs: ObsSummary;
  unitContext: UnitContext;
  projectId: string;
  /** Display name for PDF cover — optional */
  projectName?: string;
  currentUserId?: string;
  scopes?: ObservationScope[];
  onClose: () => void;
  onUpdated?: (updated: ObsSummary) => void;
  /** Navigation context — provided by the parent list when there is more than one item */
  currentIndex?: number;
  total?: number;
  onPrev?: () => void;
  onNext?: () => void;
  /** Opens directly in edit mode (e.g. from upload queue). */
  initialEditOpen?: boolean;
}

export function ObservationDetailModal({
  obs: initialObs,
  unitContext,
  projectId,
  projectName = "Project",
  currentUserId,
  scopes: _scopes = [],
  onClose,
  onUpdated,
  currentIndex,
  total,
  onPrev,
  onNext,
  initialEditOpen = false,
}: ObservationDetailModalProps) {
  const t = useTranslations("units");
  const fieldNotesLabels = useFieldNotesLocationLabels();
  const builderTagDisplayLabels = useFieldNotesBuilderTagDisplayLabels();
  const tOffline = useTranslations("offlineIndicator");
  const { isOnline } = useOfflineStatus();
  const { observationTypes } = useObservationCatalog(projectId);

  function requireOnline(): boolean {
    if (isOnline) return true;
    toast.error(tOffline("offlineActionUnavailable"));
    return false;
  }
  const isBrowser = useIsBrowser();
  const [visible, setVisible] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [obs, setObs] = useState(initialObs);
  const [editing, setEditing] = useState(initialEditOpen);
  const [editTitle, setEditTitle] = useState(obs.title ?? "");
  const [editDesc, setEditDesc] = useState(obs.description);
  const [editType, setEditType] = useState(obs.observationType);
  const [editLocation, setEditLocation] = useState<FieldNotesEditLocationState>(() =>
    fieldNotesEditLocationFromRecord(
      obs.unitRef,
      (obs.scopeTags ?? []).map((t) => t.row.id),
    ),
  );
  const [editSaving, setEditSaving] = useState(false);
  const [editStagedMedia, setEditStagedMedia] = useState<EditStagedItem[]>([]);
  const [editRemoveIds, setEditRemoveIds] = useState<Set<string>>(new Set());
  const [editUploadProgress, setEditUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [showEditCamera, setShowEditCamera] = useState(false);
  const [editAnnotatingId, setEditAnnotatingId] = useState<string | null>(null);
  const [editAnnotatingUploading, setEditAnnotatingUploading] = useState(false);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    setObs(initialObs);
  }, [initialObs]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/observations/${initialObs.id}`);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as ObsSummary;
        if (!cancelled) setObs(data);
      } catch {
        /* keep optimistic / list payload */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, initialObs.id]);

  const close = useCallback(() => {
    setVisible(false);
    window.setTimeout(onClose, 280);
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { close(); return; }
      if (e.key === "ArrowLeft"  && onPrev) { onPrev(); return; }
      if (e.key === "ArrowRight" && onNext) { onNext(); return; }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, onPrev, onNext]);

  const isAuthor = canEditObservation(obs, currentUserId);

  // ── Edit ───────────────────────────────────────────────────────────────────

  async function handleSaveEdit() {
    if (!editTitle.trim()) return;
    if (!currentUserId) {
      toast.error("You must be signed in to edit this observation.");
      return;
    }

    const effectivelyOffline =
      !isOnline || (typeof navigator !== "undefined" && !navigator.onLine);

    if (effectivelyOffline) {
      setEditSaving(true);
      try {
        const updated = await saveObservationEditOffline({
          projectId,
          obs,
          currentUserId,
          input: {
            title: editTitle.trim(),
            description: editDesc.trim(),
            observationType: editType,
            scopeTagIds: editLocation.scopeTagIds,
            unitRef: unitRefFromEditLocation(editLocation, obs.unitRef),
            removeAttachmentIds: Array.from(editRemoveIds),
            newMediaFiles: editStagedMedia.map((s) => ({
              file: s.file,
              mimeType: s.mimeType,
            })),
          },
        });
        setObs(updated);
        onUpdated?.(updated);
        setEditing(false);
        editStagedMedia.forEach((m) => URL.revokeObjectURL(m.localUrl));
        setEditStagedMedia([]);
        setEditRemoveIds(new Set());
        toast.success(t("obsUpdatedOffline"));
      } catch {
        toast.error(t("obsUpdateOfflineFailed"));
      } finally {
        setEditSaving(false);
      }
      return;
    }

    setEditSaving(true);

    // Upload any newly staged photos first
    const uploadedAttachments: { storageKey: string; storageUrl: string; mimeType: string; fileSizeBytes: number }[] = [];
    if (editStagedMedia.length > 0) {
      setEditUploadProgress({ current: 0, total: editStagedMedia.length });
      for (let i = 0; i < editStagedMedia.length; i++) {
        setEditUploadProgress({ current: i + 1, total: editStagedMedia.length });
        const s = editStagedMedia[i];
        try {
          const form = new FormData();
          form.append("file", s.file);
          form.append("type", "observations");
          const data = await uploadWithRetry(form, { projectId });
          uploadedAttachments.push({
            storageKey: data.storageKey,
            storageUrl: data.storageUrl,
            mimeType: data.mimeType,
            fileSizeBytes: data.fileSizeBytes,
          });
        } catch {
          toast.error(`Failed to upload a photo. Please try again.`);
          setEditUploadProgress(null);
          setEditSaving(false);
          return;
        }
      }
      setEditUploadProgress(null);
    }

    try {
      const body: Record<string, unknown> = {
        title: editTitle.trim(),
        description: editDesc.trim(),
        observationType: editType,
        scopeTagIds: editLocation.scopeTagIds,
        unitRef: unitRefFromEditLocation(editLocation, obs.unitRef),
      };
      if (editRemoveIds.size > 0) {
        body.removeAttachmentIds = Array.from(editRemoveIds);
      }
      if (uploadedAttachments.length > 0) {
        body.addAttachmentKeys = uploadedAttachments.map((a) => a.storageKey);
        body.addAttachmentUrls = uploadedAttachments.map((a) => a.storageUrl);
        body.addAttachmentMimeTypes = uploadedAttachments.map((a) => a.mimeType);
        body.addAttachmentFileSizeBytes = uploadedAttachments.map((a) => a.fileSizeBytes);
        body.addAttachmentCaptions = uploadedAttachments.map(() => "");
      }
      const bodyWithLocation = await enrichBodyWithActivityLocation(body);
      const res = await fetch(`/api/projects/${projectId}/observations/${obs.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyWithLocation),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json() as ObsSummary;
      setObs(updated);
      onUpdated?.(updated);
      setEditing(false);
      editStagedMedia.forEach((m) => URL.revokeObjectURL(m.localUrl));
      setEditStagedMedia([]);
      setEditRemoveIds(new Set());
      toast.success("Observation updated.");
    } catch {
      toast.error("Failed to save changes.");
    } finally {
      setEditSaving(false);
    }
  }

  function handleEditCameraCapture(captured: CapturedFile[]) {
    const existing = (obs.attachments ?? []).filter((a) => !editRemoveIds.has(a.id)).length;
    const slots = MAX_MEDIA_ATTACHMENTS_PER_ENTITY - existing - editStagedMedia.length;
    if (slots <= 0) return;
    const newItems: EditStagedItem[] = captured.slice(0, slots).map((c) => ({
      clientId: `${Date.now()}-${Math.random()}`,
      file: c.file,
      localUrl: c.localUrl,
      mimeType: c.mimeType,
    }));
    setEditStagedMedia((prev) => [...prev, ...newItems]);
  }

  async function handleEditFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const existing = (obs.attachments ?? []).filter((a) => !editRemoveIds.has(a.id)).length;
    const slots = MAX_MEDIA_ATTACHMENTS_PER_ENTITY - existing - editStagedMedia.length;
    if (slots <= 0) return;
    const rawFiles = Array.from(e.target.files ?? []).slice(0, slots);
    if (e.target) e.target.value = "";
    if (!rawFiles.length) return;

    const newItems: EditStagedItem[] = [];
    for (const file of rawFiles) {
      const mime = resolveClientMimeUtil(file);
      if (mime.startsWith("video/") && file.size > VIDEO_SIZE_LIMIT) {
        toast.error(`"${file.name}" exceeds the 50 MB video limit and was skipped.`);
        continue;
      }
      let processedFile = file;
      let processedMime = mime;
      try {
        const prepared = await processLibraryMediaFile(file, {
          stamp: {
            location: {
              building: unitContext.building,
              area: unitContext.area,
              level: unitContext.level,
              unit: unitContext.unit,
            },
            uploaded: true,
          },
        });
        processedFile = prepared.file;
        processedMime = prepared.mimeType;
      } catch {
        if (isFieldMediaImageFile(file)) {
          toast.error("Failed to prepare image. Please try another photo.");
          continue;
        }
      }
      newItems.push({
        clientId: `${Date.now()}-${Math.random()}`,
        file: processedFile,
        localUrl: URL.createObjectURL(processedFile),
        mimeType: processedMime,
      });
    }
    if (newItems.length > 0) setEditStagedMedia((prev) => [...prev, ...newItems]);
  }

  async function handleEditAnnotationSave(attachmentId: string, result: { kind: "layered"; annotation: ImageAnnotationPayload }) {
    setEditAnnotatingId(null);
    setEditAnnotatingUploading(true);
    try {
      const annotationPayload = {
        updateAttachmentAnnotation: {
          attachmentId,
          imageAnnotation: result.annotation,
        },
      };
      const bodyWithLocation = await enrichBodyWithActivityLocation(annotationPayload);
      const res = await fetch(`/api/projects/${projectId}/observations/${obs.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyWithLocation),
      });
      if (!res.ok) throw new Error();
      const refreshed = await fetch(`/api/projects/${projectId}/observations/${obs.id}`);
      if (refreshed.ok) {
        const updated = (await refreshed.json()) as ObsSummary;
        setObs(updated);
        onUpdated?.(updated);
      }
      toast.success("Markup saved.");
    } catch {
      toast.error("Failed to save markup.");
    } finally {
      setEditAnnotatingUploading(false);
    }
  }

  function handleVersionSaved(next: ObsSummary) {
    setObs(next);
    onUpdated?.(next);
  }

  async function handleExportPdf() {
    if (!requireOnline()) return;
    if (exportingPdf) return;
    setExportingPdf(true);
    try {
      const coverTitle = (obs.title || obs.description || "Observation").slice(0, 200);
      const res = await fetch(`/api/projects/${projectId}/observations/export-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          observationIds: [obs.id],
          projectName,
          filterSummary: t("exportDetailPdfFilterObs"),
          coverTitle,
          sortOrder: "newest",
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        toast.error(formatPdfExportErrorToast(errBody, t("exportDetailPdfFailed")));
        return;
      }
      const blob = await res.blob();
      const fileName = `observation-${obs.id.slice(0, 8)}.pdf`;
      const file = new File([blob], fileName, { type: "application/pdf" });
      const isMobilePwa =
        typeof navigator !== "undefined" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] }) &&
        window.matchMedia("(display-mode: standalone)").matches;
      if (isMobilePwa) {
        await navigator.share({ files: [file], title: fileName });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          URL.revokeObjectURL(url);
          document.body.removeChild(a);
        }, 1000);
      }
    } catch {
      toast.error(t("exportDetailPdfFailedGeneric"));
    } finally {
      setExportingPdf(false);
    }
  }

  if (!isBrowser) return null;

  const meta = resolveObservationTypeBadgeMeta(obs.observationType, observationTypes, t);
  const authorLabel = obs.author.name ?? obs.author.email.split("@")[0];
  const locationDisplay = formatFieldNotesLocationDisplay(
    obs.unitRef,
    projectName,
    t("projectLevelScope"),
    fieldNotesLabels,
    { buildPhaseTag: obs.buildPhaseTag, areaTag: obs.areaTag },
    builderTagDisplayLabels,
  );

  return (
    <>
      {showEditCamera && (
        <CameraCapture
          projectId={projectId}
          maxItems={MAX_MEDIA_ATTACHMENTS_PER_ENTITY - (obs.attachments ?? []).filter((a) => !editRemoveIds.has(a.id)).length - editStagedMedia.length}
          onCapture={(captured) => { handleEditCameraCapture(captured); setShowEditCamera(false); }}
          onClose={() => setShowEditCamera(false)}
          location={{ building: unitContext.building, area: unitContext.area, level: unitContext.level, unit: unitContext.unit }}
        />
      )}
      {editAnnotatingId && (() => {
        const attachment = (obs.attachments ?? []).find((a) => a.id === editAnnotatingId);
        if (!attachment) return null;
        return (
          <ImageAnnotationEditor
            src={attachment.storageUrl}
            exportMode="layered"
            initialAnnotation={attachment.imageAnnotation}
            onSave={(result) => {
              if ("kind" in result && result.kind === "layered") {
                void handleEditAnnotationSave(editAnnotatingId, result);
              }
            }}
            onClose={() => setEditAnnotatingId(null)}
          />
        );
      })()}
      {createPortal(
    <>
      <style>{SHEET_CSS}</style>
      <div
        role="presentation"
        className={`odm-backdrop${visible ? " odm-visible" : ""}`}
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Observation details"
          className={`odm-sheet${visible ? " odm-visible" : ""}`}
        >
          <div className="odm-handle" aria-hidden />

          {/* ── Header ── */}
          <div style={{ padding: "8px var(--page-padding-x) 0", flexShrink: 0 }}>

            {/* Row 1: type label (left) + action buttons (right) */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99, backgroundColor: meta.bg, color: meta.color, flexShrink: 0 }}>
                {meta.label}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                {isAuthor && !editing && (
                  <button type="button" onClick={() => {
                    setEditing(true);
                    setEditTitle(obs.title ?? "");
                    setEditDesc(obs.description);
                    setEditType(obs.observationType);
                    setEditLocation(fieldNotesEditLocationFromRecord(
                      obs.unitRef,
                      (obs.scopeTags ?? []).map((t) => t.row.id),
                    ));
                    setEditStagedMedia([]);
                    setEditRemoveIds(new Set());
                  }}
                    aria-label="Edit observation"
                    style={{ width: 30, height: 30, borderRadius: 99, border: "none", backgroundColor: "var(--neutral-100)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                    <Pencil size={13} style={{ color: "var(--neutral-500)" }} />
                  </button>
                )}
                {!editing && (
                  <button
                    type="button"
                    onClick={() => void handleExportPdf()}
                    disabled={exportingPdf}
                    aria-label={exportingPdf ? t("exportDetailPdfBusyAria") : t("exportDetailPdfAria")}
                    title={exportingPdf ? t("exportDetailPdfBusyAria") : t("exportDetailPdfAria")}
                    style={{
                      width: 30, height: 30, borderRadius: 99, border: "none", backgroundColor: "var(--neutral-100)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: exportingPdf ? "wait" : "pointer", opacity: exportingPdf ? 0.7 : 1,
                    }}
                  >
                    {exportingPdf
                      ? <Loader2 size={14} style={{ color: "var(--neutral-500)" }} className="odm-spin" />
                      : <FileDown size={14} style={{ color: "var(--neutral-500)" }} />}
                  </button>
                )}
                <button type="button" onClick={close} aria-label="Close"
                  style={{ width: 30, height: 30, borderRadius: 99, border: "none", backgroundColor: "var(--neutral-100)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                  <X size={15} style={{ color: "var(--neutral-500)" }} />
                </button>
              </div>
            </div>

            {/* Row 2: Title — dominant visual element */}
            <h2 style={{ margin: "0 0 10px", fontSize: 20, fontWeight: 800, color: "var(--neutral-900)", lineHeight: 1.25, letterSpacing: "-0.01em" }}>
              {obs.title || obs.description || "Observation"}
            </h2>

            {/* Row 3: Single muted meta line — location · author · date */}
            <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 12, flexWrap: "wrap", rowGap: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--neutral-600)" }}>{locationDisplay.headline}</span>
              {locationDisplay.detail && (
                <>
                  <span style={{ fontSize: 12, color: "var(--neutral-300)", margin: "0 5px" }}>·</span>
                  <span style={{ fontSize: 12, color: "var(--neutral-500)" }}>{locationDisplay.detail}</span>
                </>
              )}
              <span style={{ fontSize: 12, color: "var(--neutral-300)", margin: "0 5px" }}>·</span>
              <div style={{ width: 16, height: 16, borderRadius: "50%", backgroundColor: "var(--primary-100)", color: "var(--primary-700)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, flexShrink: 0, marginRight: 4 }}>
                {authorLabel.charAt(0).toUpperCase()}
              </div>
              <span style={{ fontSize: 12, color: "var(--neutral-500)" }}>{authorLabel}</span>
              <span style={{ fontSize: 12, color: "var(--neutral-300)", margin: "0 5px" }}>·</span>
              <span style={{ fontSize: 12, color: "var(--neutral-400)" }}>{formatDate(obs.createdAt)}</span>
            </div>

            <div style={{ height: 1, backgroundColor: "var(--neutral-100)", margin: "0 calc(-1 * var(--page-padding-x))" }} />
          </div>

          {/* ── Body ── */}
          <div className="odm-body">

            {/* Edit mode */}
            {editing ? (
              <div style={{ marginTop: 20 }}>
                {/* Title edit */}
                <div style={{ marginBottom: 14 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--neutral-500)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Title</span>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value.slice(0, 120))}
                    maxLength={120}
                    style={{ width: "100%", marginTop: 6, padding: "10px 12px", borderRadius: 10, border: "1.5px solid var(--neutral-250)", fontSize: 16, backgroundColor: "var(--neutral-0)", color: "var(--neutral-900)", boxSizing: "border-box", fontFamily: "inherit", outline: "none" }}
                  />
                </div>
                {/* Type picker */}
                <div style={{ marginBottom: 14 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--neutral-500)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Type</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                    {observationTypes.map((type) => (
                      <button key={type.code} type="button" onClick={() => setEditType(type.code)}
                        style={{ padding: "6px 14px", borderRadius: 99, fontSize: 13, fontWeight: 600, cursor: "pointer", border: `1.5px solid ${editType === type.code ? "var(--primary-500)" : "var(--neutral-200)"}`, backgroundColor: editType === type.code ? "var(--primary-500)" : "var(--neutral-0)", color: editType === type.code ? "var(--neutral-0)" : "var(--neutral-700)" }}>
                        {type.displayName}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Notes */}
                <div style={{ marginBottom: 14 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--neutral-500)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Notes <span style={{ fontWeight: 400, textTransform: "none" }}>(optional)</span></span>
                  <textarea
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    rows={4}
                    style={{ width: "100%", marginTop: 8, padding: "10px 12px", borderRadius: 10, border: "1.5px solid var(--neutral-250)", fontSize: 14, lineHeight: 1.5, resize: "none", fontFamily: "inherit", outline: "none", boxSizing: "border-box", backgroundColor: "var(--neutral-0)", color: "var(--neutral-900)" }}
                  />
                </div>
                <FieldNotesEditLocationSection
                  projectId={projectId}
                  projectName={projectName}
                  unitRef={obs.unitRef}
                  value={editLocation}
                  onChange={setEditLocation}
                />
                {/* Photos */}
                {(() => {
                  const existingMedia = (obs.attachments ?? []).filter((a) =>
                    a.mimeType.startsWith("image/") || a.mimeType.startsWith("video/")
                  );
                  const activeExistingCount = existingMedia.filter((a) => !editRemoveIds.has(a.id)).length;
                  const totalActive = activeExistingCount + editStagedMedia.length;
                  const canAddMore = totalActive < MAX_MEDIA_ATTACHMENTS_PER_ENTITY && !editUploadProgress;
                  return (
                    <div style={{ marginBottom: 14 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--neutral-500)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Photos{" "}
                        <span style={{ fontWeight: 400, textTransform: "none", fontSize: 11, color: "var(--neutral-400)" }}>optional</span>
                      </span>

                      {(existingMedia.length > 0 || editStagedMedia.length > 0) && (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                          {existingMedia.map((a) => {
                            const markedForRemoval = editRemoveIds.has(a.id);
                            return (
                              <div key={a.id} style={{ position: "relative", width: 80, height: 80, flexShrink: 0, borderRadius: 8, overflow: "hidden", boxShadow: markedForRemoval ? "0 0 0 2px var(--error-500)" : "var(--shadow-card)" }}>
                                {a.mimeType.startsWith("image/") ? (
                                  <img src={a.storageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: markedForRemoval ? 0.35 : 1 }} />
                                ) : (
                                  <video src={a.storageUrl} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: markedForRemoval ? 0.35 : 1 }} muted playsInline />
                                )}
                                {/* Annotating spinner overlay — shown on the specific photo being saved */}
                                {editAnnotatingUploading && (
                                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.4)" }}>
                                    <Loader2 size={20} style={{ color: "var(--neutral-0)" }} className="odm-spin" />
                                  </div>
                                )}
                                {/* Delete / restore toggle */}
                                <button
                                  type="button"
                                  aria-label={markedForRemoval ? "Restore photo" : "Remove photo"}
                                  onClick={() => setEditRemoveIds((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(a.id)) next.delete(a.id); else next.add(a.id);
                                    return next;
                                  })}
                                  style={{ position: "absolute", top: 3, right: 3, width: 22, height: 22, borderRadius: 99, backgroundColor: markedForRemoval ? "var(--error-600)" : "rgba(0,0,0,0.55)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}
                                >
                                  {markedForRemoval
                                    ? <RefreshCw size={11} style={{ color: "var(--neutral-0)" }} />
                                    : <Trash2 size={11} style={{ color: "var(--neutral-0)" }} />}
                                </button>
                                {/* Annotate button — images only, not when marked for removal */}
                                {a.mimeType.startsWith("image/") && !markedForRemoval && (
                                  <button
                                    type="button"
                                    aria-label="Edit photo markup"
                                    onClick={() => setEditAnnotatingId(a.id)}
                                    style={{ position: "absolute", bottom: 3, right: 3, width: 22, height: 22, borderRadius: 99, backgroundColor: "rgba(0,0,0,0.55)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}
                                  >
                                    <Pencil size={11} style={{ color: "var(--neutral-0)" }} />
                                  </button>
                                )}
                              </div>
                            );
                          })}

                          {editStagedMedia.map((m) => (
                            <div key={m.clientId} style={{ position: "relative", width: 80, height: 80, flexShrink: 0, borderRadius: 8, overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
                              {m.mimeType.startsWith("image/") ? (
                                <img src={m.localUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              ) : (
                                <video src={m.localUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted playsInline />
                              )}
                              {editUploadProgress ? (
                                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.4)" }}>
                                  <Loader2 size={20} style={{ color: "var(--neutral-0)" }} className="odm-spin" />
                                </div>
                              ) : (
                                <>
                                  <div style={{ position: "absolute", bottom: 4, left: 4, width: 7, height: 7, borderRadius: 99, backgroundColor: "var(--color-accent)" }} />
                                  <button type="button" aria-label="Remove new photo"
                                    onClick={() => { URL.revokeObjectURL(m.localUrl); setEditStagedMedia((prev) => prev.filter((x) => x.clientId !== m.clientId)); }}
                                    style={{ position: "absolute", top: 3, right: 3, width: 22, height: 22, borderRadius: 99, backgroundColor: "rgba(0,0,0,0.55)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
                                    <Trash2 size={11} style={{ color: "var(--neutral-0)" }} />
                                  </button>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {canAddMore && (
                        <>
                          <input ref={editFileInputRef} type="file" accept="image/*,image/heic,image/heif,video/*" multiple style={{ display: "none" }} onChange={handleEditFileChange} />
                          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                            <button type="button" onClick={() => setShowEditCamera(true)}
                              style={{ flex: 1, minHeight: 40, borderRadius: 10, border: "none", backgroundColor: "var(--primary-500)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 13, fontWeight: 700, color: "var(--neutral-0)", cursor: "pointer", fontFamily: "inherit" }}>
                              <Camera size={14} /> Camera
                            </button>
                            <button type="button" onClick={() => editFileInputRef.current?.click()}
                              style={{ flex: 1, minHeight: 40, borderRadius: 10, border: "1.5px solid var(--neutral-200)", backgroundColor: "var(--neutral-0)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 13, fontWeight: 700, color: "var(--neutral-700)", cursor: "pointer", fontFamily: "inherit" }}>
                              <Images size={14} /> Library
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()}

                {/* Actions */}
                <div style={{ display: "flex", gap: 10 }}>
                  <button type="button" onClick={handleSaveEdit} disabled={editSaving || !editTitle.trim()}
                    style={{ flex: 1, minHeight: 44, borderRadius: 10, border: "none", backgroundColor: "var(--primary-500)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    {editSaving && <Loader2 size={16} className="odm-spin" />}
                    Save changes
                  </button>
                  <button type="button" onClick={() => { editStagedMedia.forEach((m) => URL.revokeObjectURL(m.localUrl)); setEditing(false); setEditStagedMedia([]); setEditRemoveIds(new Set()); }}
                    style={{ minHeight: 44, padding: "0 18px", borderRadius: 10, border: "1.5px solid var(--neutral-200)", backgroundColor: "var(--neutral-0)", color: "var(--neutral-700)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Notes */}
                {obs.description && (
                  <div style={{ marginTop: 20 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--neutral-400)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Notes</span>
                    <p style={{ margin: "6px 0 0", fontSize: 15, lineHeight: 1.6, color: "var(--neutral-800)" }}>
                      {obs.description}
                    </p>
                  </div>
                )}

                {/* Scope pills */}
                {(obs.scopeTags ?? []).length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                    {(obs.scopeTags ?? []).map((t) => {
                      const name = t.row?.scopeType?.name;
                      if (!name) return null;
                      return (
                        <span key={t.row.id} style={{ fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 99, backgroundColor: "var(--primary-50)", color: "var(--primary-700)", border: "1px solid var(--primary-200)" }}>
                          {name}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Attachments */}
                {(obs.attachments ?? []).length > 0 && (
                  <div style={{ marginTop: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <Paperclip size={12} style={{ color: "var(--neutral-500)" }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--neutral-500)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Attachments ({(obs.attachments ?? []).length})
                      </span>
                    </div>
                    <MediaGrid
                      attachments={obs.attachments ?? []}
                      projectId={projectId}
                      observationId={obs.id}
                      canAnnotate={Boolean(isAuthor && isOnline)}
                      onVersionSaved={handleVersionSaved}
                    />
                  </div>
                )}

              </>
            )}

            {/* ── Comment thread ── */}
            {!editing && (
              <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--neutral-100)" }}>
                <CommentThread
                  projectId={projectId}
                  entityType="observation"
                  entityId={obs.id}
                  currentUserId={currentUserId}
                />
              </div>
            )}

          </div>

          {/* ── Bottom nav (matches unit/location nav pattern) ── */}
          {total !== undefined && total > 1 && (
            <div
              style={{
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 20px calc(env(safe-area-inset-bottom, 0px) + 12px)",
                borderTop: "1px solid var(--neutral-100)",
                backgroundColor: "var(--neutral-0)",
                gap: 8,
              }}
            >
              <button
                type="button"
                onClick={onPrev}
                disabled={!onPrev}
                aria-label="Previous observation"
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "10px 18px", borderRadius: 999,
                  border: "1.5px solid var(--neutral-200)",
                  backgroundColor: onPrev ? "var(--neutral-0)" : "var(--neutral-50)",
                  color: onPrev ? "var(--neutral-700)" : "var(--neutral-300)",
                  fontSize: 14, fontWeight: 600,
                  cursor: onPrev ? "pointer" : "default",
                  transition: "background-color 0.12s",
                  minHeight: 44,
                }}
              >
                <ChevronLeft size={16} />
                Prev
              </button>
              <span
                style={{
                  fontSize: 13, fontWeight: 500,
                  color: "var(--neutral-400)",
                  fontVariantNumeric: "tabular-nums",
                  flexShrink: 0,
                }}
              >
                {(currentIndex ?? 0) + 1}{" "}
                <span style={{ color: "var(--neutral-300)" }}>of</span>{" "}
                {total}
              </span>
              <button
                type="button"
                onClick={onNext}
                disabled={!onNext}
                aria-label="Next observation"
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "10px 18px", borderRadius: 999,
                  border: "1.5px solid var(--neutral-200)",
                  backgroundColor: onNext ? "var(--neutral-0)" : "var(--neutral-50)",
                  color: onNext ? "var(--neutral-700)" : "var(--neutral-300)",
                  fontSize: 14, fontWeight: 600,
                  cursor: onNext ? "pointer" : "default",
                  transition: "background-color 0.12s",
                  minHeight: 44,
                }}
              >
                Next
                <ChevronRight size={16} />
              </button>
            </div>
          )}

        </div>
      </div>
    </>,
    document.body,
      )}
    </>
  );
}
