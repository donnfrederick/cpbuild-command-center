"use client";

import { useState } from "react";
import { HelpCircle, Flag, ThumbsUp, ChevronDown, ChevronUp, Loader2, Check } from "lucide-react";
import type { FeedbackSection, ChallengeReason } from "@/lib/ai/types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  briefingId: string;
  section: FeedbackSection;
  /** Stable identifier for this item within the section (e.g. index or title slug). */
  itemKey: string;
  /** The raw item data — sent to Gemini for justify/revise. */
  itemData: Record<string, unknown>;
  /** Short context for Gemini to ground its response. */
  briefingContext: { dateFor: string; narrative?: string };
  /** Called when Gemini returns a revised version of the card. */
  onRevision?: (revisedItem: Record<string, unknown>) => void;
  children: React.ReactNode;
}

type PanelState = "idle" | "justifying" | "justified" | "challenging" | "revising" | "revised" | "approved";

const CHALLENGE_REASONS: { value: ChallengeReason; label: string }[] = [
  { value: "WRONG_CONTEXT", label: "Wrong context — doesn't apply to an internal tool" },
  { value: "INFLATED_NUMBER", label: "Inflated number — not grounded in real data" },
  { value: "NOT_APPLICABLE", label: "Not applicable to this situation" },
  { value: "OTHER", label: "Other (explain in note)" },
];

// ── BriefingCardFeedback ──────────────────────────────────────────────────────

export function BriefingCardFeedback({
  briefingId,
  section,
  itemKey,
  itemData,
  briefingContext,
  onRevision,
  children,
}: Props) {
  const [panelState, setPanelState] = useState<PanelState>("idle");
  const [justification, setJustification] = useState<string | null>(null);
  const [showJustification, setShowJustification] = useState(false);

  // Challenge form state
  const [challengeReason, setChallengeReason] = useState<ChallengeReason>("INFLATED_NUMBER");
  const [userNote, setUserNote] = useState("");
  const [askRevise, setAskRevise] = useState(true);
  const [revisionNote, setRevisionNote] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Separate boolean so TypeScript doesn't narrow the submit button disabled check
  const [challengeSubmitting, setChallengeSubmitting] = useState(false);

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleJustify() {
    if (panelState === "justifying") return;
    setPanelState("justifying");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/daily-briefing/feedback/justify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ briefingId, section, itemKey, itemData, briefingContext }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data.error as string) ?? "Failed to get justification");
      setJustification(data.justification as string);
      setShowJustification(true);
      setPanelState("justified");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Request failed");
      setPanelState("idle");
    }
  }

  async function handleApprove() {
    setPanelState("approved");
    await fetch("/api/daily-briefing/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ briefingId, section, itemKey, feedbackType: "APPROVE" }),
    }).catch(() => {});
  }

  async function handleChallengeSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setChallengeSubmitting(true);

    if (askRevise) {
      setPanelState("revising");
      try {
        const res = await fetch("/api/daily-briefing/feedback/revise", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            briefingId,
            section,
            itemKey,
            itemData,
            challengeReason,
            userNote: userNote || undefined,
            briefingContext,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error((data.error as string) ?? "Revision failed");
        onRevision?.(data.revisedItem as Record<string, unknown>);
        setRevisionNote("Gemini revised this card. The original is shown above.");
        setPanelState("revised");
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Request failed");
        setPanelState("challenging");
      } finally {
        setChallengeSubmitting(false);
      }
    } else {
      // Save challenge only (no revision)
      try {
        const res = await fetch("/api/daily-briefing/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            briefingId,
            section,
            itemKey,
            feedbackType: "CHALLENGE",
            challengeReason,
            userNote: userNote || undefined,
          }),
        });
        if (!res.ok) throw new Error("Failed to save feedback");
        setPanelState("idle");
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Request failed");
      } finally {
        setChallengeSubmitting(false);
      }
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const isLoading = panelState === "justifying" || panelState === "revising";

  return (
    <div className="group relative">
      {children}

      {/* Feedback toolbar — visible on hover or when panel is open */}
      {panelState !== "approved" && (
        <div
          className={`flex items-center gap-2 mt-2 transition-opacity ${
            panelState !== "idle" || justification
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"
          }`}
        >
          {/* Justify button */}
          <button
            type="button"
            onClick={handleJustify}
            disabled={isLoading}
            aria-label="Ask Gemini to justify this estimate"
            className="flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors disabled:opacity-50"
            style={{
              backgroundColor: "var(--neutral-100)",
              color: "var(--neutral-600)",
              border: "1px solid var(--neutral-200)",
            }}
          >
            {panelState === "justifying" ? (
              <Loader2 style={{ width: 11, height: 11 }} className="animate-spin" />
            ) : (
              <HelpCircle style={{ width: 11, height: 11 }} />
            )}
            Justify
          </button>

          {/* Challenge button */}
          <button
            type="button"
            onClick={() =>
              setPanelState((s) => (s === "challenging" ? "idle" : "challenging"))
            }
            disabled={isLoading}
            aria-label="Challenge this estimate"
            className="flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors disabled:opacity-50"
            style={{
              backgroundColor:
                panelState === "challenging" ? "var(--error-100)" : "var(--neutral-100)",
              color:
                panelState === "challenging" ? "var(--error-600)" : "var(--neutral-600)",
              border: `1px solid ${panelState === "challenging" ? "var(--error-200)" : "var(--neutral-200)"}`,
            }}
          >
            <Flag style={{ width: 11, height: 11 }} />
            Challenge
          </button>

          {/* Approve button */}
          <button
            type="button"
            onClick={handleApprove}
            disabled={isLoading}
            aria-label="Mark this estimate as accurate"
            className="flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors disabled:opacity-50"
            style={{
              backgroundColor: "var(--neutral-100)",
              color: "var(--neutral-600)",
              border: "1px solid var(--neutral-200)",
            }}
          >
            <ThumbsUp style={{ width: 11, height: 11 }} />
            Looks right
          </button>

          {/* Show/hide justification toggle */}
          {justification && (
            <button
              type="button"
              onClick={() => setShowJustification((v) => !v)}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs ml-auto"
              style={{ color: "var(--primary-600)" }}
            >
              {showJustification ? (
                <>
                  <ChevronUp style={{ width: 11, height: 11 }} />
                  Hide reasoning
                </>
              ) : (
                <>
                  <ChevronDown style={{ width: 11, height: 11 }} />
                  Show reasoning
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Approved state */}
      {panelState === "approved" && (
        <div
          className="flex items-center gap-1.5 mt-2 text-xs"
          style={{ color: "var(--success-600)" }}
        >
          <Check style={{ width: 12, height: 12 }} />
          Marked as accurate
        </div>
      )}

      {/* Justification panel */}
      {showJustification && justification && (
        <div
          className="mt-2 rounded-md p-3 text-xs leading-relaxed"
          style={{
            backgroundColor: "var(--neutral-50, #f8f9fa)",
            border: "1px solid var(--neutral-200)",
            color: "var(--neutral-700)",
          }}
        >
          <p
            className="font-semibold mb-1.5 uppercase tracking-wide"
            style={{ fontSize: "10px", color: "var(--neutral-500)" }}
          >
            Gemini&apos;s reasoning
          </p>
          <p style={{ whiteSpace: "pre-wrap" }}>{justification}</p>
        </div>
      )}

      {/* Revision notice */}
      {panelState === "revised" && revisionNote && (
        <div
          className="mt-2 rounded-md px-3 py-2 text-xs flex items-center gap-2"
          style={{
            backgroundColor: "var(--primary-100)",
            border: "1px solid var(--primary-200)",
            color: "var(--primary-700)",
          }}
        >
          <Check style={{ width: 12, height: 12, flexShrink: 0 }} />
          {revisionNote}
        </div>
      )}

      {/* General error (e.g. justify API error) */}
      {errorMsg && panelState === "idle" && (
        <p className="mt-1 text-xs" style={{ color: "var(--error-600)" }} role="alert">
          {errorMsg}
        </p>
      )}

      {/* Challenge form */}
      {panelState === "challenging" && (
        <form
          onSubmit={(e) => void handleChallengeSubmit(e)}
          className="mt-2 rounded-md p-3"
          style={{
            backgroundColor: "var(--error-50, #fff5f5)",
            border: "1px solid var(--error-200)",
          }}
        >
          <p
            className="font-semibold mb-2"
            style={{ fontSize: "var(--text-caption)", color: "var(--error-700)" }}
          >
            What&apos;s wrong with this estimate?
          </p>

          {/* Reason dropdown */}
          <select
            value={challengeReason}
            onChange={(e) => setChallengeReason(e.target.value as ChallengeReason)}
            className="w-full rounded-md px-2 py-1.5 mb-2"
            style={{
              fontSize: "var(--text-caption)",
              border: "1px solid var(--neutral-300)",
              color: "var(--neutral-800)",
              backgroundColor: "white",
            }}
            aria-label="Challenge reason"
          >
            {CHALLENGE_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>

          {/* Optional note */}
          <textarea
            value={userNote}
            onChange={(e) => setUserNote(e.target.value)}
            placeholder="Optional: add context or the correct value..."
            rows={2}
            maxLength={1000}
            className="w-full rounded-md px-2 py-1.5 mb-2 resize-none"
            style={{
              fontSize: "var(--text-caption)",
              border: "1px solid var(--neutral-300)",
              color: "var(--neutral-800)",
              backgroundColor: "white",
            }}
          />

          {/* Ask revision checkbox */}
          <label
            className="flex items-center gap-2 mb-3 cursor-pointer"
            style={{ fontSize: "var(--text-caption)", color: "var(--neutral-700)" }}
          >
            <input
              type="checkbox"
              checked={askRevise}
              onChange={(e) => setAskRevise(e.target.checked)}
              className="rounded"
            />
            Ask Gemini to revise this card
          </label>

          {errorMsg && (
            <p
              className="mb-2 text-xs"
              style={{ color: "var(--error-600)" }}
            >
              {errorMsg}
            </p>
          )}

          <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={challengeSubmitting}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-60"
            style={{
              backgroundColor: "var(--error-600)",
              color: "white",
            }}
          >
            {challengeSubmitting ? (
              <>
                <Loader2 style={{ width: 11, height: 11 }} className="animate-spin" />
                {askRevise ? "Revising..." : "Saving..."}
              </>
            ) : (
              "Submit challenge"
            )}
          </button>
            <button
              type="button"
              onClick={() => { setPanelState("idle"); setErrorMsg(null); }}
              className="rounded-md px-3 py-1.5 text-xs"
              style={{ color: "var(--neutral-600)" }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
