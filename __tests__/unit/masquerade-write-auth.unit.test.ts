import { describe, it, expect } from "vitest";
import type { EffectiveSession } from "@/lib/masquerade";
import {
  activityLogActorId,
  productionGuardActorRole,
  productionGuardSession,
  writeAuthorizationRole,
} from "@/lib/masquerade";

function makeEffective(overrides: Partial<EffectiveSession> = {}): EffectiveSession {
  return {
    user: { id: "user-1", role: "ADMIN", email: "a@example.com", name: "Admin" },
    masquerade: null,
    rolePreview: null,
    ...overrides,
  };
}

describe("writeAuthorizationRole", () => {
  it("uses real role when role preview is active (ignores overlay)", () => {
    const effective = makeEffective({
      user: { id: "user-1", role: "ADMIN", email: "a@example.com", name: "Admin" },
      rolePreview: { realRole: "DESIGNER", previewRole: "ADMIN" },
    });
    expect(writeAuthorizationRole(effective)).toBe("DESIGNER");
  });

  it("uses target role when masquerading", () => {
    const effective = makeEffective({
      user: { id: "target-1", role: "INSTALL_DIRECTOR", email: "t@example.com", name: "Target" },
      masquerade: {
        actorId: "actor-1",
        actorRole: "ADMIN",
        targetUserId: "target-1",
        logId: "log-1",
      },
    });
    expect(writeAuthorizationRole(effective)).toBe("INSTALL_DIRECTOR");
  });

  it("uses session role when no preview or masquerade", () => {
    const effective = makeEffective({
      user: { id: "user-1", role: "INSTALL_DIRECTOR", email: "d@example.com", name: "Director" },
    });
    expect(writeAuthorizationRole(effective)).toBe("INSTALL_DIRECTOR");
  });
});

describe("productionGuardActorRole", () => {
  it("uses real role when role preview is active", () => {
    const effective = makeEffective({
      user: { id: "user-1", role: "ADMIN", email: "a@example.com", name: "Admin" },
      rolePreview: { realRole: "DESIGNER", previewRole: "ADMIN" },
    });
    expect(productionGuardActorRole(effective)).toBe("DESIGNER");
  });

  it("uses masquerade actor role, not target", () => {
    const effective = makeEffective({
      user: { id: "target-1", role: "INSTALL_DIRECTOR", email: "t@example.com", name: "Target" },
      masquerade: {
        actorId: "actor-1",
        actorRole: "ADMIN",
        targetUserId: "target-1",
        logId: "log-1",
      },
    });
    expect(productionGuardActorRole(effective)).toBe("ADMIN");
  });
});

describe("productionGuardSession", () => {
  it("wraps productionGuardActorRole for enforceProductionFieldNotesMutation", () => {
    const effective = makeEffective({
      user: { id: "user-1", role: "ADMIN", email: "a@example.com", name: "Admin" },
      rolePreview: { realRole: "DESIGNER", previewRole: "ADMIN" },
    });
    expect(productionGuardSession(effective)).toEqual({ user: { role: "DESIGNER" } });
  });
});

describe("activityLogActorId", () => {
  it("uses masquerade actor id when impersonating", () => {
    const effective = makeEffective({
      user: { id: "target-1", role: "INSTALL_DIRECTOR", email: "t@example.com", name: "Target" },
      masquerade: {
        actorId: "actor-1",
        actorRole: "ADMIN",
        targetUserId: "target-1",
        logId: "log-1",
      },
    });
    expect(activityLogActorId(effective)).toBe("actor-1");
  });

  it("uses session user id when not masquerading", () => {
    const effective = makeEffective({
      user: { id: "user-1", role: "INSTALL_DIRECTOR", email: "d@example.com", name: "Director" },
    });
    expect(activityLogActorId(effective)).toBe("user-1");
  });
});
