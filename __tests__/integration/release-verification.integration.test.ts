/**
 * Integration tests for POST /api/automation/release-verification.
 *
 * Covers:
 * - 401 when no auth
 * - 503 when GEMINI_API_KEY not configured
 * - 400 when body is invalid
 * - 404 when release not found
 * - 200 when steps already exist (idempotent skip)
 * - 201 happy path — generates and saves verification steps
 * - 201 with feedback — regenerates steps when feedback is provided even if steps exist
 * - Fixture where all change fields are empty (Unifier null-field pattern)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    release: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));
vi.mock("@/lib/ai/gemini", () => ({
  generateReleaseVerification: vi.fn(),
  isAIEnabled: vi.fn(),
}));

import { POST } from "@/app/api/automation/release-verification/route";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateReleaseVerification, isAIEnabled } from "@/lib/ai/gemini";

const MOCK_RELEASE = {
  id: "release-123",
  title: "Production Fix — March 6 2026",
  branch: "feat/fix-masquerade-log",
  environment: "production",
  changes: [
    { id: "c1", description: "Add masquerade_logs table", route: "/en/admin", category: "database" },
    { id: "c2", description: "Fix projects page error", route: "/en/projects", category: "bug-fix" },
  ],
  verificationSteps: [],
};

const GENERATED_STEPS = [
  {
    id: "verify-projects-page",
    changeId: "c2",
    title: "Projects page loads without error",
    instructions: "Navigate to /en/projects. Confirm the table renders and no error banner appears.",
    route: "/en/projects",
    category: "bug-fix",
  },
];

function makeRequest(body: object, bearer?: string): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (bearer) headers["Authorization"] = `Bearer ${bearer}`;
  return new Request("http://localhost/api/automation/release-verification", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/automation/release-verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(null);
    process.env.AUTOMATION_SECRET = "test-secret";
  });

  it("returns 401 when not authorized", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const res = await POST(makeRequest({ releaseId: "abc" }) as Parameters<typeof POST>[0]);
    expect(res.status).toBe(401);
  });

  it("returns 503 when GEMINI_API_KEY is not configured", async () => {
    vi.mocked(isAIEnabled).mockReturnValue(false);
    const res = await POST(makeRequest({ releaseId: "abc" }, "test-secret") as Parameters<typeof POST>[0]);
    expect(res.status).toBe(503);
  });

  it("returns 400 when body is invalid (missing releaseId)", async () => {
    vi.mocked(isAIEnabled).mockReturnValue(true);
    const res = await POST(makeRequest({ title: "no release id" }, "test-secret") as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
  });

  it("returns 404 when release not found", async () => {
    vi.mocked(isAIEnabled).mockReturnValue(true);
    vi.mocked(db.release.findUnique).mockResolvedValue(null);
    const res = await POST(makeRequest({ releaseId: "nonexistent" }, "test-secret") as Parameters<typeof POST>[0]);
    expect(res.status).toBe(404);
  });

  it("returns 200 (skipped) when steps already exist and no feedback", async () => {
    vi.mocked(isAIEnabled).mockReturnValue(true);
    vi.mocked(db.release.findUnique).mockResolvedValue({
      ...MOCK_RELEASE,
      verificationSteps: GENERATED_STEPS,
    } as Parameters<typeof db.release.findUnique>[0] extends { where: infer _W } ? Awaited<ReturnType<typeof db.release.findUnique>> : never);
    const res = await POST(makeRequest({ releaseId: "release-123" }, "test-secret") as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);
    const body = await res.json() as { steps: typeof GENERATED_STEPS };
    expect(body.steps).toHaveLength(1);
    expect(vi.mocked(generateReleaseVerification)).not.toHaveBeenCalled();
  });

  it("returns 201 and generates steps on happy path", async () => {
    vi.mocked(isAIEnabled).mockReturnValue(true);
    vi.mocked(db.release.findUnique).mockResolvedValue(MOCK_RELEASE as Parameters<typeof db.release.findUnique>[0] extends { where: infer _W } ? Awaited<ReturnType<typeof db.release.findUnique>> : never);
    vi.mocked(generateReleaseVerification).mockResolvedValue(GENERATED_STEPS);
    vi.mocked(db.release.update).mockResolvedValue({} as Awaited<ReturnType<typeof db.release.update>>);

    const res = await POST(makeRequest({ releaseId: "release-123" }, "test-secret") as Parameters<typeof POST>[0]);
    expect(res.status).toBe(201);
    const body = await res.json() as { releaseId: string; steps: typeof GENERATED_STEPS };
    expect(body.releaseId).toBe("release-123");
    expect(body.steps).toHaveLength(1);
    expect(body.steps[0].id).toBe("verify-projects-page");
  });

  it("regenerates steps when feedback is provided even if steps already exist", async () => {
    vi.mocked(isAIEnabled).mockReturnValue(true);
    vi.mocked(db.release.findUnique).mockResolvedValue({
      ...MOCK_RELEASE,
      verificationSteps: GENERATED_STEPS,
    } as Parameters<typeof db.release.findUnique>[0] extends { where: infer _W } ? Awaited<ReturnType<typeof db.release.findUnique>> : never);
    vi.mocked(generateReleaseVerification).mockResolvedValue(GENERATED_STEPS);
    vi.mocked(db.release.update).mockResolvedValue({} as Awaited<ReturnType<typeof db.release.update>>);

    const res = await POST(
      makeRequest({ releaseId: "release-123", feedback: "focus on mobile view" }, "test-secret") as Parameters<typeof POST>[0]
    );
    expect(res.status).toBe(201);
    expect(vi.mocked(generateReleaseVerification)).toHaveBeenCalledWith(
      expect.objectContaining({ feedback: "focus on mobile view" })
    );
  });

  it("accepts a fixture where all change fields are empty (Unifier null-field pattern)", async () => {
    vi.mocked(isAIEnabled).mockReturnValue(true);
    vi.mocked(db.release.findUnique).mockResolvedValue({
      ...MOCK_RELEASE,
      changes: [
        { id: "", description: "", route: "", category: "" },
      ],
      verificationSteps: [],
    } as Parameters<typeof db.release.findUnique>[0] extends { where: infer _W } ? Awaited<ReturnType<typeof db.release.findUnique>> : never);
    vi.mocked(generateReleaseVerification).mockResolvedValue(GENERATED_STEPS);
    vi.mocked(db.release.update).mockResolvedValue({} as Awaited<ReturnType<typeof db.release.update>>);

    const res = await POST(makeRequest({ releaseId: "release-123" }, "test-secret") as Parameters<typeof POST>[0]);
    expect(res.status).toBe(201);
  });
});
