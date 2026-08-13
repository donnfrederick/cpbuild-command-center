import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/dev-session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/masquerade", () => ({ getEffectiveSession: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    issueTypeCatalog: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    responsiblePartyCatalog: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { getSession } from "@/lib/dev-session";
import { getEffectiveSession } from "@/lib/masquerade";
import { db } from "@/lib/db";

const ACTIVE_CATALOG = {
  issueTypes: [
    { code: "OTHER", displayName: "Other", requiresVisual: false },
    { code: "MATERIAL_IN_THE_WAY", displayName: "Material in the way", requiresVisual: false },
  ],
  responsibleParties: [{ code: "CP_BUILD", displayName: "CP Build" }],
};

describe("GET /api/issue-catalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.issueTypeCatalog.findMany).mockResolvedValue(ACTIVE_CATALOG.issueTypes as never);
    vi.mocked(db.responsiblePartyCatalog.findMany).mockResolvedValue(
      ACTIVE_CATALOG.responsibleParties as never,
    );
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getSession).mockResolvedValue(null as never);
    const { GET } = await import("@/app/api/issue-catalog/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns active catalog for authenticated users", async () => {
    vi.mocked(getSession).mockResolvedValue({
      user: { id: "u1", role: "MEMBER" },
    } as never);
    const { GET } = await import("@/app/api/issue-catalog/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.issueTypes).toHaveLength(2);
    expect(body.responsibleParties[0].code).toBe("CP_BUILD");
  });
});

describe("GET /api/issue-catalog/manage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.issueTypeCatalog.findMany).mockResolvedValue([
      { ...ACTIVE_CATALOG.issueTypes[0], sortOrder: 10, isActive: true },
    ] as never);
    vi.mocked(db.responsiblePartyCatalog.findMany).mockResolvedValue([
      { ...ACTIVE_CATALOG.responsibleParties[0], sortOrder: 10, isActive: true },
    ] as never);
  });

  it("returns 403 for members without report-config permission", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue({
      user: { id: "u1", role: "MEMBER" },
    } as never);
    const { GET } = await import("@/app/api/issue-catalog/manage/route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns full catalog for install director", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue({
      user: { id: "u1", role: "INSTALL_DIRECTOR" },
    } as never);
    const { GET } = await import("@/app/api/issue-catalog/manage/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.issueTypes[0].isActive).toBe(true);
  });
});

describe("POST /api/issue-catalog/issue-types", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEffectiveSession).mockResolvedValue({
      user: { id: "u1", role: "ADMIN" },
    } as never);
    vi.mocked(db.issueTypeCatalog.findUnique).mockResolvedValue(null as never);
    vi.mocked(db.issueTypeCatalog.aggregate).mockResolvedValue({ _max: { sortOrder: 50 } } as never);
    vi.mocked(db.issueTypeCatalog.create).mockResolvedValue({
      code: "CUSTOM_TYPE",
      displayName: "Custom Type",
      requiresVisual: false,
      sortOrder: 60,
      isActive: true,
    } as never);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue(null as never);
    const { POST } = await import("@/app/api/issue-catalog/issue-types/route");
    const res = await POST(
      new NextRequest("http://localhost/api/issue-catalog/issue-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Custom Type" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("creates a new issue type for admins", async () => {
    const { POST } = await import("@/app/api/issue-catalog/issue-types/route");
    const res = await POST(
      new NextRequest("http://localhost/api/issue-catalog/issue-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Custom Type" }),
      }),
    );
    expect(res.status).toBe(201);
    expect(db.issueTypeCatalog.create).toHaveBeenCalled();
  });
});
