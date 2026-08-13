import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/pdf/puppeteer-launch", () => ({
  launchPdfPuppeteerBrowser: vi.fn(),
}));
vi.mock("@/lib/pdf/fetch-image-for-pdf", () => ({
  prefetchPdfImageCache: vi.fn(async () => new Map()),
}));

import { buildMediaAlbumPdf } from "@/lib/pdf/media-album-pdf";
import { launchPdfPuppeteerBrowser } from "@/lib/pdf/puppeteer-launch";
import type { AlbumItem } from "@/lib/media/album-types";

const SOURCE_LABELS = {
  observation: "Observation",
  observation_comment: "Obs. comment",
  issue: "Issue",
  issue_comment: "Issue comment",
  inspection: "Inspection",
  general: "General",
  status_update: "Status update",
} as const;

function sampleItem(id: string): AlbumItem {
  return {
    id,
    storageUrl: `https://example.com/${id}.jpg`,
    mimeType: "image/jpeg",
    fileSizeBytes: 100,
    caption: `Caption ${id}`,
    createdAt: "2026-06-01T12:00:00.000Z",
    source: { type: "general", label: null, entityId: null },
  };
}

describe("buildMediaAlbumPdf()", () => {
  it("builds a PDF buffer grouped by building and level", async () => {
    let capturedHtml = "";
    const setContent = vi.fn(async (html: string) => {
      capturedHtml = html;
    });

    vi.mocked(launchPdfPuppeteerBrowser).mockResolvedValueOnce({
      newPage: vi.fn(async () => ({
        setDefaultTimeout: vi.fn(),
        setContent,
        pdf: vi.fn(async () => Buffer.from("%PDF-mock")),
      })),
      close: vi.fn(async () => undefined),
    } as never);

    const buffer = await buildMediaAlbumPdf({
      projectName: "Demo Tower",
      filterSummary: "All media",
      exportedAt: new Date("2026-06-15T10:00:00.000Z"),
      sourceLabels: SOURCE_LABELS,
      locations: [
        {
          location: {
            unitRef: "North|1|101",
            label: "101",
            kind: "unit",
            buildingKey: "North",
            levelKey: "1",
            buildingLabel: "North Tower",
            levelLabel: "Level 1",
            area: "Pool Deck",
            buildPhase: "2",
            detailLine: "North Tower · Level 1 · Area: Pool Deck · Phase: 2",
          },
          items: [sampleItem("a1"), sampleItem("a2")],
        },
        {
          location: {
            unitRef: "North|2|201",
            label: "201",
            kind: "unit",
            buildingKey: "North",
            levelKey: "2",
            buildingLabel: "North Tower",
            levelLabel: "Level 2",
          },
          items: [sampleItem("b1")],
        },
      ],
    });

    expect(buffer.toString("utf8")).toContain("%PDF");
    expect(capturedHtml).toContain("North Tower");
    expect(capturedHtml).toContain("Level 1");
    expect(capturedHtml).toContain("101");
    expect(capturedHtml).toContain("Area: Pool Deck");
    expect(capturedHtml).toContain("Phase: 2");
    expect(capturedHtml).toContain("201");
    expect(capturedHtml).toContain("3 photos");
  });
});
