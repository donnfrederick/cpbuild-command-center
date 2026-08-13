import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/auth/reset-password/route";
import { hashToken } from "@/lib/password-reset";

const mockFindUnique = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    passwordResetToken: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: vi.fn(),
    },
    user: { update: vi.fn() },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("new-hashed-password"),
  },
}));

const VALID_TOKEN = "a".repeat(64);

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validRecord(overrides: object = {}) {
  return {
    id: "tok-1",
    userId: "user-1",
    tokenHash: hashToken(VALID_TOKEN),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    usedAt: null,
    ...overrides,
  };
}

describe("POST /api/auth/reset-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockResolvedValue([]);
  });

  it("returns 200 and resets password with a valid unused token", async () => {
    mockFindUnique.mockResolvedValueOnce(validRecord());

    const res = await POST(
      makeRequest({ token: VALID_TOKEN, password: "NewPass1!", confirmPassword: "NewPass1!" })
    );
    expect(res.status).toBe(200);
    expect(mockTransaction).toHaveBeenCalledOnce();
  });

  it("returns 400 for an already-used token", async () => {
    mockFindUnique.mockResolvedValueOnce(validRecord({ usedAt: new Date() }));

    const res = await POST(
      makeRequest({ token: VALID_TOKEN, password: "NewPass1!", confirmPassword: "NewPass1!" })
    );
    expect(res.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns 400 for an expired token", async () => {
    mockFindUnique.mockResolvedValueOnce(
      validRecord({ expiresAt: new Date(Date.now() - 1) })
    );

    const res = await POST(
      makeRequest({ token: VALID_TOKEN, password: "NewPass1!", confirmPassword: "NewPass1!" })
    );
    expect(res.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns 400 for an unknown token", async () => {
    mockFindUnique.mockResolvedValueOnce(null);

    const res = await POST(
      makeRequest({ token: VALID_TOKEN, password: "NewPass1!", confirmPassword: "NewPass1!" })
    );
    expect(res.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns 400 for a weak password", async () => {
    const res = await POST(
      makeRequest({ token: VALID_TOKEN, password: "weak", confirmPassword: "weak" })
    );
    expect(res.status).toBe(400);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns 400 when passwords do not match", async () => {
    const res = await POST(
      makeRequest({ token: VALID_TOKEN, password: "NewPass1!", confirmPassword: "Different1!" })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing body", async () => {
    const req = new Request("http://localhost/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "bad{json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
