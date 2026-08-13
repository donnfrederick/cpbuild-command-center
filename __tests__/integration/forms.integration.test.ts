/**
 * Integration tests for /api/forms (GET, POST) and /api/forms/[id] (GET, PATCH, DELETE)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  db: {
    form: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    inspectionSubmission: {
      updateMany: vi.fn(),
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
      findMany: vi.fn(),
    },
    inspectionFormVersionQuestion: {
      count: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/forms/form-route-auth", () => ({
  authorizeFormMutation: vi.fn(),
}));

vi.mock("@/lib/masquerade", () => ({
  getEffectiveSession: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  hasPermission: vi.fn(),
  PERMISSIONS: {
    MANAGE_FORMS: "forms:manage",
  },
}));

import { GET as listForms, POST as createForm } from "@/app/api/forms/route";
import {
  GET as getForm,
  PATCH as patchForm,
  DELETE as deleteForm,
} from "@/app/api/forms/[id]/route";
import { db } from "@/lib/db";
import { getEffectiveSession } from "@/lib/masquerade";
import { hasPermission } from "@/lib/permissions";
import { authorizeFormMutation } from "@/lib/forms/form-route-auth";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeRequest(method: string, url: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ── Fixtures ───────────────────────────────────────────────────────────────────

const ADMIN_SESSION = {
  user: { id: "user-1", name: "Admin", email: "admin@cp.build", role: "ADMIN", specialPermissions: ["forms:manage"] },
};
const MEMBER_SESSION = {
  user: { id: "user-2", name: "Member", email: "member@cp.build", role: "MEMBER", specialPermissions: [] },
};

const FORM_FIXTURE = {
  id: "form-1",
  name: "Pre-Installation Inspection",
  description: "Check before install",
  level: "scope",
  category: "installation",
  scopeTypeCodes: ["CAB"],
  status: "DRAFT",
  draftSections: null,
  createdById: "user-1",
  createdAt: new Date(),
  updatedAt: new Date(),
  versions: [],
  createdBy: { id: "user-1", name: "Admin" },
  _count: { submissions: 0 },
};

// ── GET /api/forms ─────────────────────────────────────────────────────────────

describe("GET /api/forms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEffectiveSession).mockResolvedValue(ADMIN_SESSION as never);
    vi.mocked(db.form.findMany).mockResolvedValue([FORM_FIXTURE] as never);
    vi.mocked(db.inspectionFormSection.findMany).mockResolvedValue([] as never);
    vi.mocked(db.inspectionFormVersionSection.findMany).mockResolvedValue([] as never);
    vi.mocked(hasPermission).mockImplementation(
      (_role, perm, special) =>
        perm === "forms:manage" &&
        (special?.includes("forms:manage") === true || _role === "ADMIN"),
    );
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue(null);
    const res = await listForms(makeRequest("GET", "http://x/api/forms") as never);
    expect(res.status).toBe(401);
  });

  it("returns all forms for authenticated user", async () => {
    const res = await listForms(makeRequest("GET", "http://x/api/forms") as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { forms: typeof FORM_FIXTURE[] };
    expect(body.forms).toHaveLength(1);
    expect(body.forms[0].name).toBe("Pre-Installation Inspection");
  });

  it("filters by status=published when query param provided", async () => {
    vi.mocked(db.form.findMany).mockResolvedValue([] as never);
    const res = await listForms(
      makeRequest("GET", "http://x/api/forms?status=published") as never,
    );
    expect(res.status).toBe(200);
    expect(vi.mocked(db.form.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "PUBLISHED" } }),
    );
  });

  it("returns 403 for MEMBER listing all forms (drafts included)", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue(MEMBER_SESSION as never);
    const res = await listForms(makeRequest("GET", "http://x/api/forms") as never);
    expect(res.status).toBe(403);
  });

  it("allows MEMBER to list published forms for inspections", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue(MEMBER_SESSION as never);
    vi.mocked(db.form.findMany).mockResolvedValue([] as never);
    const res = await listForms(
      makeRequest("GET", "http://x/api/forms?status=published") as never,
    );
    expect(res.status).toBe(200);
  });

  it("hydrates draftSections from relational mirror when JSON stub is empty (builder list)", async () => {
    const relationalSections = [
      {
        id: "sec-1",
        formId: "form-1",
        sourceSectionId: "sec-source-1",
        title: "Layout",
        description: null,
        displayOrder: 0,
        questions: [
          {
            sourceQuestionId: "q-1",
            title: "Cabinet plumb?",
            description: null,
            responseType: "pass_fail_deficiencies",
            options: null,
            required: true,
            photoRequired: false,
            deficiencyPhotoRequired: false,
            deficiencyDescriptionEnabled: true,
            rawQuestion: { id: "q-1", title: "Cabinet plumb?", responseType: "pass_fail_deficiencies", required: true },
            isFailFollowUp: false,
            sourceParentQuestionId: null,
            displayOrder: 0,
          },
        ],
      },
    ];
    vi.mocked(db.form.findMany).mockResolvedValue([
      { ...FORM_FIXTURE, draftSections: {} },
    ] as never);
    vi.mocked(db.inspectionFormSection.findMany).mockResolvedValue(relationalSections as never);

    const res = await listForms(makeRequest("GET", "http://x/api/forms") as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      forms: Array<{ draftSections: Array<{ id: string; questions: unknown[] }> }>;
    };
    expect(body.forms[0].draftSections[0].id).toBe("sec-source-1");
    expect(body.forms[0].draftSections[0].questions).toHaveLength(1);
    expect(vi.mocked(db.inspectionFormSection.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({ where: { formId: { in: ["form-1"] } } }),
    );
  });

  it("returns published version sections only for MEMBER on published list (no draft leak)", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue(MEMBER_SESSION as never);
    vi.mocked(hasPermission).mockReturnValue(false);

    const publishedSections = [{ id: "pub-section-1", title: "Published Section" }];
    const inProgressDraft = [{ id: "draft-secret", title: "Unpublished Edit" }];

    vi.mocked(db.form.findMany).mockResolvedValue([
      {
        ...FORM_FIXTURE,
        status: "PUBLISHED",
        draftSections: inProgressDraft,
        versions: [{ id: "v1", versionNumber: 1, sections: publishedSections, publishedAt: new Date() }],
      },
    ] as never);

    const res = await listForms(
      makeRequest("GET", "http://x/api/forms?status=published") as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      forms: Array<{ draftSections: unknown[]; versions: Array<{ sections?: unknown }> }>;
    };
    expect(body.forms[0].draftSections).toEqual(publishedSections);
    expect(body.forms[0].versions[0].sections).toBeUndefined();
  });

  it("hydrates published list from version relational mirror when JSON sections stub is empty", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue(MEMBER_SESSION as never);
    vi.mocked(hasPermission).mockReturnValue(false);

    const versionSections = [
      {
        id: "ver-sec-1",
        formVersionId: "v1",
        sourceSectionId: "ver-sec-source-1",
        title: "Published Section",
        description: null,
        displayOrder: 0,
        questions: [
          {
            sourceQuestionId: "q-pub-1",
            title: "Is hardware installed?",
            description: null,
            responseType: "pass_fail_deficiencies",
            options: null,
            required: true,
            photoRequired: false,
            deficiencyPhotoRequired: false,
            deficiencyDescriptionEnabled: true,
            rawQuestion: { id: "q-pub-1", title: "Is hardware installed?", responseType: "pass_fail_deficiencies", required: true },
            isFailFollowUp: false,
            sourceParentQuestionId: null,
            displayOrder: 0,
          },
        ],
      },
    ];

    vi.mocked(db.form.findMany).mockResolvedValue([
      {
        ...FORM_FIXTURE,
        status: "PUBLISHED",
        draftSections: [{ id: "draft-secret", title: "Unpublished Edit", questions: [] }],
        versions: [{ id: "v1", versionNumber: 1, sections: {}, publishedAt: new Date() }],
      },
    ] as never);
    vi.mocked(db.inspectionFormVersionSection.findMany).mockResolvedValue(versionSections as never);

    const res = await listForms(
      makeRequest("GET", "http://x/api/forms?status=published") as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      forms: Array<{ draftSections: Array<{ id: string; title: string; questions: unknown[] }> }>;
    };
    expect(body.forms[0].draftSections[0].id).toBe("ver-sec-source-1");
    expect(body.forms[0].draftSections[0].questions).toHaveLength(1);
    expect(body.forms[0].draftSections[0].title).toBe("Published Section");
    expect(vi.mocked(db.inspectionFormVersionSection.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({ where: { formVersionId: { in: ["v1"] } } }),
    );
  });
});

// ── POST /api/forms ────────────────────────────────────────────────────────────

describe("POST /api/forms", () => {
  const VALID_BODY = {
    name: "Tile Inspection",
    description: "Checks tile installation quality",
    level: "scope",
    category: "tile",
    scopeTypeCodes: ["TIL"],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEffectiveSession).mockResolvedValue(ADMIN_SESSION as never);
    vi.mocked(hasPermission).mockReturnValue(true);
    vi.mocked(authorizeFormMutation).mockResolvedValue({ ok: true, userId: "user-1" });
    vi.mocked(db.user.findUnique).mockResolvedValue({ id: "user-1" } as never);
    vi.mocked(db.form.create).mockResolvedValue({ ...FORM_FIXTURE, ...VALID_BODY } as never);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(authorizeFormMutation).mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }) as never,
    });
    const res = await createForm(makeRequest("POST", "http://x/api/forms", VALID_BODY) as never);
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks MANAGE_FORMS permission", async () => {
    vi.mocked(authorizeFormMutation).mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Forbidden" }, { status: 403 }) as never,
    });
    const res = await createForm(makeRequest("POST", "http://x/api/forms", VALID_BODY) as never);
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid body (missing name)", async () => {
    const res = await createForm(
      makeRequest("POST", "http://x/api/forms", { level: "scope", category: "tile" }) as never,
    );
    expect(res.status).toBe(400);
  });

  it("creates form and returns 201", async () => {
    const res = await createForm(makeRequest("POST", "http://x/api/forms", VALID_BODY) as never);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { form: { name: string } };
    expect(body.form.name).toBe("Tile Inspection");
  });

  it("creates form with empty description (description is optional)", async () => {
    const bodyWithoutDesc = { name: "Quick Form", level: "unit", category: "general", scopeTypeCodes: [] };
    vi.mocked(db.form.create).mockResolvedValue({ ...FORM_FIXTURE, ...bodyWithoutDesc } as never);
    const res = await createForm(
      makeRequest("POST", "http://x/api/forms", bodyWithoutDesc) as never,
    );
    expect(res.status).toBe(201);
  });
});

// ── GET /api/forms/[id] ────────────────────────────────────────────────────────

describe("GET /api/forms/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEffectiveSession).mockResolvedValue(ADMIN_SESSION as never);
    vi.mocked(db.form.findUnique).mockResolvedValue(FORM_FIXTURE as never);
    vi.mocked(db.inspectionFormSection.findMany).mockResolvedValue([] as never);
    vi.mocked(db.inspectionFormVersionSection.findMany).mockResolvedValue([] as never);
    vi.mocked(hasPermission).mockImplementation(
      (_role, perm, special) =>
        perm === "forms:manage" &&
        (special?.includes("forms:manage") === true || _role === "ADMIN"),
    );
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue(null);
    const res = await getForm(makeRequest("GET", "http://x") as never, makeParams("form-1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when form does not exist", async () => {
    vi.mocked(db.form.findUnique).mockResolvedValue(null);
    const res = await getForm(makeRequest("GET", "http://x") as never, makeParams("missing"));
    expect(res.status).toBe(404);
  });

  it("returns form for authenticated user", async () => {
    const res = await getForm(makeRequest("GET", "http://x") as never, makeParams("form-1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { form: { name: string } };
    expect(body.form.name).toBe("Pre-Installation Inspection");
  });

  it("returns 403 for MEMBER fetching a draft form", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue(MEMBER_SESSION as never);
    vi.mocked(hasPermission).mockReturnValue(false);
    vi.mocked(db.form.findUnique).mockResolvedValue({ ...FORM_FIXTURE, status: "DRAFT" } as never);
    const res = await getForm(makeRequest("GET", "http://x") as never, makeParams("form-1"));
    expect(res.status).toBe(403);
  });

  it("allows MEMBER to fetch a published form for inspections", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue(MEMBER_SESSION as never);
    vi.mocked(hasPermission).mockReturnValue(false);
    vi.mocked(db.form.findUnique).mockResolvedValue({ ...FORM_FIXTURE, status: "PUBLISHED" } as never);
    const res = await getForm(makeRequest("GET", "http://x") as never, makeParams("form-1"));
    expect(res.status).toBe(200);
  });

  it("returns published version sections only for MEMBER on published form (no draft leak)", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue(MEMBER_SESSION as never);
    vi.mocked(hasPermission).mockReturnValue(false);
    const publishedSections = [{ id: "pub-section-1", title: "Published Section" }];
    const inProgressDraft = [{ id: "draft-secret", title: "Unpublished Edit" }];
    vi.mocked(db.form.findUnique).mockResolvedValue({
      ...FORM_FIXTURE,
      status: "PUBLISHED",
      draftSections: inProgressDraft,
      versions: [{ id: "v1", versionNumber: 1, sections: publishedSections, publishedAt: new Date() }],
    } as never);
    const res = await getForm(makeRequest("GET", "http://x") as never, makeParams("form-1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { form: { draftSections: unknown[] } };
    expect(body.form.draftSections).toEqual(publishedSections);
    expect(vi.mocked(db.inspectionFormSection.findMany)).not.toHaveBeenCalled();
  });

  it("hydrates published form from version relational mirror when JSON sections stub is empty", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue(MEMBER_SESSION as never);
    vi.mocked(hasPermission).mockReturnValue(false);
    const versionSections = [
      {
        id: "ver-sec-1",
        formVersionId: "v1",
        sourceSectionId: "ver-sec-source-1",
        title: "Published Section",
        description: null,
        displayOrder: 0,
        questions: [
          {
            sourceQuestionId: "q-pub-1",
            title: "Is hardware installed?",
            description: null,
            responseType: "pass_fail_deficiencies",
            options: null,
            required: true,
            photoRequired: false,
            deficiencyPhotoRequired: false,
            deficiencyDescriptionEnabled: true,
            rawQuestion: { id: "q-pub-1", title: "Is hardware installed?", responseType: "pass_fail_deficiencies", required: true },
            isFailFollowUp: false,
            sourceParentQuestionId: null,
            displayOrder: 0,
          },
        ],
      },
    ];
    vi.mocked(db.form.findUnique).mockResolvedValue({
      ...FORM_FIXTURE,
      status: "PUBLISHED",
      draftSections: [{ id: "draft-secret", title: "Unpublished Edit", questions: [] }],
      versions: [{ id: "v1", versionNumber: 1, sections: {}, publishedAt: new Date() }],
    } as never);
    vi.mocked(db.inspectionFormVersionSection.findMany).mockResolvedValue(versionSections as never);

    const res = await getForm(makeRequest("GET", "http://x") as never, makeParams("form-1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { form: { draftSections: Array<{ id: string; questions: unknown[] }> } };
    expect(body.form.draftSections[0].id).toBe("ver-sec-source-1");
    expect(body.form.draftSections[0].questions).toHaveLength(1);
  });
});

// ── PATCH /api/forms/[id] (save draft) ───────────────────────────────────────

describe("PATCH /api/forms/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authorizeFormMutation).mockResolvedValue({ ok: true, userId: "user-1" });
    vi.mocked(db.form.findUnique).mockResolvedValue({ id: "form-1" } as never);
    vi.mocked(db.form.update).mockResolvedValue({ ...FORM_FIXTURE, name: "Updated Name" } as never);
    vi.mocked(db.inspectionFormSection.deleteMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(db.inspectionFormSection.create).mockResolvedValue({ id: "section-1" } as never);
    vi.mocked(db.inspectionFormSection.findMany).mockResolvedValue([] as never);
    vi.mocked(db.inspectionFormQuestion.create).mockResolvedValue({ id: "question-1" } as never);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(authorizeFormMutation).mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }) as never,
    });
    const res = await patchForm(
      makeRequest("PATCH", "http://x", { name: "New" }) as never,
      makeParams("form-1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks MANAGE_FORMS permission", async () => {
    vi.mocked(authorizeFormMutation).mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Forbidden" }, { status: 403 }) as never,
    });
    const res = await patchForm(
      makeRequest("PATCH", "http://x", { name: "New" }) as never,
      makeParams("form-1"),
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when form does not exist", async () => {
    vi.mocked(db.form.findUnique).mockResolvedValue(null);
    const res = await patchForm(
      makeRequest("PATCH", "http://x", { name: "New" }) as never,
      makeParams("missing"),
    );
    expect(res.status).toBe(404);
  });

  it("saves draft and returns updated form", async () => {
    const res = await patchForm(
      makeRequest("PATCH", "http://x", { name: "Updated Name" }) as never,
      makeParams("form-1"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { form: { name: string } };
    expect(body.form.name).toBe("Updated Name");
  });

  it("persists level and category when setup changes (Gypcrete → unit-level)", async () => {
    vi.mocked(db.form.findUnique).mockResolvedValue({
      id: "form-1",
      category: "OTHER",
      level: "scope",
      scopeTypeCodes: ["TIL"],
    } as never);

    const res = await patchForm(
      makeRequest("PATCH", "http://x", {
        category: "GYPCRETE_MOISTURE_TEST",
        level: "unit",
        scopeTypeCodes: [],
      }) as never,
      makeParams("form-1"),
    );

    expect(res.status).toBe(200);
    expect(db.form.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          category: "GYPCRETE_MOISTURE_TEST",
          level: "unit",
          scopeTypeCodes: [],
        }),
      }),
    );
  });

  it("updates formPurpose to documentation without resyncing draft sections", async () => {
    vi.mocked(db.form.findUnique).mockResolvedValue({
      id: "form-1",
      category: "CLEAR_INSPECTION",
      level: "project",
      scopeTypeCodes: [],
      purpose: "inspection",
    } as never);

    const res = await patchForm(
      makeRequest("PATCH", "http://x", {
        formPurpose: "documentation",
        level: "project",
        category: "OTHER",
        scopeTypeCodes: [],
      }) as never,
      makeParams("form-1"),
    );

    expect(res.status).toBe(200);
    expect(db.inspectionFormSection.deleteMany).not.toHaveBeenCalled();
    expect(db.form.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          purpose: "documentation",
          category: "OTHER",
          level: "project",
        }),
      }),
    );
  });

  it("accepts metadata-only PATCH without a name field", async () => {
    vi.mocked(db.form.findUnique).mockResolvedValue({
      id: "form-1",
      category: "OTHER",
      level: "project",
      scopeTypeCodes: [],
      purpose: "inspection",
    } as never);

    const res = await patchForm(
      makeRequest("PATCH", "http://x", { formPurpose: "documentation" }) as never,
      makeParams("form-1"),
    );

    expect(res.status).toBe(200);
  });

  it("accepts TWO_AREA_CLEAR draft save with long form description (2AC boilerplate text)", async () => {
    vi.mocked(db.form.findUnique).mockResolvedValue({
      id: "form-1",
      category: "TWO_AREA_CLEAR",
      level: "scope",
      scopeTypeCodes: ["TOP"],
      purpose: "inspection",
    } as never);

    const longDescription = "The main purpose of the two area clear is to generate a written report. ".repeat(12);

    const res = await patchForm(
      makeRequest("PATCH", "http://x", {
        name: "2 Area Clear",
        description: longDescription,
        level: "scope",
        category: "TWO_AREA_CLEAR",
        formPurpose: "inspection",
        scopeTypeCodes: ["TOP"],
        draftSections: [
          {
            id: "sec-1",
            title: "Section 1",
            questions: [
              {
                id: "q-1",
                title: "CP Build Representative (list)",
                responseType: "PARAGRAPH",
                required: true,
                options: [],
              },
            ],
          },
        ],
      }) as never,
      makeParams("form-1"),
    );

    expect(res.status).toBe(200);
  });
});

// ── DELETE /api/forms/[id] ────────────────────────────────────────────────────

describe("DELETE /api/forms/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authorizeFormMutation).mockResolvedValue({ ok: true, userId: "user-1" });
    vi.mocked(db.form.findUnique).mockResolvedValue({ id: "form-1" } as never);
    vi.mocked(db.form.delete).mockResolvedValue(FORM_FIXTURE as never);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(authorizeFormMutation).mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }) as never,
    });
    const res = await deleteForm(makeRequest("DELETE", "http://x") as never, makeParams("form-1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks MANAGE_FORMS permission", async () => {
    vi.mocked(authorizeFormMutation).mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Forbidden" }, { status: 403 }) as never,
    });
    const res = await deleteForm(makeRequest("DELETE", "http://x") as never, makeParams("form-1"));
    expect(res.status).toBe(403);
  });

  it("returns 404 when form does not exist", async () => {
    vi.mocked(db.form.findUnique).mockResolvedValue(null);
    const res = await deleteForm(makeRequest("DELETE", "http://x") as never, makeParams("missing"));
    expect(res.status).toBe(404);
  });

  it("deletes form and returns success", async () => {
    const res = await deleteForm(makeRequest("DELETE", "http://x") as never, makeParams("form-1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);
  });
});
