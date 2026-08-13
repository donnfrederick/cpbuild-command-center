"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { Loader2, X, ZoomIn, Video, ExternalLink, ChevronLeft, Copy, Link2, Link2Off, AlertTriangle, Search, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { buildFeedbackDetailAbsoluteUrl } from "@/lib/feedback-urls";
import { buildFeedbackAgentPromptMarkdown } from "@/lib/feedback-agent-prompt";
import type { FeedbackCommentData } from "@/components/feedback/FeedbackCommentThread";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FeedbackCommentThread } from "@/components/feedback/FeedbackCommentThread";
import { filterTeamMembersForFeedbackAssignee } from "@/lib/feedback-assignment";
import type { FeedbackEnvironment } from "@/lib/feedback-environment";
import { parseFeedbackAssistMetadata } from "@/lib/feedback-assist-schema";
import { toast } from "sonner";

export type FeedbackType = "BUG" | "FEATURE_REQUEST";
export type FeedbackStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "WAITING_FOR_RESPONSE"
  | "NEEDS_INVESTIGATION"
  | "WONT_FIX"
  | "RESOLVED"
  | "DELETED";
export type FeedbackSource = "IN_APP" | "MARKER_IO";
export type FeedbackPriority = "LOW" | "MEDIUM" | "HIGH";
export type ViewerContext = "submitter" | "mentioned";

export interface FeedbackDuplicateLink {
  id: string;
  duplicateId: string;
  duplicate: {
    id: string;
    shortId: number;
    title: string;
    description: string;
    screenshot: string | null;
    screenshots?: string[];
    pageUrl: string | null;
    createdAt: string;
    user: { id: string; name: string | null; email: string };
  };
}

export interface FeedbackReport {
  id: string;
  shortId: number;
  source: FeedbackSource;
  type: FeedbackType;
  title: string;
  description: string;
  screenshot: string | null;
  /** Supabase-hosted image URLs attached at submission (up to 10). Falls back to screenshot for legacy reports. */
  screenshots?: string[];
  videoUrl: string | null;
  pageUrl: string | null;
  status: FeedbackStatus;
  /** Inbox triage; omitted or null = unset */
  priority?: FeedbackPriority | null;
  adminNote: string | null;
  /** True when the submitter used the Gemini-assisted flow to draft this report. */
  aiAssisted?: boolean;
  /** Raw metadata blob — shape is validated at render time via parseFeedbackAssistMetadata. */
  aiAssistMetadata?: unknown;
  createdAt: string;
  user: { id: string; name: string | null; email: string };
  assignee?: { id: string; name: string | null; email: string } | null;
  commentsCount?: number;
  duplicatesCount?: number;
  viewerContext?: ViewerContext;
  /** Which DB the row lives in (dev merge adds production). */
  environment?: FeedbackEnvironment;
  /** Set when this report is the canonical; lists linked duplicate submissions. */
  canonicalDuplicates?: FeedbackDuplicateLink[];
  /** Set when this report is itself a duplicate of another. */
  duplicateOf?: {
    canonicalId: string;
    canonical: { id: string; shortId: number; title: string };
  } | null;
  /** ISO timestamp of the most recent successful send to Rad-Dash; null = never sent */
  sentToRadDashAt?: string | null;
}

function feedbackApiQuery(environment?: FeedbackEnvironment): string {
  return environment === "production" ? "?environment=production" : "";
}

export function formatShortId(shortId: number): string {
  return `FB-${shortId.toString().padStart(4, "0")}`;
}

export function FeedbackStatusBadge({ status }: { status: FeedbackStatus }) {
  const t = useTranslations("feedback");
  const styles: Record<FeedbackStatus, string> = {
    OPEN: "bg-[var(--warning-100)] text-[var(--warning-600)]",
    IN_PROGRESS: "bg-[var(--primary-100)] text-[var(--primary-700)]",
    WAITING_FOR_RESPONSE: "bg-[var(--warning-100)] text-[var(--warning-600)]",
    NEEDS_INVESTIGATION: "bg-[var(--primary-100)] text-[var(--primary-700)]",
    WONT_FIX: "bg-neutral-100 text-neutral-600",
    RESOLVED: "bg-[var(--success-100)] text-[var(--success-600)]",
    DELETED: "bg-[var(--error-100)] text-[var(--error-600)]",
  };
  const labels: Record<FeedbackStatus, string> = {
    OPEN: t("statusOpen"),
    IN_PROGRESS: t("statusInProgress"),
    WAITING_FOR_RESPONSE: t("statusWaitingForResponse"),
    NEEDS_INVESTIGATION: t("statusNeedsInvestigation"),
    WONT_FIX: t("statusWontFix"),
    RESOLVED: t("statusResolved"),
    DELETED: t("statusDeleted"),
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

export function FeedbackPriorityBadge({ priority }: { priority: FeedbackPriority }) {
  const t = useTranslations("feedback");
  const styles: Record<FeedbackPriority, string> = {
    LOW: "border-neutral-300 bg-neutral-100 text-neutral-700",
    MEDIUM: "border-warning-600 bg-warning-100 text-warning-600",
    HIGH: "border-error-600 bg-error-100 text-error-600",
  };
  const labels: Record<FeedbackPriority, string> = {
    LOW: t("priorityLow"),
    MEDIUM: t("priorityMedium"),
    HIGH: t("priorityHigh"),
  };
  return (
    <Badge variant="outline" className={`text-xs font-medium ${styles[priority]}`}>
      {labels[priority]}
    </Badge>
  );
}

function ScreenshotLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  const t = useTranslations("feedback");
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("screenshotPreview")}
      className="fixed inset-0 z-[330] flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
        <button
          ref={closeRef}
          type="button"
          aria-label={t("screenshotClose")}
          onClick={onClose}
          className="absolute -top-3 -right-3 z-10 flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white shadow-md text-neutral-700"
        >
          <X size={14} />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={t("screenshotPreview")}
          className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
        />
      </div>
    </div>
  );
}

function VideoPlayer({ url, onClose }: { url: string; onClose: () => void }) {
  const t = useTranslations("feedback");
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("watchRecording")}
      className="fixed inset-0 z-330 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div className="relative w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
        <button
          ref={closeRef}
          type="button"
          aria-label={t("videoClose")}
          onClick={onClose}
          className="absolute -top-3 -right-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-md"
        >
          <X size={14} />
        </button>
        <video src={url} controls autoPlay className="w-full rounded-lg bg-black shadow-2xl" style={{ maxHeight: "80vh" }} />
      </div>
    </div>
  );
}

/**
 * Renders the persisted AI-assisted conversation + final report for a feedback
 * submission. Used by triage reviewers to audit what the AI drafted vs. what
 * the user ultimately submitted. Returns null when metadata is missing or
 * fails schema validation — we never want an old/malformed blob to crash the
 * detail view.
 */
function AiAssistMetadataPanel({
  rawMetadata,
  locale,
}: {
  rawMetadata: unknown;
  locale: string;
}) {
  const t = useTranslations("feedback.ai");
  const [showTranscript, setShowTranscript] = useState(false);
  const metadata = parseFeedbackAssistMetadata(rawMetadata);
  if (!metadata) return null;

  const { finalReport, transcript, aiModel, generatedAt, inputModes, videoRef } = metadata;
  const generatedLabel = new Date(generatedAt).toLocaleString(
    locale === "es" ? "es" : "en-US",
    { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }
  );

  // Derive a friendly label for the input mode chip. Video-only sessions are
  // rare (the user had to also type a description to even open the form), so
  // we collapse video + text into the common "video + narration / text" label.
  const hasVideo = inputModes.includes("video") || videoRef != null;
  const inputModeLabel = hasVideo ? t("inputModes.videoAndNarration") : t("inputModes.text");

  return (
    <section
      className="mb-5 rounded-lg border border-[var(--primary-200)] bg-[var(--primary-50)] p-4"
      aria-label={t("metadataPanelAria")}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--primary-700)]">
            <Sparkles size={14} aria-hidden />
            {t("metadataHeading")}
          </div>
          <span
            className="inline-flex items-center rounded-full border border-[var(--primary-300)] bg-white px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--primary-700)]"
            aria-label={t("inputModeAria")}
          >
            {inputModeLabel}
          </span>
        </div>
        <span className="text-xs text-[var(--neutral-600)]">
          {aiModel} · {generatedLabel}
        </span>
      </header>

      {hasVideo ? (
        <p className="mt-2 text-xs italic text-[var(--primary-700)]">
          {t("aiWatchedRecording")}
        </p>
      ) : null}

      {finalReport.summary ? (
        <p className="mt-2 text-sm text-[var(--neutral-900)]">{finalReport.summary}</p>
      ) : null}

      {finalReport.kind === "BUG" && finalReport.bugDetails ? (
        <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          {finalReport.bugDetails.stepsToReproduce.length > 0 ? (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-[var(--neutral-600)]">
                {t("stepsLabel")}
              </dt>
              <dd>
                <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-[var(--neutral-900)]">
                  {finalReport.bugDetails.stepsToReproduce.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </dd>
            </div>
          ) : null}
          {finalReport.bugDetails.expectedBehavior ? (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-[var(--neutral-600)]">
                {t("expectedLabel")}
              </dt>
              <dd className="mt-1 whitespace-pre-wrap text-[var(--neutral-900)]">
                {finalReport.bugDetails.expectedBehavior}
              </dd>
            </div>
          ) : null}
          {finalReport.bugDetails.actualBehavior ? (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-[var(--neutral-600)]">
                {t("actualLabel")}
              </dt>
              <dd className="mt-1 whitespace-pre-wrap text-[var(--neutral-900)]">
                {finalReport.bugDetails.actualBehavior}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {finalReport.kind === "FEATURE_REQUEST" && finalReport.featureDetails ? (
        <dl className="mt-3 space-y-3 text-sm">
          {finalReport.featureDetails.problemSolved ? (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-[var(--neutral-600)]">
                {t("problemLabel")}
              </dt>
              <dd className="mt-1 whitespace-pre-wrap text-[var(--neutral-900)]">
                {finalReport.featureDetails.problemSolved}
              </dd>
            </div>
          ) : null}
          {finalReport.featureDetails.suggestedAcceptance.length > 0 ? (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-[var(--neutral-600)]">
                {t("acceptanceLabel")}
              </dt>
              <dd>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[var(--neutral-900)]">
                  {finalReport.featureDetails.suggestedAcceptance.map((ac, i) => (
                    <li key={i}>{ac}</li>
                  ))}
                </ul>
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {transcript.length > 0 ? (
        <div className="mt-3 border-t border-[var(--primary-200)] pt-3">
          <button
            type="button"
            onClick={() => setShowTranscript((v) => !v)}
            aria-expanded={showTranscript}
            className="inline-flex items-center gap-1 text-xs font-medium text-[var(--primary-700)] hover:underline"
          >
            {showTranscript ? <ChevronUp size={12} aria-hidden /> : <ChevronDown size={12} aria-hidden />}
            {showTranscript ? t("hideTranscript") : t("showTranscript", { count: transcript.length })}
          </button>
          {showTranscript ? (
            <ol className="mt-2 space-y-2 text-xs">
              {transcript.map((entry, idx) => {
                if (entry.role === "assistant") {
                  return (
                    <li
                      key={`a-${idx}`}
                      className="rounded-md border border-[var(--primary-200)] bg-white p-2 text-[var(--neutral-900)]"
                    >
                      <p className="font-semibold">{t("transcriptAssistant")}</p>
                      <p className="mt-0.5">{entry.question.text}</p>
                      {entry.question.options.length > 0 ? (
                        <p className="mt-1 text-[var(--neutral-500)]">
                          {t("transcriptOptions", {
                            options: entry.question.options.map((o) => o.label).join(", "),
                          })}
                        </p>
                      ) : null}
                    </li>
                  );
                }
                const selectedLabels = entry.selectedOptionIds
                  .map((id) => {
                    for (let i = idx - 1; i >= 0; i--) {
                      const prev = transcript[i];
                      if (prev.role === "assistant" && prev.question.id === entry.questionId) {
                        return prev.question.options.find((o) => o.id === id)?.label ?? id;
                      }
                    }
                    return id;
                  })
                  .join(", ");
                return (
                  <li
                    key={`u-${idx}`}
                    className="rounded-md border border-[var(--neutral-200)] bg-[var(--neutral-50)] p-2 text-[var(--neutral-900)]"
                  >
                    <p className="font-semibold">{t("transcriptUser")}</p>
                    {selectedLabels ? (
                      <p className="mt-0.5">{selectedLabels}</p>
                    ) : null}
                    {entry.text ? (
                      <p className="mt-0.5 whitespace-pre-wrap text-[var(--neutral-700)]">
                        &ldquo;{entry.text}&rdquo;
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export interface FeedbackDetailViewProps {
  variant: "modal" | "page";
  report: FeedbackReport;
  locale: string;
  canTriage: boolean;
  currentUserId: string;
  onUpdate: () => void | Promise<void>;
  onRequestClose: () => void;
}

type FeedbackAssigneeRow = NonNullable<FeedbackReport["assignee"]>;

export function FeedbackDetailView({
  variant,
  report,
  locale,
  canTriage,
  currentUserId,
  onUpdate,
  onRequestClose,
}: FeedbackDetailViewProps) {
  const t = useTranslations("feedback");
  const tc = useTranslations("common");

  const panelRef = useRef<HTMLDivElement>(null);
  const pageRootRef = useRef<HTMLElement>(null);
  /** URL of the screenshot currently shown in the lightbox, or null when closed. */
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [videoPlayerUrl, setVideoPlayerUrl] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [teamMembers, setTeamMembers] = useState<
    Array<{ id: string; name: string | null; email: string; role: string }>
  >([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [assigneeSaving, setAssigneeSaving] = useState(false);
  const [prioritySaving, setPrioritySaving] = useState(false);
  const [copyingAgentPrompt, setCopyingAgentPrompt] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [linkingMode, setLinkingMode] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");
  const [linkResults, setLinkResults] = useState<Array<{ id: string; shortId: number; title: string }>>([]);
  const [linkSearching, setLinkSearching] = useState(false);
  const [linkSaving, setLinkSaving] = useState(false);
  const [unlinkSaving, setUnlinkSaving] = useState(false);
  const [activeDupTab, setActiveDupTab] = useState(0);
  /** Until parent refetches, show PATCH response so the select and label match immediately. */
  const [assigneeOverride, setAssigneeOverride] = useState<"useProp" | FeedbackAssigneeRow | null>(
    "useProp"
  );
  const [priorityOverride, setPriorityOverride] = useState<"useProp" | FeedbackPriority | null>(
    "useProp"
  );

  useEffect(() => {
    setAssigneeOverride("useProp");
  }, [report.id, report.assignee?.id]);

  useEffect(() => {
    setPriorityOverride("useProp");
  }, [report.id, report.priority]);

  const displayAssignee: FeedbackAssigneeRow | null =
    assigneeOverride === "useProp" ? (report.assignee ?? null) : assigneeOverride;

  const displayPriority: FeedbackPriority | null =
    priorityOverride === "useProp" ? (report.priority ?? null) : priorityOverride;

  const showPrioritySection = canTriage || displayPriority !== null;

  const canAssign = canTriage || report.user.id === currentUserId;

  const handleClose = useCallback(() => {
    if (lightboxSrc) {
      setLightboxSrc(null);
      return;
    }
    if (videoPlayerUrl) {
      setVideoPlayerUrl(null);
      return;
    }
    onRequestClose();
  }, [lightboxSrc, videoPlayerUrl, onRequestClose]);

  useEffect(() => {
    const el = variant === "page" ? pageRootRef.current : panelRef.current;
    // Only focus the modal dialog; focusing the full-page article draws a visible focus ring
    // around the entire detail view (browser default outline).
    if (variant === "modal") {
      el?.focus();
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      handleClose();
    };
    document.addEventListener("keydown", onKeyDown);
    if (variant === "modal") {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (variant === "modal") {
        document.body.style.overflow = "";
      }
    };
  }, [handleClose, variant]);

  useEffect(() => {
    if (!canAssign) return;
    let cancelled = false;
    setTeamLoading(true);
    const isProd = report.environment === "production";
    const url = isProd ? "/api/feedback/prod-assignees" : "/api/team";
    void fetch(url)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("team"))))
      .then(
        (data: {
          data?: typeof teamMembers;
          assignees?: Array<{ id: string; name: string | null; email: string; role: string }>;
        }) => {
          if (cancelled) return;
          if (isProd) {
            const rows = data.assignees ?? [];
            setTeamMembers(
              rows.map((u) => ({
                id: u.id,
                name: u.name,
                email: u.email,
                role: u.role,
              }))
            );
          } else {
            setTeamMembers(data.data ?? []);
          }
        }
      )
      .catch(() => {
        if (!cancelled) setTeamMembers([]);
      })
      .finally(() => {
        if (!cancelled) setTeamLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canAssign, report.environment]);

  async function updateAssignee(assigneeId: string | null) {
    setAssigneeSaving(true);
    try {
      const q = feedbackApiQuery(report.environment);
      const res = await fetch(`/api/feedback/${report.id}${q}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigneeId }),
      });
      if (!res.ok) throw new Error("assignee");
      const data = (await res.json()) as FeedbackReport;
      setAssigneeOverride(data.assignee ?? null);
      await onUpdate();
      toast.success(t("assigneeUpdated"));
    } catch {
      toast.error(t("assigneeUpdateFailed"));
    } finally {
      setAssigneeSaving(false);
    }
  }

  async function updatePriority(raw: string) {
    const next: FeedbackPriority | null = raw === "" ? null : (raw as FeedbackPriority);
    if (raw !== "" && raw !== "LOW" && raw !== "MEDIUM" && raw !== "HIGH") return;

    setPrioritySaving(true);
    try {
      const q = feedbackApiQuery(report.environment);
      const res = await fetch(`/api/feedback/${report.id}${q}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: next }),
      });
      if (!res.ok) throw new Error("priority");
      const data = (await res.json()) as FeedbackReport;
      setPriorityOverride(data.priority ?? null);
      await onUpdate();
      toast.success(t("priorityUpdated"));
    } catch {
      toast.error(t("priorityUpdateFailed"));
    } finally {
      setPrioritySaving(false);
    }
  }

  function openInNewTab() {
    const url = buildFeedbackDetailAbsoluteUrl(
      window.location.origin,
      locale,
      report.id,
      report.environment
    );
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function copyPromptForAgent() {
    setCopyingAgentPrompt(true);
    try {
      const q = feedbackApiQuery(report.environment);
      const res = await fetch(`/api/feedback/${encodeURIComponent(report.id)}/comments${q}`);
      if (!res.ok) throw new Error("comments");
      const data = (await res.json()) as { comments: FeedbackCommentData[] };
      const appDeepLink = buildFeedbackDetailAbsoluteUrl(
        window.location.origin,
        locale,
        report.id,
        report.environment
      );
      const markdown = buildFeedbackAgentPromptMarkdown(
        {
          id: report.id,
          shortId: report.shortId,
          title: report.title,
          description: report.description,
          pageUrl: report.pageUrl,
          status: report.status,
          priority: report.priority ?? null,
          type: report.type,
          source: report.source,
          createdAt: report.createdAt,
          environment: report.environment,
          user: report.user,
          assignee: report.assignee ?? null,
          adminNote: report.adminNote,
          screenshot: report.screenshot,
          videoUrl: report.videoUrl,
        },
        (data.comments ?? []).map((c) => ({
          body: c.body,
          createdAt: c.createdAt,
          author: c.author,
          attachments: c.attachments.map((a) => ({
            storageUrl: a.storageUrl,
            caption: a.caption,
            mimeType: a.mimeType,
          })),
        })),
        { appDeepLink }
      );
      await navigator.clipboard.writeText(markdown);
      toast.success(t("copyAgentPromptSuccess"));
    } catch {
      toast.error(t("copyAgentPromptFailed"));
    } finally {
      setCopyingAgentPrompt(false);
    }
  }

  async function searchFeedbackForLink(q: string) {
    setLinkSearching(true);
    try {
      const res = await fetch(`/api/feedback`);
      if (!res.ok) return;
      const data = (await res.json()) as { reports: Array<{ id: string; shortId: number; title: string; duplicateOf?: unknown }> };
      const term = q.toLowerCase();
      setLinkResults(
        (data.reports ?? [])
          .filter((r) =>
            r.id !== report.id &&
            !r.duplicateOf &&
            (r.title.toLowerCase().includes(term) ||
              formatShortId(r.shortId).toLowerCase().includes(term))
          )
          .slice(0, 8)
          .map((r) => ({ id: r.id, shortId: r.shortId, title: r.title }))
      );
    } catch {
      setLinkResults([]);
    } finally {
      setLinkSearching(false);
    }
  }

  async function linkAsDuplicate(canonicalId: string) {
    setLinkSaving(true);
    try {
      const res = await fetch(`/api/feedback/${report.id}/link-duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canonicalId }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        toast.error(err.error ?? t("linkDuplicateFailed"));
        return;
      }
      toast.success(t("linkDuplicateSuccess"));
      setLinkingMode(false);
      setLinkSearch("");
      setLinkResults([]);
      await onUpdate();
    } catch {
      toast.error(t("linkDuplicateFailed"));
    } finally {
      setLinkSaving(false);
    }
  }

  async function unlinkDuplicate() {
    setUnlinkSaving(true);
    try {
      const res = await fetch(`/api/feedback/${report.id}/link-duplicate`, { method: "DELETE" });
      if (!res.ok) throw new Error("unlink");
      toast.success(t("unlinkDuplicateSuccess"));
      await onUpdate();
    } catch {
      toast.error(t("unlinkDuplicateFailed"));
    } finally {
      setUnlinkSaving(false);
    }
  }

  async function updateStatus(status: FeedbackStatus) {
    setUpdatingStatus(true);
    try {
      const q = feedbackApiQuery(report.environment);
      const res = await fetch(`/api/feedback/${report.id}${q}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update");
      onUpdate();
      toast.success(t("statusUpdated"));
    } catch {
      toast.error(t("statusUpdateFailed"));
    } finally {
      setUpdatingStatus(false);
    }
  }

  const submittedWhen = new Date(report.createdAt).toLocaleString(locale === "es" ? "es" : "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const eligibleAssignees = filterTeamMembersForFeedbackAssignee(teamMembers);
  const orphanAssignee =
    displayAssignee && !eligibleAssignees.some((m) => m.id === displayAssignee.id)
      ? displayAssignee
      : null;

  const showAssigneeSection = canAssign || !!displayAssignee;

  /** Assignee label + control. In compact (modal) mode renders as a stacked column; in page mode renders inline. */
  function renderAssigneeBlock(compact: boolean) {
    if (!showAssigneeSection) return null;

    if (compact) {
      return (
        <div className="flex flex-col items-start gap-0.5">
          <span className="text-xs font-medium text-neutral-500">{t("assigneeLabel")}</span>
          {canAssign ? (
            <div className="flex items-center gap-1.5">
              <select
                className="h-7 box-border w-max min-w-0 max-w-40 cursor-pointer rounded-md border border-neutral-300 bg-white py-0 pl-2 pr-7 text-xs leading-4 font-normal text-neutral-900 field-sizing-content"
                aria-label={t("assigneeChangePlaceholder")}
                disabled={assigneeSaving || teamLoading}
                value={displayAssignee?.id ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  void updateAssignee(v === "" ? null : v);
                }}
              >
                <option value="">{t("assigneeUnassigned")}</option>
                {orphanAssignee ? (
                  <option value={orphanAssignee.id}>
                    {orphanAssignee.name ?? orphanAssignee.email}
                  </option>
                ) : null}
                {eligibleAssignees
                  .filter((m) => m.id !== orphanAssignee?.id)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name ?? m.email}
                    </option>
                  ))}
              </select>
              {assigneeSaving ? (
                <Loader2 size={12} className="shrink-0 animate-spin text-neutral-500" aria-hidden />
              ) : null}
            </div>
          ) : (
            <span className="text-xs font-normal text-neutral-900">
              {displayAssignee ? displayAssignee.name ?? displayAssignee.email : t("assigneeUnassigned")}
            </span>
          )}
        </div>
      );
    }

    return (
      <div className="ml-auto flex min-w-0 max-w-full shrink-0 flex-wrap items-center justify-end gap-x-4 gap-y-1">
        <span className="shrink-0 font-medium text-neutral-700 text-sm leading-5">
          {t("assigneeLabel")}
        </span>
        {canAssign ? (
          <div className="flex min-w-0 shrink-0 items-center gap-2">
            <select
              className="h-9 box-border w-max min-w-0 max-w-40 cursor-pointer rounded-md border border-neutral-300 bg-white py-0 pl-3 pr-9 text-center text-sm leading-5 font-normal text-neutral-900 antialiased field-sizing-content sm:max-w-48"
              aria-label={t("assigneeChangePlaceholder")}
              disabled={assigneeSaving || teamLoading}
              value={displayAssignee?.id ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                void updateAssignee(v === "" ? null : v);
              }}
            >
              <option value="">{t("assigneeUnassigned")}</option>
              {orphanAssignee ? (
                <option value={orphanAssignee.id}>
                  {orphanAssignee.name ?? orphanAssignee.email}
                </option>
              ) : null}
              {eligibleAssignees
                .filter((m) => m.id !== orphanAssignee?.id)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name ?? m.email}
                  </option>
                ))}
            </select>
            {assigneeSaving ? (
              <Loader2 size={14} className="shrink-0 animate-spin text-neutral-500" aria-hidden />
            ) : null}
          </div>
        ) : (
          <span className="shrink-0 font-normal text-neutral-900 text-sm leading-5">
            {displayAssignee ? displayAssignee.name ?? displayAssignee.email : t("assigneeUnassigned")}
          </span>
        )}
      </div>
    );
  }

  function renderPriorityBlock(compact: boolean) {
    if (!showPrioritySection) return null;

    if (compact) {
      return (
        <div className="flex flex-col items-start gap-0.5">
          <span className="text-xs font-medium text-neutral-500">{t("priorityLabel")}</span>
          {canTriage ? (
            <div className="flex items-center gap-1.5">
              <select
                className="h-7 box-border cursor-pointer rounded-md border border-neutral-300 bg-white py-0 pl-2 pr-7 text-xs leading-4 font-normal text-neutral-900"
                aria-label={t("priorityChangeAria")}
                disabled={prioritySaving}
                value={displayPriority ?? ""}
                onChange={(e) => {
                  void updatePriority(e.target.value);
                }}
              >
                <option value="">{t("priorityNone")}</option>
                <option value="LOW">{t("priorityLow")}</option>
                <option value="MEDIUM">{t("priorityMedium")}</option>
                <option value="HIGH">{t("priorityHigh")}</option>
              </select>
              {prioritySaving ? (
                <Loader2 size={12} className="shrink-0 animate-spin text-neutral-500" aria-hidden />
              ) : null}
            </div>
          ) : (
            displayPriority ? <FeedbackPriorityBadge priority={displayPriority} /> : null
          )}
        </div>
      );
    }

    return (
      <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="shrink-0 font-medium text-neutral-700 text-sm leading-5">{t("priorityLabel")}</span>
        {canTriage ? (
          <div className="flex shrink-0 items-center gap-2">
            <select
              className="h-9 box-border max-w-full cursor-pointer rounded-md border border-neutral-300 bg-white py-0 pl-2 pr-7 text-left text-sm leading-5 font-normal text-neutral-900"
              aria-label={t("priorityChangeAria")}
              disabled={prioritySaving}
              value={displayPriority ?? ""}
              onChange={(e) => {
                void updatePriority(e.target.value);
              }}
            >
              <option value="">{t("priorityNone")}</option>
              <option value="LOW">{t("priorityLow")}</option>
              <option value="MEDIUM">{t("priorityMedium")}</option>
              <option value="HIGH">{t("priorityHigh")}</option>
            </select>
            {prioritySaving ? (
              <Loader2 size={14} className="shrink-0 animate-spin text-neutral-500" aria-hidden />
            ) : null}
          </div>
        ) : (
          displayPriority ? <FeedbackPriorityBadge priority={displayPriority} /> : null
        )}
      </div>
    );
  }

  const panelClass =
    "rounded-xl border border-(--neutral-200) bg-white shadow-sm";

  const renderDetailFields = (textSize: "sm" | "base") => {
    const descClass = textSize === "base" ? "text-base leading-relaxed" : "text-sm";
    const linkClass = textSize === "base" ? "text-sm" : "text-xs";
    const thumbClass =
      textSize === "base"
        ? "max-h-[min(72vh,640px)] w-full max-w-4xl object-contain"
        : "max-h-64 max-w-full object-contain";

    const dups = report.canonicalDuplicates ?? [];
    const activeDup = activeDupTab > 0 ? dups[activeDupTab - 1] : null;

    return (
      <>
        {/* Duplicates tab strip — shown when this report is the canonical */}
        {dups.length > 0 && (
          <div className="mb-4">
            <div className="flex gap-1 border-b border-(--neutral-200) overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveDupTab(0)}
                className={`shrink-0 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                  activeDupTab === 0
                    ? "border-primary-600 text-primary-700"
                    : "border-transparent text-neutral-500 hover:text-neutral-700"
                }`}
              >
                {t("dupTabThisReport")}
              </button>
              {dups.map((link, idx) => (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => setActiveDupTab(idx + 1)}
                  className={`shrink-0 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                    activeDupTab === idx + 1
                      ? "border-primary-600 text-primary-700"
                      : "border-transparent text-neutral-500 hover:text-neutral-700"
                  }`}
                >
                  <span className="font-mono text-[10px] font-semibold">{formatShortId(link.duplicate.shortId)}</span>
                  <span className="ml-1.5 max-w-[120px] truncate inline-block align-middle">{link.duplicate.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Duplicate submission view */}
        {activeDup ? (
          <div className="mb-5">
            <div className="mb-3 flex items-center gap-2 text-xs text-neutral-500">
              <Link2 size={12} aria-hidden />
              <span>
                {t("dupSubmittedBy")}{" "}
                <span className="font-medium text-neutral-700">
                  {activeDup.duplicate.user.name ?? activeDup.duplicate.user.email}
                </span>
                {" · "}
                {new Date(activeDup.duplicate.createdAt).toLocaleString(locale === "es" ? "es" : "en-US", {
                  month: "short", day: "numeric", year: "numeric",
                })}
              </span>
            </div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-700">{t("descriptionHeading")}</p>
            <p className={`mb-4 whitespace-pre-wrap text-neutral-900 ${descClass}`}>{activeDup.duplicate.description}</p>
            {activeDup.duplicate.pageUrl && (
              <div className="mb-4">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-700">{t("page")}</p>
                <a
                  href={activeDup.duplicate.pageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`break-all font-medium text-(--primary-600) hover:underline ${linkClass}`}
                >
                  {activeDup.duplicate.pageUrl}
                </a>
              </div>
            )}
            {(() => {
              const dupImgs: string[] = (activeDup.duplicate.screenshots && activeDup.duplicate.screenshots.length > 0)
                ? activeDup.duplicate.screenshots
                : activeDup.duplicate.screenshot ? [activeDup.duplicate.screenshot] : [];
              if (dupImgs.length === 0) return null;
              return (
                <div className="mb-4">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-700">{t("screenshotHeading")}</p>
                  <div className="flex flex-wrap gap-2">
                    {dupImgs.map((src) => (
                      <button
                        key={src}
                        type="button"
                        aria-label={t("screenshotEnlargeAria")}
                        onClick={() => setLightboxSrc(src)}
                        className="group relative block overflow-hidden rounded-lg border border-(--neutral-200) bg-neutral-50"
                        style={{ width: 72, height: 72 }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="" className="w-full h-full object-cover block" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 transition-opacity group-hover:opacity-100">
                          <ZoomIn size={20} className="text-white drop-shadow-md" />
                        </div>
                      </button>
                    ))}
                  </div>
                  {lightboxSrc && <ScreenshotLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
                </div>
              );
            })()}
          </div>
        ) : (
          <>
        {report.aiAssisted ? (
          <AiAssistMetadataPanel rawMetadata={report.aiAssistMetadata} locale={locale} />
        ) : null}

        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-700">{t("descriptionHeading")}</p>
        <p className={`mb-5 whitespace-pre-wrap text-neutral-900 ${descClass}`}>{report.description}</p>

        {report.pageUrl && (
          <div className="mb-5">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-700">{t("page")}</p>
            <a
              href={report.pageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`break-all font-medium text-(--primary-600) hover:text-primary-700 hover:underline ${linkClass}`}
            >
              {report.pageUrl}
            </a>
          </div>
        )}

        {(() => {
          // Prefer new screenshots array; fall back to legacy single screenshot
          const imgUrls: string[] = (report.screenshots && report.screenshots.length > 0)
            ? report.screenshots
            : report.screenshot ? [report.screenshot] : [];
          if (imgUrls.length === 0) return null;
          return (
            <div className="mb-5">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-700">{t("screenshotHeading")}</p>
              <div className="flex flex-wrap gap-2">
                {imgUrls.map((src) => (
                  <button
                    key={src}
                    type="button"
                    aria-label={t("screenshotEnlargeAria")}
                    onClick={() => setLightboxSrc(src)}
                    className="group relative block overflow-hidden rounded-lg border border-(--neutral-200) bg-neutral-50"
                    style={{ width: 72, height: 72 }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="w-full h-full object-cover block" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 transition-opacity group-hover:opacity-100">
                      <ZoomIn size={20} className="text-white drop-shadow-md" />
                    </div>
                  </button>
                ))}
              </div>
              {lightboxSrc && <ScreenshotLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
            </div>
          );
        })()}

        {report.videoUrl && (
          <div className="mb-5">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-700">{t("recordingSection")}</p>
            <button
              type="button"
              onClick={() => setVideoPlayerUrl(report.videoUrl!)}
              className={`inline-flex items-center gap-1.5 font-medium text-(--primary-600) hover:text-primary-700 hover:underline ${linkClass}`}
            >
              <Video size={13} aria-hidden />
              {t("watchRecording")}
            </button>
          </div>
        )}

        {canTriage && report.adminNote && (
          <div className="mb-5 rounded-lg border border-(--neutral-200) bg-neutral-50 p-4">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-(--neutral-600)">{t("legacyNote")}</p>
            <p className={`whitespace-pre-wrap text-(--neutral-800) ${descClass}`}>{report.adminNote}</p>
          </div>
        )}

        {canTriage && (
          <div className="mb-5 space-y-2">
            {/* Status action buttons */}
            {report.status !== "DELETED" ? (
              <div className="flex flex-wrap gap-1.5">
                {report.status !== "IN_PROGRESS" && (
                  <Button size="sm" variant="outline" onClick={() => updateStatus("IN_PROGRESS")} disabled={updatingStatus}>
                    {updatingStatus ? <Loader2 size={12} className="mr-1 animate-spin" /> : null}
                    {t("markInProgress")}
                  </Button>
                )}
                {report.status !== "WAITING_FOR_RESPONSE" && (
                  <Button size="sm" variant="outline" onClick={() => updateStatus("WAITING_FOR_RESPONSE")} disabled={updatingStatus}>
                    {t("markWaitingForResponse")}
                  </Button>
                )}
                {report.status !== "NEEDS_INVESTIGATION" && (
                  <Button size="sm" variant="outline" onClick={() => updateStatus("NEEDS_INVESTIGATION")} disabled={updatingStatus}>
                    {t("markNeedsInvestigation")}
                  </Button>
                )}
                {report.status !== "WONT_FIX" && (
                  <Button size="sm" variant="outline" onClick={() => updateStatus("WONT_FIX")} disabled={updatingStatus}>
                    {t("markWontFix")}
                  </Button>
                )}
                {report.status !== "RESOLVED" && (
                  <Button size="sm" variant="outline" onClick={() => updateStatus("RESOLVED")} disabled={updatingStatus}>
                    {t("markResolved")}
                  </Button>
                )}
                {report.status !== "OPEN" && (
                  <Button size="sm" variant="outline" onClick={() => updateStatus("OPEN")} disabled={updatingStatus}>
                    {t("reopen")}
                  </Button>
                )}
                {!deletePending ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-200 text-red-600 hover:bg-red-50"
                    onClick={() => setDeletePending(true)}
                    disabled={updatingStatus}
                  >
                    {t("deleteReport")}
                  </Button>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <AlertTriangle size={12} className="shrink-0 text-red-600" aria-hidden />
                    <span className="text-xs text-red-600">{t("deleteConfirm")}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-400 text-red-600 hover:bg-red-50"
                      onClick={() => { void updateStatus("DELETED"); setDeletePending(false); }}
                      disabled={updatingStatus}
                    >
                      {t("deleteConfirmYes")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeletePending(false)}>
                      {t("deleteConfirmNo")}
                    </Button>
                  </span>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => updateStatus("OPEN")}
                  disabled={updatingStatus}
                >
                  {updatingStatus ? <Loader2 size={12} className="mr-1 animate-spin" /> : null}
                  {t("restoreReport")}
                </Button>
              </div>
            )}

            {/* Duplicate linking — not available for production reports or for already-deleted items */}
            {!report.duplicateOf && report.status !== "DELETED" && report.environment !== "production" && (
              <div>
                {!linkingMode ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1.5 text-xs text-neutral-500"
                    onClick={() => { setLinkingMode(true); void searchFeedbackForLink(""); }}
                  >
                    <Link2 size={12} aria-hidden />
                    {t("linkAsDuplicate")}
                  </Button>
                ) : (
                  <div className="rounded-lg border border-(--neutral-200) bg-neutral-50 p-3">
                    <p className="mb-2 text-xs font-medium text-neutral-700">{t("linkDuplicateSearch")}</p>
                    <div className="relative mb-2">
                      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" aria-hidden />
                      <input
                        type="text"
                        className="h-8 w-full rounded-md border border-neutral-300 bg-white pl-7 pr-3 text-xs placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        placeholder={t("linkDuplicatePlaceholder")}
                        value={linkSearch}
                        aria-label={t("linkDuplicatePlaceholder")}
                        onChange={(e) => {
                          setLinkSearch(e.target.value);
                          void searchFeedbackForLink(e.target.value);
                        }}
                      />
                    </div>
                    {linkSearching && <p className="text-xs text-neutral-400">{t("searching")}</p>}
                    {!linkSearching && linkResults.length === 0 && linkSearch.length > 0 && (
                      <p className="text-xs text-neutral-400">{t("noResults")}</p>
                    )}
                    {linkResults.length > 0 && (
                      <ul className="space-y-1">
                        {linkResults.map((r) => (
                          <li key={r.id}>
                            <button
                              type="button"
                              disabled={linkSaving}
                              onClick={() => void linkAsDuplicate(r.id)}
                              className="w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-neutral-100 disabled:opacity-50"
                            >
                              <span className="font-mono font-semibold text-neutral-500">{formatShortId(r.shortId)}</span>
                              <span className="ml-2 text-neutral-800">{r.title}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-2 flex justify-end">
                      <Button size="sm" variant="ghost" className="text-xs" onClick={() => { setLinkingMode(false); setLinkSearch(""); setLinkResults([]); }}>
                        {t("cancel")}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Already linked as a duplicate — show badge + unlink */}
            {report.duplicateOf && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <Link2 size={12} className="shrink-0 text-amber-600" aria-hidden />
                <span className="min-w-0 text-xs text-amber-800">
                  {t("duplicateOfLabel")}{" "}
                  <span className="font-semibold">{formatShortId(report.duplicateOf.canonical.shortId)}</span>
                  {" — "}{report.duplicateOf.canonical.title}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto shrink-0 h-6 px-2 text-xs text-amber-700 hover:bg-amber-100"
                  disabled={unlinkSaving}
                  onClick={() => void unlinkDuplicate()}
                  aria-label={t("unlinkDuplicateAria")}
                >
                  {unlinkSaving ? <Loader2 size={10} className="animate-spin" /> : <Link2Off size={12} />}
                  <span className="ml-1">{t("unlinkDuplicate")}</span>
                </Button>
              </div>
            )}
          </div>
        )}
          </>
        )}
      </>
    );
  };

  if (variant === "page") {
    return (
      <article
        ref={pageRootRef}
        tabIndex={-1}
        className="flex w-full flex-col gap-8"
        aria-labelledby="feedback-page-title"
      >
        <nav aria-label={t("backToInboxAria")} className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Link
              href="/feedback"
              className="inline-flex items-center gap-1 font-medium text-(--primary-600) hover:text-primary-700 hover:underline"
            >
              <ChevronLeft size={18} aria-hidden className="shrink-0" />
              {t("pageTitle")}
            </Link>
            <span className="select-none text-neutral-300" aria-hidden>
              /
            </span>
            <span className="font-mono text-xs font-semibold text-neutral-500">
              {formatShortId(report.shortId)}
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5"
            disabled={copyingAgentPrompt}
            title={t("copyAgentPromptTitle")}
            aria-label={t("copyAgentPromptAria")}
            onClick={() => void copyPromptForAgent()}
          >
            {copyingAgentPrompt ? (
              <Loader2 size={14} className="animate-spin" aria-hidden />
            ) : (
              <Copy size={14} aria-hidden />
            )}
            {t("copyAgentPrompt")}
          </Button>
        </nav>

        <header className="flex flex-col gap-3 border-b border-(--neutral-200) pb-6">
          <h1
            id="feedback-page-title"
            className="text-balance font-semibold text-neutral-900"
            style={{ fontSize: "var(--text-heading)", fontWeight: "var(--font-weight-semibold)" }}
          >
            {report.title}
          </h1>
          <div className="flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-sm text-(--neutral-600)">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <FeedbackStatusBadge status={report.status} />
                {report.environment === "production" && (
                  <Badge variant="outline" className="border-(--neutral-400) text-xs text-(--neutral-700)">
                    {t("environmentProduction")}
                  </Badge>
                )}
                {report.environment === "development" ? (
                  <Badge variant="outline" className="border-(--neutral-400) text-xs text-(--neutral-700)">
                    {t("environmentDevelopment")}
                  </Badge>
                ) : null}
                {report.viewerContext === "mentioned" && (
                  <Badge variant="outline" className="border-primary-500 text-xs text-primary-700">
                    {t("mentionedBadge")}
                  </Badge>
                )}
              </div>
              <span className="hidden h-4 w-px shrink-0 bg-(--neutral-200) sm:block" aria-hidden />
              <span className="min-w-0">
                {t("submittedBy")} {report.user.name ?? report.user.email}
                <span className="text-(--neutral-400)"> · </span>
                {submittedWhen}
              </span>
            </div>
            {renderPriorityBlock(false)}
            {renderAssigneeBlock(false)}
          </div>
        </header>

        <section className={`${panelClass} p-5 sm:p-6`} aria-labelledby="feedback-detail-summary-heading">
          <h2 id="feedback-detail-summary-heading" className="mb-4 text-base font-semibold text-neutral-900">
            {t("feedbackDetailSummary")}
          </h2>
          {renderDetailFields("base")}
        </section>

        <section className={`${panelClass} p-5 sm:p-6`} aria-label={t("commentsSection")}>
          <FeedbackCommentThread
            feedbackReportId={report.id}
            currentUserId={currentUserId}
            pollingEnabled
            feedbackEnvironment={report.environment}
          />
        </section>

        {videoPlayerUrl ? <VideoPlayer url={videoPlayerUrl} onClose={() => setVideoPlayerUrl(null)} /> : null}
      </article>
    );
  }

  const card = (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-modal-title"
      tabIndex={-1}
      className="relative flex max-h-dvh w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl sm:max-h-[min(90dvh,800px)] sm:rounded-2xl"
      style={{
        paddingTop: "max(12px, env(safe-area-inset-top))",
        paddingBottom: "max(12px, env(safe-area-inset-bottom))",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex shrink-0 flex-col gap-2 border-b border-(--neutral-200) px-3 pb-3 pt-1 sm:px-4">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => void copyPromptForAgent()}
            disabled={copyingAgentPrompt}
            aria-label={t("copyAgentPromptAria")}
            title={t("copyAgentPromptTitle")}
            className="inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-lg border border-(--neutral-200) bg-(--neutral-50) px-2.5 py-1.5 text-left text-xs font-semibold text-neutral-800 hover:bg-neutral-100 disabled:opacity-50 sm:shrink-0"
          >
            {copyingAgentPrompt ? (
              <Loader2 size={16} className="shrink-0 animate-spin" aria-hidden />
            ) : (
              <Copy size={16} className="shrink-0" aria-hidden />
            )}
            <span className="min-w-0 leading-tight">{t("copyAgentPrompt")}</span>
          </button>
          <button
            type="button"
            onClick={openInNewTab}
            aria-label={t("openInNewTabAria")}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-(--neutral-600) hover:bg-neutral-100"
          >
            <ExternalLink size={18} />
          </button>
          <button
            type="button"
            onClick={handleClose}
            aria-label={t("modalCloseAria")}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-(--neutral-600) hover:bg-neutral-100"
          >
            <X size={20} />
          </button>
        </div>
        <div className="min-w-0 w-full">
          <h2
            id="feedback-modal-title"
            className="w-full text-balance break-words text-sm font-semibold leading-snug text-neutral-900"
          >
            {formatShortId(report.shortId)} — {report.title}
          </h2>
          <p className="mt-1 text-xs text-(--neutral-500)">
            {t("submittedBy")} {report.user.name ?? report.user.email}
            <span className="text-(--neutral-400)"> · </span>
            {submittedWhen}
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4">
        <div className="mb-3 flex w-full min-w-0 flex-wrap items-start gap-x-3 gap-y-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <FeedbackStatusBadge status={report.status} />
            {report.environment === "production" && (
              <Badge variant="outline" className="border-(--neutral-400) text-xs text-(--neutral-700)">
                {t("environmentProduction")}
              </Badge>
            )}
            {report.environment === "development" ? (
              <Badge variant="outline" className="border-(--neutral-400) text-xs text-(--neutral-700)">
                {t("environmentDevelopment")}
              </Badge>
            ) : null}
            {report.viewerContext === "mentioned" && (
              <Badge variant="outline" className="border-primary-500 text-xs text-primary-700">
                {t("mentionedBadge")}
              </Badge>
            )}
          </div>
          {(showPrioritySection || showAssigneeSection) && (
            <div className="ml-auto flex shrink-0 items-start gap-3">
              {renderPriorityBlock(true)}
              {renderAssigneeBlock(true)}
            </div>
          )}
        </div>

        {renderDetailFields("sm")}

        <div className="border-t border-(--neutral-200) pt-4">
          <FeedbackCommentThread
            feedbackReportId={report.id}
            currentUserId={currentUserId}
            pollingEnabled
            feedbackEnvironment={report.environment}
          />
        </div>
      </div>

      <div
        className="shrink-0 border-t border-(--neutral-200) bg-neutral-0 px-3 py-2 sm:px-4"
        style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}
      >
        <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={handleClose}>
          {tc("close")}
        </Button>
      </div>

      {videoPlayerUrl ? <VideoPlayer url={videoPlayerUrl} onClose={() => setVideoPlayerUrl(null)} /> : null}
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-310 flex items-end justify-center sm:items-center sm:p-4"
      role="presentation"
      onClick={handleClose}
    >
      <div className="absolute inset-0 bg-black/50" aria-hidden />
      {card}
    </div>
  );
}
