import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/auth/change-password/route";

const mockAuth = vi.fn();
const mockUserFindUnique = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args), update: vi.fn() },
    passwordResetToken: { deleteMany: vi.fn() },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

const mockBcryptCompare = vi.fn();
vi.mock("bcryptjs", () => ({
  default: {
    compare: (...args: unknown[]) => mockBcryptCompare(...args),
    hash: vi.fn().mockResolvedValue("new-hash"),
  },
}));

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  currentPassword: "OldPass1!",
  newPassword: "NewPass1!",
  confirmPassword: "NewPass1!",
};

describe("POST /api/auth/change-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockResolvedValue([]);
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it("returns 200 and changes the password with correct current password", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockUserFindUnique.mockResolvedValueOnce({ id: "user-1", passwordHash: "old-hash" });
    mockBcryptCompare.mockResolvedValueOnce(true);

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    expect(mockTransaction).toHaveBeenCalledOnce();
  });

  it("returns 400 when current password is incorrect", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockUserFindUnique.mockResolvedValueOnce({ id: "user-1", passwordHash: "old-hash" });
    mockBcryptCompare.mockResolvedValueOnce(false);

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect((body as { error: string }).error).toBe("Current password is incorrect");
  });

  it("returns 400 when new password matches current password", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: "user-1" } });
    const res = await POST(
      makeRequest({
        currentPassword: "SamePass1!",
        newPassword: "SamePass1!",
        confirmPassword: "SamePass1!",
      })
    );
    // Zod refine catches this before DB calls
    expect(res.status).toBe(400);
  });

  it("returns 400 when passwords do not match", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: "user-1" } });
    const res = await POST(
      makeRequest({ ...VALID_BODY, confirmPassword: "Different1!" })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for a weak new password", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: "user-1" } });
    const res = await POST(
      makeRequest({ currentPassword: "OldPass1!", newPassword: "weak", confirmPassword: "weak" })
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 when user has no password hash (OAuth account)", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockUserFindUnique.mockResolvedValueOnce({ id: "user-1", passwordHash: null });

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it("returns 400 for an invalid request body (when authenticated)", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: "user-1" } });
    const req = new Request("http://localhost/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "bad{json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
