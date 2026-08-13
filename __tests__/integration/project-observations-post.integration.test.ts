import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

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
    observationTypeCatalog: { findFirst: vi.fn() },
    projectObservation: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { getSession } from "@/lib/dev-session";
import { getEffectiveSession } from "@/lib/masquerade";
import { enforceProductionFieldNotesMutation } from "@/lib/production-project-access";
import { db } from "@/lib/db";

const PROJECT = "proj-test-9";

async function postObservation(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/projects/[id]/observations/route");
  return POST(
    new NextRequest(`http://localhost/api/projects/${PROJECT}/observations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: PROJECT }) },
  );
}

describe("POST /api/projects/[id]/observations — project-level", () => {
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
    vi.mocked(db.observationTypeCatalog.findFirst).mockImplementation(async ({ where }) => {
      const code = (where as { code: string }).code;
      const activeCodes = new Set(["QUALITY", "PROGRESS", "SAFETY", "OTHER"]);
      return activeCodes.has(code) ? ({ code } as never) : (null as never);
    });
    vi.mocked(db.projectObservation.create).mockResolvedValue({
      id: "obs-new",
      projectId: PROJECT,
      unitRef: null,
      title: "Site walk note",
      observationTypeCode: "QUALITY",
      attachments: [],
    } as never);
    vi.mocked(db.$transaction).mockImplementation(async (fn) => {
      if (typeof fn !== "function") return fn;
      return fn({
        projectObservation: { create: db.projectObservation.create },
      });
    });
  });

  it("creates a project-level observation with no unitRef (omitted)", async () => {
    const res = await postObservation({
      projectRowIds: [],
      observationType: "QUALITY",
      title: "Site walk note",
      description: "All good",
    });
    expect(res.status).toBe(201);
    expect(db.projectObservation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          projectId: PROJECT,
          unitRef: undefined,
          title: "Site walk note",
        }),
      }),
    );
  });

  it("creates a project-level observation with explicit empty unitRef", async () => {
    const res = await postObservation({
      unitRef: "",
      projectRowIds: [],
      observationType: "SAFETY",
      title: "PPE check",
    });
    expect(res.status).toBe(201);
  });

  it("accepts attachments when fileSizeBytes entries are null (library metadata gap)", async () => {
    const res = await postObservation({
      projectRowIds: [],
      observationType: "QUALITY",
      title: "Photo note",
      attachmentKeys: ["field-media/observations/a.jpg"],
      attachmentUrls: ["https://example.com/a.jpg"],
      attachmentMimeTypes: ["image/jpeg"],
      attachmentFileSizeBytes: [null],
      attachmentCaptions: [""],
      attachmentImageAnnotations: [null],
    });
    expect(res.status).toBe(201);
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

    const res = await postObservation({
      projectRowIds: [],
      observationType: "QUALITY",
      title: "Blocked attempt",
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/Designer and Developer/i);
    expect(db.projectObservation.create).not.toHaveBeenCalled();
  });

  it("persists build phase and area tags for project-level observations", async () => {
    vi.mocked(db.projectRow.findMany).mockResolvedValue([
      { buildPhase: "Phase 1", area: "Lobby" },
    ] as never);

    const res = await postObservation({
      projectRowIds: [],
      observationType: "QUALITY",
      title: "Tagged note",
      buildPhaseTag: "Phase 1",
      areaTag: "Lobby",
    });

    expect(res.status).toBe(201);
    expect(db.projectObservation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          buildPhaseTag: "Phase 1",
          areaTag: "Lobby",
        }),
      }),
    );
  });

  it("returns 422 when build phase tag is not on the project", async () => {
    vi.mocked(db.projectRow.findMany).mockResolvedValue([
      { buildPhase: "Phase 1", area: "Lobby" },
    ] as never);

    const res = await postObservation({
      projectRowIds: [],
      observationType: "QUALITY",
      title: "Bad tag",
      buildPhaseTag: "Phase 99",
    });

    expect(res.status).toBe(422);
    expect(db.projectObservation.create).not.toHaveBeenCalled();
  });

  it("accepts a manual area reference when the project has no defined areas", async () => {
    vi.mocked(db.projectRow.findMany).mockResolvedValue([
      { buildPhase: "1", area: "" },
    ] as never);

    const res = await postObservation({
      projectRowIds: [],
      observationType: "QUALITY",
      title: "GC staging note",
      areaTag: "GC staging",
    });

    expect(res.status).toBe(201);
    expect(db.projectObservation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          areaTag: "GC staging",
        }),
      }),
    );
  });

  it("returns 422 when tags are sent for a location-scoped observation", async () => {
    vi.mocked(db.projectRow.findMany).mockResolvedValue([
      { buildPhase: "Phase 1", area: "Lobby" },
    ] as never);

    const res = await postObservation({
      unitRef: "Tower|1|101",
      projectRowIds: [],
      observationType: "QUALITY",
      title: "Scoped note",
      buildPhaseTag: "Phase 1",
    });

    expect(res.status).toBe(422);
    expect(db.projectObservation.create).not.toHaveBeenCalled();
  });
});
