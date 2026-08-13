/**
 * Integration tests for GET /api/releases/share-link.
 *
 * Covers:
 * - 401 when not authenticated
 * - 403 when authenticated but not admin
 * - 400 when releaseId is missing
 * - 404 when release not found
 * - 404 when release has no tour
 * - 200 with correct URL shape
 * - URL uses NEXT_PUBLIC_APP_URL when set
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    release: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/permissions", () => ({
  hasPermission: vi.fn(),
  PERMISSIONS: { MANAGE_ROLES: "manage:roles" },
}));

import { GET } from "@/app/api/releases/share-link/route";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";

function makeRequest(params?: Record<string, string>): Request {
  const url = new URL("http://localhost/api/releases/share-link");
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new Request(url);
}

const MOCK_ADMIN_SESSION = { user: { id: "admin-1", role: "ADMIN" } };
const MOCK_RELEASE_WITH_TOUR = {
  id: "release-abc",
  tour: { id: "tour-xyz" },
};
const MOCK_RELEASE_NO_TOUR = {
  id: "release-no-tour",
  tour: null,
};

describe("GET /api/releases/share-link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "https://command-center-test.railway.app";
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const res = await GET(makeRequest({ releaseId: "abc" }) as Parameters<typeof GET>[0]);
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not admin", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1", role: "MEMBER" } } as Awaited<ReturnType<typeof auth>>);
    vi.mocked(hasPermission).mockReturnValue(false);
    const res = await GET(makeRequest({ releaseId: "abc" }) as Parameters<typeof GET>[0]);
    expect(res.status).toBe(403);
  });

  it("returns 400 when releaseId is missing", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as Awaited<ReturnType<typeof auth>>);
    vi.mocked(hasPermission).mockReturnValue(true);
    const res = await GET(makeRequest() as Parameters<typeof GET>[0]);
    expect(res.status).toBe(400);
  });

  it("returns 404 when release not found", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as Awaited<ReturnType<typeof auth>>);
    vi.mocked(hasPermission).mockReturnValue(true);
    vi.mocked(db.release.findUnique).mockResolvedValue(null);
    const res = await GET(makeRequest({ releaseId: "nonexistent" }) as Parameters<typeof GET>[0]);
    expect(res.status).toBe(404);
  });

  it("returns 404 when release has no tour", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as Awaited<ReturnType<typeof auth>>);
    vi.mocked(hasPermission).mockReturnValue(true);
    vi.mocked(db.release.findUnique).mockResolvedValue(MOCK_RELEASE_NO_TOUR as Awaited<ReturnType<typeof db.release.findUnique>>);
    const res = await GET(makeRequest({ releaseId: "release-no-tour" }) as Parameters<typeof GET>[0]);
    expect(res.status).toBe(404);
  });

  it("returns 200 with a correctly shaped URL", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as Awaited<ReturnType<typeof auth>>);
    vi.mocked(hasPermission).mockReturnValue(true);
    vi.mocked(db.release.findUnique).mockResolvedValue(MOCK_RELEASE_WITH_TOUR as Awaited<ReturnType<typeof db.release.findUnique>>);

    const res = await GET(makeRequest({ releaseId: "release-abc" }) as Parameters<typeof GET>[0]);
    expect(res.status).toBe(200);
    const body = await res.json() as { url: string };
    expect(body.url).toBe("https://command-center-test.railway.app/en/projects?tour=release-abc");
  });

  it("uses Spanish locale when locale=es is passed", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as Awaited<ReturnType<typeof auth>>);
    vi.mocked(hasPermission).mockReturnValue(true);
    vi.mocked(db.release.findUnique).mockResolvedValue(MOCK_RELEASE_WITH_TOUR as Awaited<ReturnType<typeof db.release.findUnique>>);

    const res = await GET(makeRequest({ releaseId: "release-abc", locale: "es" }) as Parameters<typeof GET>[0]);
    expect(res.status).toBe(200);
    const body = await res.json() as { url: string };
    expect(body.url).toContain("/es/projects");
  });
});
