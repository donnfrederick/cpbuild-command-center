import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/dev-session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/masquerade", () => ({ getEffectiveSession: vi.fn() }));
vi.mock("@/lib/production-project-access", () => ({
  enforceProductionFieldNotesMutation: vi.fn(),
  enforceProjectReadVisibility: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/session-db-user", () => ({
  resolveSessionToDbUserId: vi.fn().mockResolvedValue("user-1"),
}));
vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn(),
  resolveActorName: vi.fn().mockResolvedValue("Admin User"),
}));
vi.mock("@/lib/custom-site-location-validation", () => ({
  validateCustomSiteLocationScope: vi.fn().mockResolvedValue({ ok: true }),
  customSiteLocationNameTaken: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/lib/db", () => ({
  db: {
    $transaction: vi.fn(),
    projectCustomSiteLocation: {
      findMany: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    projectObservation: { groupBy: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
    projectIssue: { groupBy: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
  },
}));

import { getSession } from "@/lib/dev-session";
import { getEffectiveSession } from "@/lib/masquerade";
import { enforceProductionFieldNotesMutation } from "@/lib/production-project-access";
import { logActivity } from "@/lib/activity-logger";
import {
  customSiteLocationNameTaken,
  validateCustomSiteLocationScope,
} from "@/lib/custom-site-location-validation";
import { db } from "@/lib/db";

const PROJECT = "proj-custom-site";

describe("custom-site-locations API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue({
      user: { id: "user-1", email: "admin@cp.build", role: "ADMIN" },
    } as never);
    vi.mocked(getEffectiveSession).mockResolvedValue({
      user: { id: "user-1", email: "admin@cp.build", role: "ADMIN" },
    } as never);
    vi.mocked(enforceProductionFieldNotesMutation).mockResolvedValue(null);
    vi.mocked(validateCustomSiteLocationScope).mockResolvedValue({ ok: true });
    vi.mocked(customSiteLocationNameTaken).mockResolvedValue(false);
    vi.mocked(db.projectObservation.groupBy).mockResolvedValue([]);
    vi.mocked(db.projectIssue.groupBy).mockResolvedValue([]);
  });

  it("GET returns locations with encoded unitRef", async () => {
    const createdAt = new Date("2026-06-01T12:00:00.000Z");
    vi.mocked(db.projectCustomSiteLocation.findMany).mockResolvedValue([
      {
        id: "loc-1",
        projectId: PROJECT,
        name: "Loading dock",
        building: "",
        level: "",
        placement: "standalone",
        sortOrder: 0,
        createdAt,
        updatedAt: createdAt,
        createdBy: { id: "user-1", name: "Hannah" },
      },
    ] as never);

    const { GET } = await import("@/app/api/projects/[id]/custom-site-locations/route");
    const res = await GET(new NextRequest(`http://localhost/api/projects/${PROJECT}/custom-site-locations`), {
      params: Promise.resolve({ id: PROJECT }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.locations).toHaveLength(1);
    expect(body.locations[0].unitRef).toBe("@custom|loc-1|Loading dock");
  });

  it("POST creates standalone location with empty building fields", async () => {
    const createdAt = new Date("2026-06-01T12:00:00.000Z");
    vi.mocked(db.projectCustomSiteLocation.aggregate).mockResolvedValue({
      _max: { sortOrder: 2 },
    } as never);
    vi.mocked(db.projectCustomSiteLocation.create).mockResolvedValue({
      id: "loc-new",
      projectId: PROJECT,
      name: "Parking lot",
      building: "",
      level: "",
      placement: "standalone",
      sortOrder: 3,
      createdAt,
      updatedAt: createdAt,
      createdBy: { id: "user-1", name: "Hannah" },
    } as never);

    const { POST } = await import("@/app/api/projects/[id]/custom-site-locations/route");
    const res = await POST(
      new NextRequest(`http://localhost/api/projects/${PROJECT}/custom-site-locations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Parking lot",
          placement: "standalone",
          building: "",
          level: "",
        }),
      }),
      { params: Promise.resolve({ id: PROJECT }) },
    );

    expect(res.status).toBe(201);
    expect(db.projectCustomSiteLocation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Parking lot",
          placement: "standalone",
          building: "",
          level: "",
          sortOrder: 3,
        }),
      }),
    );
    expect(logActivity).toHaveBeenCalledWith(
      PROJECT,
      "user-1",
      "Admin User",
      expect.objectContaining({
        eventType: "CUSTOM_SITE_LOCATION_CREATED",
        locationId: "loc-new",
        name: "Parking lot",
      }),
    );
  });

  it("POST rejects invalid scope with structured error code", async () => {
    vi.mocked(validateCustomSiteLocationScope).mockResolvedValue({
      ok: false,
      error: "Building is required",
    });

    const { POST } = await import("@/app/api/projects/[id]/custom-site-locations/route");
    const res = await POST(
      new NextRequest(`http://localhost/api/projects/${PROJECT}/custom-site-locations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Stairs",
          placement: "building",
          building: "",
          level: "",
        }),
      }),
      { params: Promise.resolve({ id: PROJECT }) },
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("invalid_scope");
    expect(db.projectCustomSiteLocation.create).not.toHaveBeenCalled();
  });

  it("POST rejects duplicate name in the same scope", async () => {
    vi.mocked(customSiteLocationNameTaken).mockResolvedValue(true);

    const { POST } = await import("@/app/api/projects/[id]/custom-site-locations/route");
    const res = await POST(
      new NextRequest(`http://localhost/api/projects/${PROJECT}/custom-site-locations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Parking lot",
          placement: "standalone",
          building: "",
          level: "",
        }),
      }),
      { params: Promise.resolve({ id: PROJECT }) },
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("duplicate_name");
    expect(body.error).toContain("this area");
    expect(db.projectCustomSiteLocation.create).not.toHaveBeenCalled();
  });

  it("POST creates location with the same name in a different scope", async () => {
    const createdAt = new Date("2026-06-01T12:00:00.000Z");
    vi.mocked(customSiteLocationNameTaken).mockResolvedValue(false);
    vi.mocked(db.projectCustomSiteLocation.aggregate).mockResolvedValue({
      _max: { sortOrder: 0 },
    } as never);
    vi.mocked(db.projectCustomSiteLocation.create).mockResolvedValue({
      id: "loc-building-parking",
      projectId: PROJECT,
      name: "Parking Lot",
      building: "5A",
      level: "",
      placement: "building",
      sortOrder: 1,
      createdAt,
      updatedAt: createdAt,
      createdBy: { id: "user-1", name: "Hannah" },
    } as never);

    const { POST } = await import("@/app/api/projects/[id]/custom-site-locations/route");
    const res = await POST(
      new NextRequest(`http://localhost/api/projects/${PROJECT}/custom-site-locations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Parking Lot",
          placement: "building",
          building: "5A",
          level: "",
        }),
      }),
      { params: Promise.resolve({ id: PROJECT }) },
    );

    expect(res.status).toBe(201);
    expect(customSiteLocationNameTaken).toHaveBeenCalledWith(
      PROJECT,
      "Parking Lot",
      {
        placement: "building",
        building: "5A",
        level: "",
      },
    );
  });

  it("DELETE blocks when field notes exist", async () => {
    vi.mocked(db.projectCustomSiteLocation.findFirst).mockResolvedValue({
      id: "loc-1",
      projectId: PROJECT,
      name: "Dock",
      building: "",
      level: "",
      placement: "standalone",
    } as never);
    vi.mocked(db.projectObservation.count).mockResolvedValue(1);
    vi.mocked(db.projectIssue.count).mockResolvedValue(0);

    const { DELETE } = await import(
      "@/app/api/projects/[id]/custom-site-locations/[locationId]/route"
    );
    const res = await DELETE(
      new NextRequest(`http://localhost/api/projects/${PROJECT}/custom-site-locations/loc-1`),
      { params: Promise.resolve({ id: PROJECT, locationId: "loc-1" }) },
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("has_field_notes");
    expect(db.projectCustomSiteLocation.delete).not.toHaveBeenCalled();
  });

  it("DELETE logs activity when location is removed", async () => {
    vi.mocked(db.projectCustomSiteLocation.findFirst).mockResolvedValue({
      id: "loc-1",
      projectId: PROJECT,
      name: "Dock",
      building: "",
      level: "",
      placement: "standalone",
    } as never);
    vi.mocked(db.projectObservation.count).mockResolvedValue(0);
    vi.mocked(db.projectIssue.count).mockResolvedValue(0);
    vi.mocked(db.projectCustomSiteLocation.delete).mockResolvedValue({} as never);

    const { DELETE } = await import(
      "@/app/api/projects/[id]/custom-site-locations/[locationId]/route"
    );
    const res = await DELETE(
      new NextRequest(`http://localhost/api/projects/${PROJECT}/custom-site-locations/loc-1`),
      { params: Promise.resolve({ id: PROJECT, locationId: "loc-1" }) },
    );

    expect(res.status).toBe(200);
    expect(logActivity).toHaveBeenCalledWith(
      PROJECT,
      "user-1",
      "Admin User",
      expect.objectContaining({
        eventType: "CUSTOM_SITE_LOCATION_DELETED",
        locationId: "loc-1",
        name: "Dock",
      }),
    );
  });

  it("PATCH updates name and placement, logs activity", async () => {
    const createdAt = new Date("2026-06-01T12:00:00.000Z");
    const existing = {
      id: "loc-1",
      projectId: PROJECT,
      name: "Old name",
      building: "",
      level: "",
      placement: "standalone",
      sortOrder: 0,
      createdAt,
      updatedAt: createdAt,
    };
    const updated = {
      ...existing,
      name: "New name",
      placement: "building",
      building: "Tower A",
      level: "",
      createdBy: { id: "user-1", name: "Hannah" },
    };
    vi.mocked(db.projectCustomSiteLocation.findFirst).mockResolvedValue(existing as never);
    vi.mocked(validateCustomSiteLocationScope).mockResolvedValue({ ok: true });
    vi.mocked(customSiteLocationNameTaken).mockResolvedValue(false);
    vi.mocked(db.$transaction).mockResolvedValue([updated] as never);
    vi.mocked(db.projectObservation.count).mockResolvedValue(0);
    vi.mocked(db.projectIssue.count).mockResolvedValue(0);

    const { PATCH } = await import(
      "@/app/api/projects/[id]/custom-site-locations/[locationId]/route"
    );
    const res = await PATCH(
      new NextRequest(
        `http://localhost/api/projects/${PROJECT}/custom-site-locations/loc-1`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "New name", placement: "building", building: "Tower A", level: "" }),
        },
      ),
      { params: Promise.resolve({ id: PROJECT, locationId: "loc-1" }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.location.name).toBe("New name");
    expect(body.location.placement).toBe("building");
    expect(body.location.unitRef).toBe("@custom|loc-1|New name");
    expect(customSiteLocationNameTaken).toHaveBeenCalledWith(
      PROJECT,
      "New name",
      {
        placement: "building",
        building: "Tower A",
        level: "",
      },
      "loc-1",
    );
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    const txOps = vi.mocked(db.$transaction).mock.calls[0]?.[0] as unknown[];
    expect(txOps).toHaveLength(3);
    expect(logActivity).toHaveBeenCalledWith(
      PROJECT,
      "user-1",
      "Admin User",
      expect.objectContaining({
        eventType: "CUSTOM_SITE_LOCATION_UPDATED",
        locationId: "loc-1",
        name: "New name",
        previousName: "Old name",
      }),
    );
  });

  it("PATCH returns 404 when location does not exist", async () => {
    vi.mocked(db.projectCustomSiteLocation.findFirst).mockResolvedValue(null);

    const { PATCH } = await import(
      "@/app/api/projects/[id]/custom-site-locations/[locationId]/route"
    );
    const res = await PATCH(
      new NextRequest(
        `http://localhost/api/projects/${PROJECT}/custom-site-locations/does-not-exist`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "X", placement: "standalone", building: "", level: "" }),
        },
      ),
      { params: Promise.resolve({ id: PROJECT, locationId: "does-not-exist" }) },
    );

    expect(res.status).toBe(404);
    expect(db.projectCustomSiteLocation.update).not.toHaveBeenCalled();
  });

  it("PATCH rejects duplicate name (excluding self)", async () => {
    const existing = {
      id: "loc-1",
      projectId: PROJECT,
      name: "Loading Dock",
      building: "",
      level: "",
      placement: "standalone",
    };
    vi.mocked(db.projectCustomSiteLocation.findFirst).mockResolvedValue(existing as never);
    vi.mocked(customSiteLocationNameTaken).mockResolvedValue(true);

    const { PATCH } = await import(
      "@/app/api/projects/[id]/custom-site-locations/[locationId]/route"
    );
    const res = await PATCH(
      new NextRequest(
        `http://localhost/api/projects/${PROJECT}/custom-site-locations/loc-1`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Parking Lot", placement: "standalone", building: "", level: "" }),
        },
      ),
      { params: Promise.resolve({ id: PROJECT, locationId: "loc-1" }) },
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("duplicate_name");
    expect(customSiteLocationNameTaken).toHaveBeenCalledWith(
      PROJECT,
      "Parking Lot",
      {
        placement: "standalone",
        building: "",
        level: "",
      },
      "loc-1",
    );
    expect(db.projectCustomSiteLocation.update).not.toHaveBeenCalled();
  });

  it("PATCH rejects invalid scope", async () => {
    const existing = {
      id: "loc-1",
      projectId: PROJECT,
      name: "Stairs",
      building: "",
      level: "",
      placement: "standalone",
    };
    vi.mocked(db.projectCustomSiteLocation.findFirst).mockResolvedValue(existing as never);
    vi.mocked(validateCustomSiteLocationScope).mockResolvedValue({
      ok: false,
      error: "Building is required",
    });

    const { PATCH } = await import(
      "@/app/api/projects/[id]/custom-site-locations/[locationId]/route"
    );
    const res = await PATCH(
      new NextRequest(
        `http://localhost/api/projects/${PROJECT}/custom-site-locations/loc-1`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Stairs", placement: "building", building: "", level: "" }),
        },
      ),
      { params: Promise.resolve({ id: PROJECT, locationId: "loc-1" }) },
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("invalid_scope");
  });

  it("PATCH accepts null/empty nullable fields from request (Unifier null parity)", async () => {
    const createdAt = new Date("2026-06-01T12:00:00.000Z");
    const existing = {
      id: "loc-2",
      projectId: PROJECT,
      name: "Site Office",
      building: "",
      level: "",
      placement: "standalone",
      sortOrder: 1,
      createdAt,
      updatedAt: createdAt,
    };
    const updated = {
      ...existing,
      name: "Site Office",
      createdBy: { id: "user-1", name: "Hannah" },
    };
    vi.mocked(db.projectCustomSiteLocation.findFirst).mockResolvedValue(existing as never);
    vi.mocked(customSiteLocationNameTaken).mockResolvedValue(false);
    vi.mocked(db.projectCustomSiteLocation.update).mockResolvedValue(updated as never);
    vi.mocked(db.projectObservation.count).mockResolvedValue(0);
    vi.mocked(db.projectIssue.count).mockResolvedValue(0);

    const { PATCH } = await import(
      "@/app/api/projects/[id]/custom-site-locations/[locationId]/route"
    );
    const res = await PATCH(
      new NextRequest(
        `http://localhost/api/projects/${PROJECT}/custom-site-locations/loc-2`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Site Office", placement: "standalone" }),
        },
      ),
      { params: Promise.resolve({ id: PROJECT, locationId: "loc-2" }) },
    );

    expect(res.status).toBe(200);
  });
});
