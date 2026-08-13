import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/offline/snapshot-cache", () => ({
  readSnapshotModule: vi.fn(),
}));

import { listPublishedForms } from "@/lib/forms/formsApi";
import { readSnapshotModule } from "@/lib/offline/snapshot-cache";

const API_FORM = {
  id: "form-1",
  name: "Clear Inspection",
  description: null,
  status: "PUBLISHED" as const,
  level: "scope",
  category: "CLEAR_INSPECTION",
  scopeTypeCodes: ["CAB"],
  draftSections: [{ id: "sec-1", title: "Section", questions: [] }],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  versions: [{ id: "ver-1", versionNumber: 1, publishedAt: "2026-01-01T00:00:00.000Z" }],
};

describe("listPublishedForms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns network forms when fetch succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ forms: [API_FORM] }),
        } as Response),
      ),
    );

    const result = await listPublishedForms();
    expect(result.isFromCache).toBe(false);
    expect(result.forms[0]?.id).toBe("form-1");
    expect(result.forms[0]?.template.name).toBe("Clear Inspection");
  });

  it("falls back to published-forms snapshot module when fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    vi.mocked(readSnapshotModule).mockResolvedValue({
      data: [API_FORM],
      generatedAt: "2026-06-12T12:00:00.000Z",
    });

    const result = await listPublishedForms();
    expect(readSnapshotModule).toHaveBeenCalledWith("published-forms");
    expect(result.isFromCache).toBe(true);
    expect(result.forms[0]?.template.name).toBe("Clear Inspection");
  });

  it("does not fall back to snapshot on 401/403", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 401,
        } as Response),
      ),
    );

    await expect(listPublishedForms()).rejects.toThrow("401");
    expect(readSnapshotModule).not.toHaveBeenCalled();
  });
});
