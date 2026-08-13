/**
 * Integration tests for form lifecycle routes:
 *   POST /api/forms/[id]/publish
 *   POST /api/forms/[id]/unpublish
 *   POST /api/forms/[id]/save-version
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  db: {
    form: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    formVersion: {
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    inspectionFormSection: {
      deleteMany: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
    inspectionFormQuestion: {
      create: vi.fn(),
      count: vi.fn(),
    },
    inspectionFormVersionSection: {
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    inspectionFormVersionQuestion: {
      create: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/forms/form-route-auth", () => ({
  authorizeFormMutation: vi.fn(),
}));

import { POST as publishRoute } from "@/app/api/forms/[id]/publish/route";
import { POST as unpublishRoute } from "@/app/api/forms/[id]/unpublish/route";
import { POST as saveVersionRoute } from "@/app/api/forms/[id]/save-version/route";
import { db } from "@/lib/db";
import { authorizeFormMutation } from "@/lib/forms/form-route-auth";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeRequest(body?: unknown): Request {
  return new Request("http://x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ── Fixtures ───────────────────────────────────────────────────────────────────

const DRAFT_SECTIONS = [{ id: "s1", title: "Section 1", questions: [{ id: "q1", title: "Q1", description: "", responseType: "PASS_FAIL", required: false, photoRequired: false, deficiencyPhotoRequired: false, options: [] }] }];

const DRAFT_FORM = {
  id: "form-1",
  name: "Pre-Install",
  status: "DRAFT",
  draftSections: DRAFT_SECTIONS,
  versions: [],
};

const PUBLISHED_FORM = {
  ...DRAFT_FORM,
  status: "PUBLISHED",
  versions: [{ id: "ver-1", versionNumber: 1, publishedAt: new Date() }],
};

const UPDATED_PUBLISHED_FORM = {
  ...PUBLISHED_FORM,
  versions: [{ id: "ver-2", versionNumber: 2, publishedAt: new Date() }],
};

// ── POST /api/forms/[id]/publish ───────────────────────────────────────────────

describe("POST /api/forms/[id]/publish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authorizeFormMutation).mockResolvedValue({ ok: true, userId: "user-1" });
    vi.mocked(db.user.findUnique).mockResolvedValue({ id: "user-1" } as never);
    vi.mocked(db.form.findUnique).mockResolvedValue(DRAFT_FORM as never);
    vi.mocked(db.$transaction).mockResolvedValue([
      { id: "ver-1", versionNumber: 1 },
      PUBLISHED_FORM,
    ] as never);
    vi.mocked(db.inspectionFormSection.deleteMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(db.inspectionFormSection.create).mockResolvedValue({ id: "section-1" } as never);
    vi.mocked(db.inspectionFormQuestion.create).mockResolvedValue({ id: "question-1" } as never);
    vi.mocked(db.inspectionFormQuestion.count).mockResolvedValue(1);
    vi.mocked(db.inspectionFormSection.findMany).mockResolvedValue([
      {
        sourceSectionId: "s1",
        title: "Section 1",
        description: null,
        displayOrder: 0,
        questions: [
          {
            sourceQuestionId: "q1",
            sourceSectionId: "s1",
            title: "Q1",
            description: null,
            responseType: "PASS_FAIL",
            options: null,
            required: false,
            photoRequired: false,
            deficiencyPhotoRequired: false,
            deficiencyDescriptionEnabled: null,
            isFailFollowUp: false,
            sourceParentQuestionId: null,
            parentQuestionTitle: null,
            displayOrder: 0,
            rawQuestion: {},
          },
        ],
      },
    ] as never);
    vi.mocked(db.inspectionFormVersionSection.deleteMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(db.inspectionFormVersionSection.create).mockResolvedValue({ id: "version-section-1" } as never);
    vi.mocked(db.inspectionFormVersionQuestion.create).mockResolvedValue({ id: "version-question-1" } as never);
    vi.mocked(db.inspectionFormVersionQuestion.count).mockResolvedValue(1);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(authorizeFormMutation).mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }) as never,
    });
    const res = await publishRoute(makeRequest() as never, makeParams("form-1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks MANAGE_FORMS permission", async () => {
    vi.mocked(authorizeFormMutation).mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Forbidden" }, { status: 403 }) as never,
    });
    const res = await publishRoute(makeRequest() as never, makeParams("form-1"));
    expect(res.status).toBe(403);
  });

  it("returns 404 when form does not exist", async () => {
    vi.mocked(db.form.findUnique).mockResolvedValue(null);
    const res = await publishRoute(makeRequest() as never, makeParams("missing"));
    expect(res.status).toBe(404);
  });

  it("returns 422 when form has no draft content", async () => {
    vi.mocked(db.form.findUnique).mockResolvedValue({ ...DRAFT_FORM, draftSections: null } as never);
    vi.mocked(db.inspectionFormQuestion.count).mockResolvedValue(0);
    const res = await publishRoute(makeRequest() as never, makeParams("form-1"));
    expect(res.status).toBe(422);
  });

  it("publishes draft and returns form with status PUBLISHED", async () => {
    const res = await publishRoute(makeRequest() as never, makeParams("form-1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { form: { status: string } };
    expect(body.form.status).toBe("PUBLISHED");
  });

  it("creates version v1 for a form with no prior versions", async () => {
    await publishRoute(makeRequest() as never, makeParams("form-1"));
    expect(vi.mocked(db.$transaction)).toHaveBeenCalledTimes(1);
  });

  it("creates version v2 for a form that already has version 1", async () => {
    vi.mocked(db.form.findUnique).mockResolvedValue({
      ...DRAFT_FORM,
      versions: [{ versionNumber: 1 }],
    } as never);
    vi.mocked(db.$transaction).mockResolvedValue([
      { id: "ver-2", versionNumber: 2 },
      UPDATED_PUBLISHED_FORM,
    ] as never);
    const res = await publishRoute(makeRequest() as never, makeParams("form-1"));
    expect(res.status).toBe(200);
  });
});

// ── POST /api/forms/[id]/unpublish ─────────────────────────────────────────────

describe("POST /api/forms/[id]/unpublish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authorizeFormMutation).mockResolvedValue({ ok: true, userId: "user-1" });
    vi.mocked(db.form.findUnique).mockResolvedValue({ id: "form-1" } as never);
    vi.mocked(db.form.update).mockResolvedValue({ ...PUBLISHED_FORM, status: "DRAFT" } as never);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(authorizeFormMutation).mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }) as never,
    });
    const res = await unpublishRoute(makeRequest() as never, makeParams("form-1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks MANAGE_FORMS permission", async () => {
    vi.mocked(authorizeFormMutation).mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Forbidden" }, { status: 403 }) as never,
    });
    const res = await unpublishRoute(makeRequest() as never, makeParams("form-1"));
    expect(res.status).toBe(403);
  });

  it("returns 404 when form does not exist", async () => {
    vi.mocked(db.form.findUnique).mockResolvedValue(null);
    const res = await unpublishRoute(makeRequest() as never, makeParams("missing"));
    expect(res.status).toBe(404);
  });

  it("unpublishes form and returns status DRAFT", async () => {
    const res = await unpublishRoute(makeRequest() as never, makeParams("form-1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { form: { status: string } };
    expect(body.form.status).toBe("DRAFT");
  });

  it("preserves existing versions when unpublishing", async () => {
    vi.mocked(db.form.update).mockResolvedValue({
      ...PUBLISHED_FORM,
      status: "DRAFT",
      // versions array still present after unpublish
      versions: [{ id: "ver-1", versionNumber: 1, publishedAt: new Date() }],
    } as never);
    const res = await unpublishRoute(makeRequest() as never, makeParams("form-1"));
    const body = (await res.json()) as { form: { versions: unknown[] } };
    expect(body.form.versions).toHaveLength(1);
  });
});

// ── POST /api/forms/[id]/save-version ─────────────────────────────────────────

describe("POST /api/forms/[id]/save-version", () => {
  const SECTIONS = [{ id: "s1", title: "Updated Section", questions: [{ id: "q1", title: "Q", description: "", responseType: "PASS_FAIL", required: false, photoRequired: false, deficiencyPhotoRequired: false, options: [] }] }];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authorizeFormMutation).mockResolvedValue({ ok: true, userId: "user-1" });
    vi.mocked(db.user.findUnique).mockResolvedValue({ id: "user-1" } as never);
    vi.mocked(db.form.findUnique).mockResolvedValue(PUBLISHED_FORM as never);
    vi.mocked(db.$transaction).mockResolvedValue([
      { id: "ver-2", versionNumber: 2 },
      UPDATED_PUBLISHED_FORM,
    ] as never);
    vi.mocked(db.inspectionFormSection.deleteMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(db.inspectionFormSection.create).mockResolvedValue({ id: "section-1" } as never);
    vi.mocked(db.inspectionFormQuestion.create).mockResolvedValue({ id: "question-1" } as never);
    vi.mocked(db.inspectionFormSection.findMany).mockResolvedValue([
      {
        sourceSectionId: "s1",
        title: "Updated Section",
        description: null,
        displayOrder: 0,
        questions: [
          {
            sourceQuestionId: "q1",
            sourceSectionId: "s1",
            title: "Q",
            description: null,
            responseType: "PASS_FAIL",
            options: null,
            required: false,
            photoRequired: false,
            deficiencyPhotoRequired: false,
            deficiencyDescriptionEnabled: null,
            isFailFollowUp: false,
            sourceParentQuestionId: null,
            parentQuestionTitle: null,
            displayOrder: 0,
            rawQuestion: {},
          },
        ],
      },
    ] as never);
    vi.mocked(db.inspectionFormVersionSection.deleteMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(db.inspectionFormVersionSection.create).mockResolvedValue({ id: "version-section-1" } as never);
    vi.mocked(db.inspectionFormVersionQuestion.create).mockResolvedValue({ id: "version-question-1" } as never);
    vi.mocked(db.inspectionFormVersionQuestion.count).mockResolvedValue(1);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(authorizeFormMutation).mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }) as never,
    });
    const res = await saveVersionRoute(
      makeRequest({ sections: SECTIONS }) as never,
      makeParams("form-1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks MANAGE_FORMS permission", async () => {
    vi.mocked(authorizeFormMutation).mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Forbidden" }, { status: 403 }) as never,
    });
    const res = await saveVersionRoute(
      makeRequest({ sections: SECTIONS }) as never,
      makeParams("form-1"),
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when form does not exist", async () => {
    vi.mocked(db.form.findUnique).mockResolvedValue(null);
    const res = await saveVersionRoute(
      makeRequest({ sections: SECTIONS }) as never,
      makeParams("missing"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when body is invalid JSON (malformed request)", async () => {
    const req = new Request("http://x", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await saveVersionRoute(req as never, makeParams("form-1"));
    expect(res.status).toBe(400);
  });

  it("saves new version and form remains PUBLISHED", async () => {
    const res = await saveVersionRoute(
      makeRequest({ sections: SECTIONS }) as never,
      makeParams("form-1"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { form: { status: string }; version: { versionNumber: number } };
    expect(body.form.status).toBe("PUBLISHED");
    expect(body.version.versionNumber).toBe(2);
  });

  it("increments to v2 when current latest is v1", async () => {
    vi.mocked(db.form.findUnique).mockResolvedValue({
      ...PUBLISHED_FORM,
      versions: [{ versionNumber: 1 }],
    } as never);
    await saveVersionRoute(makeRequest({ sections: SECTIONS }) as never, makeParams("form-1"));
    expect(vi.mocked(db.$transaction)).toHaveBeenCalledTimes(1);
  });
});
