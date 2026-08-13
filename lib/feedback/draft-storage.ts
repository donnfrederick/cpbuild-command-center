/**
 * Feedback form draft persistence.
 *
 * Saves in-progress form state to localStorage so the form can be restored
 * after an accidental close or navigation — the common field scenario where
 * a user is mid-report and the browser gets dismissed.
 *
 * Only fully-uploaded screenshot URLs are persisted (raw File blobs cannot
 * be serialised). Drafts older than 24 h are silently discarded on load.
 */

export const FEEDBACK_DRAFT_KEY = "cc-feedback-draft-v1";

/** How long a draft stays valid before being silently discarded. */
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface FeedbackDraft {
  type: "BUG" | "FEATURE_REQUEST";
  title: string;
  description: string;
  /** Signed Supabase URLs (or local-dev URLs) for already-uploaded screenshots. */
  screenshotUrls: string[];
  pageUrl: string | null;
  savedAt: number;
}

/**
 * Persist a draft. Silently swallows storage errors (private browsing,
 * quota exceeded, etc.) so it never breaks the submission flow.
 */
export function saveFeedbackDraft(draft: FeedbackDraft): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(FEEDBACK_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* storage unavailable */
  }
}

/**
 * Load a saved draft. Returns null when there is no draft, when it is
 * malformed, or when it has expired (> 24 h old).
 */
export function loadFeedbackDraft(): FeedbackDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(FEEDBACK_DRAFT_KEY);
    if (!raw) return null;

    const draft = JSON.parse(raw) as Partial<FeedbackDraft>;

    if (
      typeof draft.savedAt !== "number" ||
      Date.now() - draft.savedAt > DRAFT_TTL_MS
    ) {
      clearFeedbackDraft();
      return null;
    }

    return {
      type:
        draft.type === "BUG" || draft.type === "FEATURE_REQUEST"
          ? draft.type
          : "BUG",
      title: typeof draft.title === "string" ? draft.title : "",
      description: typeof draft.description === "string" ? draft.description : "",
      screenshotUrls: Array.isArray(draft.screenshotUrls)
        ? (draft.screenshotUrls as unknown[]).filter(
            (u): u is string => typeof u === "string",
          )
        : [],
      pageUrl:
        typeof draft.pageUrl === "string" ? draft.pageUrl : null,
      savedAt: draft.savedAt,
    };
  } catch {
    return null;
  }
}

/**
 * Remove any saved draft. Safe to call even if no draft exists.
 */
export function clearFeedbackDraft(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(FEEDBACK_DRAFT_KEY);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Returns true when a draft has enough content to be worth offering a restore.
 * A draft with only the default type set is not worth showing the banner.
 */
export function hasMeaningfulDraftContent(draft: FeedbackDraft): boolean {
  return (
    draft.title.trim().length > 0 ||
    draft.description.trim().length > 0 ||
    draft.screenshotUrls.length > 0
  );
}

/**
 * Human-readable relative time label for the draft age.
 * e.g. "just now", "3 minutes ago", "2 hours ago"
 */
export function draftAgeLabel(savedAt: number): string {
  const diffMs = Date.now() - savedAt;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} ${diffMin === 1 ? "minute" : "minutes"} ago`;
  return `${diffHr} ${diffHr === 1 ? "hour" : "hours"} ago`;
}
