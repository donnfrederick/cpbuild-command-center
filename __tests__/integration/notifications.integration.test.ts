import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNotifFindMany = vi.fn();
const mockNotifFindUnique = vi.fn();
const mockNotifUpdate = vi.fn();
const mockNotifUpdateMany = vi.fn();
const mockUserFindUnique = vi.fn();
const mockUserFindFirst = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      findFirst: (...args: unknown[]) => mockUserFindFirst(...args),
    },
    notification: {
      findMany: (...args: unknown[]) => mockNotifFindMany(...args),
      findUnique: (...args: unknown[]) => mockNotifFindUnique(...args),
      update: (...args: unknown[]) => mockNotifUpdate(...args),
      updateMany: (...args: unknown[]) => mockNotifUpdateMany(...args),
    },
  },
}));

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

// ── Import handlers after mocks ────────────────────────────────────────────────

const { GET } = await import("@/app/api/notifications/route");
const { PATCH } = await import("@/app/api/notifications/[id]/route");
const { POST: markAllReadPOST } = await import("@/app/api/notifications/mark-all-read/route");

// ── Helpers ───────────────────────────────────────────────────────────────────

function userSession(id = "user-1") {
  return { user: { id, email: "user@test.com", name: "Test User", role: "MEMBER" } };
}

const SAMPLE_NOTIFICATION = {
  id: "notif-1",
  userId: "user-1",
  feedbackId: "fb-1",
  type: "FEEDBACK_RESOLVED",
  read: false,
  createdAt: new Date(),
  feedback: {
    id: "fb-1",
    type: "BUG",
    title: "Upload broken",
    status: "RESOLVED",
    tour: null,
  },
};

describe("GET /api/notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserFindUnique.mockImplementation(
      (args: { where: { id?: string; email?: string } }) => {
        if (args.where.id) return Promise.resolve({ id: args.where.id });
        if (args.where.email) return Promise.resolve({ id: "email-user" });
        return Promise.resolve(null);
      }
    );
    mockUserFindFirst.mockResolvedValue({ id: "first-user" });
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns the user's notifications", async () => {
    mockAuth.mockResolvedValue(userSession());
    mockNotifFindMany.mockResolvedValue([SAMPLE_NOTIFICATION]);

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe("notif-1");
  });

  it("queries only the current user's notifications", async () => {
    mockAuth.mockResolvedValue(userSession("user-42"));
    mockNotifFindMany.mockResolvedValue([]);
    await GET();
    const call = mockNotifFindMany.mock.calls[0][0];
    expect(call.where.userId).toBe("user-42");
  });

  it("maps dev-user session to findFirst id for notification query (local bypass parity)", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "dev-user", email: "dev@cpbuild.com", name: "Dev User", role: "ADMIN" },
    });
    mockUserFindUnique.mockImplementation(
      (args: { where: { id?: string; email?: string } }) => {
        if (args.where.id && args.where.id !== "dev-user") return Promise.resolve({ id: args.where.id });
        if (args.where.email === "dev@cpbuild.com") return Promise.resolve(null);
        return Promise.resolve(null);
      }
    );
    mockUserFindFirst.mockResolvedValue({ id: "seed-admin-id" });
    mockNotifFindMany.mockResolvedValue([]);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(mockNotifFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "seed-admin-id" } })
    );
  });
});

describe("PATCH /api/notifications/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserFindUnique.mockImplementation(
      (args: { where: { id?: string; email?: string } }) => {
        if (args.where.id) return Promise.resolve({ id: args.where.id });
        if (args.where.email) return Promise.resolve({ id: "email-user" });
        return Promise.resolve(null);
      }
    );
    mockUserFindFirst.mockResolvedValue({ id: "first-user" });
  });

  async function callPatch(id: string) {
    return PATCH(new Request(`http://localhost/api/notifications/${id}`, { method: "PATCH" }), {
      params: Promise.resolve({ id }),
    });
  }

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await callPatch("notif-1");
    expect(res.status).toBe(401);
  });

  it("returns 404 when notification does not exist", async () => {
    mockAuth.mockResolvedValue(userSession());
    mockNotifFindUnique.mockResolvedValue(null);
    const res = await callPatch("notif-x");
    expect(res.status).toBe(404);
  });

  it("returns 403 when notification belongs to a different user", async () => {
    mockAuth.mockResolvedValue(userSession("user-99"));
    mockNotifFindUnique.mockResolvedValue({ ...SAMPLE_NOTIFICATION, userId: "user-1" });
    const res = await callPatch("notif-1");
    expect(res.status).toBe(403);
  });

  it("marks the notification as read for the owner", async () => {
    mockAuth.mockResolvedValue(userSession("user-1"));
    mockNotifFindUnique.mockResolvedValue(SAMPLE_NOTIFICATION);
    mockNotifUpdate.mockResolvedValue({ ...SAMPLE_NOTIFICATION, read: true });

    const res = await callPatch("notif-1");
    expect(res.status).toBe(200);
    expect(mockNotifUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { read: true } })
    );
  });
});

describe("POST /api/notifications/mark-all-read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserFindUnique.mockImplementation(
      (args: { where: { id?: string; email?: string } }) => {
        if (args.where.id) return Promise.resolve({ id: args.where.id });
        if (args.where.email) return Promise.resolve({ id: "email-user" });
        return Promise.resolve(null);
      }
    );
    mockUserFindFirst.mockResolvedValue({ id: "first-user" });
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await markAllReadPOST();
    expect(res.status).toBe(401);
  });

  it("marks all unread notifications as read for the current user", async () => {
    mockAuth.mockResolvedValue(userSession("user-1"));
    mockNotifUpdateMany.mockResolvedValue({ count: 3 });

    const res = await markAllReadPOST();
    expect(res.status).toBe(204);
    expect(mockNotifUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", read: false },
        data: { read: true },
      })
    );
  });
});
