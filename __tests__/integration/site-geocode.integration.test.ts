/**
 * Integration tests: GET /api/projects/[id]/site-geocode
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/masquerade", () => ({ getEffectiveSession: vi.fn() }));
vi.mock("@/lib/production-project-access", () => ({
  enforceProjectReadVisibility: vi.fn(),
}));
vi.mock("@/lib/geo/project-site-geocode", () => ({
  resolveProjectSiteGeocode: vi.fn(),
}));

const { getEffectiveSession } = await import("@/lib/masquerade");
const { enforceProjectReadVisibility } = await import("@/lib/production-project-access");
const { resolveProjectSiteGeocode } = await import("@/lib/geo/project-site-geocode");

describe("GET /api/projects/[id]/site-geocode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEffectiveSession).mockResolvedValue({
      user: { id: "u1", role: "MEMBER" },
    } as never);
    vi.mocked(enforceProjectReadVisibility).mockResolvedValue(null);
    vi.mocked(resolveProjectSiteGeocode).mockResolvedValue({
      siteLocation: "348 E South Temple, Salt Lake City, UT",
      latitude: 40.7705,
      longitude: -111.887,
      available: true,
      geocodeStatus: "OK",
    });
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValueOnce(null);
    const { GET } = await import("@/app/api/projects/[id]/site-geocode/route");
    const res = await GET(new NextRequest("http://localhost/api/projects/p1/site-geocode"), {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns geocode payload when project is visible", async () => {
    const { GET } = await import("@/app/api/projects/[id]/site-geocode/route");
    const res = await GET(new NextRequest("http://localhost/api/projects/p1/site-geocode"), {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.available).toBe(true);
    expect(body.latitude).toBe(40.7705);
    expect(body.siteLocation).toContain("South Temple");
  });
});
