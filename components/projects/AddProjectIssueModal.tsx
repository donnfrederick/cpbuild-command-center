"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Camera, Trash2, Loader2, Images, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { CameraCapture } from "@/components/projects/CameraCapture";
import type { CapturedFile } from "@/components/projects/CameraCapture";
import { resolveClientMime, isFieldMediaImageFile } from "@/lib/image-utils";
import { processLibraryMediaFile, toastImagePrepareFailure } from "@/lib/stage-library-field-media";
import { uploadWithRetry } from "@/lib/upload-with-retry";
import { MAX_MEDIA_ATTACHMENTS_PER_ENTITY } from "@/lib/media-attachment-limits";
import { MentionTextarea } from "@/components/ui/MentionTextarea";
import { DictationButton } from "@/components/ui/DictationButton";
import { FileDropOverlay } from "@/components/ui/FileDropOverlay";
import { useFileDrop } from "@/hooks/use-file-drop";
import { ProjectLevelBuilderTagFields } from "@/components/projects/ProjectLevelBuilderTagFields";
import { builderTagRequestFields } from "@/lib/field-notes/location-builder-tags";
import { enrichBodyWithActivityLocation } from "@/lib/activity/enrich-body-with-activity-location";
import {
  issueTypeRequiresVisual,
  resolveIssueTypeLabel,
  resolvePartyLabel,
  useIssueCatalog,
} from "@/lib/issues/use-issue-catalog";

const PROJECT_ISSUE_MEDIA_ACCEPT = "image/*,image/heic,image/heif,video/*";
import { appendTranscriptSegment } from "@/lib/browser-speech";

// ── Types ──────────────────────────────────────────────────────────────────────

const VIDEO_SIZE_LIMIT = 50 * 1024 * 1024;

interface StagedMedia {
  clientId: string;
  file: File;
  localUrl: string;
  mimeType: string;
}

interface UploadedMedia {
  clientId: string;
  storageKey: string;
  storageUrl: string;
  mimeType: string;
  fileSizeBytes: number;
  localUrl: string;
}

type MediaItem = ({ kind: "staged" } & StagedMedia) | ({ kind: "uploaded" } & UploadedMedia);

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  projectId: string;
  onClose: () => void;
  onCreated: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function AddProjectIssueModal({ projectId, onClose, onCreated }: Props) {
  const t = useTranslations("units");
  const tCommon = useTranslations("common");
  const td = useTranslations("dictation");
  const { issueTypes: catalogIssueTypes, responsibleParties: catalogParties } =
    useIssueCatalog(projectId);
  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [issueType, setIssueType] = useState("");
  const [buildPhaseTag, setBuildPhaseTag] = useState("");
  const [areaTag, setAreaTag] = useState("");
  const [selectedParties, setSelectedParties] = useState<Set<string>>(new Set());
  const isBlocking = false; // Project-level issues are always non-blocking
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [titleTouched, setTitleTouched] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const notesTextareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
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
  const canSubmit = title.trim().length > 0 && !!issueType && selectedParties.size > 0 && !isUploading && !submitting;

  function toggleParty(value: string) {
    setSelectedParties((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  function handleCameraCapture(captured: CapturedFile[]) {
    const slots = MAX_MEDIA_ATTACHMENTS_PER_ENTITY - media.length;
    if (slots <= 0) return;
    setMedia((prev) => [
      ...prev,
      ...captured.slice(0, slots).map((c) => ({
        kind: "staged" as const,
        clientId: `${Date.now()}-${Math.random()}`,
        file: c.file,
        localUrl: c.localUrl,
        mimeType: c.mimeType,
      })),
    ]);
    setShowCamera(false);
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
          stamp: { uploaded: true },
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
      });
    }
    if (newItems.length > 0) setMedia((prev) => [...prev, ...newItems]);
  }, [media.length, t, tCommon]);

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
    accept: PROJECT_ISSUE_MEDIA_ACCEPT,
    disabled: media.length >= MAX_MEDIA_ATTACHMENTS_PER_ENTITY || isUploading || submitting,
  });

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);

    const staged = media.filter((m): m is { kind: "staged" } & StagedMedia => m.kind === "staged");
    if (staged.length > 0) setUploadProgress({ current: 0, total: staged.length });

    const finalMedia: UploadedMedia[] = media
      .filter((m): m is { kind: "uploaded" } & UploadedMedia => m.kind === "uploaded")
      .map((m) => ({ ...m }));

    for (let i = 0; i < staged.length; i++) {
      setUploadProgress({ current: i + 1, total: staged.length });
      const s = staged[i];
      try {
        const form = new FormData();
        form.append("file", s.file);
        form.append("type", "issues");
        const data = await uploadWithRetry(form, { projectId });
        finalMedia.push({ clientId: s.clientId, storageKey: data.storageKey, storageUrl: data.storageUrl, mimeType: data.mimeType, fileSizeBytes: data.fileSizeBytes, localUrl: s.localUrl });
      } catch (uploadErr) {
        console.error(`[AddProjectIssue] upload "${s.file.name}" failed after retries:`, uploadErr);
        toast.error(`"${s.file.name}" failed to upload and was skipped.`);
      }
    }
    setUploadProgress(null);

    try {
      const issuePayload = {
        issueType,
        shortDescription: title.trim(),
        notes: notes.trim() || undefined,
        responsibleParties: Array.from(selectedParties),
        isBlockingWork: isBlocking,
        ...builderTagRequestFields({ buildPhaseTag, areaTag }),
        attachmentKeys: finalMedia.map((a) => a.storageKey),
        attachmentUrls: finalMedia.map((a) => a.storageUrl),
        attachmentMimeTypes: finalMedia.map((a) => a.mimeType),
        attachmentFileSizeBytes: finalMedia.map((a) => a.fileSizeBytes ?? null),
        attachmentCaptions: finalMedia.map(() => ""),
      };
      const bodyWithLocation = await enrichBodyWithActivityLocation(issuePayload);
      const res = await fetch(`/api/projects/${projectId}/issues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyWithLocation),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        toast.error(err.error ?? "Failed to create issue");
        setSubmitting(false);
        return;
      }
      toast.success("Project issue created");
      onCreated();
      close();
    } catch (err) {
      console.error("[AddProjectIssue] submit error:", err);
      toast.error("Failed to create issue");
      setSubmitting(false);
    }
  }

  if (showCamera) {
    return (
      <CameraCapture
        projectId={projectId}
        maxItems={MAX_MEDIA_ATTACHMENTS_PER_ENTITY - media.length}
        onCapture={handleCameraCapture}
        onClose={() => setShowCamera(false)}
      />
    );
  }

  return createPortal(
    <>
      <style>{`
        .apim-backdrop {
          position: fixed; inset: 0; z-index: 9000;
          display: flex; align-items: flex-end; justify-content: center;
          background: rgba(0,0,0,0);
          transition: background-color 0.28s ease;
        }
        .apim-backdrop.apim-visible { background: rgba(0,0,0,0.45); }
        .apim-sheet {
          width: 100%; height: 100dvh;
          background: var(--neutral-0);
          display: flex; flex-direction: column;
          transform: translateY(100%);
          transition: transform 0.3s cubic-bezier(0.32,0.72,0,1);
          padding-top: env(safe-area-inset-top, 0px);
        }
        .apim-sheet.apim-visible { transform: translateY(0); }
        @media (min-width: 640px) {
          .apim-backdrop {
            align-items: stretch; justify-content: flex-end;
            pointer-events: none;
          }
          .apim-sheet {
            width: min(440px, 100vw); height: 100%; max-height: 100%;
            border-radius: 0;
            transform: translateX(100%);
            box-shadow: -4px 0 32px rgba(0,0,0,0.14);
            padding-top: 0;
            pointer-events: all;
          }
          .apim-sheet.apim-visible { transform: translateX(0); }
        }
      `}</style>

      {/* Backdrop */}
      <div
        className={`apim-backdrop${visible ? " apim-visible" : ""}`}
        role="presentation"
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      >
        {/* Sheet / dialog */}
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add project level issue"
          className={`apim-sheet${visible ? " apim-visible" : ""}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid var(--neutral-200)", flexShrink: 0 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--neutral-900)" }}>Add Project Issue</h2>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--neutral-500)" }}>Project-wide — not tied to a unit or scope</p>
            </div>
            <button type="button" onClick={close} aria-label="Close" style={{ padding: 8, borderRadius: 8, border: "none", background: "var(--neutral-100)", cursor: "pointer", color: "var(--neutral-600)" }}>
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px", display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Callout — unit issues go in the Units page */}
            <div
              style={{
                display: "flex", gap: 10, padding: "12px 14px",
                backgroundColor: "var(--primary-50)",
                borderRadius: 10, border: "1px solid var(--primary-200)",
              }}
            >
              <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>💡</span>
              <p style={{ margin: 0, fontSize: 13, color: "var(--primary-800)", lineHeight: 1.5 }}>
                <strong>For unit or scope-specific issues</strong>, open that unit from the{" "}
                <strong>Units page</strong> and report the issue there. This form is for project-wide issues only — things that affect the whole project, not a specific unit.
              </p>
            </div>

            {/* Title */}
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--neutral-600)", marginBottom: 6 }}>
                Title <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <div style={{ position: "relative" }}>
                <input
                  ref={titleInputRef}
                  type="text"
                  value={title}
                  maxLength={50}
                  placeholder="Brief description of the issue"
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => setTitleTouched(true)}
                  style={{
                    width: "100%", padding: "10px 44px 10px 12px", fontSize: 14, borderRadius: 8,
                    border: titleTouched && !title.trim() ? "1.5px solid #dc2626" : "1px solid var(--neutral-300)",
                    outline: "none", boxSizing: "border-box", backgroundColor: "var(--neutral-0)",
                    color: "var(--neutral-900)",
                  }}
                />
                <DictationButton
                  disabled={submitting}
                  fieldLabel={td("fieldTitle")}
                  focusTargetRef={titleInputRef}
                  onAppendText={(segment) => setTitle((prev) => appendTranscriptSegment(prev, segment, 50))}
                  style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)" }}
                />
              </div>
              {titleTouched && !title.trim() && (
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "#dc2626", display: "flex", alignItems: "center", gap: 4 }}>
                  <AlertCircle size={12} /> Title is required
                </p>
              )}
            </div>

            {/* Issue type */}
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--neutral-600)", marginBottom: 6 }}>
                Issue Type <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {catalogIssueTypes.map((type) => (
                  <button
                    key={type.code}
                    type="button"
                    onClick={() => setIssueType(type.code)}
                    style={{
                      padding: "6px 12px", borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: "pointer",
                      border: issueType === type.code ? "1.5px solid var(--primary-600)" : "1px solid var(--neutral-300)",
                      backgroundColor: issueType === type.code ? "var(--primary-50)" : "var(--neutral-0)",
                      color: issueType === type.code ? "var(--primary-700)" : "var(--neutral-600)",
                    }}
                  >
                    {resolveIssueTypeLabel(type.code, catalogIssueTypes)}
                  </button>
                ))}
              </div>
            </div>

            <ProjectLevelBuilderTagFields
              projectId={projectId}
              buildPhaseTag={buildPhaseTag}
              areaTag={areaTag}
              onChangeBuildPhaseTag={setBuildPhaseTag}
              onChangeAreaTag={setAreaTag}
              compactLabels
            />

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--neutral-600)", marginBottom: 6 }}>
                {t("responsiblePartyLabel")} <span style={{ color: "var(--error-600)" }}>*</span>
              </label>
              <p style={{ margin: "0 0 8px", fontSize: 11, color: "var(--neutral-400)" }}>{t("responsiblePartiesHint")}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {catalogParties.map((party) => (
                  <button
                    key={party.code}
                    type="button"
                    onClick={() => toggleParty(party.code)}
                    style={{
                      padding: "6px 12px", borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: "pointer",
                      border: selectedParties.has(party.code) ? "1.5px solid var(--primary-600)" : "1px solid var(--neutral-300)",
                      backgroundColor: selectedParties.has(party.code) ? "var(--primary-50)" : "var(--neutral-0)",
                      color: selectedParties.has(party.code) ? "var(--primary-700)" : "var(--neutral-600)",
                    }}
                  >
                    {resolvePartyLabel(party.code, catalogParties)}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--neutral-600)", marginBottom: 6 }}>
                Notes <span style={{ fontSize: 11, fontWeight: 400, color: "var(--neutral-400)" }}>(optional)</span>
              </label>
              <div style={{ position: "relative" }}>
                <MentionTextarea
                  value={notes}
                  onChange={setNotes}
                  textFieldRef={notesTextareaRef}
                  placeholder="Additional details… (type @ to mention someone)"
                  rows={3}
                  style={{
                    width: "100%", padding: "10px 12px 44px", fontSize: 14, borderRadius: 8,
                    border: "1px solid var(--neutral-300)", resize: "none", outline: "none",
                    boxSizing: "border-box", fontFamily: "inherit", lineHeight: 1.5,
                    backgroundColor: "var(--neutral-0)", color: "var(--neutral-900)",
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

            {/* Photos */}
            <div style={{ position: "relative" }} {...dropHandlers}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--neutral-600)", marginBottom: 8 }}>
                Photos{" "}
                <span style={{ fontSize: 11, fontWeight: 400, color: "var(--neutral-400)" }}>
                  {t("mediaOptionalMaxCount", { max: MAX_MEDIA_ATTACHMENTS_PER_ENTITY })}
                </span>
              </label>
              {media.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                  {media.map((m) => (
                    <div key={m.clientId} style={{ position: "relative", width: 72, height: 72, borderRadius: 8, overflow: "hidden", flexShrink: 0, border: "1px solid var(--neutral-200)" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={m.localUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      <button
                        type="button"
                        aria-label="Remove photo"
                        onClick={() => setMedia((prev) => prev.filter((x) => x.clientId !== m.clientId))}
                        style={{ position: "absolute", top: 3, right: 3, width: 20, height: 20, borderRadius: 99, border: "none", backgroundColor: "rgba(0,0,0,0.55)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {media.length < MAX_MEDIA_ATTACHMENTS_PER_ENTITY && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "1px solid var(--neutral-300)", backgroundColor: "var(--neutral-0)", fontSize: 13, fontWeight: 500, color: "var(--neutral-700)", cursor: "pointer" }}
                  >
                    <Images size={15} /> Upload
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCamera(true)}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "1px solid var(--neutral-300)", backgroundColor: "var(--neutral-0)", fontSize: 13, fontWeight: 500, color: "var(--neutral-700)", cursor: "pointer" }}
                  >
                    <Camera size={15} /> Camera
                  </button>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept={PROJECT_ISSUE_MEDIA_ACCEPT} multiple style={{ display: "none" }} onChange={handleFileChange} />
              <FileDropOverlay
                disabled={media.length >= MAX_MEDIA_ATTACHMENTS_PER_ENTITY || isUploading || submitting}
              />
            </div>
          </div>

          {/* Footer */}
          <div style={{ padding: "12px 20px", borderTop: "1px solid var(--neutral-200)", flexShrink: 0, display: "flex", gap: 10, paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}>
            <button
              type="button"
              onClick={close}
              style={{ flex: 1, padding: "12px", borderRadius: 10, border: "1px solid var(--neutral-300)", backgroundColor: "var(--neutral-0)", fontSize: 14, fontWeight: 600, color: "var(--neutral-700)", cursor: "pointer" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              style={{
                flex: 2, padding: "12px", borderRadius: 10, border: "none",
                backgroundColor: canSubmit ? "var(--primary-600)" : "var(--neutral-200)",
                color: canSubmit ? "#fff" : "var(--neutral-400)",
                fontSize: 14, fontWeight: 700, cursor: canSubmit ? "pointer" : "default",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              {submitting ? (
                <>
                  <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />
                  {uploadProgress ? `Uploading ${uploadProgress.current}/${uploadProgress.total}…` : "Saving…"}
                </>
              ) : "Add Project Issue"}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
