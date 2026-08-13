import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: vi.fn(),
    },
    activityLog: {
      create: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { resolveActorName, resolveActivityActorName } from "@/lib/activity-logger";

describe("resolveActorName()", () => {
  beforeEach(() => {
    vi.mocked(db.user.findUnique).mockReset();
  });

  it("returns null for unknown user ids instead of guessing another user", async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue(null);
    await expect(resolveActorName("dev-user")).resolves.toBeNull();
    expect(db.user.findUnique).toHaveBeenCalledWith({
      where: { id: "dev-user" },
      select: { name: true, email: true },
    });
  });

  it("returns the matched user's name when present", async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue({
      name: "Phil Salter",
      email: "phil@cpbuild.com",
    });
    await expect(resolveActorName("user-phil")).resolves.toBe("Phil Salter");
  });
});

describe("resolveActivityActorName()", () => {
  beforeEach(() => {
    vi.mocked(db.user.findUnique).mockReset();
  });

  it("prefers session name over database lookup", async () => {
    await expect(
      resolveActivityActorName({
        user: { id: "dev-user", name: "Phil Salter", email: "phil@cpbuild.com" },
      }),
    ).resolves.toEqual({ actorId: "dev-user", userName: "Phil Salter" });
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("falls back to database when session has no display name", async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue({
      name: "Hannah Farr",
      email: "hannah@cpbuild.com",
    });
    await expect(
      resolveActivityActorName({
        user: { id: "user-hannah", name: null, email: null },
      }),
    ).resolves.toEqual({ actorId: "user-hannah", userName: "Hannah Farr" });
  });
});
