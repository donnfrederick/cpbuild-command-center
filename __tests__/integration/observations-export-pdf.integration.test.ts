import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/dev-session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/production-project-access", () => ({
  enforceProjectReadVisibility: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: { projectObservation: { findMany: vi.fn() } },
}));
vi.mock("@/lib/project-unifier-merge", () => ({
  enrichProjectById: vi.fn(),
}));
vi.mock("@/lib/pdf/observations-pdf", () => ({
  buildObsPdf: vi.fn(),
}));

import { OBSERVATIONS_PDF_EXPORT_BATCH_SIZE } from "@/lib/pdf/observations-export-batch";
import { POST } from "@/app/api/projects/[id]/observations/export-pdf/route";
import { getSession } from "@/lib/dev-session";
import { enforceProjectReadVisibility } from "@/lib/production-project-access";
import { db } from "@/lib/db";
import { enrichProjectById } from "@/lib/project-unifier-merge";

const mockGetSession = vi.mocked(getSession);
const mockVis = vi.mocked(enforceProjectReadVisibility);
const mockFindMany = vi.mocked(db.projectObservation.findMany);
const mockEnrichProject = vi.mocked(enrichProjectById);

const SESSION = {
  user: { id: "u1", email: "a@test.com", role: "MEMBER", name: "A", specialPermissions: [] as string[] },
};

function postObsExport(body: unknown, projectId = "proj-1") {
  return POST(
    new NextRequest(`http://localhost/api/projects/${projectId}/observations/export-pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: projectId }) },
  );
}

describe("POST /api/projects/[id]/observations/export-pdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(SESSION as Awaited<ReturnType<typeof getSession>>);
    mockVis.mockResolvedValue(null);
    mockEnrichProject.mockResolvedValue(null);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const res = await postObsExport({});
    expect(res.status).toBe(401);
  });

  it("returns 400 when obsTypes is not an array", async () => {
    const res = await postObsExport({ obsTypes: "QUALITY" });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain("obsTypes");
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("accepts obsTypes filter as catalog string codes", async () => {
    mockFindMany.mockResolvedValueOnce([]);
    const res = await postObsExport({ obsTypes: ["NOT_A_REAL_TYPE"] });
    expect(res.status).toBe(404);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            { observationTypeCode: { in: ["NOT_A_REAL_TYPE"] } },
          ]),
        }),
      }),
    );
  });

  it("returns 400 when authors contains non-strings", async () => {
    const res = await postObsExport({ authors: ["u1", 2] });
    expect(res.status).toBe(400);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("returns 400 when observationIds exceed the batch size cap", async () => {
    const ids = Array.from(
      { length: OBSERVATIONS_PDF_EXPORT_BATCH_SIZE + 1 },
      (_, i) => `obs-${i}`,
    );
    const res = await postObsExport({ observationIds: ids });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { code?: string; maxBatchSize?: number };
    expect(json.code).toBe("PDF_BATCH_TOO_LARGE");
    expect(json.maxBatchSize).toBe(OBSERVATIONS_PDF_EXPORT_BATCH_SIZE);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("applies obsTypes, buildings, and datePreset when querying for export", async () => {
    mockFindMany.mockResolvedValueOnce([]);
    const { buildObsPdf } = await import("@/lib/pdf/observations-pdf");
    vi.mocked(buildObsPdf).mockResolvedValueOnce(Buffer.from("%PDF"));

    const res = await postObsExport({
      observationIds: ["obs-1"],
      obsTypes: ["SAFETY"],
      buildings: ["North"],
      datePreset: "7d",
    });

    expect(res.status).toBe(404);
    expect(mockFindMany).toHaveBeenCalledOnce();
    const callArg = mockFindMany.mock.calls[0]?.[0] as { where?: { AND?: unknown[] } };
    expect(callArg.where?.AND).toEqual(
      expect.arrayContaining([
        { projectId: "proj-1" },
        { id: { in: ["obs-1"] } },
        { observationTypeCode: { in: ["SAFETY"] } },
        { OR: [{ unitRef: { startsWith: "North|" } }, { unitRef: "North" }] },
        expect.objectContaining({ createdAt: expect.objectContaining({ gte: expect.any(Date) }) }),
      ]),
    );
  });

  it("returns 400 when includeCover is not a boolean", async () => {
    const res = await postObsExport({ includeCover: "false" });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain("includeCover");
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("returns 400 when coverObservationCount is not a positive number", async () => {
    const res = await postObsExport({ coverObservationCount: "47" });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain("coverObservationCount");
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("still returns PDF when enrichProjectById throws", async () => {
    mockEnrichProject.mockRejectedValueOnce(new Error("Unifier unavailable"));
    mockFindMany.mockResolvedValueOnce([
      {
        id: "obs-1",
        observationTypeCode: "QUALITY",
        title: "Gap",
        description: "",
        createdAt: new Date(),
        unitRef: null,
        author: { id: "u1", name: "Alice", email: "a@test.com" },
        attachments: [],
        scopeTags: [],
        comments: [],
      },
    ] as Awaited<ReturnType<typeof mockFindMany>>);
    const { buildObsPdf } = await import("@/lib/pdf/observations-pdf");
    vi.mocked(buildObsPdf).mockResolvedValueOnce(Buffer.from("%PDF"));

    const res = await postObsExport({ observationIds: ["obs-1"], projectName: "Fallback Project" });

    expect(res.status).toBe(200);
    expect(buildObsPdf).toHaveBeenCalledWith(
      expect.objectContaining({ projectName: "Fallback Project", projectAddress: "" }),
    );
  });
});
