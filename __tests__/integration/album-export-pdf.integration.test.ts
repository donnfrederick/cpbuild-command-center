import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/dev-session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/production-project-access", () => ({
  enforceProjectReadVisibility: vi.fn(),
}));
vi.mock("@/lib/media/fetch-album-items-for-unit-ref", () => ({
  fetchAlbumItemsForUnitRef: vi.fn(),
}));
vi.mock("@/lib/project-unifier-merge", () => ({
  enrichProjectById: vi.fn(),
}));
vi.mock("@/lib/pdf/media-album-pdf", () => ({
  buildMediaAlbumPdf: vi.fn(),
}));

import { POST } from "@/app/api/projects/[id]/album/export-pdf/route";
import { getSession } from "@/lib/dev-session";
import { enforceProjectReadVisibility } from "@/lib/production-project-access";
import { fetchAlbumItemsForUnitRef } from "@/lib/media/fetch-album-items-for-unit-ref";
import { enrichProjectById } from "@/lib/project-unifier-merge";
import { buildMediaAlbumPdf } from "@/lib/pdf/media-album-pdf";
import { MEDIA_ALBUM_PDF_MAX_LOCATIONS } from "@/lib/pdf/media-album-export-limits";

const mockGetSession = vi.mocked(getSession);
const mockVis = vi.mocked(enforceProjectReadVisibility);
const mockFetchAlbum = vi.mocked(fetchAlbumItemsForUnitRef);
const mockEnrich = vi.mocked(enrichProjectById);
const mockBuildPdf = vi.mocked(buildMediaAlbumPdf);

const SESSION = {
  user: { id: "u1", email: "a@test.com", role: "MEMBER", name: "A", specialPermissions: [] as string[] },
};

function postExport(body: unknown, projectId = "proj-1") {
  return POST(
    new NextRequest(`http://localhost/api/projects/${projectId}/album/export-pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: "session=test" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: projectId }) },
  );
}

const baseLocation = {
  unitRef: "North|1|101",
  label: "101",
  kind: "unit" as const,
  buildingKey: "North",
  levelKey: "1",
  buildingLabel: "North",
  levelLabel: "1",
};

describe("POST /api/projects/[id]/album/export-pdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(SESSION as Awaited<ReturnType<typeof getSession>>);
    mockVis.mockResolvedValue(null);
    mockEnrich.mockResolvedValue({ projectName: "Demo Project" } as Awaited<ReturnType<typeof enrichProjectById>>);
    mockBuildPdf.mockResolvedValue(Buffer.from("%PDF"));
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const res = await postExport({ locations: [baseLocation], filters: {} });
    expect(res.status).toBe(401);
  });

  it("returns 400 when locations exceed the batch cap", async () => {
    const locations = Array.from({ length: MEDIA_ALBUM_PDF_MAX_LOCATIONS + 1 }, (_, i) => ({
      ...baseLocation,
      unitRef: `North|1|${i}`,
      label: String(i),
    }));
    const res = await postExport({ locations, filters: {} });
    expect(res.status).toBe(400);
    expect(mockFetchAlbum).not.toHaveBeenCalled();
  });

  it("returns 400 when no media matches filters", async () => {
    mockFetchAlbum.mockResolvedValueOnce([]);
    const res = await postExport({
      locations: [baseLocation],
      filters: { mediaSourceTypes: [], albumSourceTags: [] },
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { code?: string };
    expect(json.code).toBe("PDF_NO_MATCHING_MEDIA");
  });

  it("filters album items and returns a PDF", async () => {
    mockFetchAlbum.mockResolvedValueOnce([
      {
        id: "m1",
        storageUrl: "https://example.com/a.jpg",
        mimeType: "image/jpeg",
        fileSizeBytes: 1,
        caption: null,
        createdAt: "2026-06-01T00:00:00.000Z",
        source: { type: "general", label: null, entityId: null },
      },
      {
        id: "m2",
        storageUrl: "https://example.com/b.jpg",
        mimeType: "image/jpeg",
        fileSizeBytes: 1,
        caption: null,
        createdAt: "2026-06-01T00:00:00.000Z",
        source: { type: "issue", label: "Leak", entityId: "i1" },
      },
    ]);

    const res = await postExport({
      locations: [baseLocation],
      filters: { mediaSourceTypes: ["general"], albumSourceTags: [] },
      filterSummary: "General uploads",
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(mockBuildPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        projectName: "Demo Project",
        filterSummary: "General uploads",
        locations: [
          expect.objectContaining({
            location: baseLocation,
            items: [expect.objectContaining({ id: "m1" })],
          }),
        ],
      }),
    );
  });
});
