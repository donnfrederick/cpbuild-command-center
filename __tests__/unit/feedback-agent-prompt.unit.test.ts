import { describe, it, expect } from "vitest";
import {
  buildFeedbackAgentPromptMarkdown,
  type FeedbackAgentPromptReport,
  type FeedbackAgentPromptComment,
} from "@/lib/feedback-agent-prompt";

const baseReport: FeedbackAgentPromptReport = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  shortId: 25,
  title: "Add filtering",
  description: "Need filters",
  pageUrl: "https://example.com/en/feedback",
  status: "OPEN",
  type: "FEATURE_REQUEST",
  source: "IN_APP",
  createdAt: "2026-04-01T12:00:00.000Z",
  environment: "development",
  user: { name: "Pat Example", email: "pat@example.com" },
  assignee: null,
};

describe("buildFeedbackAgentPromptMarkdown()", () => {
  it("includes human ref, UUID, deep link, and metadata", () => {
    const md = buildFeedbackAgentPromptMarkdown(baseReport, [], {
      appDeepLink: "https://app.test/en/feedback/550e8400-e29b-41d4-a716-446655440000?environment=development",
    });
    expect(md).toContain("**Human reference:** FB-0025");
    expect(md).toContain("`550e8400-e29b-41d4-a716-446655440000`");
    expect(md).toContain("https://app.test/en/feedback/550e8400-e29b-41d4-a716-446655440000");
    expect(md).toContain("**Status:** OPEN");
    expect(md).toContain("**Assignee:** Unassigned");
  });

  it("renders empty description as placeholder", () => {
    const md = buildFeedbackAgentPromptMarkdown(
      { ...baseReport, description: "" },
      [],
      { appDeepLink: "https://x/y" }
    );
    expect(md).toContain("_(empty)_");
  });

  it("omits page section when pageUrl is null", () => {
    const md = buildFeedbackAgentPromptMarkdown(
      { ...baseReport, pageUrl: null },
      [],
      { appDeepLink: "https://x/y" }
    );
    expect(md).not.toContain("### Page URL");
  });

  it("lists comments in chronological order with attachment URLs", () => {
    const comments: FeedbackAgentPromptComment[] = [
      {
        body: "Second",
        createdAt: "2026-04-02T14:00:00.000Z",
        author: { name: null, email: "b@example.com" },
      },
      {
        body: "First",
        createdAt: "2026-04-02T12:00:00.000Z",
        author: { name: "Ann", email: "a@example.com" },
        attachments: [
          {
            storageUrl: "https://cdn.example/img.png",
            caption: "shot",
            mimeType: "image/png",
          },
        ],
      },
    ];
    const md = buildFeedbackAgentPromptMarkdown(baseReport, comments, { appDeepLink: "https://x/y" });
    const firstIdx = md.indexOf("Ann");
    const secondIdx = md.indexOf("b@example.com");
    expect(firstIdx).toBeGreaterThan(-1);
    expect(secondIdx).toBeGreaterThan(firstIdx);
    expect(md).toContain("https://cdn.example/img.png");
    expect(md).toContain("(image)");
  });

  it("includes admin note when present", () => {
    const md = buildFeedbackAgentPromptMarkdown(
      { ...baseReport, adminNote: "Old triage text" },
      [],
      { appDeepLink: "https://x/y" }
    );
    expect(md).toContain("Old triage text");
  });

  it("includes priority in metadata when set", () => {
    const md = buildFeedbackAgentPromptMarkdown(
      { ...baseReport, priority: "HIGH" },
      [],
      { appDeepLink: "https://x/y" }
    );
    expect(md).toContain("**Priority:** HIGH");
  });

  it("shows unset priority placeholder when null", () => {
    const md = buildFeedbackAgentPromptMarkdown(
      { ...baseReport, priority: null },
      [],
      { appDeepLink: "https://x/y" }
    );
    expect(md).toContain("**Priority:** _(not set)_");
  });
});
