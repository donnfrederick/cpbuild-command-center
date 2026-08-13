import { describe, it, expect, vi, beforeEach } from "vitest";
import { normalizeUserEmail, findUserByEmailForAuth } from "@/lib/user-email";

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

describe("normalizeUserEmail()", () => {
  it("lowercases and trims", () => {
    expect(normalizeUserEmail("  User@CP.Build  ")).toBe("user@cp.build");
  });
});

describe("findUserByEmailForAuth()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns exact match when present", async () => {
    const user = { id: "u1", email: "user@cp.build", role: { code: "MEMBER" } };
    mockFindUnique.mockResolvedValueOnce(user);

    const result = await findUserByEmailForAuth("user@cp.build");
    expect(result).toBe(user);
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("falls back to case-insensitive lookup", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    const user = { id: "u1", email: "User@CP.Build", role: { code: "MEMBER" } };
    mockFindFirst.mockResolvedValueOnce(user);

    const result = await findUserByEmailForAuth("user@cp.build");
    expect(result).toBe(user);
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: { equals: "user@cp.build", mode: "insensitive" } },
      }),
    );
  });

  it("returns null for empty email", async () => {
    expect(await findUserByEmailForAuth("   ")).toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });
});
