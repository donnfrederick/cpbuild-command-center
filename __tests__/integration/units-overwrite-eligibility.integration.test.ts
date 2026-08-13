import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/projects/[id]/units/overwrite-eligibility/route";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    project: { findFirst: vi.fn() },
    inspectionSubmission: { count: vi.fn() },
    clearInspection: { count: vi.fn() },
    projectRow: { count: vi.fn() },
    projectIssue: { count: vi.fn() },
    projectObservation: { count: vi.fn() },
  },
}));

describe("GET /api/projects/[id]/units/overwrite-eligibility", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValue({
      user: { id: "u1", role: "ADMIN" },
    } as never);
    const { db } = await import("@/lib/db");
    vi.mocked(db.project.findFirst).mockResolvedValue({ id: "p1" } as never);
    vi.mocked(db.inspectionSubmission.count).mockResolvedValue(0);
    vi.mocked(db.clearInspection.count).mockResolvedValue(0);
    vi.mocked(db.projectRow.count).mockResolvedValue(0);
    vi.mocked(db.projectIssue.count).mockResolvedValue(0);
    vi.mocked(db.projectObservation.count).mockResolvedValue(0);
  });

  it("returns overwriteAllowed true when project has no field data", async () => {
    const res = await GET(new Request("http://localhost/api"), {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.overwriteAllowed).toBe(true);
    expect(body.blocked).toBe(false);
    expect(body.canUseOverwriteMode).toBe(true);
  });

  it("returns overwriteAllowed false when issues exist", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectIssue.count).mockResolvedValue(3);

    const res = await GET(new Request("http://localhost/api"), {
      params: Promise.resolve({ id: "p1" }),
    });
    const body = await res.json();
    expect(body.overwriteAllowed).toBe(false);
    expect(body.blocked).toBe(true);
    expect(body.counts.issues).toBe(3);
  });
});
