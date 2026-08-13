/**
 * Integration tests for POST /api/projects/[id]/units/[rowId]/inspections/reset
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: vi.fn(),
    projectRow: { findUnique: vi.fn() },
    inspectionSubmission: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/masquerade", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/masquerade")>();
  return {
    ...actual,
    getEffectiveSession: vi.fn(),
  };
});

vi.mock("@/lib/production-project-access", () => ({
  enforceProductionProjectMutation: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/inspections/recompute-scope-inspection-status", () => ({
  recomputeScopeInspectionStatusFromSubmissions: vi.fn().mockResolvedValue(null),
}));

import { POST } from "@/app/api/projects/[id]/units/[rowId]/inspections/reset/route";
import { db } from "@/lib/db";
import { getEffectiveSession } from "@/lib/masquerade";
import { recomputeScopeInspectionStatusFromSubmissions } from "@/lib/inspections/recompute-scope-inspection-status";

const params = Promise.resolve({ id: "proj-1", rowId: "row-1" });

describe("POST /api/projects/[id]/units/[rowId]/inspections/reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.projectRow.findUnique).mockResolvedValue({ projectId: "proj-1" } as never);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue(null);
    const res = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({ category: "CLEAR_INSPECTION" }),
      }),
      { params },
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin users", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue({
      user: { id: "u1", role: "MEMBER" },
    } as never);
    const res = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({ category: "CLEAR_INSPECTION" }),
      }),
      { params },
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when no submission matches category", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue({
      user: { id: "admin", role: "ADMIN" },
    } as never);
    vi.mocked(db.inspectionSubmission.findMany).mockResolvedValue([]);
    const res = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({ category: "FIELD_VERIFICATION" }),
      }),
      { params },
    );
    expect(res.status).toBe(404);
  });

  it("deletes latest matching submission and recomputes status for admin", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue({
      user: { id: "admin", role: "ADMIN" },
    } as never);
    vi.mocked(db.inspectionSubmission.findMany).mockResolvedValue([
      {
        id: "sub-fv",
        source: "FORM",
        templateSnapshot: { category: "FIELD_VERIFICATION" },
        form: { category: "FIELD_VERIFICATION" },
        clearInspection: { id: "ci-1", deletedAt: null },
      },
    ] as never);

    const txDelete = vi.fn();
    const txClearUpdate = vi.fn();
    vi.mocked(db.$transaction).mockImplementation(async (fn) =>
      fn({
        clearInspection: { update: txClearUpdate },
        inspectionSubmission: { delete: txDelete },
        projectRow: { update: vi.fn() },
      } as never),
    );

    const res = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({ category: "FIELD_VERIFICATION" }),
      }),
      { params },
    );

    expect(res.status).toBe(200);
    expect(txDelete).toHaveBeenCalledWith({ where: { id: "sub-fv" } });
    expect(recomputeScopeInspectionStatusFromSubmissions).toHaveBeenCalledWith("row-1", expect.anything());
  });

  it("matches legacy PRE_INSTALL stub to TWO_AREA_CLEAR via linked form category", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue({
      user: { id: "admin", role: "ADMIN" },
    } as never);
    vi.mocked(db.inspectionSubmission.findMany).mockResolvedValue([
      {
        id: "sub-2ac",
        source: "FORM",
        templateSnapshot: { category: "PRE_INSTALL" },
        form: { category: "TWO_AREA_CLEAR" },
        clearInspection: { id: "ci-1", deletedAt: null },
      },
    ] as never);

    const txDelete = vi.fn();
    vi.mocked(db.$transaction).mockImplementation(async (fn) =>
      fn({
        clearInspection: { update: vi.fn() },
        inspectionSubmission: { delete: txDelete },
        projectRow: { update: vi.fn() },
      } as never),
    );

    const res = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({ category: "TWO_AREA_CLEAR" }),
      }),
      { params },
    );

    expect(res.status).toBe(200);
    expect(txDelete).toHaveBeenCalledWith({ where: { id: "sub-2ac" } });
  });
});
