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
import { X, Camera, Mic, Trash2, Loader2, AlertCircle, AlertTriangle, Check, Building2, Layers, Images, Pencil, AlignLeft, ChevronRight, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { UnitContext } from "./AddObservationModal";
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
  resolveSelectedScopeUom,
} from "@/lib/issues/missing-materials";

const FIELD_MEDIA_ACCEPT = "image/*,image/heic,image/heif,video/*,audio/*";
import { appendTranscriptSegment } from "@/lib/browser-speech";
import { isCustomSiteUnitRef } from "@/lib/custom-site-locations";
import {
  issueTypeRequiresVisual,
  resolveIssueTypeLabel,
  resolvePartyLabel,
  useIssueCatalog,
} from "@/lib/issues/use-issue-catalog";

export interface IssueScopeSubScope {
  id: string;   // SubScopeInstance id
  name: string; // subScope.name
}

export interface IssueScope {
  id: string;
  name: string;
  uom?: { code: string; name: string } | null;
  subScopes?: IssueScopeSubScope[];
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

/** A media item whose upload failed after all automatic retries. Retains the
 * file reference so the user can trigger a manual retry without re-selecting. */
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

const VIDEO_SIZE_LIMIT = 50 * 1024 * 1024; // 50 MB

function resolveClientMime(file: File): string {
  return resolveClientMimeUtil(file);
}

export interface AddIssueModalProps {
  projectId: string;
  unitContext: UnitContext;
  scopes: IssueScope[];
  defaultRowId?: string;
  onClose: () => void;
  onCreated: () => void;
  /** Stack above nested detail shells (e.g. custom site location panel). */
  elevatedStacking?: boolean;
}

const SHEET_CSS = `
  .aim-backdrop { position: fixed; inset: 0; z-index: 300; display: flex; align-items: flex-end; background: rgba(0,0,0,0); transition: background-color 0.26s ease; }
  .aim-backdrop.aim-elevated { z-index: 450; }
  .aim-backdrop.aim-visible { background: rgba(0,0,0,0.45); }
  .aim-sheet { width: 100%; min-height: 75dvh; max-height: 92dvh; border-radius: 20px 20px 0 0; background: var(--neutral-0); transform: translateY(105%); transition: transform 0.3s cubic-bezier(0.32,0.72,0,1); display: flex; flex-direction: column; box-shadow: 0 -4px 40px rgba(0,0,0,0.18); }
  .aim-sheet.aim-sheet-visible { transform: translateY(0); }
  .aim-handle { width: 36px; height: 4px; background: var(--neutral-300); border-radius: 99px; margin: 10px auto 4px; flex-shrink: 0; }
  .aim-body { flex: 1; overflow-y: auto; padding: 10px var(--page-padding-x) calc(env(safe-area-inset-bottom) + 16px); scroll-padding-top: 24px; }
  .aim-footer { padding: 12px var(--page-padding-x) calc(env(safe-area-inset-bottom) + 16px); border-top: 1px solid var(--neutral-100); flex-shrink: 0; }
  @keyframes aim-spin { to { transform: rotate(360deg); } }
  .aim-spinning { animation: aim-spin 1s linear infinite; }
  @media (min-width: 768px) {
    .aim-backdrop { align-items: stretch; justify-content: flex-end; }
    .aim-sheet { width: min(520px, 100vw); min-height: 0; max-height: none; height: 100%; border-radius: 0; transform: translateX(105%); box-shadow: -4px 0 32px rgba(0,0,0,0.18); }
    .aim-sheet.aim-sheet-visible { transform: translateX(0); }
    .aim-handle { display: none; }
    .aim-body { padding-bottom: 24px; }
    .aim-footer { padding-bottom: 24px; }
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
  const isVideo = item.mimeType.startsWith("video/");
  const isPending = item.kind === "staged";
  const isFailed = item.kind === "failed";
  const caption = "caption" in item ? (item.caption as string) : "";
  const hasCaption = caption.trim().length > 0;

  return (
    <div style={{ position: "relative", width: 88, height: 88, flexShrink: 0, borderRadius: 10, overflow: "hidden", border: `1.5px solid ${isFailed ? "var(--error-500)" : isPending ? "var(--error-300)" : "var(--neutral-200)"}` }}>
      {isImage && <img src={item.localUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: isFailed ? 0.5 : 1 }} />}
      {isVideo && <video src={item.localUrl} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: isFailed ? 0.5 : 1 }} muted playsInline />}
      {!isImage && !isVideo && (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--neutral-100)" }}>
          <Mic size={24} style={{ color: "var(--neutral-500)" }} />
        </div>
      )}

      {/* Failed overlay — red tint with centered retry button */}
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
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.4)" }}>
          <Loader2 size={22} style={{ color: "#fff" }} className="aim-spinning" />
        </div>
      )}

      {/* Caption indicator strip */}
      {hasCaption && !uploading && !isFailed && (
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.55)", padding: "2px 5px" }}>
          <p style={{ margin: 0, fontSize: 10, color: "#fff", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{caption}</p>
        </div>
      )}

      {!uploading && (
        <button type="button" aria-label="Remove" onClick={onRemove}
          style={{ position: "absolute", top: 3, right: 3, width: 22, height: 22, borderRadius: 99, backgroundColor: isFailed ? "var(--error-600)" : "rgba(0,0,0,0.55)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
          <Trash2 size={12} style={{ color: "#fff" }} />
        </button>
      )}
      {/* Caption button — bottom-left (not shown on failed items) */}
      {!uploading && !isFailed && (
        <button type="button" aria-label={hasCaption ? "Edit caption" : "Add caption"} onClick={onCaption}
          style={{ position: "absolute", bottom: 3, left: 3, width: 22, height: 22, borderRadius: 99, backgroundColor: hasCaption ? "rgba(220,38,38,0.85)" : "rgba(0,0,0,0.55)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
          <AlignLeft size={11} style={{ color: "#fff" }} />
        </button>
      )}
      {/* Annotate button — bottom-right (images only, not failed) */}
      {isImage && !uploading && !isFailed && onAnnotate && (
        <button type="button" aria-label="Annotate" onClick={onAnnotate}
          style={{ position: "absolute", bottom: 3, right: 3, width: 22, height: 22, borderRadius: 99, backgroundColor: "rgba(0,0,0,0.55)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
          <Pencil size={11} style={{ color: "#fff" }} />
        </button>
      )}
    </div>
  );
}

function ScopePill({ scope, checked, onToggle }: { scope: IssueScope; checked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "7px 14px", borderRadius: 99,
        border: `1.5px solid ${checked ? "var(--error-500)" : "var(--neutral-250)"}`,
        backgroundColor: checked ? "var(--error-500)" : "var(--neutral-0)",
        color: checked ? "#fff" : "var(--neutral-700)",
        fontSize: 13, fontWeight: checked ? 600 : 400,
        cursor: "pointer", transition: "all 0.12s",
        flexShrink: 0,
      }}
    >
      {checked && <Check size={12} style={{ color: "#fff", strokeWidth: 3 }} />}
      {scope.name}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function AddIssueModal({
  projectId, unitContext, scopes, defaultRowId, onClose, onCreated, elevatedStacking = false,
}: AddIssueModalProps) {
  const t = useTranslations("units");
  const tCommon = useTranslations("common");
  const td = useTranslations("dictation");
  const tOfflineMedia = useTranslations("offlineMedia");
  const isBrowser = useIsBrowser();
  const { issueTypes: catalogIssueTypes, responsibleParties: catalogParties, loading: catalogLoading } =
    useIssueCatalog(projectId);

  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<"pick-blocking" | "form">("pick-blocking");
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(
    () => new Set(
      defaultRowId ? [defaultRowId]
      : scopes.length === 1 ? [scopes[0].id]
      : []
    )
  );
  const [selectedSubScopeIds, setSelectedSubScopeIds] = useState<Set<string>>(new Set());
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const notesTextareaRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const scopeSectionRef = useRef<HTMLDivElement>(null);
  // Track visual viewport dimensions so the sheet stays anchored to the visible
  // area above the keyboard on iOS (layout viewport shifts down when keyboard opens,
  // which slides position:fixed elements partially off the top of the screen).
  const [vp, setVp] = useState({ height: 0, offsetTop: 0 });
  const scrollTimerRef = useRef<number | null>(null);
  const [retryingClientIds, setRetryingClientIds] = useState<Set<string>>(new Set());
  const [showMissingMaterialsScopeAlert, setShowMissingMaterialsScopeAlert] = useState(false);

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
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
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

  const scrollToScopeSection = useCallback(() => {
    const el = scopeSectionRef.current;
    if (el) scrollFieldIntoView(el);
  }, [scrollFieldIntoView]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  function toggleScope(id: string) {
    if (issueType === "MISSING_MATERIALS" && scopes.length > 1) {
      setSelectedRowIds((prev) => {
        if (prev.has(id) && prev.size === 1) return prev;
        setSelectedSubScopeIds(new Set());
        return new Set([id]);
      });
      return;
    }

    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        // Clear sub-scope selections that belonged to this scope
        const scope = scopes.find((s) => s.id === id);
        if (scope?.subScopes && scope.subScopes.length > 0) {
          const ownedIds = new Set(scope.subScopes.map((ss) => ss.id));
          setSelectedSubScopeIds((prev2) => {
            const next2 = new Set(prev2);
            for (const oid of ownedIds) next2.delete(oid);
            return next2;
          });
        }
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSubScope(id: string) {
    setSelectedSubScopeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const isUploading = uploadProgress !== null;
  const hasFailedMedia = media.some((m) => m.kind === "failed");
  const requiresVisual =
    issueType !== "" && issueTypeRequiresVisual(issueType, catalogIssueTypes);
  const hasVisualMedia = media.some((m) => m.mimeType.startsWith("image/") || m.mimeType.startsWith("video/"));
  const mediaError = requiresVisual && !hasVisualMedia;
  const isMissingMaterialsSingleScope = issueType === "MISSING_MATERIALS";
  const missingMaterialsScopeValid =
    !isMissingMaterialsSingleScope || scopes.length <= 1 || selectedRowIds.size === 1;
  const showMissingMaterialsScopeHint =
    isMissingMaterialsSingleScope
    && scopes.length > 1
    && selectedRowIds.size !== 1
    && !showMissingMaterialsScopeAlert;
  const selectedScopeUom = resolveSelectedScopeUom(scopes, selectedRowIds);
  const missingMaterialsComplete = missingMaterialsFieldsComplete(
    issueType,
    missingMaterialDescription,
    missingMaterialQuantity,
  );
  const canSubmit = !!issueType && description.trim().length > 0 && selectedParties.size > 0 && !mediaError && !isUploading && !hasFailedMedia && missingMaterialsComplete && missingMaterialsScopeValid;

  function handleIssueTypeSelect(type: string) {
    setIssueType(type);
    if (type !== "MISSING_MATERIALS") {
      setMissingMaterialDescription("");
      setMissingMaterialQuantity("");
      return;
    }
    if (scopes.length > 1 && selectedRowIds.size > 1) {
      setShowMissingMaterialsScopeAlert(true);
      return;
    }
    if (scopes.length > 1 && selectedRowIds.size !== 1) {
      window.setTimeout(() => scrollToScopeSection(), 60);
    }
  }

  function handleMissingMaterialsScopeAlertOk() {
    setShowMissingMaterialsScopeAlert(false);
    setSelectedRowIds(new Set());
    setSelectedSubScopeIds(new Set());
    window.setTimeout(() => scrollToScopeSection(), 60);
  }

  function toggleParty(party: string) {
    setSelectedParties((prev) => {
      const next = new Set(prev);
      if (next.has(party)) {
        if (next.size <= 1) return prev;
        next.delete(party);
      } else {
        next.add(party);
      }
      return next;
    });
  }

  function handleCameraCapture(captured: CapturedFile[]) {
    const slots = MAX_MEDIA_ATTACHMENTS_PER_ENTITY - media.length;
    if (slots <= 0) return;
    const newItems: MediaItem[] = captured.slice(0, slots).map((c) => ({
      kind: "staged",
      clientId: `${Date.now()}-${Math.random()}`,
      file: c.file,
      localUrl: c.localUrl,
      mimeType: c.mimeType,
      caption: "",
      imageAnnotation: c.imageAnnotation,
    }));
    setMedia((prev) => [...prev, ...newItems]);
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
            location: { building: unitContext.building, area: unitContext.area, level: unitContext.level, unit: unitContext.unit },
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
  }, [media.length, t, tCommon, unitContext.area, unitContext.building, unitContext.level, unitContext.unit]);

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
    if (!item || item.kind !== "failed") return;
    if (retryingClientIds.has(clientId)) return;
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
            missingMaterialUomCode: selectedScopeUom?.code,
          }
        : {};

    // Offline path: store any staged media in IDB, then enqueue mutation with blobIds
    if (!navigator.onLine) {
      try {
        const staged = media.filter((m): m is { kind: "staged" } & StagedMedia => m.kind === "staged");
        await enqueueMutationWithVerifiedBlobs({
          type: "create-issue",
          url: `/api/projects/${projectId}/issues`,
          method: "POST",
          body: {
            unitRef: unitContext.unitRef,
            projectRowIds: Array.from(selectedRowIds),
            issueType,
            shortDescription: description.trim(),
            notes: notes.trim() || undefined,
            responsibleParties: Array.from(selectedParties),
            isBlockingWork: isBlocking,
            subScopeInstanceIds: Array.from(selectedSubScopeIds),
            ...missingMaterialsPayload,
            ...offlineAttachmentFieldsFromStaged(staged),
          },
          mediaFiles: staged.map((s) => s.file),
        });
        toast.success(staged.length > 0
          ? t("issueSavedOfflineWithMedia")
          : t("issueSavedOffline")
        );
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

    const finalMedia: UploadedMedia[] = media
      .filter((m): m is { kind: "uploaded" } & UploadedMedia => m.kind === "uploaded")
      .map((m) => ({ ...m }));

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
      } catch (uploadErr) {
        console.error(`[upload] "${s.file.name}" failed after retries:`, uploadErr);
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
        unitRef: unitContext.unitRef,
        projectRowIds: Array.from(selectedRowIds),
        issueType,
        shortDescription: description.trim(),
        notes: notes.trim() || undefined,
        responsibleParties: Array.from(selectedParties),
        isBlockingWork: isBlocking,
        subScopeInstanceIds: Array.from(selectedSubScopeIds),
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
        toast.error(err.error ?? "Failed to submit issue. Please try again.");
        return;
      }
      toast.success("Issue reported.");
      onCreated();
      close();
    } catch (submitErr) {
      console.error("[issues POST] exception:", submitErr);
      toast.error("Failed to submit issue. Please try again.");
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

  const sheet = createPortal(
    <>
      <style>{SHEET_CSS}</style>
      <div role="presentation" className={`aim-backdrop${visible ? " aim-visible" : ""}${elevatedStacking ? " aim-elevated" : ""}`}
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        style={vp.height > 0 ? { top: vp.offsetTop, height: vp.height } : undefined}>
        <div role="dialog" aria-modal="true" aria-label={t("addIssue")}
          className={`aim-sheet${visible ? " aim-sheet-visible" : ""}`}
          style={vp.height > 0 ? { height: `${Math.round(vp.height)}px`, maxHeight: `${Math.round(vp.height)}px`, minHeight: 0 } : undefined}>
          <div className="aim-handle" aria-hidden />

          {/* Header */}
          <div style={{ padding: "8px var(--page-padding-x) 0", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <AlertCircle size={18} style={{ color: "var(--error-600)" }} />
                <span style={{ fontSize: 16, fontWeight: 700, color: "var(--neutral-900)" }}>{t("addIssue")}</span>
              </div>
              <button type="button" onClick={close} aria-label="Close"
                style={{ width: 32, height: 32, borderRadius: 99, border: "none", backgroundColor: "var(--neutral-100)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <X size={16} style={{ color: "var(--neutral-600)" }} />
              </button>
            </div>

            {/* Unit context */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--neutral-600)" }}>
                {unitContext.unitKey}
              </span>
              {!isCustomSiteUnitRef(unitContext.unitRef) && unitContext.building.trim() && (
                <>
                  <Building2 size={12} style={{ color: "var(--neutral-400)", flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: "var(--neutral-400)" }}>{unitContext.building}</span>
                </>
              )}
              {!isCustomSiteUnitRef(unitContext.unitRef) && unitContext.level.trim() && (
                <>
                  <Layers size={12} style={{ color: "var(--neutral-400)", flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: "var(--neutral-400)" }}>Level {unitContext.level}</span>
                </>
              )}
            </div>

            <div style={{ height: 1, backgroundColor: "var(--neutral-100)", margin: "0 calc(-1 * var(--page-padding-x))" }} />
          </div>

          {/* ── Step 1: Blocking picker ─────────────────────────────────────── */}
          {step === "pick-blocking" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "16px var(--page-padding-x) calc(env(safe-area-inset-bottom) + 24px)" }}>
              <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--neutral-500)", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "center" }}>
                Is this issue blocking work?
              </p>
              <p style={{ margin: "0 0 28px", fontSize: 14, color: "var(--neutral-400)", textAlign: "center" }}>
                Select one to continue
              </p>

              {/* Blocking option */}
              <button
                type="button"
                onClick={() => openForm(true)}
                style={{
                  width: "100%", padding: "20px 20px", borderRadius: 14, border: "2px solid var(--error-200)",
                  backgroundColor: "var(--error-50)", cursor: "pointer", marginBottom: 12,
                  display: "flex", alignItems: "center", gap: 16, textAlign: "left",
                }}
              >
                <span style={{ width: 44, height: 44, borderRadius: 99, backgroundColor: "var(--error-600)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <AlertCircle size={22} style={{ color: "#fff" }} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 16, fontWeight: 700, color: "var(--error-700)", marginBottom: 3 }}>Blocking</span>
                  <span style={{ display: "block", fontSize: 13, color: "var(--error-600)", lineHeight: 1.4 }}>Work cannot proceed until this is resolved</span>
                </span>
                <ChevronRight size={18} style={{ color: "var(--error-400)", flexShrink: 0 }} />
              </button>

              {/* Non-blocking option */}
              <button
                type="button"
                onClick={() => openForm(false)}
                style={{
                  width: "100%", padding: "20px 20px", borderRadius: 14, border: "2px solid var(--warning-200)",
                  backgroundColor: "var(--warning-50)", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 16, textAlign: "left",
                }}
              >
                <span style={{ width: 44, height: 44, borderRadius: 99, backgroundColor: "#f97316", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <AlertTriangle size={22} style={{ color: "#fff" }} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 16, fontWeight: 700, color: "var(--warning-800)", marginBottom: 3 }}>Non-Blocking</span>
                  <span style={{ display: "block", fontSize: 13, color: "var(--warning-700)", lineHeight: 1.4 }}>Work can continue alongside this issue</span>
                </span>
                <ChevronRight size={18} style={{ color: "var(--warning-400)", flexShrink: 0 }} />
              </button>
            </div>
          )}

          {/* ── Step 2: Report form ─────────────────────────────────────────── */}
          <div className="aim-body" ref={bodyRef} style={{ display: step === "form" ? undefined : "none" }}>

            {/* Blocking status badge — tappable to go back to picker */}
            <button
              type="button"
              onClick={() => setStep("pick-blocking")}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                marginTop: 14, marginBottom: 4,
                padding: "6px 14px 6px 10px", borderRadius: 99, border: "none", cursor: "pointer",
                backgroundColor: isBlocking ? "var(--error-600)" : "#f97316",
              }}
              aria-label="Change blocking status"
            >
              {isBlocking
                ? <AlertCircle size={14} style={{ color: "#fff", flexShrink: 0 }} />
                : <AlertTriangle size={14} style={{ color: "#fff", flexShrink: 0 }} />}
              <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
                {isBlocking ? "Blocking" : "Non-Blocking"}
              </span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", marginLeft: 2 }}>change</span>
            </button>

            {/* Scope + sub-scope — unified vertical accordion list */}
            {scopes.length > 1 && (
              <div ref={scopeSectionRef} style={{ marginTop: 16 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 8 }}>
                  <span style={LABEL_STYLE}>{t("scopeLabel")}</span>
                  <span style={{ fontSize: 11, color: "var(--neutral-400)", fontStyle: "italic" }}>
                    {isMissingMaterialsSingleScope
                      ? t("scopeLabelRequiredSingle")
                      : "optional · tap to select"}
                  </span>
                </div>
                {showMissingMaterialsScopeHint && (
                  <div
                    role="alert"
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                      margin: "0 0 8px",
                      padding: "10px 12px",
                      borderRadius: 8,
                      backgroundColor: "var(--warning-50)",
                      border: "1.5px solid var(--warning-300)",
                    }}
                  >
                    <AlertTriangle size={16} style={{ color: "var(--warning-600)", flexShrink: 0, marginTop: 1 }} />
                    <span style={{ fontSize: 12, color: "var(--error-600)", fontWeight: 600, lineHeight: 1.4 }}>
                      {t("missingMaterialsScopeRequiredHint")}
                    </span>
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {scopes.map((scope) => {
                    const isSelected = selectedRowIds.has(scope.id);
                    const hasSubScopes = (scope.subScopes?.length ?? 0) > 0;
                    const selectedSubCount = scope.subScopes?.filter((ss) => selectedSubScopeIds.has(ss.id)).length ?? 0;
                    return (
                      <div key={scope.id}>
                        {/* Scope row — checkbox + name */}
                        <button
                          type="button"
                          onClick={() => toggleScope(scope.id)}
                          style={{
                            width: "100%",
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "9px 12px",
                            borderRadius: isSelected && hasSubScopes ? "10px 10px 0 0" : 10,
                            border: isSelected
                              ? "1.5px solid var(--primary-300)"
                              : "1.5px solid var(--neutral-200)",
                            backgroundColor: isSelected ? "var(--primary-50)" : "var(--neutral-0)",
                            cursor: "pointer",
                            textAlign: "left",
                            fontFamily: "inherit",
                            transition: "background 0.12s, border-color 0.12s",
                          }}
                        >
                          {/* Checkbox / radio indicator */}
                          <span style={{
                            width: 18, height: 18,
                            borderRadius: isMissingMaterialsSingleScope ? 99 : 5,
                            flexShrink: 0,
                            border: isSelected ? "none" : "1.5px solid var(--neutral-300)",
                            backgroundColor: isSelected ? "var(--primary-500)" : "transparent",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            {isSelected && !isMissingMaterialsSingleScope && (
                              <svg width="11" height="8" viewBox="0 0 11 8" fill="none">
                                <path d="M1 4L4 7L10 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                            {isSelected && isMissingMaterialsSingleScope && (
                              <span style={{
                                width: 8, height: 8, borderRadius: 99, backgroundColor: "var(--neutral-0)",
                              }} />
                            )}
                          </span>
                          <span style={{ fontSize: 14, color: isSelected ? "var(--primary-700)" : "var(--neutral-800)", fontWeight: isSelected ? 500 : 400, flex: 1 }}>
                            {scope.name}
                          </span>
                          {/* Sub-scope count badge when collapsed */}
                          {hasSubScopes && !isSelected && (
                            <span style={{ fontSize: 11, color: "var(--neutral-400)" }}>
                              {scope.subScopes!.length} sub-scopes
                            </span>
                          )}
                          {hasSubScopes && isSelected && selectedSubCount > 0 && (
                            <span style={{
                              fontSize: 11, fontWeight: 600, color: "var(--primary-600)",
                              backgroundColor: "var(--primary-100)", borderRadius: 10, padding: "2px 7px",
                            }}>
                              {selectedSubCount} selected
                            </span>
                          )}
                        </button>

                        {/* Sub-scope checklist — only shown when parent scope is selected */}
                        {isSelected && hasSubScopes && (
                          <div style={{
                            border: "1.5px solid var(--primary-300)",
                            borderTop: "1px solid var(--primary-100)",
                            borderRadius: "0 0 10px 10px",
                            backgroundColor: "var(--primary-25, #f8f9ff)",
                            padding: "8px 12px 10px 12px",
                            marginBottom: 2,
                          }}>
                            <div style={{ fontSize: 11, color: "var(--neutral-500)", marginBottom: 8, fontStyle: "italic" }}>
                              Which sub-scope(s) are affected?
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              {scope.subScopes!.map((ss) => {
                                const ssChecked = selectedSubScopeIds.has(ss.id);
                                return (
                                  <button
                                    key={ss.id}
                                    type="button"
                                    onClick={() => toggleSubScope(ss.id)}
                                    style={{
                                      display: "flex", alignItems: "center", gap: 10,
                                      padding: "7px 10px", borderRadius: 8,
                                      border: ssChecked ? "1.5px solid var(--primary-300)" : "1.5px solid var(--neutral-200)",
                                      backgroundColor: ssChecked ? "var(--primary-50)" : "var(--neutral-0)",
                                      cursor: "pointer", textAlign: "left",
                                      fontFamily: "inherit",
                                      transition: "background 0.1s, border-color 0.1s",
                                    }}
                                  >
                                    <span style={{
                                      width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                                      border: ssChecked ? "none" : "1.5px solid var(--neutral-300)",
                                      backgroundColor: ssChecked ? "var(--primary-500)" : "transparent",
                                      display: "flex", alignItems: "center", justifyContent: "center",
                                    }}>
                                      {ssChecked && (
                                        <svg width="10" height="7" viewBox="0 0 10 7" fill="none">
                                          <path d="M1 3.5L3.5 6L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                                        </svg>
                                      )}
                                    </span>
                                    <span style={{ fontSize: 13, color: ssChecked ? "var(--primary-700)" : "var(--neutral-700)", fontWeight: ssChecked ? 500 : 400 }}>
                                      {ss.name}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Title (stored as shortDescription) */}
            <div style={{ marginTop: 16 }}>
              <label style={LABEL_STYLE}>Title <span style={{ color: "var(--error-500)" }}>*</span></label>
              <div style={{ position: "relative", marginTop: 6 }}>
                <input
                  ref={titleInputRef}
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, 50))}
                  onFocus={(e) => { setTitleTouched(true); scrollFieldIntoView(e.currentTarget); }}
                  placeholder="e.g. Water damage behind cabinet panel"
                  maxLength={50}
                  style={{
                    width: "100%", padding: "10px 44px 10px 12px", borderRadius: 10,
                    border: "1.5px solid var(--neutral-250)", fontSize: 16, lineHeight: 1.5,
                    backgroundColor: "var(--neutral-0)", color: "var(--neutral-900)",
                    boxSizing: "border-box", fontFamily: "inherit", outline: "none",
                  }}
                />
                <DictationButton
                  disabled={submitting}
                  fieldLabel={td("fieldTitle")}
                  focusTargetRef={titleInputRef}
                  onAppendText={(segment) => setDescription((prev) => appendTranscriptSegment(prev, segment, 50))}
                  style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)" }}
                />
              </div>
              <div style={{ fontSize: 11, color: "var(--neutral-400)", textAlign: "right", marginTop: 2 }}>{description.length}/50</div>
            </div>

            {/* Progressive reveal — shown after title is focused or has content */}
            {(titleTouched || description.trim().length > 0) && (<>

            {/* Notes — optional description */}
            <div style={{ marginTop: 12 }}>
              <label style={LABEL_STYLE}>
                Notes <span style={{ fontSize: 10, fontWeight: 400, color: "var(--neutral-400)", textTransform: "none", letterSpacing: 0 }}>optional</span>
              </label>
              <div style={{ position: "relative", marginTop: 6 }}>
                <MentionTextarea
                  value={notes}
                  onChange={setNotes}
                  textFieldRef={notesTextareaRef}
                  onFocus={(e) => scrollFieldIntoView(e.currentTarget)}
                  placeholder="Additional details, context, or observations… (type @ to mention someone)"
                  rows={3}
                  style={{
                    width: "100%", padding: "10px 12px 44px", borderRadius: 10,
                    border: "1.5px solid var(--neutral-250)", fontSize: 14, lineHeight: 1.5,
                    resize: "none", backgroundColor: "var(--neutral-0)", color: "var(--neutral-900)",
                    boxSizing: "border-box", fontFamily: "inherit", outline: "none",
                  }}
                  aria-label="Issue notes"
                />
                <DictationButton
                  disabled={submitting}
                  fieldLabel={td("fieldNotes")}
                  focusTargetRef={notesTextareaRef}
                  onAppendText={(segment) => setNotes((prev) => appendTranscriptSegment(prev, segment))}
                  style={{ position: "absolute", right: 8, bottom: 8 }}
                />
              </div>
            </div>

            {/* Issue type */}
            <div style={{ marginTop: 16 }}>
              <label style={LABEL_STYLE}>{t("issueTypeLabel")}</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                {catalogIssueTypes.map((type) => (
                  <button key={type.code} type="button" onClick={() => handleIssueTypeSelect(type.code)}
                    style={{
                      width: "100%", textAlign: "left", padding: "11px 14px", borderRadius: 10,
                      border: `1.5px solid ${issueType === type.code ? "transparent" : "var(--neutral-200)"}`,
                      backgroundColor: issueType === type.code ? "var(--primary-50)" : "var(--neutral-0)",
                      fontSize: 14, fontWeight: issueType === type.code ? 600 : 400,
                      color: issueType === type.code ? "var(--primary-700)" : "var(--neutral-800)",
                      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between",
                    }}>
                    {issueTypeLabel(type.code)}
                    {issueType === type.code && <Check size={16} style={{ color: "var(--primary-500)", flexShrink: 0 }} />}
                  </button>
                ))}
                {catalogLoading && catalogIssueTypes.length === 0 && (
                  <p style={{ margin: 0, fontSize: 13, color: "var(--neutral-500)" }}>{tCommon("loading")}</p>
                )}
              </div>
              {issueType === "MISSING_MATERIALS" && (
                <MissingMaterialsFields
                  materialDescription={missingMaterialDescription}
                  onMaterialDescriptionChange={setMissingMaterialDescription}
                  materialQuantity={missingMaterialQuantity}
                  onMaterialQuantityChange={setMissingMaterialQuantity}
                  uom={selectedScopeUom}
                  disabled={submitting}
                  onFieldFocus={scrollFieldIntoView}
                />
              )}
            </div>

            {/* Responsible party */}
            <div style={{ marginTop: 16 }}>
              <label style={LABEL_STYLE}>{t("responsiblePartyLabel")}</label>
              <span style={{ display: "block", fontSize: 11, color: "var(--neutral-400)", marginTop: 2, marginBottom: 8 }}>
                {t("responsiblePartiesHint")}
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {catalogParties.map((party) => (
                  <button key={party.code} type="button" onClick={() => toggleParty(party.code)}
                    style={{
                      padding: "7px 14px", borderRadius: 99,
                      border: `1.5px solid ${selectedParties.has(party.code) ? "var(--primary-500)" : "var(--neutral-250)"}`,
                      backgroundColor: selectedParties.has(party.code) ? "var(--primary-500)" : "var(--neutral-0)",
                      color: selectedParties.has(party.code) ? "var(--neutral-0)" : "var(--neutral-700)",
                      fontSize: 12, fontWeight: 600, cursor: "pointer",
                    }}>
                    {partyLabel(party.code)}
                  </button>
                ))}
              </div>
            </div>

            {/* Media */}
            <div style={{ marginTop: 16, position: "relative" }} {...dropHandlers}>
              <label style={LABEL_STYLE}>{t("mediaLabel")}</label>
              {requiresVisual && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, padding: "8px 10px", borderRadius: 8, backgroundColor: "var(--warning-50)", border: "1px solid var(--warning-300)" }}>
                  <AlertCircle size={14} style={{ color: "var(--warning-600)", flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: "var(--warning-700)" }}>{t("mediaRequired")}</span>
                </div>
              )}
              {media.length > 0 && (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8, marginBottom: 8 }}>
                  {media.map((m) => (
                    <MediaThumb
                      key={m.clientId}
                      item={m}
                      uploading={isUploading && m.kind === "staged"}
                      onRemove={() => setMedia((prev) => prev.filter((x) => x.clientId !== m.clientId))}
                      onAnnotate={m.mimeType.startsWith("image/") && m.kind === "staged" ? () => setAnnotatingClientId(m.clientId) : undefined}
                      onCaption={() => {
                        const existing = "caption" in m ? (m.caption as string) : "";
                        setCaptionDraft(existing);
                        setCaptioningClientId(m.clientId);
                      }}
                      onRetry={m.kind === "failed" && !retryingClientIds.has(m.clientId) ? () => handleRetryUpload(m.clientId) : undefined}
                    />
                  ))}
                </div>
              )}
              {media.some((m) => m.kind === "staged") && !isUploading && (
                <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--error-600)", fontWeight: 600 }}>
                  {media.filter((m) => m.kind === "staged").length} item{media.filter((m) => m.kind === "staged").length > 1 ? "s" : ""} ready — tap Submit to save
                </p>
              )}
              {media.length < MAX_MEDIA_ATTACHMENTS_PER_ENTITY && !isUploading && (
                <>
                  <input ref={fileInputRef} type="file" accept={FIELD_MEDIA_ACCEPT} multiple
                    style={{ display: "none" }} onChange={handleFileChange} />
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button type="button" onClick={() => setShowCamera(true)}
                      style={{
                        flex: 1, minHeight: 44, borderRadius: 10,
                        border: `1.5px solid ${mediaError ? "var(--error-300)" : "var(--primary-200)"}`,
                        backgroundColor: mediaError ? "var(--error-50)" : "var(--primary-50)",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        fontSize: 13, fontWeight: 600,
                        color: mediaError ? "var(--error-700)" : "var(--primary-700)",
                        cursor: "pointer",
                      }}>
                      <Camera size={15} /> Camera
                    </button>
                    <button type="button" onClick={() => fileInputRef.current?.click()}
                      style={{
                        flex: 1, minHeight: 44, borderRadius: 10,
                        border: `1.5px dashed ${mediaError ? "var(--error-400)" : "var(--neutral-300)"}`,
                        backgroundColor: mediaError ? "var(--error-50)" : "var(--neutral-50)",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        fontSize: 13, fontWeight: 600,
                        color: mediaError ? "var(--error-600)" : "var(--neutral-600)",
                        cursor: "pointer",
                      }}>
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
            </>)}

          </div>

          {/* Footer — only shown on form step after title is touched */}
          {step === "form" && (titleTouched || description.trim().length > 0) && (
          <div className="aim-footer">
            {hasFailedMedia && (
              <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--error-600)", fontWeight: 600, textAlign: "center" }}>
                {t("mediaUploadFailedBanner", { count: media.filter((m) => m.kind === "failed").length })}
              </p>
            )}
            <button type="button" onClick={handleSubmit} disabled={!canSubmit || submitting}
              style={{
                width: "100%", minHeight: 48, borderRadius: 12, border: "none",
                backgroundColor: !canSubmit || submitting ? "var(--neutral-200)" : "var(--error-600)",
                color: !canSubmit || submitting ? "var(--neutral-500)" : "var(--neutral-0)",
                fontSize: 15, fontWeight: 700, cursor: submitting ? "wait" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                transition: "background-color 0.15s",
              }}>
              {submitting && <Loader2 size={18} className="aim-spinning" />}
              {uploadProgress
                ? `Uploading photo ${uploadProgress.current} of ${uploadProgress.total}…`
                : submitting
                  ? t("submitting")
                  : t("addIssue")}
            </button>
          </div>
          )}
        </div>
      </div>
    </>,
    document.body
  );

  const annotatingItem = annotatingClientId ? media.find((m) => m.clientId === annotatingClientId) : null;

  return (
    <>
      {sheet}
      {showCamera && (
        <CameraCapture
          projectId={projectId}
          maxItems={MAX_MEDIA_ATTACHMENTS_PER_ENTITY - media.length}
          onCapture={handleCameraCapture}
          onClose={() => setShowCamera(false)}
          location={{ building: unitContext.building, area: unitContext.area, level: unitContext.level, unit: unitContext.unit }}
        />
      )}
      {annotatingItem && annotatingClientId && (
        <ImageAnnotationEditor
          src={annotatingItem.localUrl}
          onSave={(result) => handleAnnotationSave(annotatingClientId, result)}
          onClose={() => setAnnotatingClientId(null)}
        />
      )}
      {showMissingMaterialsScopeAlert && isBrowser && createPortal(
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="aim-missing-materials-scope-alert-title"
          aria-describedby="aim-missing-materials-scope-alert-desc"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: elevatedStacking ? 700 : 650,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            backgroundColor: "var(--overlay-bg, rgba(0,0,0,0.5))",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 360,
              borderRadius: 16,
              backgroundColor: "var(--neutral-0)",
              border: "2px solid var(--warning-200, #fde68a)",
              padding: "20px 18px",
              boxShadow: "var(--shadow-2)",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
              <span
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 99,
                  backgroundColor: "var(--warning-100)",
                  border: "1.5px solid var(--warning-300, #fcd34d)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <AlertTriangle size={18} style={{ color: "var(--warning-600)" }} />
              </span>
              <p
                id="aim-missing-materials-scope-alert-title"
                style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--neutral-900)", lineHeight: 1.35 }}
              >
                {t("missingMaterialsSingleScopeDialogTitle")}
              </p>
            </div>
            <p
              id="aim-missing-materials-scope-alert-desc"
              style={{ margin: "0 0 18px", fontSize: 14, lineHeight: 1.5, color: "var(--neutral-700)" }}
            >
              {t("missingMaterialsSingleScopeDialogBody")}
            </p>
            <button
              type="button"
              onClick={handleMissingMaterialsScopeAlertOk}
              style={{
                width: "100%",
                minHeight: 44,
                borderRadius: 10,
                border: "none",
                backgroundColor: "var(--warning-600)",
                color: "var(--neutral-0)",
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {t("missingMaterialsSingleScopeDialogOk")}
            </button>
          </div>
        </div>,
        document.body,
      )}
      {/* Caption editor overlay */}
      {captioningClientId && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add caption"
          style={{ position: "fixed", inset: 0, zIndex: 500, display: "flex", flexDirection: "column", backgroundColor: "rgba(0,0,0,0.6)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setCaptioningClientId(null); }}
        >
          <div style={{ flex: 1 }} onClick={() => setCaptioningClientId(null)} />
          <div style={{
            backgroundColor: "var(--neutral-0)",
            borderRadius: "20px 20px 0 0",
            padding: "20px 20px",
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
            display: "flex", flexDirection: "column", gap: 14,
            boxShadow: "0 -4px 40px rgba(0,0,0,0.18)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: "var(--neutral-900)" }}>Add Caption</span>
              <button type="button" onClick={() => setCaptioningClientId(null)} aria-label="Cancel"
                style={{ width: 32, height: 32, borderRadius: 99, border: "none", backgroundColor: "var(--neutral-100)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <X size={16} style={{ color: "var(--neutral-600)" }} />
              </button>
            </div>
            <textarea
              autoFocus
              value={captionDraft}
              onChange={(e) => setCaptionDraft(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Describe what this photo shows…"
              rows={4}
              maxLength={500}
              style={{
                width: "100%", padding: "12px 14px", fontSize: 16, lineHeight: 1.5,
                borderRadius: 12, border: "1.5px solid var(--neutral-250)",
                backgroundColor: "var(--neutral-50)", color: "var(--neutral-900)",
                resize: "none", fontFamily: "inherit", outline: "none", boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={() => setCaptioningClientId(null)}
                style={{ flex: 1, minHeight: 48, borderRadius: 12, border: "1.5px solid var(--neutral-200)", backgroundColor: "var(--neutral-0)", fontSize: 15, fontWeight: 600, color: "var(--neutral-600)", cursor: "pointer" }}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = captioningClientId;
                  setMedia((prev) => prev.map((x) => x.clientId === id ? { ...x, caption: captionDraft.trim() } : x));
                  setCaptioningClientId(null);
                }}
                style={{ flex: 1, minHeight: 48, borderRadius: 12, border: "none", backgroundColor: "var(--error-600)", fontSize: 15, fontWeight: 700, color: "#fff", cursor: "pointer" }}
              >
                Save Caption
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: "var(--neutral-500)",
  textTransform: "uppercase", letterSpacing: "0.05em",
};
