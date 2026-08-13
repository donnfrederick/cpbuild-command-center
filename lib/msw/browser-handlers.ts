/**
 * browser-handlers.ts — MSW mock handlers for sandbox mode
 *
 * These handlers intercept API calls in the browser when sandbox mode is active.
 * Every handler returns a realistic success response WITHOUT touching the real DB.
 *
 * Only mutation routes are mocked — GET requests pass through so the UI still
 * shows real data (read-only) while writes are safely intercepted.
 *
 * Add a handler here whenever a new mutation route is added to the app.
 */

import { http, HttpResponse } from "msw";

// ── Projects ─────────────────────────────────────────────────────────────────

export const projectHandlers = [
  // Create project — returns a plausible stub
  http.post("/api/projects", async ({ request }) => {
    const body = await request.json().catch(() => ({}));
    const pid = (body as Record<string, string>).unifierPid ?? "sandbox-pid";
    return HttpResponse.json(
      {
        id: `sandbox-${Date.now()}`,
        projectName: "Sandbox Project",
        siteLocation: "",
        status: "",
        lifecycleStatus: "Planning" as const,
        startDate: null,
        installManagerId: null,
        installManagerName: null,
        projectManagerId: null,
        projectManagerName: "",
        unifierPid: pid,
        unifierProjectNumber: null,
        restored: false,
        unitsCount: 0,
      },
      { status: 201 }
    );
  }),

  // Soft-delete project
  http.delete("/api/projects/:id", () => {
    return HttpResponse.json({ ok: true });
  }),

  // Update project (PATCH)
  http.patch("/api/projects/:id", async ({ request }) => {
    const body = await request.json().catch(() => ({}));
    return HttpResponse.json({
      id: "sandbox-id",
      ...(body as object),
      updatedAt: new Date().toISOString(),
    });
  }),
];

// ── Units / ProjectRows ───────────────────────────────────────────────────────

export const unitHandlers = [
  // Update unit scope stage/status
  http.patch("/api/projects/:projectId/units/:rowId", async ({ request }) => {
    const body = await request.json().catch(() => ({}));
    return HttpResponse.json({
      id: "sandbox-row-id",
      ...(body as object),
      updatedAt: new Date().toISOString(),
    });
  }),

  // Bulk delete units
  http.post("/api/projects/:projectId/units/bulk-delete", () => {
    return HttpResponse.json({ deleted: 0, message: "[Sandbox] No rows deleted" });
  }),
];

// ── Team / Invites ────────────────────────────────────────────────────────────

export const teamHandlers = [
  // Send invite
  http.post("/api/invites", async ({ request }) => {
    const body = await request.json().catch(() => ({}));
    return HttpResponse.json(
      {
        id: `sandbox-invite-${Date.now()}`,
        email: (body as Record<string, string>).email ?? "sandbox@example.com",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
      },
      { status: 201 }
    );
  }),

  // Update member role
  http.patch("/api/team/:userId/role", async ({ request }) => {
    const body = await request.json().catch(() => ({}));
    return HttpResponse.json({ ok: true, ...(body as object) });
  }),

  // Remove member
  http.delete("/api/team/:userId", () => {
    return HttpResponse.json({ ok: true });
  }),
];

// ── Feedback ──────────────────────────────────────────────────────────────────

export const feedbackHandlers = [
  http.post("/api/feedback", async ({ request }) => {
    const body = await request.json().catch(() => ({}));
    return HttpResponse.json(
      {
        id: `sandbox-feedback-${Date.now()}`,
        ...(body as object),
        status: "OPEN",
        createdAt: new Date().toISOString(),
      },
      { status: 201 }
    );
  }),

  http.patch("/api/feedback/:id", async ({ request }) => {
    const body = await request.json().catch(() => ({}));
    return HttpResponse.json({ ok: true, ...(body as object) });
  }),
];

// ── Offline preferences ───────────────────────────────────────────────────────

export const offlineHandlers = [
  http.patch("/api/offline/preferences", async ({ request }) => {
    const body = await request.json().catch(() => ({}));
    return HttpResponse.json({ ok: true, ...(body as object) });
  }),
];

// ── All sandbox handlers ──────────────────────────────────────────────────────

export const sandboxHandlers = [
  ...projectHandlers,
  ...unitHandlers,
  ...teamHandlers,
  ...feedbackHandlers,
  ...offlineHandlers,
];
