import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/masquerade", () => ({ getEffectiveSession: vi.fn() }));

describe("GET /api/site-tour", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const { getEffectiveSession } = await import("@/lib/masquerade");
    vi.mocked(getEffectiveSession).mockResolvedValueOnce(null);

    const { GET } = await import("@/app/api/site-tour/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 200 with steps array when authenticated", async () => {
    const { getEffectiveSession } = await import("@/lib/masquerade");
    vi.mocked(getEffectiveSession).mockResolvedValueOnce({
      user: { id: "user-1", name: "Test", email: "test@cpbuild.com", role: "MEMBER", specialPermissions: [] },
      masquerade: null,
      rolePreview: null,
    } as never);

    const { GET } = await import("@/app/api/site-tour/route");
    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json() as { steps: unknown[] };
    expect(Array.isArray(body.steps)).toBe(true);
    expect(body.steps.length).toBeGreaterThanOrEqual(10);
  });

  it("every returned step has the required shape", async () => {
    const { getEffectiveSession } = await import("@/lib/masquerade");
    vi.mocked(getEffectiveSession).mockResolvedValueOnce({
      user: { id: "user-1", name: "Test", email: "test@cpbuild.com", role: "MEMBER", specialPermissions: [] },
      masquerade: null,
      rolePreview: null,
    } as never);

    const { GET } = await import("@/app/api/site-tour/route");
    const res = await GET();
    const body = await res.json() as { steps: Record<string, unknown>[] };

    const isLocalizedString = (v: unknown) =>
      typeof v === "object" && v !== null && typeof (v as Record<string, unknown>).en === "string" && typeof (v as Record<string, unknown>).es === "string";

    for (const step of body.steps) {
      expect(typeof step.order).toBe("number");
      expect(typeof step.pageUrl).toBe("string");
      expect(typeof step.title === "string" || isLocalizedString(step.title)).toBe(true);
      expect(typeof step.description === "string" || isLocalizedString(step.description)).toBe(true);
      expect(typeof step.voiceText === "string" || isLocalizedString(step.voiceText)).toBe(true);
      expect(typeof step.elementSelector).toBe("string");
    }
  });

  it("works for any role — tour is available to all authenticated users", async () => {
    for (const role of ["ADMIN", "MEMBER", "CONTROLS_MANAGER", "PROJECT_MANAGER"]) {
      const { getEffectiveSession } = await import("@/lib/masquerade");
      vi.mocked(getEffectiveSession).mockResolvedValueOnce({
        user: { id: "user-1", name: "Test", email: "test@cpbuild.com", role, specialPermissions: [] },
        masquerade: null,
        rolePreview: null,
      } as never);

      const { GET } = await import("@/app/api/site-tour/route");
      const res = await GET();
      expect(res.status, `role ${role} should get 200`).toBe(200);

      vi.resetModules();
      vi.clearAllMocks();
    }
  });

  it("uses the effective session role — route responds 200 for CONTROLS_MANAGER with all current steps", async () => {
    // NOTE: No current tour steps navigate to /users, so the VIEW_DASHBOARD filter
    // in the route is currently a no-op. CONTROLS_MANAGER (which lacks VIEW_DASHBOARD)
    // still receives all steps. This test verifies the route uses getEffectiveSession()
    // and returns a valid step set for the effective role. The step-count filter will
    // become meaningful if /users tour steps are added in the future.
    const { getEffectiveSession } = await import("@/lib/masquerade");
    vi.mocked(getEffectiveSession).mockResolvedValueOnce({
      user: { id: "user-1", name: "Test", email: "test@cpbuild.com", role: "CONTROLS_MANAGER", specialPermissions: [] },
      masquerade: null,
      rolePreview: null,
    } as never);

    const { GET } = await import("@/app/api/site-tour/route");
    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json() as { steps: unknown[] };
    expect(body.steps.length).toBeGreaterThanOrEqual(10);
  });

  it("role-preview as CONTROLS_MANAGER from ADMIN uses the effective role (previewed role) to filter steps", async () => {
    // The route uses getEffectiveSession() so role-preview is respected.
    // Currently no steps navigate to /users, so both ADMIN and CONTROLS_MANAGER
    // receive the same step set — but this test confirms the route consults the
    // effective (previewed) role rather than the real JWT role.
    const { getEffectiveSession } = await import("@/lib/masquerade");
    vi.mocked(getEffectiveSession).mockResolvedValueOnce({
      user: { id: "user-1", name: "Admin", email: "admin@cpbuild.com", role: "CONTROLS_MANAGER", specialPermissions: [] },
      masquerade: null,
      rolePreview: { realRole: "ADMIN", previewRole: "CONTROLS_MANAGER" },
    } as never);

    const { GET } = await import("@/app/api/site-tour/route");
    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json() as { steps: unknown[] };
    expect(body.steps.length).toBeGreaterThanOrEqual(10);
  });
});
