import { describe, it, expect, vi, beforeEach } from "vitest";

const mockProjectFindFirst = vi.fn();

vi.mock("@/lib/bi-auth", () => ({
  validateBiKey: vi.fn(),
  requireScope: vi.fn(),
  isProjectAllowed: vi.fn(),
  biResponseHeaders: vi.fn(() => ({ "Content-Type": "application/json" })),
}));

vi.mock("@/lib/db", () => ({
  db: {
    project: {
      findFirst: mockProjectFindFirst,
    },
  },
}));

vi.mock("@/lib/project-unifier-merge", () => ({
  enrichProjectById: vi.fn(),
}));

import { validateBiKey, requireScope, isProjectAllowed } from "@/lib/bi-auth";
import { enrichProjectById } from "@/lib/project-unifier-merge";

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("BI test project whitelist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireScope).mockReturnValue(true);
    vi.mocked(isProjectAllowed).mockReturnValue(true);
  });

  it("returns 404 for a test clone when the project ID is not whitelisted", async () => {
    vi.mocked(validateBiKey).mockResolvedValue({
      keyId: "key-1",
      scopes: ["bi:projects"],
      allowedProjectIds: [],
      party: "INTERNAL",
    });
    mockProjectFindFirst.mockResolvedValue(null);

    const { GET } = await import("@/app/api/bi/v1/projects/[id]/route");
    const res = await GET(new Request("http://localhost"), params("clone-test"));
    expect(res.status).toBe(404);
    expect(mockProjectFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "clone-test", deletedAt: null, isTestProject: false },
      })
    );
  });

  it("returns 200 for a whitelisted test clone", async () => {
    vi.mocked(validateBiKey).mockResolvedValue({
      keyId: "key-1",
      scopes: ["bi:projects"],
      allowedProjectIds: ["clone-test"],
      party: "INTERNAL",
    });
    mockProjectFindFirst.mockResolvedValue({
      id: "clone-test",
      createdAt: new Date(),
      updatedAt: new Date(),
      isTestProject: true,
    });
    vi.mocked(enrichProjectById).mockResolvedValue({
      id: "clone-test",
      projectName: "Sandbox (TEST)",
      isTestProject: true,
    } as never);

    const { GET } = await import("@/app/api/bi/v1/projects/[id]/route");
    const res = await GET(new Request("http://localhost"), params("clone-test"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.projectId).toBe("clone-test");
    expect(body.projectName).toBe("Sandbox (TEST)");
    expect(mockProjectFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "clone-test", deletedAt: null },
      })
    );
  });
});
