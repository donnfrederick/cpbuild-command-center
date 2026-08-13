import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/dev-session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/production-project-access", () => ({
  enforceProjectReadVisibility: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/observation-attachments", () => ({
  filterObservationAttachmentHeads: vi.fn((attachments: unknown[]) => attachments),
}));
vi.mock("@/lib/db", () => ({
  db: {
    projectObservation: { findMany: vi.fn(), count: vi.fn() },
    projectIssue: { findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
  },
}));

import { getSession } from "@/lib/dev-session";
import { db } from "@/lib/db";

const PROJECT = "proj-1";

describe("GET /api/projects/[id]/observations|issues with projectLevel=true", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue({
      user: { id: "user-1", role: "ADMIN" },
    } as Awaited<ReturnType<typeof getSession>>);
    vi.mocked(db.projectObservation.findMany).mockResolvedValue([]);
    vi.mocked(db.projectObservation.count).mockResolvedValue(0);
    vi.mocked(db.projectIssue.findMany).mockResolvedValue([]);
    vi.mocked(db.projectIssue.count).mockResolvedValue(0);
    vi.mocked(db.projectIssue.groupBy).mockResolvedValue([]);
  });

  it("filters observations to project-level unitRef values", async () => {
    const { GET } = await import("@/app/api/projects/[id]/observations/route");
    const req = new NextRequest(
      `http://localhost/api/projects/${PROJECT}/observations?projectLevel=true`,
    );

    const res = await GET(req, { params: Promise.resolve({ id: PROJECT }) });
    expect(res.status).toBe(200);
    expect(db.projectObservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          projectId: PROJECT,
          OR: [{ unitRef: null }, { unitRef: "" }, { unitRef: "||" }],
        }),
      }),
    );
  });

  it("applies take and returns totalCount when limit is set on observations", async () => {
    vi.mocked(db.projectObservation.findMany).mockResolvedValue([]);
    vi.mocked(db.projectObservation.count).mockResolvedValue(12);
    const { GET } = await import("@/app/api/projects/[id]/observations/route");
    const req = new NextRequest(
      `http://localhost/api/projects/${PROJECT}/observations?projectLevel=true&limit=1`,
    );

    const res = await GET(req, { params: Promise.resolve({ id: PROJECT }) });
    expect(res.status).toBe(200);
    expect(db.projectObservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 1 }),
    );
    expect(db.projectObservation.count).toHaveBeenCalled();
    const body = await res.json();
    expect(body.totalCount).toBe(12);
  });

  it("filters issues to project-level unitRef values", async () => {
    const { GET } = await import("@/app/api/projects/[id]/issues/route");
    const req = new NextRequest(
      `http://localhost/api/projects/${PROJECT}/issues?projectLevel=true`,
    );

    const res = await GET(req, { params: Promise.resolve({ id: PROJECT }) });
    expect(res.status).toBe(200);
    expect(db.projectIssue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          projectId: PROJECT,
          OR: [{ unitRef: null }, { unitRef: "" }, { unitRef: "||" }],
        }),
      }),
    );
  });
});
