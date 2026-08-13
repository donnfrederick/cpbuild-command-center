import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/unifier/service", () => ({
  getProjectDocuments: vi.fn(),
}));

const MOCK_DOC = {
  id: "doc_1",
  projectId: "1234",
  title: "Submittal Package",
  fileName: "submittal.pdf",
  revisionNo: "Rev 2",
  issueDate: null,
  createDate: null,
  uploadDate: "2026-01-15T00:00:00Z",
  fileSize: 204800,
  createdBy: "John Doe",
  uploadBy: "John Doe",
  docTag: null,
};

describe("GET /api/unifier/projects/[pid]/documents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "false";
    process.env.NODE_ENV = "test";
  });

  async function callRoute(pid: string, queryString = "") {
    const { GET } = await import("@/app/api/unifier/projects/[pid]/documents/route");
    return GET(
      new Request(`http://localhost/api/unifier/projects/${pid}/documents${queryString}`),
      { params: Promise.resolve({ pid }) }
    );
  }

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce(null as never);

    const res = await callRoute("1234");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns documents array on success", async () => {
    const { auth } = await import("@/lib/auth");
    const { getProjectDocuments } = await import("@/lib/unifier/service");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1" } } as never);
    vi.mocked(getProjectDocuments).mockResolvedValueOnce([MOCK_DOC] as never);

    const res = await callRoute("1234");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.documents).toHaveLength(1);
    expect(body.documents[0].id).toBe("doc_1");
  });

  it("passes projectNumber query param to getProjectDocuments", async () => {
    const { auth } = await import("@/lib/auth");
    const { getProjectDocuments } = await import("@/lib/unifier/service");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1" } } as never);
    vi.mocked(getProjectDocuments).mockResolvedValueOnce([]);

    await callRoute("1234", "?projectNumber=24-00967");
    expect(vi.mocked(getProjectDocuments)).toHaveBeenCalledWith("1234", "24-00967");
  });

  it("passes null when projectNumber query param is absent", async () => {
    const { auth } = await import("@/lib/auth");
    const { getProjectDocuments } = await import("@/lib/unifier/service");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1" } } as never);
    vi.mocked(getProjectDocuments).mockResolvedValueOnce([]);

    await callRoute("1234");
    expect(vi.mocked(getProjectDocuments)).toHaveBeenCalledWith("1234", null);
  });

  it("returns 500 when getProjectDocuments throws", async () => {
    const { auth } = await import("@/lib/auth");
    const { getProjectDocuments } = await import("@/lib/unifier/service");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1" } } as never);
    vi.mocked(getProjectDocuments).mockRejectedValueOnce(new Error("Unifier API timeout"));

    const res = await callRoute("1234");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to fetch documents");
    expect(body.detail).toBe("Unifier API timeout");
  });

  it("returns empty documents array when project has no documents", async () => {
    const { auth } = await import("@/lib/auth");
    const { getProjectDocuments } = await import("@/lib/unifier/service");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1" } } as never);
    vi.mocked(getProjectDocuments).mockResolvedValueOnce([]);

    const res = await callRoute("1234");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.documents).toEqual([]);
  });

  it("bypasses auth in dev mode", async () => {
    process.env.DEV_BYPASS_AUTH = "true";
    process.env.NODE_ENV = "test";

    const { getProjectDocuments } = await import("@/lib/unifier/service");
    vi.mocked(getProjectDocuments).mockResolvedValueOnce([MOCK_DOC] as never);

    const res = await callRoute("1234");
    expect(res.status).toBe(200);
  });
});
