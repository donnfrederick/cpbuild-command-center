import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/masquerade", () => ({
  getEffectiveSession: vi.fn(),
}));

vi.mock("@/lib/project-unifier-merge", () => ({
  enrichProjectById: vi.fn(),
}));

vi.mock("@/lib/unifier/subcontractors", () => ({
  getSubcontractorsForPicker: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/production-project-access", () => ({
  enforceProjectReadVisibility: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/db", () => ({
  db: {
    project: { findUnique: vi.fn() },
    projectRow: { findMany: vi.fn() },
    inspectionSubmission: { findMany: vi.fn() },
    scopeType: { findMany: vi.fn() },
  },
}));

import { getEffectiveSession } from "@/lib/masquerade";
import { enrichProjectById } from "@/lib/project-unifier-merge";
import { enforceProjectReadVisibility } from "@/lib/production-project-access";
import { db } from "@/lib/db";

const projectParams = (id: string) => ({ params: Promise.resolve({ id }) });

describe("GET /api/projects/[id]/inspections-report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEffectiveSession).mockResolvedValue({
      user: { id: "u1", role: "ADMIN" },
    } as never);
    vi.mocked(enforceProjectReadVisibility).mockResolvedValue(null);
    vi.mocked(enrichProjectById).mockResolvedValue({
      installManagerName: "IM Name",
    } as never);
    vi.mocked(db.project.findUnique).mockResolvedValue({
      createdAt: new Date("2026-05-01"),
    } as never);
    vi.mocked(db.projectRow.findMany).mockResolvedValue([] as never);
    vi.mocked(db.inspectionSubmission.findMany).mockResolvedValue([] as never);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue(null);
    const { GET } = await import("@/app/api/projects/[id]/inspections-report/route");
    const res = await GET(new Request("http://localhost"), projectParams("p1"));
    expect(res.status).toBe(401);
  });

  it("returns project visibility block before querying submissions", async () => {
    vi.mocked(enforceProjectReadVisibility).mockResolvedValue(
      NextResponse.json({ error: "Not found" }, { status: 404 }),
    );
    const { GET } = await import("@/app/api/projects/[id]/inspections-report/route");
    const res = await GET(
      new Request("http://localhost/api/projects/p1/inspections-report"),
      projectParams("p1"),
    );
    expect(res.status).toBe(404);
    expect(enforceProjectReadVisibility).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({ user: expect.objectContaining({ id: "u1" }) }),
    );
    expect(db.inspectionSubmission.findMany).not.toHaveBeenCalled();
  });

  it("does not apply a submittedAt filter when from/to are omitted", async () => {
    const { GET } = await import("@/app/api/projects/[id]/inspections-report/route");
    const res = await GET(
      new Request("http://localhost/api/projects/p1/inspections-report"),
      projectParams("p1")
    );
    expect(res.status).toBe(200);
    expect(db.inspectionSubmission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          projectId: "p1",
          source: "FORM",
        }),
      })
    );
    const call = vi.mocked(db.inspectionSubmission.findMany).mock.calls[0]![0] as {
      where: Record<string, unknown>;
    };
    expect(call.where.submittedAt).toBeUndefined();
  });

  it("applies submittedAt bounds when from/to are provided", async () => {
    const { GET } = await import("@/app/api/projects/[id]/inspections-report/route");
    const res = await GET(
      new Request(
        "http://localhost/api/projects/p1/inspections-report?from=2026-01-01&to=2026-05-01"
      ),
      projectParams("p1")
    );
    expect(res.status).toBe(200);
    const call = vi.mocked(db.inspectionSubmission.findMany).mock.calls[0]![0] as {
      where: { submittedAt: { gte: Date; lte: Date } };
    };
    expect(call.where.submittedAt.gte).toEqual(new Date("2026-01-01"));
    expect(call.where.submittedAt.lte.getUTCHours()).toBe(23);
  });

  it("returns 400 when from/to are not valid dates", async () => {
    const { GET } = await import("@/app/api/projects/[id]/inspections-report/route");

    const badFrom = await GET(
      new Request("http://localhost/api/projects/p1/inspections-report?from=not-a-date"),
      projectParams("p1")
    );
    expect(badFrom.status).toBe(400);

    const badTo = await GET(
      new Request("http://localhost/api/projects/p1/inspections-report?to=not-a-date"),
      projectParams("p1")
    );
    expect(badTo.status).toBe(400);
    expect(db.inspectionSubmission.findMany).not.toHaveBeenCalled();
  });
});
