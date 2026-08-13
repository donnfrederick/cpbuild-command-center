import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockTxProjectIssueCreate = vi.fn();

vi.mock("@/lib/dev-session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/masquerade", () => ({ getEffectiveSession: vi.fn() }));
vi.mock("@/lib/production-project-access", () => ({
  enforceProductionFieldNotesMutation: vi.fn(),
  enforceProjectReadVisibility: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
  resolveActorName: vi.fn().mockResolvedValue("Test User"),
  getActivityReplayMetadata: vi.fn().mockReturnValue({}),
}));
vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: vi.fn(), findFirst: vi.fn() },
    projectRow: { findMany: vi.fn() },
    projectSubScopeInstance: { findMany: vi.fn() },
    issueTypeCatalog: { findFirst: vi.fn() },
    responsiblePartyCatalog: { findMany: vi.fn() },
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        projectIssue: {
          create: mockTxProjectIssueCreate,
          update: vi.fn().mockResolvedValue({}),
        },
        issueResponsiblePartyTag: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };
      return cb(tx);
    }),
  },
}));

import { getSession } from "@/lib/dev-session";
import { getEffectiveSession } from "@/lib/masquerade";
import { enforceProductionFieldNotesMutation } from "@/lib/production-project-access";
import { db } from "@/lib/db";

const PROJECT = "proj-test-9";

const CREATED_ISSUE_FIXTURE = {
  id: "issue-new",
  projectId: PROJECT,
  unitRef: null,
  shortDescription: "Site defect",
  issueTypeCode: "OTHER",
  responsiblePartyCode: "CP_BUILD",
  attachments: [],
  createdBy: { id: "user-1", name: "Test User", email: "admin@cp.build" },
  scopeTags: [],
  subScopeTags: [],
  responsiblePartyTags: [{ partyCode: "CP_BUILD" }],
};

async function postIssue(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/projects/[id]/issues/route");
  return POST(
    new NextRequest(`http://localhost/api/projects/${PROJECT}/issues`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: PROJECT }) },
  );
}

describe("POST /api/projects/[id]/issues — project-level", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue({
      user: { id: "user-1", email: "admin@cp.build", role: "ADMIN" },
    } as never);
    vi.mocked(getEffectiveSession).mockResolvedValue({
      user: { id: "user-1", email: "admin@cp.build", role: "ADMIN" },
    } as never);
    vi.mocked(enforceProductionFieldNotesMutation).mockResolvedValue(null);
    vi.mocked(db.user.findUnique).mockResolvedValue({ id: "user-1" } as never);
    vi.mocked(db.projectRow.findMany).mockResolvedValue([]);
    vi.mocked(db.projectSubScopeInstance.findMany).mockResolvedValue([]);
    vi.mocked(db.issueTypeCatalog.findFirst).mockImplementation(async ({ where }) => {
      const code = (where as { code: string }).code;
      const catalog: Record<string, { code: string; requiresVisual: boolean }> = {
        OTHER: { code: "OTHER", requiresVisual: false },
        DAMAGED_MATERIALS: { code: "DAMAGED_MATERIALS", requiresVisual: true },
        MISSING_MATERIALS: { code: "MISSING_MATERIALS", requiresVisual: false },
      };
      return (catalog[code] ?? null) as never;
    });
    vi.mocked(db.responsiblePartyCatalog.findMany).mockImplementation(async ({ where }) => {
      const codes = (where as { code: { in: string[] } }).code.in;
      return codes.map((code) => ({ code })) as never;
    });
    mockTxProjectIssueCreate.mockResolvedValue(CREATED_ISSUE_FIXTURE as never);
  });

  it("creates a project-level issue with no unitRef (omitted)", async () => {
    const res = await postIssue({
      issueType: "OTHER",
      shortDescription: "Site defect",
      responsibleParty: "CP_BUILD",
    });
    expect(res.status).toBe(201);
    expect(mockTxProjectIssueCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          projectId: PROJECT,
          unitRef: undefined,
          shortDescription: "Site defect",
          issueTypeCode: "OTHER",
          responsiblePartyCode: "CP_BUILD",
        }),
      }),
    );
  });

  it("returns 422 for inactive or unknown issue type", async () => {
    vi.mocked(db.issueTypeCatalog.findFirst).mockResolvedValue(null as never);

    const res = await postIssue({
      issueType: "RETIRED_TYPE",
      shortDescription: "Bad type",
      responsibleParty: "CP_BUILD",
    });
    expect(res.status).toBe(422);
    expect(mockTxProjectIssueCreate).not.toHaveBeenCalled();
  });

  it("accepts attachments when fileSizeBytes entries are null (library metadata gap)", async () => {
    const res = await postIssue({
      issueType: "OTHER",
      shortDescription: "Photo issue",
      responsibleParty: "CP_BUILD",
      attachmentKeys: ["field-media/issues/a.jpg"],
      attachmentUrls: ["https://example.com/a.jpg"],
      attachmentMimeTypes: ["image/jpeg"],
      attachmentFileSizeBytes: [null],
      attachmentCaptions: [""],
      attachmentImageAnnotations: [null],
    });
    expect(res.status).toBe(201);
    expect(mockTxProjectIssueCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attachments: {
            create: expect.arrayContaining([
              expect.objectContaining({
                fileSizeBytes: null,
              }),
            ]),
          },
        }),
      }),
    );
  });

  it("persists scopeRefKeys when projectRowIds are provided", async () => {
    const rowFixture = {
      id: "row-1",
      building: "A",
      level: "1",
      unit: "101",
      description: "Floor install",
    };
    vi.mocked(db.projectRow.findMany)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{ id: "row-1" }] as never)
      .mockResolvedValueOnce([rowFixture] as never);

    const res = await postIssue({
      issueType: "OTHER",
      shortDescription: "Scoped issue",
      responsibleParty: "CP_BUILD",
      projectRowIds: ["row-1"],
    });

    expect(res.status).toBe(201);
    expect(mockTxProjectIssueCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scopeRefKeys: ["a|1|101|floor install"],
          scopeTags: {
            create: expect.arrayContaining([
              expect.objectContaining({ projectRowId: "row-1" }),
            ]),
          },
        }),
      }),
    );
  });

  it("returns field-notes production block when enforceProductionFieldNotesMutation blocks", async () => {
    const { NextResponse } = await import("next/server");
    vi.mocked(enforceProductionFieldNotesMutation).mockResolvedValue(
      NextResponse.json(
        {
          error:
            "Designer and Developer accounts cannot modify production project data. Use the staging environment or a designated test project.",
        },
        { status: 403 },
      ),
    );

    const res = await postIssue({
      issueType: "OTHER",
      shortDescription: "Blocked attempt",
      responsibleParty: "CP_BUILD",
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/Designer and Developer/i);
    expect(mockTxProjectIssueCreate).not.toHaveBeenCalled();
  });

  it("persists build phase and area tags for project-level issues", async () => {
    vi.mocked(db.projectRow.findMany).mockResolvedValue([
      { buildPhase: "Phase 1", area: "Lobby" },
    ] as never);

    const res = await postIssue({
      issueType: "OTHER",
      shortDescription: "Tagged issue",
      responsibleParty: "CP_BUILD",
      buildPhaseTag: "Phase 1",
      areaTag: "Lobby",
    });

    expect(res.status).toBe(201);
    expect(mockTxProjectIssueCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          buildPhaseTag: "Phase 1",
          areaTag: "Lobby",
        }),
      }),
    );
  });

  it("returns 422 when area tag is not on the project", async () => {
    vi.mocked(db.projectRow.findMany).mockResolvedValue([
      { buildPhase: "Phase 1", area: "Lobby" },
    ] as never);

    const res = await postIssue({
      issueType: "OTHER",
      shortDescription: "Bad tag",
      responsibleParty: "CP_BUILD",
      areaTag: "Roof",
    });

    expect(res.status).toBe(422);
    expect(mockTxProjectIssueCreate).not.toHaveBeenCalled();
  });

  it("accepts a manual area reference when the project has no defined areas", async () => {
    vi.mocked(db.projectRow.findMany).mockResolvedValue([
      { buildPhase: "1", area: "" },
    ] as never);

    const res = await postIssue({
      issueType: "OTHER",
      shortDescription: "GC staging note",
      responsibleParty: "CP_BUILD",
      areaTag: "GC staging",
    });

    expect(res.status).toBe(201);
    expect(mockTxProjectIssueCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          areaTag: "GC staging",
        }),
      }),
    );
  });

  it("returns 422 when tags are sent for a location-scoped issue", async () => {
    vi.mocked(db.projectRow.findMany).mockResolvedValue([
      { buildPhase: "Phase 1", area: "Lobby" },
    ] as never);

    const res = await postIssue({
      unitRef: "Tower|1|101",
      issueType: "OTHER",
      shortDescription: "Scoped issue",
      responsibleParty: "CP_BUILD",
      buildPhaseTag: "Phase 1",
    });

    expect(res.status).toBe(422);
    expect(mockTxProjectIssueCreate).not.toHaveBeenCalled();
  });

  it("returns 422 when visual evidence is required but missing", async () => {
    const res = await postIssue({
      issueType: "DAMAGED_MATERIALS",
      shortDescription: "No photo",
      responsibleParty: "CP_BUILD",
    });
    expect(res.status).toBe(422);
    expect(mockTxProjectIssueCreate).not.toHaveBeenCalled();
  });

  it("creates issue with multiple responsible parties", async () => {
    mockTxProjectIssueCreate.mockResolvedValueOnce({
      id: "issue-multi",
      projectId: PROJECT,
      unitRef: null,
      shortDescription: "Multi-party",
      issueTypeCode: "OTHER",
      responsiblePartyCode: "ELECTRICIAN",
      attachments: [],
      createdBy: { id: "user-1", name: "Test User", email: "admin@cp.build" },
      scopeTags: [],
      subScopeTags: [],
      responsiblePartyTags: [],
    } as never);

    const res = await postIssue({
      issueType: "OTHER",
      shortDescription: "Multi-party",
      responsibleParties: ["ELECTRICIAN", "PLUMBER"],
    });
    expect(res.status).toBe(201);
    expect(mockTxProjectIssueCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          issueTypeCode: "OTHER",
          responsiblePartyCode: "ELECTRICIAN",
        }),
      }),
    );
    const body = (await res.json()) as { responsibleParties: string[] };
    expect(body.responsibleParties).toEqual(["ELECTRICIAN", "PLUMBER"]);
  });

  it("returns 422 when responsibleParties is empty", async () => {
    const res = await postIssue({
      issueType: "OTHER",
      shortDescription: "No parties",
      responsibleParties: [],
    });
    expect(res.status).toBe(422);
    expect(mockTxProjectIssueCreate).not.toHaveBeenCalled();
  });

  it("returns 422 when MISSING_MATERIALS is missing material fields", async () => {
    const res = await postIssue({
      issueType: "MISSING_MATERIALS",
      shortDescription: "Missing tile",
      responsibleParty: "CP_BUILD",
    });
    expect(res.status).toBe(422);
    expect(mockTxProjectIssueCreate).not.toHaveBeenCalled();
  });

  it("persists missing material fields and scope UOM for MISSING_MATERIALS", async () => {
    const rowFixture = {
      id: "row-1",
      building: "A",
      level: "1",
      unit: "101",
      description: "Countertops",
      uom: { code: "SF" },
    };
    vi.mocked(db.projectRow.findMany)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{ id: "row-1", uom: { code: "SF" } }] as never)
      .mockResolvedValueOnce([rowFixture] as never);

    const res = await postIssue({
      issueType: "MISSING_MATERIALS",
      shortDescription: "Missing countertop",
      responsibleParty: "CP_BUILD",
      projectRowIds: ["row-1"],
      missingMaterialDescription: "Quartz slab",
      missingMaterialQuantity: 12,
    });

    expect(res.status).toBe(201);
    expect(mockTxProjectIssueCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          missingMaterialDescription: "Quartz slab",
          missingMaterialQuantity: 12,
          missingMaterialUomCode: "SF",
        }),
      }),
    );
  });

  it("accepts MISSING_MATERIALS with empty optional material description omitted", async () => {
    const res = await postIssue({
      issueType: "MISSING_MATERIALS",
      shortDescription: "Missing tile",
      responsibleParty: "CP_BUILD",
      missingMaterialDescription: "",
      missingMaterialQuantity: 2,
    });
    expect(res.status).toBe(422);
    expect(mockTxProjectIssueCreate).not.toHaveBeenCalled();
  });

  it("returns 422 when MISSING_MATERIALS tags more than one scope", async () => {
    const res = await postIssue({
      issueType: "MISSING_MATERIALS",
      shortDescription: "Missing tile",
      responsibleParty: "CP_BUILD",
      projectRowIds: ["row-1", "row-2"],
      missingMaterialDescription: "Tile cartons",
      missingMaterialQuantity: 4,
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/one scope/i);
    expect(mockTxProjectIssueCreate).not.toHaveBeenCalled();
  });
});
