"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useIsBrowser } from "@/hooks/use-is-browser";
import {
  BlobStoreVerificationError,
  enqueueMutationWithVerifiedBlobs,
  offlineAttachmentFieldsFromStaged,
} from "@/lib/offline/enqueue-mutation-with-blobs";
import { enrichBodyWithActivityLocation } from "@/lib/activity/enrich-body-with-activity-location";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import {
  X, Camera, Mic, Trash2, Loader2, Building2, Layers, Images, Pencil, AlignLeft, RefreshCw, Eye,
} from "lucide-react";
import { toast } from "sonner";
import { CameraCapture } from "@/components/projects/CameraCapture";
import type { CapturedFile } from "@/components/projects/CameraCapture";
import { ImageAnnotationEditor, isFlattenAnnotationSave, type AnnotationSaveResult } from "@/components/projects/ImageAnnotationEditor";
import type { ImageAnnotationPayload } from "@/lib/image-annotation-schema";
import { resolveClientMime as resolveClientMimeUtil, isFieldMediaImageFile } from "@/lib/image-utils";
import { processLibraryMediaFile } from "@/lib/stage-library-field-media";
import { uploadWithRetry } from "@/lib/upload-with-retry";
import { MAX_MEDIA_ATTACHMENTS_PER_ENTITY } from "@/lib/media-attachment-limits";
import { appendTranscriptSegment } from "@/lib/browser-speech";
import { DictationButton } from "@/components/ui/DictationButton";
import { FileDropOverlay } from "@/components/ui/FileDropOverlay";
import { useFileDrop } from "@/hooks/use-file-drop";
import { ProjectLevelBuilderTagFields } from "@/components/projects/ProjectLevelBuilderTagFields";
import { useObservationCatalog } from "@/lib/observations/use-observation-catalog";
import { builderTagRequestFields } from "@/lib/field-notes/location-builder-tags";

const FIELD_MEDIA_ACCEPT = "image/*,image/heic,image/heif,video/*,audio/*";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AddLocationObservationModalProps =
  | {
      projectId: string;
      currentUserId?: string;
      onClose: () => void;
      onCreated: () => void;
      projectLevel: true;
    }
  | {
      projectId: string;
      currentUserId?: string;
      building: string;
      level?: string;
      onClose: () => void;
      onCreated: () => void;
      projectLevel?: false;
    };

interface StagedMedia {
  clientId: string;
  file: File;
  localUrl: string;
  mimeType: string;
  caption: string;
  imageAnnotation?: ImageAnnotationPayload;
}

interface UploadedMedia {
  clientId: string;
  storageKey: string;
  storageUrl: string;
  mimeType: string;
  fileSizeBytes: number;
  localUrl: string;
  fileName: string;
  caption: string;
  imageAnnotation?: ImageAnnotationPayload;
}

interface FailedMedia {
  clientId: string;
  file: File;
  localUrl: string;
  mimeType: string;
  caption: string;
  imageAnnotation?: ImageAnnotationPayload;
}

type MediaItem =
  | ({ kind: "staged" } & StagedMedia)
  | ({ kind: "uploaded" } & UploadedMedia)
  | ({ kind: "failed" } & FailedMedia);

const VIDEO_SIZE_LIMIT = 50 * 1024 * 1024;

function resolveClientMime(file: File): string {
  return resolveClientMimeUtil(file);
}

// ── CSS ───────────────────────────────────────────────────────────────────────

const SHEET_CSS = `
  .alom-backdrop { position: fixed; inset: 0; z-index: 300; display: flex; align-items: flex-end; background: rgba(0,0,0,0); transition: background-color 0.26s ease; }
  .alom-backdrop.alom-visible { background: rgba(0,0,0,0.45); }
  .alom-sheet { width: 100%; min-height: 75dvh; max-height: 92dvh; border-radius: 20px 20px 0 0; background: var(--color-surface); transform: translateY(105%); transition: transform 0.3s cubic-bezier(0.32,0.72,0,1); display: flex; flex-direction: column; box-shadow: var(--shadow-modal); }
  .alom-sheet.alom-sheet-visible { transform: translateY(0); }
  .alom-handle { width: 36px; height: 4px; background: var(--neutral-300); border-radius: var(--radius-pill); margin: 10px auto 4px; flex-shrink: 0; }
  .alom-body { flex: 1; overflow-y: auto; padding: 16px var(--page-padding-x) calc(env(safe-area-inset-bottom) + 16px); scroll-padding-top: 24px; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
  .alom-title-anchor { position: relative; z-index: 1; }
  .alom-input, .alom-textarea { width: 100%; border: none; border-radius: var(--radius-md); background: var(--control-bg); color: var(--color-text-primary); box-sizing: border-box; font-family: inherit; font-size: var(--text-body); font-weight: var(--font-weight-normal); outline: none; }
  .alom-input { min-height: var(--input-height); padding: 10px 44px 10px 14px; }
  .alom-textarea { padding: 12px 14px 44px; line-height: 1.5; resize: none; }
  .alom-input:focus, .alom-textarea:focus { background: var(--control-bg); box-shadow: var(--focus-ring); }
  .alom-footer { padding: 12px var(--page-padding-x) calc(env(safe-area-inset-bottom) + 16px); border-top: none; background: var(--color-surface); flex-shrink: 0; }
  @keyframes alom-spin { to { transform: rotate(360deg); } }
  .alom-spinning { animation: alom-spin 1s linear infinite; }
  @media (min-width: 768px) {
    .alom-backdrop { align-items: stretch; justify-content: flex-end; }
    .alom-sheet { width: min(520px, 100vw); min-height: 0; max-height: none; height: 100%; border-radius: 0; transform: translateX(105%); box-shadow: -4px 0 32px rgba(0,0,0,0.18); }
    .alom-sheet.alom-sheet-visible { transform: translateX(0); }
    .alom-handle { display: none; }
    .alom-body { padding-bottom: 24px; }
    .alom-footer { padding-bottom: 24px; }
  }
`;

const LABEL_STYLE: React.CSSProperties = {
  fontSize: "var(--text-caption)",
  fontWeight: "var(--font-weight-extrabold)",
  color: "var(--color-text-tertiary)",
  textTransform: "uppercase",
  letterSpacing: "var(--tracking-section)",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function MediaThumb({
  item, uploading, onRemove, onAnnotate, onCaption, onRetry,
}: {
  item: MediaItem;
  uploading: boolean;
  onRemove: () => void;
  onAnnotate?: () => void;
  onCaption: () => void;
  onRetry?: () => void;
}) {
  const t = useTranslations("units");
  const isImage = item.mimeType.startsWith("image/");
  const isPending = item.kind === "staged";
  const isFailed = item.kind === "failed";
  const caption = "caption" in item ? (item.caption as string) : "";
  const hasCaption = caption.trim().length > 0;

  return (
    <div style={{ position: "relative", width: 88, height: 88, flexShrink: 0, borderRadius: "var(--radius-md)", overflow: "hidden", border: "none", boxShadow: isFailed ? "0 0 0 2px var(--error-500)" : "var(--shadow-card)" }}>
      {isImage
        ? <img src={item.localUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: isFailed ? 0.5 : 1 }} />
        : item.mimeType.startsWith("video/")
          ? <video src={item.localUrl} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: isFailed ? 0.5 : 1 }} muted playsInline />
          : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--neutral-100)" }}>
              <Mic size={24} style={{ color: "var(--neutral-500)" }} />
            </div>
      }
      {isFailed && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "color-mix(in srgb, var(--error-500) 18%, transparent)" }}>
          {onRetry && (
            <button type="button" aria-label={t("mediaRetryUploadAria")} onClick={onRetry}
              style={{ width: 36, height: 36, borderRadius: 99, backgroundColor: "var(--error-500)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
              <RefreshCw size={16} style={{ color: "var(--neutral-0)" }} />
            </button>
          )}
        </div>
      )}
      {isPending && !uploading && (
        <div style={{ position: "absolute", bottom: 4, left: 4, width: 8, height: 8, borderRadius: "var(--radius-pill)", backgroundColor: "var(--color-accent)" }} />
      )}
      {isPending && uploading && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.4)" }}>
          <Loader2 size={22} style={{ color: "var(--color-text-inverse)" }} className="alom-spinning" />
        </div>
      )}
      {hasCaption && !uploading && !isFailed && (
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.55)", padding: "2px 5px" }}>
          <p style={{ margin: 0, fontSize: "var(--text-micro)", color: "var(--color-text-inverse)", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{caption}</p>
        </div>
      )}
      {!uploading && (
        <button type="button" aria-label="Remove" onClick={onRemove}
          style={{ position: "absolute", top: 3, right: 3, width: 22, height: 22, borderRadius: 99, backgroundColor: isFailed ? "var(--error-600)" : "rgba(0,0,0,0.55)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
          <Trash2 size={12} style={{ color: "var(--color-text-inverse)" }} />
        </button>
      )}
      {!uploading && !isFailed && (
        <button type="button" aria-label={hasCaption ? "Edit caption" : "Add caption"} onClick={onCaption}
          style={{ position: "absolute", bottom: 3, left: 3, width: 22, height: 22, borderRadius: 99, backgroundColor: "rgba(0,0,0,0.55)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
          <AlignLeft size={11} style={{ color: "var(--color-text-inverse)" }} />
        </button>
      )}
      {isImage && !uploading && !isFailed && onAnnotate && (
        <button type="button" aria-label="Annotate" onClick={onAnnotate}
          style={{ position: "absolute", bottom: 3, right: 3, width: 22, height: 22, borderRadius: 99, backgroundColor: "rgba(0,0,0,0.55)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
          <Pencil size={11} style={{ color: "var(--color-text-inverse)" }} />
        </button>
      )}
    </div>
  );
}


// ── Main component ────────────────────────────────────────────────────────────

export function AddLocationObservationModal(props: AddLocationObservationModalProps) {
  const { projectId, onClose, onCreated } = props;
  const isProjectLevel = props.projectLevel === true;
  const building = props.projectLevel === true ? "" : props.building;
  const level = props.projectLevel === true ? undefined : props.level;
  const t = useTranslations("units");
  const tCommon = useTranslations("common");
  const td = useTranslations("dictation");
  const tOfflineMedia = useTranslations("offlineMedia");
  const isBrowser = useIsBrowser();
  const { observationTypes } = useObservationCatalog(projectId);

  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState("");
  const [obsType, setObsType] = useState("");
  const [buildPhaseTag, setBuildPhaseTag] = useState("");
  const [areaTag, setAreaTag] = useState("");
  const [description, setDescription] = useState("");
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [annotatingClientId, setAnnotatingClientId] = useState<string | null>(null);
  const [captioningClientId, setCaptioningClientId] = useState<string | null>(null);
  const [captionDraft, setCaptionDraft] = useState("");
  const [retryingClientIds, setRetryingClientIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const descriptionTextareaRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState({ height: 0, offsetTop: 0 });
  const scrollTimerRef = useRef<number | null>(null);

  const unitRef = isProjectLevel ? undefined : (level ? `${building}|${level}|` : `${building}||`);
  const modalTitle = isProjectLevel ? t("projectObsTitle") : level ? t("levelObsTitle") : t("buildingObsTitle");

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setVp({ height: vv.height, offsetTop: vv.offsetTop ?? 0 });
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => { vv.removeEventListener("resize", update); vv.removeEventListener("scroll", update); };
  }, []);

  const scrollFieldIntoView = useCallback((el: HTMLElement) => {
    const body = bodyRef.current;
    if (!body) return;
    if (scrollTimerRef.current !== null) {
      window.clearTimeout(scrollTimerRef.current);
    }
    scrollTimerRef.current = window.setTimeout(() => {
      scrollTimerRef.current = null;
      const bodyRect = body.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      // Field is fully visible — do nothing, don't move the screen.
      if (elRect.top >= bodyRect.top && elRect.bottom <= bodyRect.bottom) return;
      const fieldCenter = elRect.top - bodyRect.top + elRect.height / 2;
      const visibleCenter = bodyRect.height * 0.54;
      const targetScrollTop = body.scrollTop + fieldCenter - visibleCenter;
      const top = Math.max(0, targetScrollTop);
      if (typeof body.scrollTo === "function") {
        body.scrollTo({ top, behavior: "smooth" });
      } else {
        body.scrollTop = top;
      }
    }, 150);
  }, []);

  const close = useCallback(() => {
    setVisible(false);
    window.setTimeout(onClose, 280);
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const isUploading = uploadProgress !== null;
  const hasFailedMedia = media.some((m) => m.kind === "failed");
  const canSubmit = !!obsType && title.trim().length > 0 && !isUploading && !hasFailedMedia;

  function handleCameraCapture(captured: CapturedFile[]) {
    const slots = MAX_MEDIA_ATTACHMENTS_PER_ENTITY - media.length;
    if (slots <= 0) return;
    setMedia((prev) => [...prev, ...captured.slice(0, slots).map((c) => ({
      kind: "staged" as const,
      clientId: `${Date.now()}-${Math.random()}`,
      file: c.file, localUrl: c.localUrl, mimeType: c.mimeType, caption: "",
      imageAnnotation: c.imageAnnotation,
    }))]);
  }

  function handleAnnotationSave(clientId: string, result: AnnotationSaveResult) {
    if (!isFlattenAnnotationSave(result)) return;
    setAnnotatingClientId(null);
    setMedia((prev) => prev.map((m) =>
      m.clientId === clientId
        ? { ...m, file: new File([result.blob], "annotated.jpg", { type: "image/jpeg" }), localUrl: result.localUrl, mimeType: "image/jpeg" }
        : m
    ));
  }

  const processFiles = useCallback(async (rawFiles: File[]) => {
    const slots = MAX_MEDIA_ATTACHMENTS_PER_ENTITY - media.length;
    if (slots <= 0) return;
    const files = rawFiles.slice(0, slots);
    if (!files.length) return;

    const newItems: MediaItem[] = [];
    for (const file of files) {
      const mime = resolveClientMime(file);
      if (mime.startsWith("video/") && file.size > VIDEO_SIZE_LIMIT) {
        toast.error(`"${file.name}" exceeds the 50 MB video limit and was skipped.`);
        continue;
      }
      let processedFile = file;
      let processedMime = mime;
      try {
        const prepared = await processLibraryMediaFile(file, {
          stamp: {
            location: isProjectLevel ? undefined : { building, level: level ?? "", unit: "" },
            uploaded: true,
          },
          onHeicLargeWarning: (f) =>
            toast(tCommon("heicLargeFileWarning", { filename: f.name, sizeMb: (f.size / 1024 / 1024).toFixed(0) }), { icon: "ℹ️" }),
        });
        processedFile = prepared.file;
        processedMime = prepared.mimeType;
      } catch {
        if (isFieldMediaImageFile(file)) {
          toast.error(t("obsImagePrepareFailed"));
          continue;
        }
      }
      newItems.push({ kind: "staged", clientId: `${Date.now()}-${Math.random()}`, file: processedFile, localUrl: URL.createObjectURL(processedFile), mimeType: processedMime, caption: "" });
    }
    if (newItems.length > 0) setMedia((prev) => [...prev, ...newItems]);
  }, [building, isProjectLevel, level, media.length, t, tCommon]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const rawFiles = Array.from(e.target.files ?? []);
    if (e.target) e.target.value = "";
    await processFiles(rawFiles);
  }

  const handleMediaDropRejected = useCallback(() => {
    toast.error(tCommon("dropRejectedFileType"));
  }, [tCommon]);

  const { dropHandlers } = useFileDrop({
    onFiles: processFiles,
    onRejected: handleMediaDropRejected,
    accept: FIELD_MEDIA_ACCEPT,
    disabled: media.length >= MAX_MEDIA_ATTACHMENTS_PER_ENTITY || isUploading,
  });

  async function handleRetryUpload(clientId: string) {
    const item = media.find((m) => m.clientId === clientId && m.kind === "failed");
    if (!item || item.kind !== "failed" || retryingClientIds.has(clientId)) return;
    setRetryingClientIds((prev) => new Set(prev).add(clientId));
    setMedia((prev) => prev.map((m) =>
      m.clientId === clientId
        ? { kind: "staged" as const, clientId: item.clientId, file: item.file, localUrl: item.localUrl, mimeType: item.mimeType, caption: item.caption, imageAnnotation: item.imageAnnotation }
        : m
    ));
    try {
      const form = new FormData();
      form.append("file", item.file);
      form.append("type", "observations");
      if (item.caption) form.append("caption", item.caption);
      if (item.imageAnnotation) form.append("imageAnnotation", JSON.stringify(item.imageAnnotation));
      const data = await uploadWithRetry(form, { projectId });
      setMedia((prev) => prev.map((m) =>
        m.clientId === clientId
          ? { kind: "uploaded" as const, clientId, storageKey: data.storageKey, storageUrl: data.storageUrl, mimeType: data.mimeType, fileSizeBytes: data.fileSizeBytes, localUrl: item.localUrl, fileName: item.file.name, caption: item.caption, imageAnnotation: data.imageAnnotation }
          : m
      ));
    } catch {
      toast.error(t("mediaUploadStillFailing", { name: item.file.name }), { duration: 5000 });
      setMedia((prev) => prev.map((m) =>
        m.clientId === clientId
          ? { kind: "failed" as const, clientId: item.clientId, file: item.file, localUrl: item.localUrl, mimeType: item.mimeType, caption: item.caption, imageAnnotation: item.imageAnnotation }
          : m
      ));
    } finally {
      setRetryingClientIds((prev) => { const next = new Set(prev); next.delete(clientId); return next; });
    }
  }

  async function handleSubmit() {
    if (!obsType) { toast.error(t("obsSelectTypeFirst")); return; }
    if (!title.trim()) { toast.error(t("obsAddTitleFirst")); return; }
    setSubmitting(true);

    if (!navigator.onLine) {
      try {
        const staged = media.filter((m): m is { kind: "staged" } & StagedMedia => m.kind === "staged");
        await enqueueMutationWithVerifiedBlobs({
          type: "create-observation",
          url: `/api/projects/${projectId}/observations`,
          method: "POST",
          body: {
            ...(unitRef !== undefined ? { unitRef } : {}),
            projectRowIds: [],
            observationType: obsType,
            title: title.trim(),
            description: description.trim(),
            ...(isProjectLevel ? builderTagRequestFields({ buildPhaseTag, areaTag }) : {}),
            ...offlineAttachmentFieldsFromStaged(staged),
          },
          mediaFiles: staged.map((s) => s.file),
          actorUserId: props.currentUserId,
        });
        toast.success(staged.length > 0 ? t("obsSavedOfflineWithMedia") : t("obsSavedOffline"));
        onCreated();
        close();
      } catch (err) {
        if (err instanceof BlobStoreVerificationError) {
          toast.error(tOfflineMedia("photoSaveFailed"));
        } else {
          toast.error(t("obsSaveOfflineFailed"));
        }
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const staged = media.filter((m): m is { kind: "staged" } & StagedMedia => m.kind === "staged");
    if (staged.length > 0) setUploadProgress({ current: 0, total: staged.length });
    const finalMedia: UploadedMedia[] = media.filter((m): m is { kind: "uploaded" } & UploadedMedia => m.kind === "uploaded").map((m) => ({ ...m }));

    let failedCount = 0;
    for (let i = 0; i < staged.length; i++) {
      setUploadProgress({ current: i + 1, total: staged.length });
      const s = staged[i];
      try {
        const form = new FormData();
        form.append("file", s.file);
        form.append("type", "observations");
        if (s.caption) form.append("caption", s.caption);
        if (s.imageAnnotation) form.append("imageAnnotation", JSON.stringify(s.imageAnnotation));
        const data = await uploadWithRetry(form, { projectId });
        finalMedia.push({ clientId: s.clientId, storageKey: data.storageKey, storageUrl: data.storageUrl, mimeType: data.mimeType, fileSizeBytes: data.fileSizeBytes, localUrl: s.localUrl, fileName: s.file.name, caption: s.caption, imageAnnotation: data.imageAnnotation });
        setMedia((prev) => prev.map((m) =>
          m.clientId === s.clientId
            ? { kind: "uploaded" as const, clientId: s.clientId, storageKey: data.storageKey, storageUrl: data.storageUrl, mimeType: data.mimeType, fileSizeBytes: data.fileSizeBytes, localUrl: s.localUrl, fileName: s.file.name, caption: s.caption, imageAnnotation: data.imageAnnotation }
            : m
        ));
      } catch {
        failedCount++;
        setMedia((prev) => prev.map((m) =>
          m.clientId === s.clientId
            ? { kind: "failed" as const, clientId: s.clientId, file: s.file, localUrl: s.localUrl, mimeType: s.mimeType, caption: s.caption, imageAnnotation: s.imageAnnotation }
            : m
        ));
      }
    }
    setUploadProgress(null);

    if (failedCount > 0) {
      toast.error(t("mediaUploadFailedBanner", { count: failedCount }), { duration: 7000 });
      setSubmitting(false);
      return;
    }

    try {
      const observationPayload = {
        ...(isProjectLevel ? { unitRef: "" } : unitRef !== undefined ? { unitRef } : {}),
        projectRowIds: [],
        observationType: obsType,
        title: title.trim(),
        description: description.trim(),
        ...(isProjectLevel ? builderTagRequestFields({ buildPhaseTag, areaTag }) : {}),
        attachmentKeys: finalMedia.map((a) => a.storageKey),
        attachmentUrls: finalMedia.map((a) => a.storageUrl),
        attachmentMimeTypes: finalMedia.map((a) => a.mimeType),
        attachmentFileSizeBytes: finalMedia.map((a) => a.fileSizeBytes ?? null),
        attachmentCaptions: finalMedia.map((a) => a.caption),
        attachmentImageAnnotations: finalMedia.map((a) => a.imageAnnotation ?? null),
      };
      const bodyWithLocation = await enrichBodyWithActivityLocation(observationPayload);
      const res = await fetch(`/api/projects/${projectId}/observations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyWithLocation),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(err.error ?? t("obsSubmitFailed"));
        return;
      }
      toast.success(t("obsAdded"));
      onCreated();
      close();
    } catch {
      toast.error(t("obsSubmitFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  if (!isBrowser) return null;

  const annotatingItem = annotatingClientId ? media.find((m) => m.clientId === annotatingClientId) : null;

  const sheet = createPortal(
    <>
      <style>{SHEET_CSS}</style>
      <div role="presentation" className={`alom-backdrop${visible ? " alom-visible" : ""}`}
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        style={vp.height > 0 ? { top: vp.offsetTop, height: vp.height } : undefined}>
        <div role="dialog" aria-modal="true" aria-label={modalTitle}
          className={`alom-sheet${visible ? " alom-sheet-visible" : ""}`}
          style={vp.height > 0 ? { height: `${Math.round(vp.height)}px`, maxHeight: `${Math.round(vp.height)}px`, minHeight: 0 } : undefined}>
          <div className="alom-handle" aria-hidden />

          {/* Header */}
          <div style={{ padding: "8px var(--page-padding-x) 0", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Eye size={18} style={{ color: "var(--color-accent-hover)" }} />
                <span style={{ fontSize: "var(--text-subheading)", fontWeight: "var(--font-weight-black)", color: "var(--color-text-primary)", letterSpacing: "var(--tracking-tight)" }}>{modalTitle}</span>
              </div>
              <button type="button" onClick={close} aria-label="Close"
                style={{ width: 32, height: 32, borderRadius: "var(--radius-pill)", border: "none", backgroundColor: "var(--control-bg)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <X size={16} style={{ color: "var(--control-icon)" }} />
              </button>
            </div>

            {/* Location badge */}
            {!isProjectLevel && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 10, padding: "5px 10px", borderRadius: "var(--radius-md)", backgroundColor: "var(--control-bg)", border: "none" }}>
                <Building2 size={12} style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }} />
                <span style={{ fontSize: "var(--text-caption)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text-secondary)" }}>{building}</span>
                {level && (
                  <>
                    <span style={{ fontSize: "var(--text-caption)", color: "var(--color-text-disabled)" }}>›</span>
                    <Layers size={12} style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }} />
                    <span style={{ fontSize: "var(--text-caption)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text-secondary)" }}>Level {level}</span>
                  </>
                )}
              </div>
            )}

            <div style={{ height: 1, backgroundColor: "var(--color-divider)", margin: "0 calc(-1 * var(--page-padding-x))" }} />
          </div>

          <div className="alom-body" ref={bodyRef}>

            {/* Title */}
            <div className="alom-title-anchor">
              <label style={LABEL_STYLE}>Title <span style={{ color: "var(--error-500)" }}>*</span></label>
              <div style={{ position: "relative", marginTop: 6 }}>
                <input ref={titleInputRef} type="text" className="alom-input" value={title}
                  onChange={(e) => setTitle(e.target.value.slice(0, 120))}
                  onFocus={(e) => {
                    scrollFieldIntoView(e.currentTarget);
                  }}
                  placeholder={t("titlePlaceholderObs")}
                  maxLength={120}
                />
                <DictationButton disabled={submitting} fieldLabel={td("fieldTitle")} focusTargetRef={titleInputRef}
                  onAppendText={(segment) => setTitle((prev) => appendTranscriptSegment(prev, segment, 120))}
                  style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)" }} />
              </div>
            </div>

            {/* Observation type */}
            <div style={{ marginTop: 16 }}>
              <label style={LABEL_STYLE}>{t("obsTypeLabel")}</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                {observationTypes.map((type) => (
                  <button key={type.code} type="button" onClick={() => setObsType(type.code)}
                    style={{ padding: "8px 16px", borderRadius: "var(--radius-pill)", border: "none", backgroundColor: obsType === type.code ? "var(--control-active-bg)" : "var(--control-bg)", color: obsType === type.code ? "var(--control-active-fg)" : "var(--control-fg)", fontSize: "var(--text-body)", fontWeight: "var(--font-weight-semibold)", cursor: "pointer", fontFamily: "inherit" }}>
                    {type.displayName}
                  </button>
                ))}
              </div>
            </div>

            {isProjectLevel ? (
              <ProjectLevelBuilderTagFields
                projectId={projectId}
                buildPhaseTag={buildPhaseTag}
                areaTag={areaTag}
                onChangeBuildPhaseTag={setBuildPhaseTag}
                onChangeAreaTag={setAreaTag}
              />
            ) : null}

            {/* Description — optional */}
            <div style={{ marginTop: 16 }}>
              <label style={LABEL_STYLE}>Notes <span style={{ fontSize: "var(--text-micro)", fontWeight: "var(--font-weight-normal)", color: "var(--color-text-disabled)", textTransform: "none", letterSpacing: 0 }}>optional</span></label>
              <div style={{ position: "relative", marginTop: 6 }}>
                <textarea ref={descriptionTextareaRef} className="alom-textarea" value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onFocus={(e) => scrollFieldIntoView(e.currentTarget)}
                  placeholder={t("descriptionPlaceholder")}
                  rows={4}
                />
                <DictationButton disabled={submitting} fieldLabel={td("fieldNotes")} focusTargetRef={descriptionTextareaRef}
                  onAppendText={(segment) => setDescription((prev) => appendTranscriptSegment(prev, segment))}
                  style={{ position: "absolute", right: 8, bottom: 8 }} />
              </div>
            </div>

            {/* Media */}
            <div style={{ marginTop: 16, position: "relative" }} {...dropHandlers}>
              <label style={LABEL_STYLE}>{t("mediaLabel")}</label>
              {media.length > 0 && (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8, marginBottom: 8 }}>
                  {media.map((m) => (
                    <MediaThumb key={m.clientId} item={m} uploading={isUploading && m.kind === "staged"}
                      onRemove={() => setMedia((prev) => prev.filter((x) => x.clientId !== m.clientId))}
                      onAnnotate={m.mimeType.startsWith("image/") ? () => setAnnotatingClientId(m.clientId) : undefined}
                      onCaption={() => { setCaptionDraft("caption" in m ? (m.caption as string) : ""); setCaptioningClientId(m.clientId); }}
                      onRetry={m.kind === "failed" && !retryingClientIds.has(m.clientId) ? () => handleRetryUpload(m.clientId) : undefined}
                    />
                  ))}
                </div>
              )}
              {media.some((m) => m.kind === "staged") && !isUploading && (
                <p style={{ margin: "4px 0 0", fontSize: "var(--text-caption)", color: "var(--color-accent-hover)", fontWeight: "var(--font-weight-semibold)" }}>
                  {media.filter((m) => m.kind === "staged").length} item{media.filter((m) => m.kind === "staged").length > 1 ? "s" : ""} ready — tap Submit to save
                </p>
              )}
              {media.length < MAX_MEDIA_ATTACHMENTS_PER_ENTITY && !isUploading && (
                <>
                  <input ref={fileInputRef} type="file" accept={FIELD_MEDIA_ACCEPT} multiple style={{ display: "none" }} onChange={handleFileChange} />
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button type="button" onClick={() => setShowCamera(true)}
                      style={{ flex: 1, minHeight: "var(--button-height)", borderRadius: "var(--radius-md)", border: "none", backgroundColor: "var(--control-active-bg)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: "var(--text-body)", fontWeight: "var(--font-weight-extrabold)", color: "var(--control-active-fg)", cursor: "pointer", fontFamily: "inherit" }}>
                      <Camera size={15} /> Camera
                    </button>
                    <button type="button" onClick={() => fileInputRef.current?.click()}
                      style={{ flex: 1, minHeight: "var(--button-height)", borderRadius: "var(--radius-md)", border: "none", backgroundColor: "var(--control-bg)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: "var(--text-body)", fontWeight: "var(--font-weight-extrabold)", color: "var(--control-fg)", cursor: "pointer", fontFamily: "inherit" }}>
                      <Images size={15} /> Library
                    </button>
                  </div>
                  {media.length > 0 && (
                    <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--neutral-400)", textAlign: "center" }}>
                      {t("mediaAttachedCount", { current: media.length, max: MAX_MEDIA_ATTACHMENTS_PER_ENTITY })}
                    </p>
                  )}
                </>
              )}
              <FileDropOverlay
                disabled={media.length >= MAX_MEDIA_ATTACHMENTS_PER_ENTITY || isUploading}
              />
            </div>

            <div style={{ height: 8 }} />
          </div>

          <div className="alom-footer">
            {hasFailedMedia && (
              <p style={{ margin: "0 0 10px", fontSize: "var(--text-caption)", color: "var(--error-600)", fontWeight: "var(--font-weight-semibold)", textAlign: "center" }}>
                {t("mediaUploadFailedBanner", { count: media.filter((m) => m.kind === "failed").length })}
              </p>
            )}
            <button type="button" onClick={handleSubmit} disabled={!canSubmit || submitting}
              style={{ width: "100%", minHeight: 48, borderRadius: "var(--radius-md)", border: "none", backgroundColor: !canSubmit || submitting ? "var(--control-bg)" : "var(--color-accent)", color: !canSubmit || submitting ? "var(--color-text-disabled)" : "var(--color-text-inverse)", fontSize: "var(--text-body)", fontWeight: "var(--font-weight-extrabold)", cursor: submitting ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "background-color 0.15s", fontFamily: "inherit" }}>
              {submitting && <Loader2 size={18} className="alom-spinning" />}
              {uploadProgress ? `Uploading photo ${uploadProgress.current} of ${uploadProgress.total}…` : submitting ? t("submitting") : t("submit")}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );

  return (
    <>
      {sheet}
      {showCamera && (
        <CameraCapture maxItems={MAX_MEDIA_ATTACHMENTS_PER_ENTITY - media.length} projectId={projectId} onCapture={handleCameraCapture} onClose={() => setShowCamera(false)}
          location={{ building, level: level ?? "", unit: "" }} />
      )}
      {annotatingItem && annotatingClientId && (
        <ImageAnnotationEditor src={annotatingItem.localUrl}
          onSave={(result) => handleAnnotationSave(annotatingClientId, result)}
          onClose={() => setAnnotatingClientId(null)} />
      )}
      {captioningClientId && createPortal(
        <div role="dialog" aria-modal="true" aria-label="Add caption"
          style={{ position: "fixed", inset: 0, zIndex: 500, display: "flex", flexDirection: "column", backgroundColor: "rgba(0,0,0,0.6)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setCaptioningClientId(null); }}>
          <div style={{ flex: 1 }} onClick={() => setCaptioningClientId(null)} />
          <div style={{ backgroundColor: "var(--color-surface)", borderRadius: "20px 20px 0 0", padding: "20px 20px", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)", display: "flex", flexDirection: "column", gap: 14, boxShadow: "var(--shadow-modal)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "var(--text-subheading)", fontWeight: "var(--font-weight-black)", color: "var(--color-text-primary)", letterSpacing: "var(--tracking-tight)" }}>{t("addCaptionTitle")}</span>
              <button type="button" onClick={() => setCaptioningClientId(null)} aria-label="Cancel"
                style={{ width: 32, height: 32, borderRadius: "var(--radius-pill)", border: "none", backgroundColor: "var(--control-bg)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <X size={16} style={{ color: "var(--control-icon)" }} />
              </button>
            </div>
            <textarea autoFocus value={captionDraft} onChange={(e) => setCaptionDraft(e.target.value)} onKeyDown={(e) => e.stopPropagation()}
              placeholder={t("captionPlaceholder")} rows={4} maxLength={500}
              style={{ width: "100%", padding: "12px 14px", fontSize: "var(--text-body)", lineHeight: 1.5, borderRadius: "var(--radius-md)", border: "none", backgroundColor: "var(--control-bg)", color: "var(--color-text-primary)", resize: "none", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={() => setCaptioningClientId(null)}
                style={{ flex: 1, minHeight: 48, borderRadius: "var(--radius-md)", border: "none", backgroundColor: "var(--control-bg)", fontSize: "var(--text-body)", fontWeight: "var(--font-weight-extrabold)", color: "var(--control-fg)", cursor: "pointer", fontFamily: "inherit" }}>
                {tCommon("cancel")}
              </button>
              <button type="button"
                onClick={() => { const id = captioningClientId; setMedia((prev) => prev.map((x) => x.clientId === id ? { ...x, caption: captionDraft.trim() } : x)); setCaptioningClientId(null); }}
                style={{ flex: 1, minHeight: 48, borderRadius: "var(--radius-md)", border: "none", backgroundColor: "var(--color-accent)", fontSize: "var(--text-body)", fontWeight: "var(--font-weight-extrabold)", color: "var(--color-text-inverse)", cursor: "pointer", fontFamily: "inherit" }}>
                {t("saveCaptionBtn")}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

export type AddProjectObservationModalProps = {
  projectId: string;
  onClose: () => void;
  onCreated: () => void;
};

export function AddProjectObservationModal(props: AddProjectObservationModalProps) {
  return <AddLocationObservationModal {...props} projectLevel />;
}
