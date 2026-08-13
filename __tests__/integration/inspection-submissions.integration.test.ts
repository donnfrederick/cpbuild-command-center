/**
 * Integration tests for /api/inspection-submissions (GET, POST)
 * and /api/inspection-submissions/[id] (PUT)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: vi.fn(),
    form: {
      findUnique: vi.fn(),
    },
    formVersion: {
      findFirst: vi.fn(),
    },
    inspectionFormVersionSection: {
      findMany: vi.fn(),
    },
    inspectionSubmission: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    inspectionDeficiency: {
      deleteMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    inspectionFormVersionQuestion: {
      findMany: vi.fn(),
    },
    inspectionAnswer: {
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    inspectionAnswerMedia: {
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    clearInspection: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    inspectionType: {
      findUniqueOrThrow: vi.fn((args: { where: { code: string } }) => {
        if (args.where.code === "CALIBRATION_INSPECTION") {
          return Promise.resolve({ id: "insp_type_calibration" });
        }
        return Promise.resolve({ id: "insp_type_clear" });
      }),
    },
    projectRow: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    projectSubScopeInstance: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/session-db-user", () => ({
  resolveSessionToDbUserId: vi.fn(async (user: { id: string }) => user.id),
}));

vi.mock("@/lib/masquerade", () => ({
  getEffectiveSession: vi.fn(),
}));

vi.mock("@/lib/production-project-access", () => ({
  enforceProjectReadVisibility: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/sub-scopes", () => ({
  hasSubScopeInstances: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
  resolveActorName: vi.fn().mockResolvedValue("Alice"),
  getActivityReplayMetadata: vi.fn(() => ({})),
}));

const { mockHydrateSubmissionView, mockReclassifyClearSubmissionToCalibration } = vi.hoisted(() => ({
  mockHydrateSubmissionView: vi.fn(),
  mockReclassifyClearSubmissionToCalibration: vi.fn(),
}));

vi.mock("@/lib/inspections/hydrate-inspection-submission-view", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/inspections/hydrate-inspection-submission-view")
  >();
  return {
    ...actual,
    hydrateInspectionSubmissionView: mockHydrateSubmissionView,
  };
});

vi.mock("@/lib/inspections/reclassify-submission-calibration", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/inspections/reclassify-submission-calibration")
  >();
  return {
    ...actual,
    reclassifyClearSubmissionToCalibration: mockReclassifyClearSubmissionToCalibration,
  };
});

import {
  GET as listSubmissions,
  POST as createSubmission,
} from "@/app/api/inspection-submissions/route";
import { PUT as updateSubmission, GET as getSubmissionById } from "@/app/api/inspection-submissions/[id]/route";
import { db } from "@/lib/db";
import { getEffectiveSession } from "@/lib/masquerade";
import { enforceProjectReadVisibility } from "@/lib/production-project-access";
import { voidLogFieldActivity } from "@/lib/activity/log-field-activity";
import { logActivity } from "@/lib/activity-logger";
import { hasSubScopeInstances } from "@/lib/sub-scopes";
import { PROJECT_LEVEL_INSPECTION_UNIT_ID } from "@/lib/inspections/unit-inspection-ref";

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
  user: { id: "user-1", name: "Admin", email: "admin@cp.build", role: "ADMIN", specialPermissions: [] },
};

const INSTALL_MANAGER_SESSION = {
  user: {
    id: "user-2",
    name: "IM",
    email: "im@cp.build",
    role: "INSTALL_MANAGER",
    specialPermissions: [],
  },
};

const SUBMISSION_FIXTURE = {
  id: "sub-1",
  formId: "form-1",
  formVersionId: "ver-1",
  templateSnapshot: { id: "form-1", name: "Pre-Install", sections: [] },
  projectId: "proj-1",
  unitId: "unit-1",
  scopeRowId: "row-1",
  scopeTypeCode: "CAB",
  outcome: "PASS",
  deficiencyCount: 0,
  payload: { q1: "yes" },
  submittedAt: new Date(),
  form: { id: "form-1", name: "Pre-Install" },
  formVersion: { id: "ver-1", versionNumber: 1 },
  clearInspection: {
    inspectedById: "user-1",
    inspectedBy: { id: "user-1", name: "Alice" },
  },
};

const VALID_SUBMIT_BODY = {
  formId: "form-1",
  formVersionId: "ver-1",
  templateSnapshot: { id: "form-1", name: "Pre-Install", sections: [] },
  projectId: "proj-1",
  unitId: "unit-1",
  scopeRowId: "row-1",
  scopeTypeCode: "CAB",
  outcome: "PASS",
  deficiencyCount: 0,
  payload: { q1: "yes" },
};

// ── GET /api/inspection-submissions ───────────────────────────────────────────

describe("GET /api/inspection-submissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEffectiveSession).mockResolvedValue(ADMIN_SESSION as never);
    vi.mocked(db.inspectionSubmission.findMany).mockResolvedValue([SUBMISSION_FIXTURE] as never);
    mockHydrateSubmissionView.mockImplementation(async (submission) => ({
      templateSnapshot: submission.templateSnapshot,
      payload: isRecord(submission.payload) ? submission.payload : {},
    }));
  });

  function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue(null);
    const res = await listSubmissions(
      makeRequest("GET", "http://x?scopeRowId=row-1") as never,
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when no filter query param provided", async () => {
    const res = await listSubmissions(makeRequest("GET", "http://x") as never);
    expect(res.status).toBe(400);
  });

  it("returns submissions filtered by scopeRowId", async () => {
    const res = await listSubmissions(
      makeRequest("GET", "http://x?scopeRowId=row-1") as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { submissions: typeof SUBMISSION_FIXTURE[] };
    expect(body.submissions).toHaveLength(1);
    expect(body.submissions[0].scopeRowId).toBe("row-1");
  });

  it("returns submissions filtered by unitId", async () => {
    vi.mocked(db.inspectionSubmission.findMany).mockResolvedValue([SUBMISSION_FIXTURE] as never);
    const res = await listSubmissions(
      makeRequest("GET", "http://x?unitId=unit-1") as never,
    );
    expect(res.status).toBe(200);
  });

  it("returns 400 when unit location ref is queried without projectId", async () => {
    const res = await listSubmissions(
      makeRequest("GET", "http://x?unitId=B1%7C3%7C209") as never,
    );
    expect(res.status).toBe(400);
  });

  it("filters unit-level rows when unitId is a location ref with projectId", async () => {
    await listSubmissions(
      makeRequest("GET", "http://x?unitId=B1%7C3%7C209&projectId=proj-1") as never,
    );
    expect(vi.mocked(db.inspectionSubmission.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          unitId: "B1|3|209",
          scopeRowId: null,
          projectId: "proj-1",
        }),
      }),
    );
  });

  it("preserves scopeRowId when combined with project-level unitId sentinel", async () => {
    await listSubmissions(
      makeRequest(
        "GET",
        `http://x?scopeRowId=row-1&unitId=${encodeURIComponent(PROJECT_LEVEL_INSPECTION_UNIT_ID)}`,
      ) as never,
    );
    expect(vi.mocked(db.inspectionSubmission.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          scopeRowId: "row-1",
          unitId: PROJECT_LEVEL_INSPECTION_UNIT_ID,
        }),
      }),
    );
  });

  it("returns submissions filtered by projectId", async () => {
    const res = await listSubmissions(
      makeRequest("GET", "http://x?projectId=proj-1") as never,
    );
    expect(res.status).toBe(200);
  });

  it("returns empty array when no matching submissions", async () => {
    vi.mocked(db.inspectionSubmission.findMany).mockResolvedValue([] as never);
    const res = await listSubmissions(
      makeRequest("GET", "http://x?scopeRowId=no-match") as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { submissions: unknown[] };
    expect(body.submissions).toHaveLength(0);
  });

  it("hydrates relational stub submissions for the record viewer", async () => {
    const relationalStub = {
      ...SUBMISSION_FIXTURE,
      templateSnapshot: { category: "CLEAR_INSPECTION" },
      payload: {},
      source: "FORM" as const,
      form: {
        id: "form-1",
        name: "Clear Inspection",
        category: "CLEAR_INSPECTION",
        level: "scope",
        scopeTypeCodes: ["TIL"],
        description: "",
      },
    };
    vi.mocked(db.inspectionSubmission.findMany).mockResolvedValue([relationalStub] as never);
    mockHydrateSubmissionView.mockResolvedValue({
      templateSnapshot: {
        id: "form-1",
        name: "Clear Inspection",
        category: "CLEAR_INSPECTION",
        sections: [{ id: "s1", title: "Section", questions: [{ id: "q1", title: "Q1" }] }],
      },
      payload: { q1: { choice: "pass" } },
    });

    const res = await listSubmissions(
      makeRequest("GET", "http://x?scopeRowId=row-1") as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      submissions: Array<{ payload: Record<string, unknown>; templateSnapshot: { sections: unknown[] } }>;
    };
    expect(mockHydrateSubmissionView).toHaveBeenCalledWith(relationalStub);
    expect(body.submissions[0].payload).toEqual({ q1: { choice: "pass" } });
    expect(body.submissions[0].templateSnapshot.sections).toHaveLength(1);
  });
});

// ── POST /api/inspection-submissions ──────────────────────────────────────────

describe("POST /api/inspection-submissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEffectiveSession).mockResolvedValue(ADMIN_SESSION as never);
    vi.mocked(db.$transaction).mockImplementation(async (callback) => callback(db) as never);
    // Default: non-CLEAR_INSPECTION form so business rules don't trigger.
    vi.mocked(db.form.findUnique).mockResolvedValue({ id: "form-1", name: "Pre-Install", category: "PRE_INSTALL", level: "scope" } as never);
    vi.mocked(db.formVersion.findFirst).mockResolvedValue({ id: "ver-1" } as never);
    vi.mocked(db.inspectionFormVersionSection.findMany).mockResolvedValue([
      {
        formVersionId: "ver-1",
        sourceSectionId: "s1",
        title: "Section",
        description: null,
        questions: [
          {
            sourceQuestionId: "q1",
            title: "Q1",
            description: null,
            responseType: "YES_NO",
            options: null,
            required: false,
            photoRequired: false,
            deficiencyPhotoRequired: false,
            deficiencyDescriptionEnabled: null,
            isFailFollowUp: false,
            rawQuestion: { id: "q1", title: "Q1", responseType: "YES_NO", options: [] },
          },
        ],
      },
    ] as never);
    vi.mocked(db.inspectionSubmission.create).mockResolvedValue(SUBMISSION_FIXTURE as never);
    vi.mocked(db.inspectionSubmission.findUnique).mockResolvedValue(SUBMISSION_FIXTURE as never);
    vi.mocked(db.inspectionSubmission.findFirst).mockResolvedValue(null as never);
    vi.mocked(db.inspectionSubmission.count).mockResolvedValue(1 as never);
    vi.mocked(db.inspectionDeficiency.deleteMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(db.inspectionDeficiency.create).mockResolvedValue({ id: "def-row-1" } as never);
    vi.mocked(db.inspectionFormVersionQuestion.findMany).mockResolvedValue([{ id: "fvq-1", sourceQuestionId: "q1" }] as never);
    vi.mocked(db.inspectionAnswer.deleteMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(db.inspectionAnswer.create).mockResolvedValue({ id: "answer-1", questionId: "q1" } as never);
    vi.mocked(db.inspectionAnswerMedia.deleteMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(db.inspectionAnswerMedia.create).mockResolvedValue({ id: "media-1" } as never);
    vi.mocked(db.clearInspection.create).mockResolvedValue({ id: "clear-1" } as never);
    vi.mocked(db.projectRow.findUnique).mockResolvedValue({
      building: "South",
      level: "1",
      unit: "S108",
      scopeType: { name: "Cabinets" },
    } as never);
    vi.mocked(db.projectRow.update).mockResolvedValue({} as never);
    vi.mocked(logActivity).mockResolvedValue(undefined as never);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue(null);
    const res = await createSubmission(
      makeRequest("POST", "http://x", VALID_SUBMIT_BODY) as never,
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await createSubmission(
      makeRequest("POST", "http://x", { formId: "form-1" }) as never,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid outcome value", async () => {
    const res = await createSubmission(
      makeRequest("POST", "http://x", { ...VALID_SUBMIT_BODY, outcome: "UNKNOWN" }) as never,
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when referenced form does not exist", async () => {
    vi.mocked(db.form.findUnique).mockResolvedValue(null);
    const res = await createSubmission(
      makeRequest("POST", "http://x", VALID_SUBMIT_BODY) as never,
    );
    expect(res.status).toBe(404);
  });

  it("creates submission and returns 201", async () => {
    const res = await createSubmission(
      makeRequest("POST", "http://x", VALID_SUBMIT_BODY) as never,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { submission: { outcome: string } };
    expect(body.submission.outcome).toBe("PASS");
  });

  it("creates FAIL submission with deficiency count > 0", async () => {
    const failBody = { ...VALID_SUBMIT_BODY, outcome: "FAIL", deficiencyCount: 3 };
    vi.mocked(db.inspectionSubmission.create).mockResolvedValue({
      ...SUBMISSION_FIXTURE,
      outcome: "FAIL",
      deficiencyCount: 3,
    } as never);
    vi.mocked(db.inspectionSubmission.findUnique).mockResolvedValue({
      ...SUBMISSION_FIXTURE,
      outcome: "FAIL",
      deficiencyCount: 3,
    } as never);
    const res = await createSubmission(makeRequest("POST", "http://x", failBody) as never);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { submission: { outcome: string; deficiencyCount: number } };
    expect(body.submission.outcome).toBe("FAIL");
    expect(body.submission.deficiencyCount).toBe(3);
  });

  it("normalizes deficiencies from the submission payload", async () => {
    const templateSnapshot = {
      sections: [
        {
          questions: [
            {
              id: "q1",
              title: "Cabinet quality",
              responseType: "PASS_FAIL_DEFICIENCIES",
            },
          ],
        },
      ],
    };
    vi.mocked(db.inspectionSubmission.create).mockResolvedValue({
      ...SUBMISSION_FIXTURE,
      templateSnapshot,
      outcome: "FAIL",
      deficiencyCount: 1,
      payload: {
        q1: {
          choice: "fail",
          deficiencies: [
            {
              id: "def-1",
              description: "Door reveal is uneven.",
              severity: "Major",
              count: 1,
            },
          ],
        },
      },
    } as never);

    const res = await createSubmission(
      makeRequest("POST", "http://x", {
        ...VALID_SUBMIT_BODY,
        templateSnapshot,
        outcome: "FAIL",
        deficiencyCount: 1,
        payload: {
          q1: {
            choice: "fail",
            deficiencies: [
              {
                id: "def-1",
                description: "Door reveal is uneven.",
                severity: "Major",
                count: 1,
              },
            ],
          },
        },
      }) as never,
    );

    expect(res.status).toBe(201);
    expect(vi.mocked(db.inspectionDeficiency.deleteMany)).toHaveBeenCalledWith({
      where: { inspectionAnswer: { inspectionSubmissionId: "sub-1" } },
    });
    expect(vi.mocked(db.inspectionDeficiency.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          inspectionAnswerId: "answer-1",
          sourceDeficiencyId: "def-1",
          description: "Door reveal is uneven.",
          severity: "Major",
        }),
      }),
    );
    expect(vi.mocked(db.inspectionAnswer.deleteMany)).toHaveBeenCalledWith({
      where: { inspectionSubmissionId: "sub-1" },
    });
    expect(vi.mocked(db.inspectionAnswer.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          inspectionSubmissionId: "sub-1",
          formVersionQuestionId: "fvq-1",
          questionId: "q1",
          choiceValue: "fail",
          isFailed: true,
          hasDeficiencies: true,
          deficiencyCount: 1,
          rawAnswer: {
            choice: "fail",
            deficiencies: [
              {
                id: "def-1",
                description: "Door reveal is uneven.",
                severity: "Major",
                count: 1,
              },
            ],
          },
        }),
      }),
    );
  });

  it("creates unit-level submission without scopeRowId", async () => {
    vi.mocked(db.form.findUnique).mockResolvedValue({
      id: "form-gyp",
      name: "Gypcrete Moisture Test",
      category: "GYPCRETE_MOISTURE_TEST",
      level: "unit",
    } as never);
    const minimalBody = {
      formId: "form-gyp",
      formVersionId: "ver-1",
      projectId: "proj-1",
      unitId: "B1|3|209",
      outcome: "COMPLETE",
      deficiencyCount: 0,
      payload: {},
    };
    vi.mocked(db.inspectionSubmission.create).mockResolvedValue({
      ...SUBMISSION_FIXTURE,
      formId: "form-gyp",
      unitId: "B1|3|209",
      scopeRowId: null,
      scopeTypeCode: null,
      outcome: "COMPLETE",
    } as never);
    const res = await createSubmission(makeRequest("POST", "http://x", minimalBody) as never);
    expect(res.status).toBe(201);
  });

  it("creates project-level submission with sentinel unitId and no scopeRowId", async () => {
    vi.mocked(db.form.findUnique).mockResolvedValue({
      id: "form-daily",
      name: "Daily Update",
      category: "OTHER",
      level: "project",
    } as never);
    const body = {
      formId: "form-daily",
      formVersionId: "ver-1",
      projectId: "proj-1",
      unitId: "||",
      outcome: "COMPLETE",
      deficiencyCount: 0,
      payload: {},
    };
    vi.mocked(db.inspectionSubmission.create).mockResolvedValue({
      ...SUBMISSION_FIXTURE,
      formId: "form-daily",
      unitId: "||",
      scopeRowId: null,
      scopeTypeCode: null,
      outcome: "COMPLETE",
    } as never);
    const res = await createSubmission(makeRequest("POST", "http://x", body) as never);
    expect(res.status).toBe(201);
    expect(db.inspectionSubmission.create).toHaveBeenCalled();
  });

  it("accepts Gypcrete without scopeRowId when form.level is scope in DB", async () => {
    vi.mocked(db.form.findUnique).mockResolvedValue({
      id: "form-gyp-legacy",
      name: "Gypcrete Moisture Test",
      category: "GYPCRETE_MOISTURE_TEST",
      level: "scope",
    } as never);
    const body = {
      formId: "form-gyp-legacy",
      formVersionId: "ver-1",
      projectId: "proj-1",
      unitId: "B1|3|209",
      outcome: "PASS",
      deficiencyCount: 0,
      payload: {},
    };
    vi.mocked(db.inspectionSubmission.create).mockResolvedValue({
      ...SUBMISSION_FIXTURE,
      formId: "form-gyp-legacy",
      unitId: "B1|3|209",
      scopeRowId: null,
      outcome: "PASS",
    } as never);
    const res = await createSubmission(makeRequest("POST", "http://x", body) as never);
    expect(res.status).toBe(201);
  });

  // ── CLEAR_INSPECTION business rules ─────────────────────────────────────────

  it("returns 422 when scope is not Install·Complete for CLEAR_INSPECTION form", async () => {
    vi.mocked(db.form.findUnique).mockResolvedValue({ id: "form-1", name: "Clear Inspection", category: "CLEAR_INSPECTION", level: "scope" } as never);
    vi.mocked(hasSubScopeInstances).mockResolvedValue(false);
    vi.mocked(db.projectRow.findUnique).mockResolvedValue({ scopeStage: "PRE_INSTALL", scopeStatus: "COMPLETE", unifierSubId: "sub-1" } as never);
    const res = await createSubmission(
      makeRequest("POST", "http://x", VALID_SUBMIT_BODY) as never,
    );
    expect(res.status).toBe(422);
  });

  it("allows CLEAR_INSPECTION when parent scope is Install·Complete regardless of sub-scope instances", async () => {
    vi.mocked(db.form.findUnique).mockResolvedValue({ id: "form-1", name: "Clear Inspection", category: "CLEAR_INSPECTION", level: "scope" } as never);
    vi.mocked(db.projectRow.findUnique).mockResolvedValue({
      scopeStage: "INSTALL",
      scopeStatus: "COMPLETE",
      unifierSubId: "subcontractor-1",
    } as never);
    vi.mocked(db.inspectionSubmission.findFirst).mockResolvedValue(null as never);
    vi.mocked(db.inspectionSubmission.count).mockResolvedValue(1 as never);
    vi.mocked(db.inspectionSubmission.findMany).mockResolvedValue([
      {
        outcome: "PASS",
        source: "FORM",
        templateSnapshot: { category: "CLEAR_INSPECTION" },
        form: { category: "CLEAR_INSPECTION" },
      },
    ] as never);

    const res = await createSubmission(
      makeRequest("POST", "http://x", VALID_SUBMIT_BODY) as never,
    );
    expect(res.status).toBe(201);
  });

  it("returns 422 when parent scope is not Install·Complete even if sub-scope instances are complete", async () => {
    vi.mocked(db.form.findUnique).mockResolvedValue({ id: "form-1", name: "Clear Inspection", category: "CLEAR_INSPECTION", level: "scope" } as never);
    vi.mocked(db.projectRow.findUnique).mockResolvedValue({
      scopeStage: "INSTALL",
      scopeStatus: "IN_PROGRESS",
      unifierSubId: "subcontractor-1",
    } as never);

    const res = await createSubmission(
      makeRequest("POST", "http://x", VALID_SUBMIT_BODY) as never,
    );
    expect(res.status).toBe(422);
  });

  it("returns 409 when scope already has a passing clear inspection", async () => {
    vi.mocked(db.form.findUnique).mockResolvedValue({ id: "form-1", name: "Clear Inspection", category: "CLEAR_INSPECTION", level: "scope" } as never);
    vi.mocked(hasSubScopeInstances).mockResolvedValue(false);
    vi.mocked(db.projectRow.findUnique).mockResolvedValue({ scopeStage: "INSTALL", scopeStatus: "COMPLETE", unifierSubId: "subcontractor-1" } as never);
    vi.mocked(db.inspectionSubmission.findFirst).mockResolvedValue({ id: "existing-pass" } as never);
    const res = await createSubmission(
      makeRequest("POST", "http://x", VALID_SUBMIT_BODY) as never,
    );
    expect(res.status).toBe(409);
  });

  it("returns 422 when CLEAR_INSPECTION scope has no subcontractor assigned (non-admin)", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue(INSTALL_MANAGER_SESSION as never);
    vi.mocked(db.form.findUnique).mockResolvedValue({ id: "form-1", name: "Clear Inspection", category: "CLEAR_INSPECTION", level: "scope" } as never);
    vi.mocked(db.projectRow.findUnique).mockResolvedValue({ scopeStage: "INSTALL", scopeStatus: "COMPLETE", unifierSubId: null } as never);
    const res = await createSubmission(
      makeRequest("POST", "http://x", VALID_SUBMIT_BODY) as never,
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 when ADMIN CLEAR_INSPECTION has no subcontractor assigned", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue(ADMIN_SESSION as never);
    vi.mocked(db.form.findUnique).mockResolvedValue({ id: "form-1", name: "Clear Inspection", category: "CLEAR_INSPECTION", level: "scope" } as never);
    vi.mocked(db.projectRow.findUnique).mockResolvedValue({ scopeStage: "INSTALL", scopeStatus: "COMPLETE", unifierSubId: null } as never);
    const res = await createSubmission(
      makeRequest("POST", "http://x", VALID_SUBMIT_BODY) as never,
    );
    expect(res.status).toBe(422);
  });

  it("syncs inspectionStatus on scope row when CLEAR_INSPECTION FAIL is submitted", async () => {
    vi.mocked(db.form.findUnique).mockResolvedValue({ id: "form-1", name: "Clear Inspection", category: "CLEAR_INSPECTION", level: "scope" } as never);
    vi.mocked(db.projectRow.findUnique).mockResolvedValue({ scopeStage: "INSTALL", scopeStatus: "COMPLETE", unifierSubId: "subcontractor-1" } as never);
    vi.mocked(db.inspectionSubmission.findFirst).mockResolvedValue(null as never);
    vi.mocked(db.inspectionSubmission.count).mockResolvedValue(1 as never);
    vi.mocked(db.inspectionSubmission.create).mockResolvedValue({ ...SUBMISSION_FIXTURE, outcome: "FAIL" } as never);
    vi.mocked(db.inspectionSubmission.findMany).mockResolvedValue([
      {
        outcome: "FAIL",
        source: "FORM",
        templateSnapshot: { category: "CLEAR_INSPECTION" },
        form: { category: "CLEAR_INSPECTION" },
      },
    ] as never);

    const res = await createSubmission(
      makeRequest("POST", "http://x", { ...VALID_SUBMIT_BODY, outcome: "FAIL" }) as never,
    );
    expect(res.status).toBe(201);
    expect(vi.mocked(db.projectRow.update)).toHaveBeenCalledWith(
      expect.objectContaining({ data: { inspectionStatus: "FAILED" } }),
    );
    expect(vi.mocked(db.clearInspection.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rowId: "row-1",
          status: "FAILED",
          inspectionSubmissionId: "sub-1",
          inspectionTypeId: "insp_type_clear",
          inspectedById: "user-1",
        }),
      }),
    );
  });

  it("returns 400 when calibration omits calibratedAgainstSubmissionId", async () => {
    vi.mocked(db.form.findUnique).mockResolvedValue({ id: "form-1", name: "Clear Inspection", category: "CLEAR_INSPECTION", level: "scope" } as never);

    const res = await createSubmission(
      makeRequest("POST", "http://x", {
        ...VALID_SUBMIT_BODY,
        outcome: "PASS",
        categoryOverride: "CALIBRATION_INSPECTION",
      }) as never,
    );

    expect(res.status).toBe(400);
    expect(vi.mocked(db.inspectionSubmission.create)).not.toHaveBeenCalled();
  });

  it("does not sync scope inspectionStatus when a calibration submission passes after a failed clear inspection", async () => {
    vi.mocked(db.form.findUnique).mockResolvedValue({ id: "form-1", name: "Clear Inspection", category: "CLEAR_INSPECTION", level: "scope" } as never);
    vi.mocked(db.clearInspection.findFirst).mockResolvedValue({ id: "clear-original" } as never);
    vi.mocked(db.inspectionSubmission.create).mockResolvedValue({
      ...SUBMISSION_FIXTURE,
      outcome: "PASS",
      templateSnapshot: { category: "CALIBRATION_INSPECTION" },
    } as never);

    const res = await createSubmission(
      makeRequest("POST", "http://x", {
        ...VALID_SUBMIT_BODY,
        outcome: "PASS",
        categoryOverride: "CALIBRATION_INSPECTION",
        calibratedAgainstSubmissionId: "cl01234567890123456789012",
      }) as never,
    );

    expect(res.status).toBe(201);
    expect(vi.mocked(db.projectRow.update)).not.toHaveBeenCalled();
    expect(vi.mocked(db.clearInspection.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rowId: "row-1",
          status: "PASSED",
          inspectionSubmissionId: "sub-1",
          inspectionTypeId: "insp_type_calibration",
          inspectedById: "user-1",
          calibratedAgainstClearInspectionId: "clear-original",
        }),
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(vi.mocked(voidLogFieldActivity)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ user: expect.any(Object) }),
      expect.objectContaining({
        eventType: "INSPECTION_SUBMITTED",
        category: "CALIBRATION_INSPECTION",
      }),
      expect.any(Object),
    );
  });

  it("fires logActivity after successful submission", async () => {
    vi.mocked(db.inspectionSubmission.count).mockResolvedValue(1 as never);
    await createSubmission(
      makeRequest("POST", "http://x", VALID_SUBMIT_BODY) as never,
    );
    // Drain the event loop so the fire-and-forget async block completes.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(vi.mocked(voidLogFieldActivity)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(voidLogFieldActivity)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ user: expect.any(Object) }),
      expect.objectContaining({ eventType: "INSPECTION_SUBMITTED", isEdit: false }),
      expect.any(Object),
    );
  });

  it("logs failed question count and total deficiency count for failed inspections", async () => {
    vi.mocked(db.inspectionSubmission.count).mockResolvedValue(1 as never);
    vi.mocked(db.inspectionFormVersionQuestion.findMany).mockResolvedValue([
      { id: "fvq-1", sourceQuestionId: "q1" },
      { id: "fvq-2", sourceQuestionId: "q2" },
      { id: "fvq-3", sourceQuestionId: "q3" },
    ] as never);
    vi.mocked(db.inspectionFormVersionSection.findMany).mockResolvedValue([
      {
        formVersionId: "ver-1",
        sourceSectionId: "s1",
        title: "Section",
        description: null,
        questions: [
          { sourceQuestionId: "q1", title: "Q1", description: null, responseType: "PASS_FAIL_DEFICIENCIES", options: null, required: false, photoRequired: false, deficiencyPhotoRequired: false, deficiencyDescriptionEnabled: null, isFailFollowUp: false, rawQuestion: { id: "q1" } },
          { sourceQuestionId: "q2", title: "Q2", description: null, responseType: "PASS_FAIL_DEFICIENCIES", options: null, required: false, photoRequired: false, deficiencyPhotoRequired: false, deficiencyDescriptionEnabled: null, isFailFollowUp: false, rawQuestion: { id: "q2" } },
          { sourceQuestionId: "q3", title: "Q3", description: null, responseType: "PASS_FAIL_DEFICIENCIES", options: null, required: false, photoRequired: false, deficiencyPhotoRequired: false, deficiencyDescriptionEnabled: null, isFailFollowUp: false, rawQuestion: { id: "q3" } },
        ],
      },
    ] as never);
    await createSubmission(
      makeRequest("POST", "http://x", {
        ...VALID_SUBMIT_BODY,
        outcome: "FAIL",
        deficiencyCount: 4,
        payload: {
          q1: {
            choice: "fail",
            deficiencies: [{ id: "def-1", count: 2 }],
          },
          q2: {
            choice: "fail",
            deficiencies: [{ id: "def-2", count: 1 }, { id: "def-3", count: 1 }],
          },
          q3: {
            choice: "pass",
            deficiencies: [{ id: "ignored", count: 7 }],
          },
        },
      }) as never,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(vi.mocked(voidLogFieldActivity)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ user: expect.any(Object) }),
      expect.objectContaining({
        eventType: "INSPECTION_SUBMITTED",
        outcome: "FAIL",
        failedQuestionCount: 2,
        totalDeficiencyCount: 4,
      }),
      expect.any(Object),
    );
  });

  it("returns 422 when scope-level form is submitted without scopeRowId", async () => {
    vi.mocked(db.form.findUnique).mockResolvedValue({
      id: "form-1",
      name: "Clear Inspection",
      category: "CLEAR_INSPECTION",
      level: "scope",
    } as never);

    const res = await createSubmission(
      makeRequest("POST", "http://x", {
        ...VALID_SUBMIT_BODY,
        scopeRowId: undefined,
      }) as never,
    );

    expect(res.status).toBe(422);
    expect(vi.mocked(db.inspectionSubmission.create)).not.toHaveBeenCalled();
  });

  it("returns 422 when unit-level form includes scopeRowId", async () => {
    vi.mocked(db.form.findUnique).mockResolvedValue({
      id: "form-gyp",
      name: "Gypcrete Moisture Test",
      category: "GYPCRETE_MOISTURE_TEST",
      level: "unit",
    } as never);

    const res = await createSubmission(
      makeRequest("POST", "http://x", {
        ...VALID_SUBMIT_BODY,
        formId: "form-gyp",
        unitId: "B1|3|209",
        scopeRowId: "row-1",
      }) as never,
    );

    expect(res.status).toBe(422);
    expect(vi.mocked(db.inspectionSubmission.create)).not.toHaveBeenCalled();
  });

  it("accepts unit-level Gypcrete with location ref and null scope side effects", async () => {
    vi.mocked(db.form.findUnique).mockResolvedValue({
      id: "form-gyp",
      name: "Gypcrete Moisture Test",
      category: "GYPCRETE_MOISTURE_TEST",
      level: "unit",
    } as never);
    vi.mocked(db.inspectionSubmission.create).mockResolvedValue({
      ...SUBMISSION_FIXTURE,
      formId: "form-gyp",
      unitId: "B1|3|209",
      scopeRowId: null,
      scopeTypeCode: null,
    } as never);

    const res = await createSubmission(
      makeRequest("POST", "http://x", {
        ...VALID_SUBMIT_BODY,
        formId: "form-gyp",
        unitId: "B1|3|209",
        scopeRowId: undefined,
        scopeTypeCode: undefined,
      }) as never,
    );

    expect(res.status).toBe(201);
    expect(vi.mocked(db.inspectionSubmission.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          unitId: "B1|3|209",
          scopeRowId: null,
        }),
      }),
    );
    expect(vi.mocked(db.projectRow.update)).not.toHaveBeenCalled();
    expect(vi.mocked(db.clearInspection.create)).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(vi.mocked(voidLogFieldActivity)).toHaveBeenCalledWith(
      "proj-1",
      expect.objectContaining({ user: expect.any(Object) }),
      expect.objectContaining({
        eventType: "INSPECTION_SUBMITTED",
        building: "B1",
        level: "3",
        unit: "209",
      }),
      expect.any(Object),
    );
  });
});

describe("PUT /api/inspection-submissions/[id]", () => {
  const EXISTING_SUBMISSION = {
    id: "sub-1",
    formId: "form-1",
    formVersionId: "ver-1",
    projectId: "proj-1",
    unitId: "unit-1",
    scopeRowId: "row-1",
    scopeTypeCode: "CAB",
    outcome: "FAIL",
    deficiencyCount: 2,
    payload: { q1: "no" },
    submittedAt: new Date(Date.now() - 3_600_000),
    source: "FORM" as const,
    form: { category: "CLEAR_INSPECTION" },
    templateSnapshot: { category: "CLEAR_INSPECTION" },
    clearInspection: { inspectedById: "user-1" },
  };

  const UPDATED_SUBMISSION = {
    ...SUBMISSION_FIXTURE,
    form: { id: "form-1", name: "Pre-Install" },
    formVersion: { id: "ver-1", versionNumber: 1 },
    outcome: "PASS",
  };

  const VALID_UPDATE_BODY = {
    outcome: "PASS",
    deficiencyCount: 0,
    payload: { q1: "pass" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEffectiveSession).mockResolvedValue(ADMIN_SESSION as never);
    vi.mocked(enforceProjectReadVisibility).mockResolvedValue(null);
    vi.mocked(db.inspectionSubmission.findUnique).mockResolvedValue(EXISTING_SUBMISSION as never);
    vi.mocked(db.inspectionSubmission.findFirst).mockResolvedValue(null as never);
    vi.mocked(db.inspectionSubmission.update).mockResolvedValue(UPDATED_SUBMISSION as never);
    vi.mocked(db.inspectionSubmission.count).mockResolvedValue(1 as never);
    vi.mocked(db.inspectionDeficiency.deleteMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(db.inspectionDeficiency.create).mockResolvedValue({ id: "def-row-1" } as never);
    vi.mocked(db.inspectionFormVersionSection.findMany).mockResolvedValue([
      {
        formVersionId: "ver-1",
        sourceSectionId: "s1",
        title: "Section",
        description: null,
        questions: [
          {
            sourceQuestionId: "q1",
            title: "Q1",
            description: null,
            responseType: "PASS_FAIL",
            options: null,
            required: false,
            photoRequired: false,
            deficiencyPhotoRequired: false,
            deficiencyDescriptionEnabled: null,
            isFailFollowUp: false,
            rawQuestion: { id: "q1", title: "Q1", responseType: "PASS_FAIL", options: [] },
          },
        ],
      },
    ] as never);
    vi.mocked(db.inspectionFormVersionQuestion.findMany).mockResolvedValue([{ id: "fvq-1", sourceQuestionId: "q1" }] as never);
    vi.mocked(db.inspectionAnswer.deleteMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(db.inspectionAnswer.create).mockResolvedValue({ id: "answer-1", questionId: "q1" } as never);
    vi.mocked(db.inspectionAnswerMedia.deleteMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(db.inspectionAnswerMedia.create).mockResolvedValue({ id: "media-1" } as never);
    vi.mocked(db.clearInspection.findUnique).mockResolvedValue(null as never);
    vi.mocked(db.clearInspection.upsert).mockResolvedValue({ id: "clear-1" } as never);
    vi.mocked(db.clearInspection.deleteMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(db.inspectionSubmission.findMany).mockResolvedValue([
      {
        outcome: "PASS",
        source: "FORM",
        templateSnapshot: { category: "CLEAR_INSPECTION" },
        form: { category: "CLEAR_INSPECTION" },
      },
    ] as never);
    vi.mocked(db.projectRow.findUnique).mockResolvedValue({
      building: "South",
      level: "1",
      unit: "S108",
      scopeType: { name: "Cabinets" },
    } as never);
    vi.mocked(db.projectRow.update).mockResolvedValue({} as never);
    vi.mocked(logActivity).mockResolvedValue(undefined as never);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue(null);
    const res = await updateSubmission(
      makeRequest("PUT", "http://x", VALID_UPDATE_BODY) as never,
      makeParams("sub-1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when a non-author tries to edit a field verification", async () => {
    vi.mocked(db.inspectionSubmission.findUnique).mockResolvedValue({
      ...EXISTING_SUBMISSION,
      form: { category: "FIELD_VERIFICATION" },
      templateSnapshot: { category: "FIELD_VERIFICATION" },
      clearInspection: { inspectedById: "other-user" },
    } as never);

    const res = await updateSubmission(
      makeRequest("PUT", "http://x", VALID_UPDATE_BODY) as never,
      makeParams("sub-1"),
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("original submitter");
  });

  it("returns 403 when a non-author tries to edit a clear inspection", async () => {
    vi.mocked(db.inspectionSubmission.findUnique).mockResolvedValue({
      ...EXISTING_SUBMISSION,
      clearInspection: { inspectedById: "other-user" },
    } as never);

    const res = await updateSubmission(
      makeRequest("PUT", "http://x", VALID_UPDATE_BODY) as never,
      makeParams("sub-1"),
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Only the original submitter can edit this inspection.");
  });

  it("returns 403 when a non-author tries to edit a calibration", async () => {
    vi.mocked(db.inspectionSubmission.findUnique).mockResolvedValue({
      ...EXISTING_SUBMISSION,
      templateSnapshot: { category: "CALIBRATION_INSPECTION" },
      clearInspection: { inspectedById: "other-user" },
    } as never);

    const res = await updateSubmission(
      makeRequest("PUT", "http://x", VALID_UPDATE_BODY) as never,
      makeParams("sub-1"),
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Only the original submitter can edit this inspection.");
  });

  it("returns 200 when the field verification author edits their submission", async () => {
    vi.mocked(db.inspectionSubmission.findUnique).mockResolvedValue({
      ...EXISTING_SUBMISSION,
      form: { category: "FIELD_VERIFICATION" },
      templateSnapshot: { category: "FIELD_VERIFICATION" },
      clearInspection: { inspectedById: "user-1" },
    } as never);
    vi.mocked(db.inspectionSubmission.findMany).mockResolvedValue([
      {
        outcome: "PASS",
        source: "FORM",
        templateSnapshot: { category: "FIELD_VERIFICATION" },
        form: { category: "FIELD_VERIFICATION" },
      },
    ] as never);

    const res = await updateSubmission(
      makeRequest("PUT", "http://x", VALID_UPDATE_BODY) as never,
      makeParams("sub-1"),
    );

    expect(res.status).toBe(200);
  });

  it("returns 200 when the clear inspection author edits their submission", async () => {
    vi.mocked(db.inspectionSubmission.findMany).mockResolvedValue([
      {
        outcome: "PASS",
        source: "FORM",
        templateSnapshot: { category: "CLEAR_INSPECTION" },
        form: { category: "CLEAR_INSPECTION" },
      },
    ] as never);

    const res = await updateSubmission(
      makeRequest("PUT", "http://x", VALID_UPDATE_BODY) as never,
      makeParams("sub-1"),
    );

    expect(res.status).toBe(200);
  });

  it("returns 400 for invalid body (missing outcome)", async () => {
    const res = await updateSubmission(
      makeRequest("PUT", "http://x", { deficiencyCount: 0, payload: {} }) as never,
      makeParams("sub-1"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when submission does not exist", async () => {
    vi.mocked(db.inspectionSubmission.findUnique).mockResolvedValue(null);
    const res = await updateSubmission(
      makeRequest("PUT", "http://x", VALID_UPDATE_BODY) as never,
      makeParams("missing"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 when a newer attempt exists for the same scope+form", async () => {
    vi.mocked(db.inspectionSubmission.findFirst).mockResolvedValue({ id: "newer-sub" } as never);
    const res = await updateSubmission(
      makeRequest("PUT", "http://x", VALID_UPDATE_BODY) as never,
      makeParams("sub-1"),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Only the most recent attempt can be edited.");
  });

  it("returns 200 with updated submission on success", async () => {
    const res = await updateSubmission(
      makeRequest("PUT", "http://x", VALID_UPDATE_BODY) as never,
      makeParams("sub-1"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { submission: { outcome: string } };
    expect(body.submission.outcome).toBe("PASS");
  });

  it("syncs inspectionStatus PASSED on scope row when outcome is PASS", async () => {
    await updateSubmission(
      makeRequest("PUT", "http://x", { ...VALID_UPDATE_BODY, outcome: "PASS" }) as never,
      makeParams("sub-1"),
    );
    expect(vi.mocked(db.projectRow.update)).toHaveBeenCalledWith(
      expect.objectContaining({ data: { inspectionStatus: "PASSED" } }),
    );
    expect(vi.mocked(db.clearInspection.upsert)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { inspectionSubmissionId: "sub-1" },
        update: expect.objectContaining({
          status: "PASSED",
          inspectionTypeId: "insp_type_clear",
        }),
        create: expect.objectContaining({
          inspectedById: "user-1",
          inspectionTypeId: "insp_type_clear",
        }),
      }),
    );
    expect(vi.mocked(db.inspectionAnswer.deleteMany)).toHaveBeenCalledWith({
      where: { inspectionSubmissionId: "sub-1" },
    });
  });

  it("syncs inspectionStatus FAILED on scope row when outcome is FAIL", async () => {
    vi.mocked(db.inspectionSubmission.update).mockResolvedValue({
      ...UPDATED_SUBMISSION,
      outcome: "FAIL",
    } as never);
    vi.mocked(db.inspectionSubmission.findMany).mockResolvedValue([
      {
        outcome: "FAIL",
        source: "FORM",
        templateSnapshot: { category: "CLEAR_INSPECTION" },
        form: { category: "CLEAR_INSPECTION" },
      },
    ] as never);
    await updateSubmission(
      makeRequest("PUT", "http://x", { ...VALID_UPDATE_BODY, outcome: "FAIL" }) as never,
      makeParams("sub-1"),
    );
    expect(vi.mocked(db.projectRow.update)).toHaveBeenCalledWith(
      expect.objectContaining({ data: { inspectionStatus: "FAILED" } }),
    );
  });

  it("does not set scope inspectionStatus to PASSED when editing a calibration submission", async () => {
    vi.mocked(db.inspectionSubmission.findUnique).mockResolvedValue({
      ...EXISTING_SUBMISSION,
      templateSnapshot: { category: "CALIBRATION_INSPECTION" },
      clearInspection: { inspectedById: "user-1" },
    } as never);
    vi.mocked(db.inspectionSubmission.findMany).mockResolvedValue([
      {
        outcome: "PASS",
        source: "FORM",
        templateSnapshot: { category: "CALIBRATION_INSPECTION" },
        form: { category: "CALIBRATION_INSPECTION" },
      },
    ] as never);

    const res = await updateSubmission(
      makeRequest("PUT", "http://x", { ...VALID_UPDATE_BODY, outcome: "PASS" }) as never,
      makeParams("sub-1"),
    );

    expect(res.status).toBe(200);
    expect(vi.mocked(db.projectRow.update)).toHaveBeenCalledWith(
      expect.objectContaining({ data: { inspectionStatus: null } }),
    );
    expect(vi.mocked(db.clearInspection.upsert)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { inspectionSubmissionId: "sub-1" },
        update: expect.objectContaining({
          status: "PASSED",
          inspectionTypeId: "insp_type_calibration",
        }),
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(vi.mocked(voidLogFieldActivity)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ user: expect.any(Object) }),
      expect.objectContaining({
        eventType: "INSPECTION_SUBMITTED",
        category: "CALIBRATION_INSPECTION",
      }),
      expect.any(Object),
    );
  });

  it("fires voidLogFieldActivity with isEdit=true after successful edit", async () => {
    await updateSubmission(
      makeRequest("PUT", "http://x", VALID_UPDATE_BODY) as never,
      makeParams("sub-1"),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(vi.mocked(voidLogFieldActivity)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(voidLogFieldActivity)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ user: expect.any(Object) }),
      expect.objectContaining({ eventType: "INSPECTION_SUBMITTED", isEdit: true }),
      expect.any(Object),
    );
  });

  it("passes activityLocation from PUT body to voidLogFieldActivity", async () => {
    const activityLocation = {
      gpsStatus: "GRANTED" as const,
      locationRecordedAt: "2026-08-01T12:00:00.000Z",
      latitude: 40.7,
      longitude: -74.0,
      accuracyMeters: 12,
    };

    await updateSubmission(
      makeRequest("PUT", "http://x", { ...VALID_UPDATE_BODY, activityLocation }) as never,
      makeParams("sub-1"),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(vi.mocked(voidLogFieldActivity)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ user: expect.any(Object) }),
      expect.objectContaining({ eventType: "INSPECTION_SUBMITTED", isEdit: true }),
      expect.objectContaining({
        requestBody: expect.objectContaining({ activityLocation }),
      }),
    );
  });

  it("returns visibility block when caller cannot read the submission project", async () => {
    const { NextResponse } = await import("next/server");
    vi.mocked(enforceProjectReadVisibility).mockResolvedValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }) as never,
    );

    const res = await updateSubmission(
      makeRequest("PUT", "http://x", VALID_UPDATE_BODY) as never,
      makeParams("sub-1"),
    );
    expect(res.status).toBe(403);
    expect(db.inspectionSubmission.update).not.toHaveBeenCalled();
  });
});

describe("GET /api/inspection-submissions/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEffectiveSession).mockResolvedValue(ADMIN_SESSION as never);
    vi.mocked(enforceProjectReadVisibility).mockResolvedValue(null);
    vi.mocked(db.inspectionSubmission.findUnique).mockResolvedValue(SUBMISSION_FIXTURE as never);
    mockHydrateSubmissionView.mockImplementation(async (submission) => ({
      ...submission,
      templateSnapshot: submission.templateSnapshot,
      payload: submission.payload,
    }));
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValueOnce(null as never);
    const res = await getSubmissionById(
      makeRequest("GET", "http://x") as never,
      makeParams("sub-1"),
    );
    expect(res.status).toBe(401);
  });

  it("enforces project read visibility before returning submission", async () => {
    const { NextResponse } = await import("next/server");
    vi.mocked(enforceProjectReadVisibility).mockResolvedValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }) as never,
    );

    const res = await getSubmissionById(
      makeRequest("GET", "http://x") as never,
      makeParams("sub-1"),
    );
    expect(res.status).toBe(403);
    expect(enforceProjectReadVisibility).toHaveBeenCalledWith(
      "proj-1",
      expect.objectContaining({ user: expect.objectContaining({ id: "user-1" }) }),
    );
  });
});

describe("PATCH /api/inspection-submissions/[id]/reclassify-calibration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEffectiveSession).mockResolvedValue({
      user: { id: "user-1", role: "INSTALL_DIRECTOR", name: "Justin", email: "j@m.com" },
    } as never);
    vi.mocked(enforceProjectReadVisibility).mockResolvedValue(null);
    mockReclassifyClearSubmissionToCalibration.mockResolvedValue({
      submissionId: "sub-1",
      calibratedAgainstSubmissionId: "clear-1",
    });
  });

  it("returns 403 without CALIBRATE_INSPECTION permission", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValueOnce({
      user: { id: "user-2", role: "MEMBER", name: "Member", email: "m@m.com" },
    } as never);

    const { PATCH } = await import(
      "@/app/api/inspection-submissions/[id]/reclassify-calibration/route"
    );
    const res = await PATCH(
      new Request("http://x", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calibratedAgainstSubmissionId: "clear-1" }),
      }) as never,
      { params: Promise.resolve({ id: "sub-1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValueOnce(null as never);

    const { PATCH } = await import(
      "@/app/api/inspection-submissions/[id]/reclassify-calibration/route"
    );
    const res = await PATCH(
      new Request("http://x", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calibratedAgainstSubmissionId: "clear-1" }),
      }) as never,
      { params: Promise.resolve({ id: "sub-1" }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid body", async () => {
    const { PATCH } = await import(
      "@/app/api/inspection-submissions/[id]/reclassify-calibration/route"
    );
    const res = await PATCH(
      new Request("http://x", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }) as never,
      { params: Promise.resolve({ id: "sub-1" }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when submission does not exist", async () => {
    vi.mocked(db.inspectionSubmission.findUnique).mockResolvedValueOnce(null as never);

    const { PATCH } = await import(
      "@/app/api/inspection-submissions/[id]/reclassify-calibration/route"
    );
    const res = await PATCH(
      new Request("http://x", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calibratedAgainstSubmissionId: "clear-1" }),
      }) as never,
      { params: Promise.resolve({ id: "missing" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 and reclassifies when authorized", async () => {
    vi.mocked(db.inspectionSubmission.findUnique).mockResolvedValueOnce({
      id: "sub-1",
      projectId: "proj-1",
      unitId: "unit-1",
      scopeRowId: "row-1",
      scopeTypeCode: "CT",
      form: { name: "Countertops", category: "CLEAR_INSPECTION" },
    } as never);

    const { PATCH } = await import(
      "@/app/api/inspection-submissions/[id]/reclassify-calibration/route"
    );
    const res = await PATCH(
      new Request("http://x", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calibratedAgainstSubmissionId: "clear-1" }),
      }) as never,
      { params: Promise.resolve({ id: "sub-1" }) },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; submissionId: string };
    expect(body.ok).toBe(true);
    expect(body.submissionId).toBe("sub-1");
    expect(mockReclassifyClearSubmissionToCalibration).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        submissionId: "sub-1",
        calibratedAgainstSubmissionId: "clear-1",
        inspectedById: "user-1",
      }),
    );
  });

  it("returns domain error status when reclassify service rejects", async () => {
    vi.mocked(db.inspectionSubmission.findUnique).mockResolvedValueOnce({
      id: "sub-1",
      projectId: "proj-1",
      unitId: "unit-1",
      scopeRowId: "row-1",
      scopeTypeCode: "CT",
      form: { name: "Countertops", category: "CLEAR_INSPECTION" },
    } as never);
    const { ReclassifyCalibrationError } = await import(
      "@/lib/inspections/reclassify-submission-calibration"
    );
    mockReclassifyClearSubmissionToCalibration.mockRejectedValueOnce(
      new ReclassifyCalibrationError("This scope already has a calibration inspection", 409),
    );

    const { PATCH } = await import(
      "@/app/api/inspection-submissions/[id]/reclassify-calibration/route"
    );
    const res = await PATCH(
      new Request("http://x", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calibratedAgainstSubmissionId: "clear-1" }),
      }) as never,
      { params: Promise.resolve({ id: "sub-1" }) },
    );

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("calibration inspection");
  });
});
