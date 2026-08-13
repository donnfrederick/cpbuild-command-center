import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { PERMISSIONS } from "@/lib/permissions";
import {
  resetEmailOutboundRateLimitForTests,
  feedbackNotifyActorScopeKey,
  tryRecordEmailOutbound,
  FEEDBACK_NOTIFY_ACTOR_MAX,
  FEEDBACK_NOTIFY_ACTOR_WINDOW_MS,
} from "@/lib/email-outbound-rate-limit";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockCreate = vi.fn();
const mockFindMany = vi.fn();
const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockFeedbackMentionFindMany = vi.fn();
const mockFeedbackMentionFindUnique = vi.fn();
const mockFeedbackMentionUpsert = vi.fn();
const mockFeedbackCommentFindMany = vi.fn();
const mockFeedbackCommentFindFirst = vi.fn();
const mockFeedbackCommentCreate = vi.fn();
const mockFeedbackCommentUpdate = vi.fn();
const mockNotificationCreateMany = vi.fn();
const mockNotificationCreate = vi.fn().mockResolvedValue({});
const mockTransaction = vi.fn();
const mockUserFindUnique = vi.fn();
const mockUserFindMany = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    feedbackReport: {
      create: (...args: unknown[]) => mockCreate(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
    },
    feedbackMention: {
      findMany: (...args: unknown[]) => mockFeedbackMentionFindMany(...args),
      findUnique: (...args: unknown[]) => mockFeedbackMentionFindUnique(...args),
      upsert: (...args: unknown[]) => mockFeedbackMentionUpsert(...args),
    },
    feedbackComment: {
      findMany: (...args: unknown[]) => mockFeedbackCommentFindMany(...args),
      findFirst: (...args: unknown[]) => mockFeedbackCommentFindFirst(...args),
      create: (...args: unknown[]) => mockFeedbackCommentCreate(...args),
      update: (...args: unknown[]) => mockFeedbackCommentUpdate(...args),
    },
    notification: {
      create: (...args: unknown[]) => mockNotificationCreate(...args),
      createMany: (...args: unknown[]) => mockNotificationCreateMany(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      findFirst: vi.fn(),
      findMany: (...args: unknown[]) => mockUserFindMany(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

const mockGetEffectiveSession = vi.fn();
vi.mock("@/lib/masquerade", () => ({
  getEffectiveSession: () => mockGetEffectiveSession(),
}));

const mockResolveSessionToDbUserId = vi.fn();
vi.mock("@/lib/session-db-user", () => ({
  resolveSessionToDbUserId: (user: { id: string; email?: string | null }) =>
    mockResolveSessionToDbUserId(user),
}));

/** `vi.clearAllMocks()` clears mock implementations — re-apply after every clear. */
function restoreSessionDbUserIdMockPassthrough() {
  mockResolveSessionToDbUserId.mockImplementation(async (u: { id: string }) => u.id);
}

const mockProxyProdFeedbackPath = vi.fn();
vi.mock("@/lib/feedback-prod-proxy", () => ({
  proxyProdFeedbackPath: (...args: unknown[]) => mockProxyProdFeedbackPath(...args),
}));

const mockSendFeedbackNotificationEmail = vi.fn().mockResolvedValue(undefined);
const mockSendFeedbackStatusEmail = vi.fn().mockResolvedValue(undefined);
const mockSendMentionEmail = vi.fn().mockResolvedValue(undefined);
const mockSendFeedbackAssignedEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/email", () => ({
  sendFeedbackNotificationEmail: (...args: unknown[]) =>
    mockSendFeedbackNotificationEmail(...args),
  sendFeedbackStatusEmail: (...args: unknown[]) =>
    mockSendFeedbackStatusEmail(...args),
  sendFeedbackAssignedEmail: (...args: unknown[]) =>
    mockSendFeedbackAssignedEmail(...args),
  sendMentionEmail: (...args: unknown[]) => mockSendMentionEmail(...args),
}));

// ── Import handlers after mocks ────────────────────────────────────────────────

restoreSessionDbUserIdMockPassthrough();

const { POST, GET } = await import("@/app/api/feedback/route");
const { GET: GET_BY_ID, PATCH, DELETE } = await import("@/app/api/feedback/[id]/route");
const { GET: GET_COMMENTS, POST: POST_COMMENT } = await import(
  "@/app/api/feedback/[id]/comments/route"
);
const { PATCH: PATCH_COMMENT, DELETE: DELETE_COMMENT } = await import(
  "@/app/api/feedback/[id]/comments/[cid]/route"
);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** PATCH body assigneeId must satisfy updateFeedbackSchema (z.string().cuid()). */
const CUID_DEV_USER = "cklqy5a0d0000l6587q2v8n2r";
const CUID_PM_USER = "cklqy5a0d0000l6587q2v8n2s";
const CUID_ADMIN_USER = "cklqy5a0d0000l6587q2v8n2t";

function adminSession() {
  return { user: { id: "admin-1", email: "admin@test.com", name: "Admin", role: "ADMIN" } };
}

function memberSession() {
  return { user: { id: "member-1", email: "member@test.com", name: "Member", role: "MEMBER" } };
}

function memberWithFeedbackInboxOverrideSession() {
  return {
    user: {
      id: "member-1",
      email: "member@test.com",
      name: "Member",
      role: "MEMBER",
      specialPermissions: [PERMISSIONS.SPECIAL_ACCESS_FEEDBACK_INBOX],
    },
  };
}

function developerSession() {
  return {
    user: { id: CUID_DEV_USER, email: "dev@test.com", name: "Developer", role: "DEVELOPER" },
  };
}

function effectiveFrom(
  session: {
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      specialPermissions?: string[];
    };
  } | null
) {
  if (!session) return null;
  return { ...session, masquerade: null, rolePreview: null };
}

function makeRequest(method: string, body?: unknown, url = "http://localhost/api/feedback") {
  return new Request(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

function nextReq(url: string, init?: RequestInit) {
  return new NextRequest(url, init);
}

const SAMPLE_REPORT = {
  id: "rpt-1",
  shortId: 1,
  source: "IN_APP" as const,
  userId: "member-1",
  assigneeId: null as string | null,
  assignee: null as { id: string; name: string | null; email: string } | null,
  type: "BUG" as const,
  title: "Button doesn't work",
  description: "When I click Submit nothing happens",
  screenshot: null,
  videoUrl: null,
  pageUrl: "http://app/en/projects",
  status: "OPEN" as const,
  priority: null,
  adminNote: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  user: { id: "member-1", name: "Member", email: "member@test.com" },
};

const REPORT_WITH_COUNT = {
  ...SAMPLE_REPORT,
  _count: { comments: 0 },
  canonicalDuplicates: [],
};

// ── POST /api/feedback ────────────────────────────────────────────────────────

describe("POST /api/feedback", () => {
  const originalSupabaseUrl = process.env.SUPABASE_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    restoreSessionDbUserIdMockPassthrough();
    resetEmailOutboundRateLimitForTests();
    mockSendFeedbackNotificationEmail.mockResolvedValue(undefined);
    process.env.SUPABASE_URL = "https://supabase.co";
  });

  afterEach(() => {
    if (originalSupabaseUrl === undefined) {
      delete process.env.SUPABASE_URL;
    } else {
      process.env.SUPABASE_URL = originalSupabaseUrl;
    }
  });

  it("returns 401 when not authenticated", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(null));
    const res = await POST(makeRequest("POST", {
      type: "BUG",
      title: "Test",
      description: "A test bug",
    }) as never);
    expect(res.status).toBe(401);
  });

  it("creates feedback for authenticated user", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(memberSession()));
    mockCreate.mockResolvedValue({ ...SAMPLE_REPORT, id: "new-1" });

    const res = await POST(makeRequest("POST", {
      type: "BUG",
      title: "Button doesn't work",
      description: "When I click Submit nothing happens",
      pageUrl: "http://app/en/projects",
    }) as never);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("new-1");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "member-1",
          type: "BUG",
          title: "Button doesn't work",
        }),
      })
    );
  });

  it("includes shortId in POST response", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(memberSession()));
    mockCreate.mockResolvedValue({ ...SAMPLE_REPORT, id: "new-2", shortId: 42 });

    const res = await POST(makeRequest("POST", {
      type: "FEATURE_REQUEST",
      title: "Add dark mode",
      description: "Would love a dark mode option",
    }) as never);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.shortId).toBe(42);
  });

  it("returns 400 for invalid input (missing title)", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(memberSession()));

    const res = await POST(makeRequest("POST", {
      type: "BUG",
      description: "Some description",
    }) as never);

    expect(res.status).toBe(400);
  });

  it("accepts screenshots array and persists URLs", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(memberSession()));
    mockCreate.mockResolvedValue({ ...SAMPLE_REPORT, id: "ss-1", screenshots: ["https://supabase.co/storage/v1/object/sign/field-media/feedback-screenshots/a.png?token=1", "https://supabase.co/storage/v1/object/sign/field-media/feedback-screenshots/b.jpg?token=2"] });

    const res = await POST(makeRequest("POST", {
      type: "BUG",
      title: "Images attached",
      description: "See the attached screenshots",
      screenshots: [
        "https://supabase.co/storage/v1/object/sign/field-media/feedback-screenshots/a.png?token=1",
        "https://supabase.co/storage/v1/object/sign/field-media/feedback-screenshots/b.jpg?token=2",
      ],
    }) as never);

    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          screenshots: [
            "https://supabase.co/storage/v1/object/sign/field-media/feedback-screenshots/a.png?token=1",
            "https://supabase.co/storage/v1/object/sign/field-media/feedback-screenshots/b.jpg?token=2",
          ],
        }),
      })
    );
  });

  it("accepts local field-media screenshot URLs from upload-screenshot (no Supabase)", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(memberSession()));
    const localUrl =
      "http://localhost:3002/api/upload/field-media/file?key=field-media%2Ffeedback-screenshots%2Fabc.png";
    mockCreate.mockResolvedValue({ ...SAMPLE_REPORT, id: "ss-local", screenshots: [localUrl] });

    const res = await POST(makeRequest("POST", {
      type: "BUG",
      title: "Local dev screenshot",
      description: "Uploaded without Supabase service role key",
      screenshots: [localUrl],
    }) as never);

    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ screenshots: [localUrl] }),
      }),
    );
  });

  it("accepts submission with no screenshots (empty array — mirrors null/absent from external system)", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(memberSession()));
    mockCreate.mockResolvedValue({ ...SAMPLE_REPORT, id: "ss-empty", screenshots: [] });

    const res = await POST(makeRequest("POST", {
      type: "BUG",
      title: "No screenshot",
      description: "Reproduced without an image",
    }) as never);

    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ screenshots: [] }),
      })
    );
  });

  it("returns 400 when screenshots exceeds 10 items", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(memberSession()));

    const tooMany = Array.from({ length: 11 }, (_, i) =>
      `https://supabase.co/storage/v1/object/sign/field-media/feedback-screenshots/${i}.png?token=${i}`
    );
    const res = await POST(makeRequest("POST", {
      type: "BUG",
      title: "Too many",
      description: "Exceeded cap",
      screenshots: tooMany,
    }) as never);

    expect(res.status).toBe(400);
  });

  it("returns 400 when a screenshots entry is not a valid URL", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(memberSession()));

    const res = await POST(makeRequest("POST", {
      type: "BUG",
      title: "Bad URL",
      description: "Not a real URL",
      screenshots: ["not-a-url"],
    }) as never);

    expect(res.status).toBe(400);
  });

  it("returns 400 when a screenshots entry is not a feedback-screenshots storage URL", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(memberSession()));

    const res = await POST(makeRequest("POST", {
      type: "BUG",
      title: "Third-party image",
      description: "External URL injection attempt",
      screenshots: ["https://evil.example.com/image.png"],
    }) as never);

    expect(res.status).toBe(400);
  });

  it("fires notification email after successful creation", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(memberSession()));
    mockCreate.mockResolvedValue({ ...SAMPLE_REPORT, id: "notify-1" });
    mockSendFeedbackNotificationEmail.mockResolvedValue(undefined);

    const res = await POST(makeRequest("POST", {
      type: "BUG",
      title: "Button doesn't work",
      description: "When I click Submit nothing happens",
      pageUrl: "http://app/en/projects",
    }) as never);

    expect(res.status).toBe(201);
    await new Promise((r) => setTimeout(r, 0));
    expect(mockSendFeedbackNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        submitterEmail: "member@test.com",
        type: "BUG",
        title: "Button doesn't work",
        feedbackId: "notify-1",
      })
    );
  });

  it("skips inbox notification email when submitter exceeds hourly cap", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(memberSession()));
    const lim = { windowMs: FEEDBACK_NOTIFY_ACTOR_WINDOW_MS, max: FEEDBACK_NOTIFY_ACTOR_MAX };
    for (let i = 0; i < FEEDBACK_NOTIFY_ACTOR_MAX; i++) {
      tryRecordEmailOutbound(feedbackNotifyActorScopeKey("member-1"), lim);
    }
    mockCreate.mockResolvedValueOnce({ ...SAMPLE_REPORT, id: "rate-cap-1" });
    mockSendFeedbackNotificationEmail.mockClear();

    const res = await POST(
      makeRequest("POST", {
        type: "BUG",
        title: "T",
        description: "D",
      }) as never
    );

    expect(res.status).toBe(201);
    await new Promise((r) => setTimeout(r, 0));
    expect(mockSendFeedbackNotificationEmail).not.toHaveBeenCalled();
  });

  it("does not fail submission when notification email throws", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(memberSession()));
    mockCreate.mockResolvedValue({ ...SAMPLE_REPORT, id: "email-fail-1" });
    mockSendFeedbackNotificationEmail.mockRejectedValue(new Error("SMTP down"));

    const res = await POST(makeRequest("POST", {
      type: "FEATURE_REQUEST",
      title: "Dark mode",
      description: "Please add a dark mode option",
    }) as never);

    expect(res.status).toBe(201);
  });

  it("returns 400 for invalid feedback type", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(memberSession()));

    const res = await POST(makeRequest("POST", {
      type: "UNKNOWN_TYPE",
      title: "Test",
      description: "A test bug",
    }) as never);

    expect(res.status).toBe(400);
  });

  it("accepts FEATURE_REQUEST type", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(memberSession()));
    mockCreate.mockResolvedValue({ ...SAMPLE_REPORT, type: "FEATURE_REQUEST", id: "feat-1" });

    const res = await POST(makeRequest("POST", {
      type: "FEATURE_REQUEST",
      title: "Add export button",
      description: "I need to export the UPM to PDF",
    }) as never);

    expect(res.status).toBe(201);
  });

  it("persists aiAssisted + aiAssistMetadata when supplied", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(memberSession()));
    mockCreate.mockResolvedValue({ ...SAMPLE_REPORT, id: "ai-1", aiAssisted: true });

    const metadata = {
      version: 1 as const,
      aiModel: "gemini-2.5-flash",
      sessionId: "sess-42",
      transcript: [],
      finalReport: {
        kind: "BUG" as const,
        suggestedTitle: "Filter button crashes Projects page",
        suggestedDescription: "Steps: open projects, click filter.",
        summary: "Filter button crashes.",
      },
      generatedAt: new Date().toISOString(),
    };

    const res = await POST(makeRequest("POST", {
      type: "BUG",
      title: metadata.finalReport.suggestedTitle,
      description: metadata.finalReport.suggestedDescription,
      aiAssisted: true,
      aiAssistMetadata: metadata,
    }) as never);

    expect(res.status).toBe(201);
    const call = mockCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data.aiAssisted).toBe(true);
    // Schema defaults fill in inputModes: ["text"], videoRef: null,
    // calibrationRounds: 0, and finalReport.{proactivePrompts, imagePrompt}
    // when omitted, so the persisted payload is `metadata` + those defaults.
    expect(call.data.aiAssistMetadata).toEqual({
      ...metadata,
      finalReport: {
        ...metadata.finalReport,
        proactivePrompts: [],
        imagePrompt: null,
      },
      inputModes: ["text"],
      videoRef: null,
      calibrationRounds: 0,
    });
  });

  it("persists videoRef + inputModes inside aiAssistMetadata when present", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(memberSession()));
    mockCreate.mockResolvedValue({ ...SAMPLE_REPORT, id: "ai-video-1", aiAssisted: true });

    const videoRef = {
      fileUri: "https://generativelanguage.googleapis.com/v1beta/files/abc123",
      mimeType: "video/webm",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    };
    const metadata = {
      version: 1 as const,
      aiModel: "gemini-2.5-flash",
      sessionId: "sess-video-1",
      transcript: [],
      finalReport: {
        kind: "BUG" as const,
        suggestedTitle: "Save button unresponsive on Projects",
        suggestedDescription:
          "Clicking Save on the Projects page does nothing — no error, no success.",
        summary: "Save is broken.",
        bugDetails: {
          stepsToReproduce: ["Open Projects", "Click Save"],
          expectedBehavior: "Project is saved",
          actualBehavior: "Nothing happens",
        },
      },
      generatedAt: new Date().toISOString(),
      inputModes: ["text", "video"] as const,
      videoRef,
    };

    const res = await POST(makeRequest("POST", {
      type: "BUG",
      title: metadata.finalReport.suggestedTitle,
      description: metadata.finalReport.suggestedDescription,
      aiAssisted: true,
      aiAssistMetadata: metadata,
    }) as never);

    expect(res.status).toBe(201);
    const call = mockCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    const persisted = call.data.aiAssistMetadata as {
      videoRef?: typeof videoRef;
      inputModes?: string[];
    };
    expect(persisted.videoRef).toEqual(videoRef);
    expect(persisted.inputModes).toEqual(["text", "video"]);
  });

  it("forces aiAssistMetadata to null when aiAssisted is false", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(memberSession()));
    mockCreate.mockResolvedValue({ ...SAMPLE_REPORT, id: "ai-2" });

    const res = await POST(makeRequest("POST", {
      type: "BUG",
      title: "Normal bug",
      description: "Normal description.",
      aiAssisted: false,
    }) as never);

    expect(res.status).toBe(201);
    const call = mockCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data.aiAssisted).toBe(false);
    // `aiAssistMetadata` is `Json?` (nullable) in the schema. For absent audit
    // payload we want SQL NULL, which Prisma expresses as `Prisma.DbNull` —
    // NOT `Prisma.JsonNull` (which stores the JSON literal `null` instead).
    expect(call.data.aiAssistMetadata).toBe(Prisma.DbNull);
  });

  it("rejects aiAssistMetadata when aiAssisted is false", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(memberSession()));

    const res = await POST(makeRequest("POST", {
      type: "BUG",
      title: "Normal bug",
      description: "Normal description.",
      aiAssisted: false,
      aiAssistMetadata: {
        version: 1,
        aiModel: "gemini-2.5-flash",
        sessionId: "x",
        transcript: [],
        finalReport: {
          kind: "BUG",
          suggestedTitle: "x",
          suggestedDescription: "x",
        },
        generatedAt: new Date().toISOString(),
      },
    }) as never);

    expect(res.status).toBe(400);
  });

  it("rejects malformed aiAssistMetadata when aiAssisted is true", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(memberSession()));

    const res = await POST(makeRequest("POST", {
      type: "BUG",
      title: "Bug",
      description: "Desc",
      aiAssisted: true,
      aiAssistMetadata: { version: 99 },
    }) as never);

    expect(res.status).toBe(400);
  });

  it("rejects aiAssisted=true when aiAssistMetadata is missing", async () => {
    // Audit guard — the DB should never end up with a row marked AI-assisted
    // but no captured conversation. If the client flags aiAssisted=true we
    // require the full metadata payload alongside it.
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(memberSession()));

    const res = await POST(makeRequest("POST", {
      type: "BUG",
      title: "Bug",
      description: "Desc",
      aiAssisted: true,
    }) as never);

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; details?: Record<string, string[]> };
    expect(body.error).toBe("Invalid input");
    expect(body.details?.aiAssistMetadata?.[0]).toMatch(/required when aiAssisted/i);
  });

  it("maps dev-user session to a real User.id before create (FK-safe dev bypass)", async () => {
    mockResolveSessionToDbUserId.mockResolvedValue("admin-1");
    mockGetEffectiveSession.mockResolvedValue(
      effectiveFrom({
        user: {
          id: "dev-user",
          email: "dev@cpbuild.com",
          name: "Dev User",
          role: "ADMIN",
        },
      }),
    );
    mockCreate.mockResolvedValue({
      ...SAMPLE_REPORT,
      id: "dev-fb-1",
      userId: "admin-1",
      user: { name: "Admin", email: "admin@test.com" },
    });

    const res = await POST(makeRequest("POST", {
      type: "BUG",
      title: "Bypass bug",
      description: "Submitted under synthetic dev-user",
    }) as never);

    expect(res.status).toBe(201);
    expect(mockResolveSessionToDbUserId).toHaveBeenCalledWith(
      expect.objectContaining({ id: "dev-user", email: "dev@cpbuild.com" }),
    );
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "admin-1" }),
      }),
    );
  });

  it("returns 500 when no database user can be resolved for the session", async () => {
    mockResolveSessionToDbUserId.mockResolvedValue(null);
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(memberSession()));

    const res = await POST(makeRequest("POST", {
      type: "BUG",
      title: "Orphan",
      description: "No user row",
    }) as never);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("No users found");
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

// ── GET /api/feedback ─────────────────────────────────────────────────────────

describe("GET /api/feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreSessionDbUserIdMockPassthrough();
    mockFeedbackMentionFindMany.mockResolvedValue([]);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(null));
    const res = await GET(makeRequest("GET") as never);
    expect(res.status).toBe(401);
  });

  it("returns all reports for admin", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(adminSession()));
    mockFindMany.mockResolvedValue([REPORT_WITH_COUNT]);

    const res = await GET(makeRequest("GET") as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reports).toHaveLength(1);
    expect(body.prodFeed).toBe("off");
    // Admin sees all non-deleted, non-duplicate reports
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { not: "DELETED" },
          duplicateOf: { is: null },
        }),
      })
    );
    expect(body.reports[0].commentsCount).toBe(0);
  });

  it("returns all reports for DEVELOPER (feedback inbox access)", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(developerSession()));
    mockFindMany.mockResolvedValue([REPORT_WITH_COUNT]);

    const res = await GET(makeRequest("GET") as never);
    expect(res.status).toBe(200);
    await res.json();
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { not: "DELETED" },
          duplicateOf: { is: null },
        }),
      })
    );
  });

  it("includes shortId in GET list items", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(adminSession()));
    mockFindMany.mockResolvedValue([{ ...REPORT_WITH_COUNT, shortId: 7 }]);

    const res = await GET(makeRequest("GET") as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reports[0].shortId).toBe(7);
  });

  it("returns only own reports for member with no mentions", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(memberSession()));
    mockFeedbackMentionFindMany.mockResolvedValue([]);
    mockFindMany.mockResolvedValue([REPORT_WITH_COUNT]);

    const res = await GET(makeRequest("GET") as never);
    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ userId: "member-1" }],
          status: { not: "DELETED" },
          duplicateOf: { is: null },
        }),
      })
    );
  });

  it("includes mentioned reports for member via OR filter", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(memberSession()));
    mockFeedbackMentionFindMany.mockResolvedValue([{ feedbackReportId: "other-1" }]);
    mockFindMany.mockResolvedValue([REPORT_WITH_COUNT]);

    const res = await GET(makeRequest("GET") as never);
    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ userId: "member-1" }, { id: { in: ["other-1"] } }],
          status: { not: "DELETED" },
          duplicateOf: { is: null },
        }),
      })
    );
  });
});

// ── GET /api/feedback/[id] ────────────────────────────────────────────────────

describe("GET /api/feedback/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreSessionDbUserIdMockPassthrough();
    mockProxyProdFeedbackPath.mockResolvedValue(null);
  });

  const makeParams = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

  it("maps non-404 prod proxy failures to 503 and passes through body", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(adminSession()));
    mockProxyProdFeedbackPath.mockResolvedValue(
      new Response(JSON.stringify({ error: "Bridge not configured" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      })
    );

    const res = await GET_BY_ID(
      nextReq("http://localhost/api/feedback/rpt-prod?environment=production"),
      makeParams("rpt-prod")
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("Bridge not configured");
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when prod proxy returns 404", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(adminSession()));
    mockProxyProdFeedbackPath.mockResolvedValue(
      new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    );

    const res = await GET_BY_ID(
      nextReq("http://localhost/api/feedback/missing?environment=production"),
      makeParams("missing")
    );
    expect(res.status).toBe(404);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns 503 when prod proxy fetch throws", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(adminSession()));
    mockProxyProdFeedbackPath.mockRejectedValue(new Error("network down"));

    const res = await GET_BY_ID(
      nextReq("http://localhost/api/feedback/rpt-x?environment=production"),
      makeParams("rpt-x")
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("Service unavailable");
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when member cannot view report", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(memberSession()));
    mockFindUnique.mockResolvedValue({
      ...REPORT_WITH_COUNT,
      userId: "someone-else",
      user: { id: "someone-else", name: "Other", email: "o@test.com" },
    });
    mockFeedbackMentionFindUnique.mockResolvedValue(null);

    const res = await GET_BY_ID(nextReq("http://localhost/api/feedback/x"), makeParams("x"));
    expect(res.status).toBe(404);
  });

  it("returns report when member is submitter", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(memberSession()));
    mockFindUnique.mockResolvedValue({
      ...REPORT_WITH_COUNT,
      userId: "member-1",
      user: { id: "member-1", name: "Member", email: "member@test.com" },
    });

    const res = await GET_BY_ID(nextReq("http://localhost/api/feedback/rpt-1"), makeParams("rpt-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("rpt-1");
    expect(body.commentsCount).toBe(0);
  });
});

// ── PATCH /api/feedback/[id] ──────────────────────────────────────────────────

describe("PATCH /api/feedback/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreSessionDbUserIdMockPassthrough();
  });

  const makeParams = (id: string) =>
    ({ params: Promise.resolve({ id }) }) as never;

  it("returns 401 when not authenticated", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(null));
    const res = await PATCH(
      makeRequest("PATCH", { status: "IN_PROGRESS" }) as never,
      makeParams("rpt-1")
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when member tries to triage (status)", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(memberSession()));
    mockFindUnique.mockResolvedValue(SAMPLE_REPORT);
    mockFeedbackMentionFindUnique.mockResolvedValue(null);
    const res = await PATCH(
      makeRequest("PATCH", { status: "IN_PROGRESS" }) as never,
      makeParams("rpt-1")
    );
    expect(res.status).toBe(403);
  });

  it("allows member with feedback:inbox special permission to set priority", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(memberWithFeedbackInboxOverrideSession()));
    mockFindUnique.mockResolvedValue(SAMPLE_REPORT);
    mockFeedbackMentionFindUnique.mockResolvedValue(null);
    mockUpdate.mockResolvedValue({ ...SAMPLE_REPORT, priority: "MEDIUM" as const });

    const res = await PATCH(
      makeRequest("PATCH", { priority: "MEDIUM" }) as never,
      makeParams("rpt-1")
    );

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("returns 400 when no fields to update", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(adminSession()));
    mockFindUnique.mockResolvedValue(SAMPLE_REPORT);
    mockFeedbackMentionFindUnique.mockResolvedValue(null);
    const res = await PATCH(makeRequest("PATCH", {}) as never, makeParams("rpt-1"));
    expect(res.status).toBe(400);
  });

  it("allows admin to update status", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(adminSession()));
    mockFindUnique.mockResolvedValue(SAMPLE_REPORT);
    mockFeedbackMentionFindUnique.mockResolvedValue(null);
    mockUpdate.mockResolvedValue({ ...SAMPLE_REPORT, status: "IN_PROGRESS" });

    const res = await PATCH(
      makeRequest("PATCH", { status: "IN_PROGRESS" }) as never,
      makeParams("rpt-1")
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("IN_PROGRESS");
  });

  it("returns 404 when report not found", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(adminSession()));
    mockFindUnique.mockResolvedValue(null);

    const res = await PATCH(
      makeRequest("PATCH", { status: "RESOLVED" }) as never,
      makeParams("nonexistent")
    );
    expect(res.status).toBe(404);
  });

  it("allows admin to add a note", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(adminSession()));
    mockFindUnique.mockResolvedValue(SAMPLE_REPORT);
    mockFeedbackMentionFindUnique.mockResolvedValue(null);
    mockUpdate.mockResolvedValue({ ...SAMPLE_REPORT, adminNote: "Working on it" });

    const res = await PATCH(
      makeRequest("PATCH", { adminNote: "Working on it" }) as never,
      makeParams("rpt-1")
    );
    expect(res.status).toBe(200);
  });

  const devUser = {
    id: CUID_DEV_USER,
    email: "dev@test.com",
    name: "Dev User",
    role: { code: "DEVELOPER" as const },
  };

  it("allows submitter to assign a developer", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(memberSession()));
    mockFindUnique.mockResolvedValue(SAMPLE_REPORT);
    mockFeedbackMentionFindUnique.mockResolvedValue(null);
    mockUserFindUnique.mockResolvedValue(devUser);
    mockUpdate.mockResolvedValue({
      ...SAMPLE_REPORT,
      assigneeId: CUID_DEV_USER,
      assignee: { id: CUID_DEV_USER, name: "Dev User", email: "dev@test.com" },
    });

    const res = await PATCH(
      makeRequest("PATCH", { assigneeId: CUID_DEV_USER }) as never,
      makeParams("rpt-1")
    );
    expect(res.status).toBe(200);
    expect(mockNotificationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: CUID_DEV_USER,
        feedbackId: "rpt-1",
        type: "FEEDBACK_ASSIGNED",
        actorId: "member-1",
      }),
    });
    expect(mockSendFeedbackAssignedEmail).toHaveBeenCalled();
  });

  it("returns 400 when assignee role is not allowed", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(memberSession()));
    mockFindUnique.mockResolvedValue(SAMPLE_REPORT);
    mockFeedbackMentionFindUnique.mockResolvedValue(null);
    mockUserFindUnique.mockResolvedValue({
      id: CUID_PM_USER,
      email: "pm@test.com",
      name: "PM",
      role: { code: "PROJECT_MANAGER" },
    });

    const res = await PATCH(
      makeRequest("PATCH", { assigneeId: CUID_PM_USER }) as never,
      makeParams("rpt-1")
    );
    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 403 when mentioned-only user tries to assign", async () => {
    mockGetEffectiveSession.mockResolvedValue(
      effectiveFrom({
        user: {
          id: "member-2",
          email: "m2@test.com",
          name: "M2",
          role: "MEMBER",
        },
      })
    );
    mockFindUnique.mockResolvedValue(SAMPLE_REPORT);
    mockFeedbackMentionFindUnique.mockResolvedValue({ id: "mention-1" });

    const res = await PATCH(
      makeRequest("PATCH", { assigneeId: CUID_DEV_USER }) as never,
      makeParams("rpt-1")
    );
    expect(res.status).toBe(403);
  });

  it("skips assignment notification on self-assign", async () => {
    mockGetEffectiveSession.mockResolvedValue(
      effectiveFrom({
        user: {
          id: CUID_ADMIN_USER,
          email: "admin@test.com",
          name: "Admin",
          role: "ADMIN",
        },
      })
    );
    mockFindUnique.mockResolvedValue(SAMPLE_REPORT);
    mockFeedbackMentionFindUnique.mockResolvedValue(null);
    mockUserFindUnique.mockResolvedValue({
      id: CUID_ADMIN_USER,
      email: "admin@test.com",
      name: "Admin",
      role: { code: "ADMIN" },
    });
    mockUpdate.mockResolvedValue({
      ...SAMPLE_REPORT,
      assigneeId: CUID_ADMIN_USER,
      assignee: { id: CUID_ADMIN_USER, name: "Admin", email: "admin@test.com" },
    });
    mockNotificationCreate.mockClear();
    mockSendFeedbackAssignedEmail.mockClear();

    const res = await PATCH(
      makeRequest("PATCH", { assigneeId: CUID_ADMIN_USER }) as never,
      makeParams("rpt-1")
    );
    expect(res.status).toBe(200);
    expect(mockNotificationCreate).not.toHaveBeenCalled();
    expect(mockSendFeedbackAssignedEmail).not.toHaveBeenCalled();
  });

  it("allows admin to set triage priority", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(adminSession()));
    mockFindUnique.mockResolvedValue(SAMPLE_REPORT);
    mockFeedbackMentionFindUnique.mockResolvedValue(null);
    mockUpdate.mockResolvedValue({ ...SAMPLE_REPORT, priority: "HIGH" as const });

    const res = await PATCH(
      makeRequest("PATCH", { priority: "HIGH" }) as never,
      makeParams("rpt-1")
    );
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ priority: "HIGH" }),
      })
    );
  });

  it("allows admin to clear priority with null", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(adminSession()));
    mockFindUnique.mockResolvedValue({ ...SAMPLE_REPORT, priority: "MEDIUM" });
    mockFeedbackMentionFindUnique.mockResolvedValue(null);
    mockUpdate.mockResolvedValue({ ...SAMPLE_REPORT, priority: null });

    const res = await PATCH(
      makeRequest("PATCH", { priority: null }) as never,
      makeParams("rpt-1")
    );
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ priority: null }),
      })
    );
  });

  it("returns 400 for invalid priority value", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(adminSession()));
    mockFindUnique.mockResolvedValue(SAMPLE_REPORT);
    mockFeedbackMentionFindUnique.mockResolvedValue(null);

    const res = await PATCH(
      makeRequest("PATCH", { priority: "URGENT" }) as never,
      makeParams("rpt-1")
    );
    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 403 when member tries to set priority", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(memberSession()));
    mockFindUnique.mockResolvedValue(SAMPLE_REPORT);
    mockFeedbackMentionFindUnique.mockResolvedValue(null);

    const res = await PATCH(
      makeRequest("PATCH", { priority: "LOW" }) as never,
      makeParams("rpt-1")
    );
    expect(res.status).toBe(403);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("allows inbox to assign and update status in one PATCH", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(developerSession()));
    mockFindUnique.mockResolvedValue(SAMPLE_REPORT);
    mockFeedbackMentionFindUnique.mockResolvedValue(null);
    mockUserFindUnique.mockResolvedValue(devUser);
    mockUpdate.mockResolvedValue({
      ...SAMPLE_REPORT,
      status: "IN_PROGRESS",
      assigneeId: CUID_DEV_USER,
      assignee: { id: CUID_DEV_USER, name: "Dev User", email: "dev@test.com" },
    });
    mockNotificationCreate.mockClear();

    const res = await PATCH(
      makeRequest("PATCH", { status: "IN_PROGRESS", assigneeId: CUID_DEV_USER }) as never,
      makeParams("rpt-1")
    );
    expect(res.status).toBe(200);
    expect(mockNotificationCreate).toHaveBeenCalled();
  });
});

// ── DELETE /api/feedback/[id] ─────────────────────────────────────────────────

describe("DELETE /api/feedback/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreSessionDbUserIdMockPassthrough();
  });

  const makeParams = (id: string) =>
    ({ params: Promise.resolve({ id }) }) as never;

  it("returns 401 when not authenticated", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(null));
    const res = await DELETE(makeRequest("DELETE") as never, makeParams("rpt-1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin member", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(memberSession()));
    const res = await DELETE(makeRequest("DELETE") as never, makeParams("rpt-1"));
    expect(res.status).toBe(403);
  });

  it("deletes for admin and returns 204", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(adminSession()));
    mockFindUnique.mockResolvedValue(SAMPLE_REPORT);
    mockDelete.mockResolvedValue(SAMPLE_REPORT);

    const res = await DELETE(makeRequest("DELETE") as never, makeParams("rpt-1"));
    expect(res.status).toBe(204);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: "rpt-1" } });
  });
});

// ── GET/POST /api/feedback/[id]/comments ──────────────────────────────────────

describe("GET /api/feedback/[id]/comments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreSessionDbUserIdMockPassthrough();
  });

  const params = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

  it("returns 404 when not viewer", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(memberSession()));
    mockFindUnique.mockResolvedValue({ id: "fb1", userId: "other" });
    mockFeedbackMentionFindUnique.mockResolvedValue(null);

    const res = await GET_COMMENTS(nextReq("http://localhost/api/feedback/fb1/comments"), params("fb1"));
    expect(res.status).toBe(404);
  });

  it("returns comments for submitter", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(memberSession()));
    mockFindUnique.mockResolvedValue({ id: "fb1", userId: "member-1" });
    mockFeedbackCommentFindMany.mockResolvedValue([]);

    const res = await GET_COMMENTS(nextReq("http://localhost/api/feedback/fb1/comments"), params("fb1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.comments).toEqual([]);
  });
});

describe("POST /api/feedback/[id]/comments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreSessionDbUserIdMockPassthrough();
    mockUserFindUnique.mockResolvedValue({
      id: "member-1",
      name: "Member",
      email: "member@test.com",
    });
    mockTransaction.mockImplementation((arg: unknown) => {
      if (typeof arg === "function") {
        return (arg as (tx: {
          feedbackComment: { create: typeof mockFeedbackCommentCreate };
        }) => Promise<unknown>)({
          feedbackComment: { create: mockFeedbackCommentCreate },
        });
      }
      if (Array.isArray(arg)) {
        return Promise.all(arg as Promise<unknown>[]);
      }
      return Promise.resolve(arg);
    });
    mockFeedbackMentionUpsert.mockResolvedValue({});
    mockNotificationCreateMany.mockResolvedValue({ count: 0 });
  });

  const params = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

  it("rejects invalid attachment key prefix", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(memberSession()));
    mockFindUnique.mockResolvedValue({ id: "fb1", userId: "member-1" });

    const res = await POST_COMMENT(
      nextReq("http://localhost/api/feedback/fb1/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: "Hi",
          attachmentKeys: ["field-media/issues/bad.jpg"],
          attachmentUrls: ["https://x"],
          attachmentMimeTypes: ["image/jpeg"],
          attachmentFileSizeBytes: [100],
          attachmentCaptions: [""],
        }),
      }),
      params("fb1")
    );
    expect(res.status).toBe(400);
  });

  it("creates comment with empty attachment arrays", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(memberSession()));
    mockFindUnique.mockResolvedValue({ id: "fb1", userId: "member-1" });
    mockFeedbackCommentCreate.mockResolvedValue({
      id: "c1",
      feedbackReportId: "fb1",
      authorId: "member-1",
      body: "Hello",
      editedAt: null,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      author: { id: "member-1", name: "Member", email: "member@test.com" },
      attachments: [],
    });

    const res = await POST_COMMENT(
      nextReq("http://localhost/api/feedback/fb1/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "Hello" }),
      }),
      params("fb1")
    );
    expect(res.status).toBe(201);
    expect(mockFeedbackCommentCreate).toHaveBeenCalled();
  });

  it("creates MENTIONED_IN_COMMENT notification when author @mentions themselves", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(memberSession()));
    mockFindUnique.mockResolvedValue({ id: "fb1", userId: "member-1" });
    const selfMentionBody = "Reminder @[Member](member-1)";
    mockUserFindMany.mockResolvedValue([
      { id: "member-1", name: "Member", email: "member@test.com" },
    ]);
    mockFeedbackCommentCreate.mockResolvedValue({
      id: "c-self",
      feedbackReportId: "fb1",
      authorId: "member-1",
      body: selfMentionBody,
      editedAt: null,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      author: { id: "member-1", name: "Member", email: "member@test.com" },
      attachments: [],
    });

    const res = await POST_COMMENT(
      nextReq("http://localhost/api/feedback/fb1/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: selfMentionBody }),
      }),
      params("fb1")
    );
    expect(res.status).toBe(201);

    await new Promise<void>((resolve) => {
      setImmediate(() => resolve());
    });

    expect(mockNotificationCreateMany).toHaveBeenCalled();
    const payload = mockNotificationCreateMany.mock.calls[0][0] as {
      data: Array<{ userId: string; type: string; feedbackId: string; mentionCommentId: string }>;
    };
    expect(payload.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: "member-1",
          type: "MENTIONED_IN_COMMENT",
          feedbackId: "fb1",
          mentionCommentId: "c-self",
        }),
      ])
    );
    expect(mockSendMentionEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "member@test.com" })
    );
  });
});

// ── PATCH/DELETE comment ─────────────────────────────────────────────────────

describe("PATCH /api/feedback/[id]/comments/[cid]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreSessionDbUserIdMockPassthrough();
  });

  const params = (id: string, cid: string) =>
    ({ params: Promise.resolve({ id, cid }) }) as never;

  it("returns 400 when edit window expired", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(memberSession()));
    mockFindUnique.mockResolvedValue({ id: "fb1", userId: "member-1" });
    const old = new Date(Date.now() - 31 * 60 * 1000);
    mockFeedbackCommentFindFirst.mockResolvedValue({
      id: "c1",
      feedbackReportId: "fb1",
      authorId: "member-1",
      body: "Old",
      createdAt: old,
      deletedAt: null,
    });

    const res = await PATCH_COMMENT(
      nextReq("http://localhost/api/feedback/fb1/comments/c1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "New text" }),
      }),
      params("fb1", "c1")
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 for non-author", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(memberSession()));
    mockFindUnique.mockResolvedValue({ id: "fb1", userId: "member-1" });
    mockFeedbackCommentFindFirst.mockResolvedValue({
      id: "c1",
      feedbackReportId: "fb1",
      authorId: "admin-1",
      body: "X",
      createdAt: new Date(),
      deletedAt: null,
    });

    const res = await PATCH_COMMENT(
      nextReq("http://localhost/api/feedback/fb1/comments/c1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "Hijack" }),
      }),
      params("fb1", "c1")
    );
    expect(res.status).toBe(403);
  });

  it("notifies when author adds a self-@mention in an edit", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(memberSession()));
    mockFindUnique.mockResolvedValue({ id: "fb1", userId: "member-1" });
    mockFeedbackCommentFindFirst.mockResolvedValue({
      id: "c1",
      feedbackReportId: "fb1",
      authorId: "member-1",
      body: "Original",
      createdAt: new Date(),
      deletedAt: null,
    });
    mockUserFindUnique.mockResolvedValue({
      id: "member-1",
      name: "Member",
      email: "member@test.com",
    });
    mockUserFindMany.mockResolvedValue([
      { id: "member-1", name: "Member", email: "member@test.com" },
    ]);
    mockTransaction.mockImplementation((arg: unknown) => {
      if (typeof arg === "function") {
        return (arg as (tx: {
          feedbackComment: { create: typeof mockFeedbackCommentCreate };
        }) => Promise<unknown>)({
          feedbackComment: { create: mockFeedbackCommentCreate },
        });
      }
      if (Array.isArray(arg)) {
        return Promise.all(arg as Promise<unknown>[]);
      }
      return Promise.resolve(arg);
    });
    mockFeedbackMentionUpsert.mockResolvedValue({});
    mockNotificationCreateMany.mockResolvedValue({ count: 1 });
    mockFeedbackCommentUpdate.mockResolvedValue({
      id: "c1",
      feedbackReportId: "fb1",
      authorId: "member-1",
      body: "Original @[Member](member-1)",
      editedAt: new Date(),
      author: { id: "member-1", name: "Member", email: "member@test.com" },
      attachments: [],
    });

    const res = await PATCH_COMMENT(
      nextReq("http://localhost/api/feedback/fb1/comments/c1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "Original @[Member](member-1)" }),
      }),
      params("fb1", "c1")
    );
    expect(res.status).toBe(200);

    await new Promise<void>((resolve) => {
      setImmediate(() => resolve());
    });

    expect(mockNotificationCreateMany).toHaveBeenCalled();
    const payload = mockNotificationCreateMany.mock.calls[0][0] as {
      data: Array<{ userId: string; type: string }>;
    };
    expect(payload.data[0].userId).toBe("member-1");
    expect(payload.data[0].type).toBe("MENTIONED_IN_COMMENT");
  });
});

describe("DELETE /api/feedback/[id]/comments/[cid]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreSessionDbUserIdMockPassthrough();
  });

  const params = (id: string, cid: string) =>
    ({ params: Promise.resolve({ id, cid }) }) as never;

  it("returns 403 when not author", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(memberSession()));
    mockFindUnique.mockResolvedValue({ id: "fb1", userId: "member-1" });
    mockFeedbackCommentFindFirst.mockResolvedValue({
      id: "c1",
      feedbackReportId: "fb1",
      authorId: "other",
      deletedAt: null,
    });

    const res = await DELETE_COMMENT(
      nextReq("http://localhost/api/feedback/fb1/comments/c1", { method: "DELETE" }),
      params("fb1", "c1")
    );
    expect(res.status).toBe(403);
  });

  it("soft-deletes for author", async () => {
    mockGetEffectiveSession.mockResolvedValue(effectiveFrom(memberSession()));
    mockFindUnique.mockResolvedValue({ id: "fb1", userId: "member-1" });
    mockFeedbackCommentFindFirst.mockResolvedValue({
      id: "c1",
      feedbackReportId: "fb1",
      authorId: "member-1",
      deletedAt: null,
    });
    mockFeedbackCommentUpdate.mockResolvedValue({});

    const res = await DELETE_COMMENT(
      nextReq("http://localhost/api/feedback/fb1/comments/c1", { method: "DELETE" }),
      params("fb1", "c1")
    );
    expect(res.status).toBe(200);
    expect(mockFeedbackCommentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c1" },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      })
    );
  });
});
