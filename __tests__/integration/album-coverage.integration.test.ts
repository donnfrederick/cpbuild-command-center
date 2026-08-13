import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    mediaAttachment: { findMany: vi.fn() },
    projectObservation: { findMany: vi.fn() },
    observationComment: { findMany: vi.fn() },
    projectIssue: { findMany: vi.fn() },
    issueComment: { findMany: vi.fn() },
    projectRow: { findMany: vi.fn() },
    inspectionSubmission: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/production-project-access", () => ({
  enforceProjectReadVisibility: vi.fn().mockResolvedValue(null),
}));

const PROJECT_ID = "proj_test";

async function makeCoverageGet() {
  const { GET } = await import("@/app/api/projects/[id]/album/coverage/route");
  return GET(
    new Request(`http://localhost/api/projects/${PROJECT_ID}/album/coverage`),
    { params: Promise.resolve({ id: PROJECT_ID }) },
  );
}

describe("GET /api/projects/[id]/album/coverage", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "true";
    process.env.DEV_USER_ROLE = "ADMIN";

    const { db } = await import("@/lib/db");
    vi.mocked(db.mediaAttachment.findMany).mockResolvedValue([]);
    vi.mocked(db.projectObservation.findMany).mockResolvedValue([]);
    vi.mocked(db.observationComment.findMany).mockResolvedValue([]);
    vi.mocked(db.projectIssue.findMany).mockResolvedValue([]);
    vi.mocked(db.issueComment.findMany).mockResolvedValue([]);
    vi.mocked(db.projectRow.findMany).mockResolvedValue([]);
    vi.mocked(db.inspectionSubmission.findMany).mockResolvedValue([]);
  });

  it("returns empty unitRefs when no media exists", async () => {
    const res = await makeCoverageGet();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.unitRefs).toEqual([]);
  });

  it("returns distinct unit refs from standalone album uploads", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.mediaAttachment.findMany).mockResolvedValue([
      { unitPhotoUnitRef: "1|2|203" },
    ] as never);

    const res = await makeCoverageGet();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.unitRefs).toEqual(["1|2|203"]);
  });

  it("includes observation unit refs with visual attachments", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectObservation.findMany).mockResolvedValue([
      { unitRef: "1|3|301" },
    ] as never);

    const res = await makeCoverageGet();
    const data = await res.json();
    expect(data.unitRefs).toContain("1|3|301");
    expect(data.sourceTypesByUnitRef["1|3|301"]).toContain("observation");
  });

  it("returns source types for standalone uploads", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.mediaAttachment.findMany).mockResolvedValue([
      { unitPhotoUnitRef: "1|2|203", unitPhotoSourceType: "status_update" },
    ] as never);

    const res = await makeCoverageGet();
    const data = await res.json();
    expect(data.sourceTypesByUnitRef["1|2|203"]).toContain("status_update");
  });
});
