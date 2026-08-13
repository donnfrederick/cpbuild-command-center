import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  FEEDBACK_DRAFT_KEY,
  saveFeedbackDraft,
  loadFeedbackDraft,
  clearFeedbackDraft,
  hasMeaningfulDraftContent,
  draftAgeLabel,
  type FeedbackDraft,
} from "@/lib/feedback/draft-storage";

// ── localStorage mock ─────────────────────────────────────────────────────────

const localStorageStore: Record<string, string> = {};

const localStorageMock = {
  getItem: (key: string) => localStorageStore[key] ?? null,
  setItem: (key: string, value: string) => { localStorageStore[key] = value; },
  removeItem: (key: string) => { delete localStorageStore[key]; },
  clear: () => { Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k]); },
};

vi.stubGlobal("localStorage", localStorageMock);

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeDraft(overrides: Partial<FeedbackDraft> = {}): FeedbackDraft {
  return {
    type: "BUG",
    title: "App crashes on L5",
    description: "Opening the locations page causes a white screen.",
    screenshotUrls: [],
    pageUrl: "/en/projects/abc123/locations",
    savedAt: Date.now(),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("saveFeedbackDraft / loadFeedbackDraft", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorageMock.clear();
  });

  it("round-trips a BUG draft with text fields", () => {
    const draft = makeDraft();
    saveFeedbackDraft(draft);
    const loaded = loadFeedbackDraft();
    expect(loaded).not.toBeNull();
    expect(loaded?.type).toBe("BUG");
    expect(loaded?.title).toBe("App crashes on L5");
    expect(loaded?.description).toBe("Opening the locations page causes a white screen.");
    expect(loaded?.screenshotUrls).toEqual([]);
  });

  it("round-trips a FEATURE_REQUEST draft", () => {
    const draft = makeDraft({ type: "FEATURE_REQUEST", title: "Export to PDF" });
    saveFeedbackDraft(draft);
    const loaded = loadFeedbackDraft();
    expect(loaded?.type).toBe("FEATURE_REQUEST");
    expect(loaded?.title).toBe("Export to PDF");
  });

  it("round-trips screenshot URLs", () => {
    const urls = [
      "https://storage.example.com/feedback-screenshots/a.jpg",
      "https://storage.example.com/feedback-screenshots/b.png",
    ];
    const draft = makeDraft({ screenshotUrls: urls });
    saveFeedbackDraft(draft);
    const loaded = loadFeedbackDraft();
    expect(loaded?.screenshotUrls).toEqual(urls);
  });

  it("returns null when no draft is stored", () => {
    expect(loadFeedbackDraft()).toBeNull();
  });

  it("returns null when draft is older than 24 hours", () => {
    const oldSavedAt = Date.now() - (25 * 60 * 60 * 1000); // 25 h ago
    saveFeedbackDraft(makeDraft({ savedAt: oldSavedAt }));
    expect(loadFeedbackDraft()).toBeNull();
  });

  it("removes the stored key when an expired draft is loaded", () => {
    const oldSavedAt = Date.now() - (25 * 60 * 60 * 1000);
    saveFeedbackDraft(makeDraft({ savedAt: oldSavedAt }));
    loadFeedbackDraft(); // triggers cleanup
    expect(localStorageStore[FEEDBACK_DRAFT_KEY]).toBeUndefined();
  });

  it("returns null and does not throw when localStorage contains malformed JSON", () => {
    localStorageStore[FEEDBACK_DRAFT_KEY] = "{not: valid json}}}";
    expect(() => loadFeedbackDraft()).not.toThrow();
    expect(loadFeedbackDraft()).toBeNull();
  });

  it("sanitises unknown type value to BUG", () => {
    const raw: Record<string, unknown> = {
      type: "UNKNOWN_TYPE",
      title: "hi",
      description: "",
      screenshotUrls: [],
      pageUrl: null,
      savedAt: Date.now(),
    };
    localStorageStore[FEEDBACK_DRAFT_KEY] = JSON.stringify(raw);
    const loaded = loadFeedbackDraft();
    expect(loaded?.type).toBe("BUG");
  });

  it("filters non-string values from screenshotUrls", () => {
    const raw: Record<string, unknown> = {
      type: "BUG",
      title: "test",
      description: "",
      screenshotUrls: ["https://valid.com/a.jpg", 42, null, "https://valid.com/b.jpg"],
      pageUrl: null,
      savedAt: Date.now(),
    };
    localStorageStore[FEEDBACK_DRAFT_KEY] = JSON.stringify(raw);
    const loaded = loadFeedbackDraft();
    expect(loaded?.screenshotUrls).toEqual([
      "https://valid.com/a.jpg",
      "https://valid.com/b.jpg",
    ]);
  });

  it("accepts a draft with null pageUrl", () => {
    const draft = makeDraft({ pageUrl: null });
    saveFeedbackDraft(draft);
    const loaded = loadFeedbackDraft();
    expect(loaded?.pageUrl).toBeNull();
  });
});

describe("clearFeedbackDraft", () => {
  beforeEach(() => localStorageMock.clear());
  afterEach(() => localStorageMock.clear());

  it("removes the draft from localStorage", () => {
    saveFeedbackDraft(makeDraft());
    expect(localStorageMock.getItem(FEEDBACK_DRAFT_KEY)).not.toBeNull();
    clearFeedbackDraft();
    expect(localStorageMock.getItem(FEEDBACK_DRAFT_KEY)).toBeNull();
  });

  it("does not throw when called with no draft stored", () => {
    expect(() => clearFeedbackDraft()).not.toThrow();
  });
});

describe("hasMeaningfulDraftContent", () => {
  it("returns true when title is non-empty", () => {
    expect(hasMeaningfulDraftContent(makeDraft({ title: "Bug on L5" }))).toBe(true);
  });

  it("returns true when description is non-empty", () => {
    expect(hasMeaningfulDraftContent(makeDraft({ title: "", description: "Long desc" }))).toBe(true);
  });

  it("returns true when there are screenshot URLs", () => {
    expect(
      hasMeaningfulDraftContent(
        makeDraft({ title: "", description: "", screenshotUrls: ["https://x.com/a.jpg"] }),
      ),
    ).toBe(true);
  });

  it("returns false for a blank draft (only default type set)", () => {
    expect(
      hasMeaningfulDraftContent(makeDraft({ title: "", description: "", screenshotUrls: [] })),
    ).toBe(false);
  });

  it("returns false for a whitespace-only title and description", () => {
    expect(
      hasMeaningfulDraftContent(makeDraft({ title: "   ", description: "\t\n", screenshotUrls: [] })),
    ).toBe(false);
  });
});

describe("draftAgeLabel", () => {
  it("returns 'just now' for < 1 minute ago", () => {
    expect(draftAgeLabel(Date.now() - 30_000)).toBe("just now");
  });

  it("returns singular 'minute' for exactly 1 minute ago", () => {
    expect(draftAgeLabel(Date.now() - 60_001)).toBe("1 minute ago");
  });

  it("returns plural 'minutes' for 5 minutes ago", () => {
    expect(draftAgeLabel(Date.now() - 5 * 60_001)).toBe("5 minutes ago");
  });

  it("returns singular 'hour' for 1 hour ago", () => {
    expect(draftAgeLabel(Date.now() - 60 * 60_001)).toBe("1 hour ago");
  });

  it("returns plural 'hours' for 3 hours ago", () => {
    expect(draftAgeLabel(Date.now() - 3 * 60 * 60_001)).toBe("3 hours ago");
  });
});
