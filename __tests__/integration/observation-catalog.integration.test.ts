import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/dev-session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/masquerade", () => ({ getEffectiveSession: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    observationTypeCatalog: {
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
  observationTypes: [
    { code: "QUALITY", displayName: "Quality" },
    { code: "SAFETY", displayName: "Safety" },
  ],
};

describe("GET /api/observation-catalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.observationTypeCatalog.findMany).mockResolvedValue(
      ACTIVE_CATALOG.observationTypes as never,
    );
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getSession).mockResolvedValue(null as never);
    const { GET } = await import("@/app/api/observation-catalog/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns active catalog for authenticated users", async () => {
    vi.mocked(getSession).mockResolvedValue({
      user: { id: "u1", role: "MEMBER" },
    } as never);
    const { GET } = await import("@/app/api/observation-catalog/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.observationTypes).toHaveLength(2);
    expect(body.observationTypes[0].code).toBe("QUALITY");
  });
});

describe("GET /api/observation-catalog/manage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.observationTypeCatalog.findMany).mockResolvedValue([
      { ...ACTIVE_CATALOG.observationTypes[0], sortOrder: 10, isActive: true },
    ] as never);
  });

  it("returns 403 for members without report-config permission", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue({
      user: { id: "u1", role: "MEMBER" },
    } as never);
    const { GET } = await import("@/app/api/observation-catalog/manage/route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns manage catalog for install directors", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue({
      user: { id: "u1", role: "INSTALL_DIRECTOR" },
    } as never);
    const { GET } = await import("@/app/api/observation-catalog/manage/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.observationTypes[0].code).toBe("QUALITY");
  });
});

describe("POST /api/observation-catalog/types", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.observationTypeCatalog.findUnique).mockResolvedValue(null as never);
    vi.mocked(db.observationTypeCatalog.aggregate).mockResolvedValue({ _max: { sortOrder: 40 } } as never);
    vi.mocked(db.observationTypeCatalog.create).mockResolvedValue({
      code: "SITE_CONDITION",
      displayName: "Site condition",
      sortOrder: 50,
      isActive: true,
    } as never);
  });

  it("creates a new observation type for authorized users", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue({
      user: { id: "u1", role: "INSTALL_DIRECTOR" },
    } as never);
    const { POST } = await import("@/app/api/observation-catalog/types/route");
    const res = await POST(
      new NextRequest("http://localhost/api/observation-catalog/types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Site condition" }),
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.displayName).toBe("Site condition");
  });
});
