import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindUnique = vi.fn();
const mockFindFirst = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
  },
}));

describe("resolveSessionToDbUserId()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns id when session id matches a DB user", async () => {
    mockFindUnique.mockResolvedValueOnce({ id: "u-real" });
    const { resolveSessionToDbUserId } = await import("@/lib/session-db-user");
    const id = await resolveSessionToDbUserId({ id: "u-real", email: "x@test.com" });
    expect(id).toBe("u-real");
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("for dev-user, resolves by email when row exists", async () => {
    mockFindUnique.mockResolvedValueOnce({ id: "admin-db" });
    const { resolveSessionToDbUserId } = await import("@/lib/session-db-user");
    const id = await resolveSessionToDbUserId({
      id: "dev-user",
      email: "admin@example.com",
    });
    expect(id).toBe("admin-db");
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { email: "admin@example.com" },
      select: { id: true },
    });
  });

  it("for dev-user without email match, prefers oldest ADMIN then any user", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    mockFindFirst.mockResolvedValueOnce({ id: "admin-user" });
    const { resolveSessionToDbUserId } = await import("@/lib/session-db-user");
    const id = await resolveSessionToDbUserId({ id: "dev-user", email: "dev@cpbuild.com" });
    expect(id).toBe("admin-user");
    expect(mockFindFirst).toHaveBeenCalled();
  });

  it("returns null when no user can be resolved", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const { resolveSessionToDbUserId } = await import("@/lib/session-db-user");
    const id = await resolveSessionToDbUserId({ id: "dev-user", email: "orphan@x.com" });
    expect(id).toBeNull();
  });
});
