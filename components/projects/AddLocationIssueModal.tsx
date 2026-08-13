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
  X, Camera, Mic, Trash2, Loader2, AlertCircle, AlertTriangle,
  Building2, Layers, Images, Pencil, AlignLeft, ChevronRight, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { CameraCapture } from "@/components/projects/CameraCapture";
import type { CapturedFile } from "@/components/projects/CameraCapture";
import { resolveClientMime as resolveClientMimeUtil, isFieldMediaImageFile } from "@/lib/image-utils";
import { processLibraryMediaFile, toastImagePrepareFailure } from "@/lib/stage-library-field-media";
import { uploadWithRetry } from "@/lib/upload-with-retry";
import { MAX_MEDIA_ATTACHMENTS_PER_ENTITY } from "@/lib/media-attachment-limits";
import { ImageAnnotationEditor, isFlattenAnnotationSave, type AnnotationSaveResult } from "@/components/projects/ImageAnnotationEditor";
import type { ImageAnnotationPayload } from "@/lib/image-annotation-schema";
import { MentionTextarea } from "@/components/ui/MentionTextarea";
import { DictationButton } from "@/components/ui/DictationButton";
import { FileDropOverlay } from "@/components/ui/FileDropOverlay";
import { useFileDrop } from "@/hooks/use-file-drop";
import { MissingMaterialsFields } from "@/components/projects/issues/MissingMaterialsFields";
import {
  missingMaterialsFieldsComplete,
  parseMissingMaterialQuantity,
} from "@/lib/issues/missing-materials";

const FIELD_MEDIA_ACCEPT = "image/*,image/heic,image/heif,video/*,audio/*";
import { appendTranscriptSegment } from "@/lib/browser-speech";
import { issueTypePillClass } from "@/lib/issues/issueDisplay";
import {
  issueTypeRequiresVisual,
  resolveIssueTypeLabel,
  resolvePartyLabel,
  useIssueCatalog,
} from "@/lib/issues/use-issue-catalog";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AddLocationIssueModalProps {
  projectId: string;
  building: string;
  level?: string;
  onClose: () => void;
  onCreated: () => void;
}

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
  .alim-backdrop { position: fixed; inset: 0; z-index: 300; display: flex; align-items: flex-end; background: transparent; transition: background-color 0.26s ease; }
  .alim-backdrop.alim-visible { background: var(--overlay-bg, color-mix(in srgb, var(--color-surface-dark) 45%, transparent)); }
  .alim-sheet { width: 100%; min-height: 75dvh; max-height: 92dvh; border-radius: 20px 20px 0 0; background: var(--color-surface); transform: translateY(105%); transition: transform 0.3s cubic-bezier(0.32,0.72,0,1); display: flex; flex-direction: column; box-shadow: var(--shadow-modal); }
  .alim-sheet.alim-sheet-visible { transform: translateY(0); }
  .alim-handle { width: 36px; height: 4px; background: var(--neutral-300); border-radius: var(--radius-pill); margin: 10px auto 4px; flex-shrink: 0; }
  .alim-body { flex: 1; overflow-y: auto; padding: 10px var(--page-padding-x) calc(env(safe-area-inset-bottom) + 16px); scroll-padding-top: 24px; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
  .alim-title-anchor { position: relative; z-index: 1; }
  .alim-input, .alim-textarea { width: 100%; border: none; border-radius: var(--radius-md); background: var(--control-bg); color: var(--color-text-primary); box-sizing: border-box; font-family: inherit; font-size: var(--text-body); font-weight: var(--font-weight-normal); outline: none; }
  .alim-input { min-height: var(--input-height); padding: 10px 44px 10px 14px; }
  .alim-textarea { padding: 12px 14px 44px; line-height: 1.5; resize: none; }
  .alim-input:focus, .alim-textarea:focus { background: var(--control-bg); box-shadow: var(--focus-ring); }
  .alim-footer { padding: 12px var(--page-padding-x) calc(env(safe-area-inset-bottom) + 16px); border-top: none; background: var(--color-surface); flex-shrink: 0; }
  .alim-blocking-badge { display: inline-flex; align-items: center; gap: 7px; margin-top: 14px; margin-bottom: 4px; padding: 6px 14px 6px 10px; border-radius: var(--radius-pill); border: none; cursor: pointer; font-family: inherit; }
  .alim-blocking-badge--blocking { background: var(--error-600); }
  .alim-blocking-badge--nonblocking { background: var(--warning-600); }
  .alim-blocking-badge__label { font-size: var(--text-caption); font-weight: var(--font-weight-bold); color: var(--color-text-inverse); }
  .alim-blocking-badge__change { font-size: var(--text-micro); color: color-mix(in srgb, var(--color-text-inverse) 75%, transparent); margin-left: 2px; }
  .alim-media-actions { display: flex; gap: 8px; margin-top: 8px; }
  .alim-media-btn { flex: 1; min-height: var(--button-height); border-radius: var(--radius-md); border: none; display: flex; align-items: center; justify-content: center; gap: 6px; font-size: var(--text-body); font-weight: var(--font-weight-extrabold); cursor: pointer; font-family: inherit; }
  .alim-media-btn--primary { background: var(--control-active-bg); color: var(--control-active-fg); }
  .alim-media-btn--secondary { background: var(--control-bg); color: var(--control-fg); }
  .alim-media-btn--error { background: var(--error-50); color: var(--error-700); }
  .alim-type-grid { display: flex; flex-wrap: wrap; gap: 8px; }
  .alim-party-grid { display: flex; flex-wrap: wrap; gap: 8px; }
  @keyframes alim-spin { to { transform: rotate(360deg); } }
  .alim-spinning { animation: alim-spin 1s linear infinite; }
  @media (min-width: 768px) {
    .alim-backdrop { align-items: stretch; justify-content: flex-end; }
    .alim-sheet { width: min(520px, 100vw); min-height: 0; max-height: none; height: 100%; border-radius: 0; transform: translateX(105%); box-shadow: var(--shadow-modal); }
    .alim-sheet.alim-sheet-visible { transform: translateX(0); }
    .alim-handle { display: none; }
    .alim-body { padding-bottom: 24px; }
    .alim-footer { padding-bottom: 24px; }
  }
`;

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
    <div style={{ position: "relative", width: 88, height: 88, flexShrink: 0, borderRadius: 10, overflow: "hidden", border: `1.5px solid ${isFailed ? "var(--error-500)" : isPending ? "var(--error-300)" : "var(--neutral-200)"}` }}>
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
        <div style={{ position: "absolute", bottom: 4, left: 4, width: 8, height: 8, borderRadius: 99, backgroundColor: "var(--error-500)", border: "1.5px solid var(--neutral-0)" }} />
      )}
      {isPending && uploading && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--overlay-bg, color-mix(in srgb, var(--color-surface-dark) 40%, transparent))" }}>
          <Loader2 size={22} style={{ color: "var(--color-text-inverse)" }} className="alim-spinning" />
        </div>
      )}
      {hasCaption && !uploading && !isFailed && (
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "var(--overlay-bg, color-mix(in srgb, var(--color-surface-dark) 55%, transparent))", padding: "2px 5px" }}>
          <p style={{ margin: 0, fontSize: "var(--text-micro)", color: "var(--color-text-inverse)", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{caption}</p>
        </div>
      )}
      {!uploading && (
        <button type="button" aria-label={t("removeMediaAria")} onClick={onRemove}
          style={{ position: "absolute", top: 3, right: 3, width: 22, height: 22, borderRadius: "var(--radius-pill)", backgroundColor: isFailed ? "var(--error-600)" : "var(--overlay-bg, color-mix(in srgb, var(--color-surface-dark) 55%, transparent))", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
          <Trash2 size={12} style={{ color: "var(--color-text-inverse)" }} />
        </button>
      )}
      {!uploading && !isFailed && (
        <button type="button" aria-label={hasCaption ? t("editCaptionAria") : t("addCaptionAria")} onClick={onCaption}
          style={{ position: "absolute", bottom: 3, left: 3, width: 22, height: 22, borderRadius: "var(--radius-pill)", backgroundColor: "var(--overlay-bg, color-mix(in srgb, var(--color-surface-dark) 55%, transparent))", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
          <AlignLeft size={11} style={{ color: "var(--color-text-inverse)" }} />
        </button>
      )}
      {isImage && !uploading && !isFailed && onAnnotate && (
        <button type="button" aria-label={t("annotateMediaAria")} onClick={onAnnotate}
          style={{ position: "absolute", bottom: 3, right: 3, width: 22, height: 22, borderRadius: "var(--radius-pill)", backgroundColor: "var(--overlay-bg, color-mix(in srgb, var(--color-surface-dark) 55%, transparent))", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
          <Pencil size={11} style={{ color: "var(--color-text-inverse)" }} />
        </button>
      )}
    </div>
  );
}


// ── Main component ────────────────────────────────────────────────────────────

export function AddLocationIssueModal({
  projectId, building, level, onClose, onCreated,
}: AddLocationIssueModalProps) {
  const t = useTranslations("units");
  const tCommon = useTranslations("common");
  const td = useTranslations("dictation");
  const tOfflineMedia = useTranslations("offlineMedia");
  const isBrowser = useIsBrowser();
  const { issueTypes: catalogIssueTypes, responsibleParties: catalogParties } =
    useIssueCatalog(projectId);

  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<"pick-blocking" | "form">("pick-blocking");
  const [issueType, setIssueType] = useState("");
  const [missingMaterialDescription, setMissingMaterialDescription] = useState("");
  const [missingMaterialQuantity, setMissingMaterialQuantity] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [selectedParties, setSelectedParties] = useState<Set<string>>(new Set());
  const [isBlocking, setIsBlocking] = useState(false);
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
  const notesTextareaRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState({ height: 0, offsetTop: 0 });
  const scrollTimerRef = useRef<number | null>(null);

  const unitRef = level ? `${building}|${level}|` : `${building}||`;
  const modalTitle = level ? t("levelIssueTitle") : t("buildingIssueTitle");

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

  const openForm = useCallback((blocking: boolean) => {
    setIsBlocking(blocking);
    setStep("form");
    window.setTimeout(() => {
      const titleInput = titleInputRef.current;
      if (!titleInput) return;
      scrollFieldIntoView(titleInput);
    }, 60);
  }, [scrollFieldIntoView]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const isUploading = uploadProgress !== null;
  const hasFailedMedia = media.some((m) => m.kind === "failed");
  const requiresVisual =
    issueType !== "" && issueTypeRequiresVisual(issueType, catalogIssueTypes);
  const hasVisualMedia = media.some((m) => m.mimeType.startsWith("image/") || m.mimeType.startsWith("video/"));
  const mediaError = requiresVisual && !hasVisualMedia;
  const missingMaterialsComplete = missingMaterialsFieldsComplete(
    issueType,
    missingMaterialDescription,
    missingMaterialQuantity,
  );
  const canSubmit = !!issueType && description.trim().length > 0 && selectedParties.size > 0 && !mediaError && !isUploading && !hasFailedMedia && missingMaterialsComplete;

  function toggleParty(party: string) {
    setSelectedParties((prev) => {
      const next = new Set(prev);
      if (next.has(party)) next.delete(party);
      else next.add(party);
      return next;
    });
  }

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
            location: { building, level: level ?? "", unit: "" },
            uploaded: true,
          },
          onHeicLargeWarning: (f) =>
            toast(tCommon("heicLargeFileWarning", { filename: f.name, sizeMb: (f.size / 1024 / 1024).toFixed(0) }), { icon: "ℹ️" }),
        });
        processedFile = prepared.file;
        processedMime = prepared.mimeType;
      } catch {
        if (isFieldMediaImageFile(file)) {
          toastImagePrepareFailure(
            file,
            () => t("obsImagePrepareFailed"),
            (v) => tCommon("imageTooLargePrepareFailed", v),
          );
          continue;
        }
      }
      newItems.push({
        kind: "staged",
        clientId: `${Date.now()}-${Math.random()}`,
        file: processedFile,
        localUrl: URL.createObjectURL(processedFile),
        mimeType: processedMime,
        caption: "",
      });
    }
    if (newItems.length > 0) setMedia((prev) => [...prev, ...newItems]);
  }, [building, level, media.length, t, tCommon]);

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

  function handleAnnotationSave(clientId: string, result: AnnotationSaveResult) {
    if (!isFlattenAnnotationSave(result)) return;
    setMedia((prev) => prev.map((m) => {
      if (m.clientId !== clientId || m.kind !== "staged") return m;
      const annotatedFile = new File([result.blob], (m as StagedMedia).file.name, { type: "image/jpeg" });
      return { ...m, file: annotatedFile, localUrl: result.localUrl, mimeType: "image/jpeg" };
    }));
    setAnnotatingClientId(null);
  }

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
      form.append("type", "issues");
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
    if (!canSubmit) return;
    setSubmitting(true);

    const missingMaterialsPayload =
      issueType === "MISSING_MATERIALS"
        ? {
            missingMaterialDescription: missingMaterialDescription.trim(),
            missingMaterialQuantity: parseMissingMaterialQuantity(missingMaterialQuantity) ?? undefined,
          }
        : {};

    if (!navigator.onLine) {
      try {
        const staged = media.filter((m): m is { kind: "staged" } & StagedMedia => m.kind === "staged");
        await enqueueMutationWithVerifiedBlobs({
          type: "create-issue",
          url: `/api/projects/${projectId}/issues`,
          method: "POST",
          body: {
            unitRef,
            projectRowIds: [],
            issueType,
            shortDescription: description.trim(),
            notes: notes.trim() || undefined,
            responsibleParties: Array.from(selectedParties),
            isBlockingWork: isBlocking,
            subScopeInstanceIds: [],
            ...missingMaterialsPayload,
            ...offlineAttachmentFieldsFromStaged(staged),
          },
          mediaFiles: staged.map((s) => s.file),
        });
        toast.success(staged.length > 0 ? t("issueSavedOfflineWithMedia") : t("issueSavedOffline"));
        onCreated();
        close();
      } catch (err) {
        if (err instanceof BlobStoreVerificationError) {
          toast.error(tOfflineMedia("photoSaveFailed"));
        } else {
          toast.error(t("issueSaveOfflineFailed"));
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
        form.append("type", "issues");
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
      const issuePayload = {
        unitRef,
        projectRowIds: [],
        subScopeInstanceIds: [],
        issueType,
        shortDescription: description.trim(),
        notes: notes.trim() || undefined,
        responsibleParties: Array.from(selectedParties),
        isBlockingWork: isBlocking,
        ...missingMaterialsPayload,
        attachmentKeys: finalMedia.map((a) => a.storageKey),
        attachmentUrls: finalMedia.map((a) => a.storageUrl),
        attachmentMimeTypes: finalMedia.map((a) => a.mimeType),
        attachmentFileSizeBytes: finalMedia.map((a) => a.fileSizeBytes ?? null),
        attachmentCaptions: finalMedia.map((a) => a.caption),
        attachmentImageAnnotations: finalMedia.map((a) => a.imageAnnotation ?? null),
      };
      const bodyWithLocation = await enrichBodyWithActivityLocation(issuePayload);
      const res = await fetch(`/api/projects/${projectId}/issues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyWithLocation),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(err.error ?? t("issueSubmitFailed"));
        return;
      }
      toast.success(t("issueReported"));
      onCreated();
      close();
    } catch {
      toast.error(t("issueSubmitFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  if (!isBrowser) return null;

  const issueTypeLabel = (code: string) =>
    resolveIssueTypeLabel(code, catalogIssueTypes, (c) => {
      const legacy: Record<string, string> = {
        SUBSTRATE_CONDITION: t("issueTypeSubstrate"),
        DAMAGED_MATERIALS: t("issueTypeDamagedMaterials"),
        MISSING_MATERIALS: t("issueTypeMissingMaterials"),
        TRADE_DAMAGE_REPAIR: t("issueTypeTradeDamage"),
        OTHER: t("issueTypeOther"),
      };
      return legacy[c] ?? c.replace(/_/g, " ");
    });

  const partyLabel = (code: string) =>
    resolvePartyLabel(code, catalogParties, (c) => {
      const legacy: Record<string, string> = {
        CP_BUILD: t("rpCpBuild"), ELECTRICIAN: t("rpElectrician"), PLUMBER: t("rpPlumber"),
        CARPENTER: t("rpCarpenter"), GENERAL_CONTRACTOR: t("rpGC"), FRAMING: t("rpFraming"),
        DRYWALL: t("rpDrywall"), FLOORING: t("rpFlooring"), PAINTING: t("rpPainting"),
        HVAC: t("rpHVAC"), FIRE_PROTECTION: t("rpFireProtection"), LOW_VOLTAGE: t("rpLowVoltage"),
      };
      return legacy[c] ?? c.replace(/_/g, " ");
    });

  const annotatingItem = annotatingClientId ? media.find((m) => m.clientId === annotatingClientId) : null;

  const sheet = createPortal(
    <>
      <style>{SHEET_CSS}</style>
      <div role="presentation" className={`alim-backdrop${visible ? " alim-visible" : ""}`}
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        style={vp.height > 0 ? { top: vp.offsetTop, height: vp.height } : undefined}>
        <div role="dialog" aria-modal="true" aria-label={modalTitle}
          className={`alim-sheet${visible ? " alim-sheet-visible" : ""}`}
          style={vp.height > 0 ? { height: `${Math.round(vp.height)}px`, maxHeight: `${Math.round(vp.height)}px`, minHeight: 0 } : undefined}>
          <div className="alim-handle" aria-hidden />

          {/* Header */}
          <div style={{ padding: "8px var(--page-padding-x) 0", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <AlertCircle size={18} style={{ color: "var(--error-600)" }} />
                <span style={{ fontSize: "var(--text-subheading)", fontWeight: "var(--font-weight-black)", color: "var(--color-text-primary)", letterSpacing: "var(--tracking-tight)" }}>{modalTitle}</span>
              </div>
              <button type="button" onClick={close} aria-label={tCommon("close")}
                style={{ width: 32, height: 32, borderRadius: "var(--radius-pill)", border: "none", backgroundColor: "var(--control-bg)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <X size={16} style={{ color: "var(--control-icon)" }} />
              </button>
            </div>

            {/* Location badge */}
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 10, padding: "5px 10px", borderRadius: "var(--radius-md)", backgroundColor: "var(--control-bg)", border: "none" }}>
              <Building2 size={12} style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }} />
              <span style={{ fontSize: "var(--text-caption)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text-secondary)" }}>{building}</span>
              {level && (
                <>
                  <span style={{ fontSize: "var(--text-caption)", color: "var(--color-text-disabled)" }}>›</span>
                  <Layers size={12} style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }} />
                  <span style={{ fontSize: "var(--text-caption)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text-secondary)" }}>{t("levelGroupHeading", { level })}</span>
                </>
              )}
            </div>

            <div style={{ height: 1, backgroundColor: "var(--color-divider)", margin: "0 calc(-1 * var(--page-padding-x))" }} />
          </div>

          {/* Step 1 — Blocking picker */}
          {step === "pick-blocking" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "16px var(--page-padding-x) calc(env(safe-area-inset-bottom) + 24px)" }}>
              <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--neutral-500)", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "center" }}>
                {t("blockingPickerQuestion")}
              </p>
              <p style={{ margin: "0 0 28px", fontSize: 14, color: "var(--neutral-400)", textAlign: "center" }}>
                {t("blockingPickerSubtitle")}
              </p>
              <button type="button" onClick={() => openForm(true)}
                style={{ width: "100%", padding: "20px 20px", borderRadius: "var(--radius-lg)", border: "2px solid var(--error-200)", backgroundColor: "var(--error-50)", cursor: "pointer", marginBottom: 12, display: "flex", alignItems: "center", gap: 16, textAlign: "left", fontFamily: "inherit" }}>
                <span style={{ width: 44, height: 44, borderRadius: "var(--radius-pill)", backgroundColor: "var(--error-600)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <AlertCircle size={22} style={{ color: "var(--color-text-inverse)" }} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 16, fontWeight: 700, color: "var(--error-700)", marginBottom: 3 }}>{t("blockingLabel")}</span>
                  <span style={{ display: "block", fontSize: 13, color: "var(--error-600)", lineHeight: 1.4 }}>{t("blockingDesc")}</span>
                </span>
                <ChevronRight size={18} style={{ color: "var(--error-400)", flexShrink: 0 }} />
              </button>
              <button type="button" onClick={() => openForm(false)}
                style={{ width: "100%", padding: "20px 20px", borderRadius: 14, border: "2px solid var(--warning-100)", backgroundColor: "var(--warning-100)", cursor: "pointer", display: "flex", alignItems: "center", gap: 16, textAlign: "left" }}>
                <span style={{ width: 44, height: 44, borderRadius: 99, backgroundColor: "var(--warning-600)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <AlertTriangle size={22} style={{ color: "var(--neutral-0)" }} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 16, fontWeight: 700, color: "var(--warning-600)", marginBottom: 3 }}>{t("nonBlockingLabel")}</span>
                  <span style={{ display: "block", fontSize: 13, color: "var(--warning-600)", lineHeight: 1.4 }}>{t("nonBlockingDesc")}</span>
                </span>
                <ChevronRight size={18} style={{ color: "var(--warning-400)", flexShrink: 0 }} />
              </button>
            </div>
          )}

          {/* Step 2 — Form */}
          <div className="alim-body" ref={bodyRef} style={{ display: step === "form" ? undefined : "none" }}>

            {/* Blocking badge — tappable to go back */}
            <button type="button" onClick={() => setStep("pick-blocking")}
              className={`alim-blocking-badge ${isBlocking ? "alim-blocking-badge--blocking" : "alim-blocking-badge--nonblocking"}`}
              aria-label={t("changeBlockingAria")}>
              {isBlocking
                ? <AlertCircle size={14} style={{ color: "var(--color-text-inverse)", flexShrink: 0 }} />
                : <AlertTriangle size={14} style={{ color: "var(--color-text-inverse)", flexShrink: 0 }} />}
              <span className="alim-blocking-badge__label">{isBlocking ? t("blockingLabel") : t("nonBlockingLabel")}</span>
              <span className="alim-blocking-badge__change">{tCommon("change")}</span>
            </button>

            {/* Title */}
            <div className="entity-form-section entity-form-section--flush-top alim-title-anchor">
              <div className="entity-form-section__header">
                {td("fieldTitle")} <span className="entity-form-section__required">*</span>
              </div>
              <div style={{ position: "relative" }}>
                <input ref={titleInputRef} type="text" className="alim-input" value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, 50))}
                  onFocus={(e) => { setTitleTouched(true); scrollFieldIntoView(e.currentTarget); }}
                  placeholder={t("titlePlaceholderIssue")}
                  maxLength={50}
                />
                <DictationButton disabled={submitting} fieldLabel={td("fieldTitle")} focusTargetRef={titleInputRef}
                  onAppendText={(segment) => setDescription((prev) => appendTranscriptSegment(prev, segment, 50))}
                  style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)" }} />
              </div>
              <div className="entity-form-char-count">{description.length}/50</div>
            </div>

            {(titleTouched || description.trim().length > 0) && (<>

            {/* Notes */}
            <div className="entity-form-section">
              <div className="entity-form-section__header">
                {td("fieldNotes")} <span className="entity-form-section__optional">{tCommon("optionalLabel")}</span>
              </div>
              <div style={{ position: "relative" }}>
                <MentionTextarea value={notes} onChange={setNotes} textFieldRef={notesTextareaRef}
                  onFocus={(e) => scrollFieldIntoView(e.currentTarget)}
                  placeholder={t("notesTitlePlaceholder")}
                  rows={3}
                  className="alim-textarea"
                  aria-label={t("issueNotesAria")}
                />
                <DictationButton disabled={submitting} fieldLabel={td("fieldNotes")} focusTargetRef={notesTextareaRef}
                  onAppendText={(segment) => setNotes((prev) => appendTranscriptSegment(prev, segment))}
                  style={{ position: "absolute", right: 8, bottom: 8 }} />
              </div>
            </div>

            {/* Issue type */}
            <div className="entity-form-section">
              <div className="entity-form-section__header">{t("issueTypeLabel")}</div>
              <div className="alim-type-grid">
                {catalogIssueTypes.map((type) => (
                  <button key={type.code} type="button" onClick={() => {
                    setIssueType(type.code);
                    if (type.code !== "MISSING_MATERIALS") {
                      setMissingMaterialDescription("");
                      setMissingMaterialQuantity("");
                    }
                  }}
                    className={`entity-form-type-pill${issueType === type.code ? ` is-selected ${issueTypePillClass(type.code)}` : ""}`}>
                    {issueTypeLabel(type.code)}
                  </button>
                ))}
              </div>
              {issueType === "MISSING_MATERIALS" && (
                <MissingMaterialsFields
                  materialDescription={missingMaterialDescription}
                  onMaterialDescriptionChange={setMissingMaterialDescription}
                  materialQuantity={missingMaterialQuantity}
                  onMaterialQuantityChange={setMissingMaterialQuantity}
                  uom={null}
                  disabled={submitting}
                  onFieldFocus={scrollFieldIntoView}
                />
              )}
            </div>

            {/* Responsible party */}
            <div className="entity-form-section">
              <div className="entity-form-section__header">{t("responsiblePartyLabel")}</div>
              <p style={{ margin: "4px 0 8px", fontSize: 11, color: "var(--neutral-400)" }}>{t("responsiblePartiesHint")}</p>
              <div className="alim-party-grid">
                {catalogParties.map((party) => (
                  <button key={party.code} type="button" onClick={() => toggleParty(party.code)}
                    className={`entity-form-choice-pill${selectedParties.has(party.code) ? " is-selected" : ""}`}>
                    {partyLabel(party.code)}
                  </button>
                ))}
              </div>
            </div>

            {/* Media */}
            <div className="entity-form-section" style={{ position: "relative" }} {...dropHandlers}>
              <div className="entity-form-section__header">{t("mediaLabel")}</div>
              {requiresVisual && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, padding: "8px 10px", borderRadius: 8, backgroundColor: "var(--warning-50)", border: "1px solid var(--warning-300)" }}>
                  <AlertCircle size={14} style={{ color: "var(--warning-600)", flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: "var(--warning-700)" }}>{t("mediaRequired")}</span>
                </div>
              )}
              {media.length > 0 && (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8, marginBottom: 8 }}>
                  {media.map((m) => (
                    <MediaThumb key={m.clientId} item={m} uploading={isUploading && m.kind === "staged"}
                      onRemove={() => setMedia((prev) => prev.filter((x) => x.clientId !== m.clientId))}
                      onAnnotate={m.mimeType.startsWith("image/") && m.kind === "staged" ? () => setAnnotatingClientId(m.clientId) : undefined}
                      onCaption={() => { setCaptionDraft("caption" in m ? (m.caption as string) : ""); setCaptioningClientId(m.clientId); }}
                      onRetry={m.kind === "failed" && !retryingClientIds.has(m.clientId) ? () => handleRetryUpload(m.clientId) : undefined}
                    />
                  ))}
                </div>
              )}
              {media.some((m) => m.kind === "staged") && !isUploading && (
                <p style={{ margin: "4px 0 0", fontSize: "var(--text-caption)", color: "var(--error-600)", fontWeight: "var(--font-weight-semibold)" }}>
                  {t("mediaReadyHint", { count: media.filter((m) => m.kind === "staged").length })}
                </p>
              )}
              {media.length < MAX_MEDIA_ATTACHMENTS_PER_ENTITY && !isUploading && (
                <>
                  <input ref={fileInputRef} type="file" accept={FIELD_MEDIA_ACCEPT} multiple style={{ display: "none" }} onChange={handleFileChange} />
                  <div className="alim-media-actions">
                    <button type="button" onClick={() => setShowCamera(true)}
                      className={`alim-media-btn ${mediaError ? "alim-media-btn--error" : "alim-media-btn--primary"}`}>
                      <Camera size={15} /> {t("album.camera")}
                    </button>
                    <button type="button" onClick={() => fileInputRef.current?.click()}
                      className={`alim-media-btn ${mediaError ? "alim-media-btn--error" : "alim-media-btn--secondary"}`}>
                      <Images size={15} /> {t("album.library")}
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
            </>)}
          </div>

          {/* Footer */}
          {step === "form" && (titleTouched || description.trim().length > 0) && (
            <div className="alim-footer">
              {hasFailedMedia && (
                <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--error-600)", fontWeight: 600, textAlign: "center" }}>
                  {t("mediaUploadFailedBanner", { count: media.filter((m) => m.kind === "failed").length })}
                </p>
              )}
              <button type="button" onClick={handleSubmit} disabled={!canSubmit || submitting}
                style={{ width: "100%", minHeight: 48, borderRadius: "var(--radius-md)", border: "none", backgroundColor: !canSubmit || submitting ? "var(--control-bg)" : "var(--error-600)", color: !canSubmit || submitting ? "var(--color-text-disabled)" : "var(--color-text-inverse)", fontSize: "var(--text-body)", fontWeight: "var(--font-weight-extrabold)", cursor: submitting ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "background-color 0.15s", fontFamily: "inherit" }}>
                {submitting && <Loader2 size={18} className="alim-spinning" />}
                {uploadProgress ? t("uploadProgressLabel", { current: uploadProgress.current, total: uploadProgress.total }) : submitting ? t("submitting") : t("addIssue")}
              </button>
            </div>
          )}
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
        <div role="dialog" aria-modal="true" aria-label={t("addCaptionTitle")}
          style={{ position: "fixed", inset: 0, zIndex: 500, display: "flex", flexDirection: "column", backgroundColor: "var(--overlay-bg, color-mix(in srgb, var(--color-surface-dark) 60%, transparent))" }}
          onClick={(e) => { if (e.target === e.currentTarget) setCaptioningClientId(null); }}>
          <div style={{ flex: 1 }} onClick={() => setCaptioningClientId(null)} />
          <div style={{ backgroundColor: "var(--color-surface)", borderRadius: "20px 20px 0 0", padding: "20px 20px", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)", display: "flex", flexDirection: "column", gap: 14, boxShadow: "var(--shadow-modal)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "var(--text-subheading)", fontWeight: "var(--font-weight-black)", color: "var(--color-text-primary)", letterSpacing: "var(--tracking-tight)" }}>{t("addCaptionTitle")}</span>
              <button type="button" onClick={() => setCaptioningClientId(null)} aria-label={tCommon("cancel")}
                style={{ width: 32, height: 32, borderRadius: "var(--radius-pill)", border: "none", backgroundColor: "var(--control-bg)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <X size={16} style={{ color: "var(--control-icon)" }} />
              </button>
            </div>
            <textarea autoFocus value={captionDraft} onChange={(e) => setCaptionDraft(e.target.value)} onKeyDown={(e) => e.stopPropagation()}
              placeholder={t("captionPlaceholder")} rows={4} maxLength={500}
              className="alim-textarea"
              style={{ padding: "12px 14px" }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={() => setCaptioningClientId(null)}
                style={{ flex: 1, minHeight: 48, borderRadius: "var(--radius-md)", border: "1.5px solid var(--control-border)", backgroundColor: "var(--color-surface)", fontSize: "var(--text-body)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text-secondary)", cursor: "pointer", fontFamily: "inherit" }}>
                {tCommon("cancel")}
              </button>
              <button type="button"
                onClick={() => { const id = captioningClientId; setMedia((prev) => prev.map((x) => x.clientId === id ? { ...x, caption: captionDraft.trim() } : x)); setCaptioningClientId(null); }}
                style={{ flex: 1, minHeight: 48, borderRadius: "var(--radius-md)", border: "none", backgroundColor: "var(--error-600)", fontSize: "var(--text-body)", fontWeight: "var(--font-weight-extrabold)", color: "var(--color-text-inverse)", cursor: "pointer", fontFamily: "inherit" }}>
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
