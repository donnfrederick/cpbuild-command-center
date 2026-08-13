import { describe, it, expect } from "vitest";
import { computeMediaAlbumExportPercent } from "@/lib/media/media-album-export-progress";

describe("computeMediaAlbumExportPercent()", () => {
  it("maps gathering progress to 0–65%", () => {
    expect(
      computeMediaAlbumExportPercent({
        phase: "gathering",
        locationsCompleted: 0,
        locationsTotal: 10,
      }),
    ).toBe(0);
    expect(
      computeMediaAlbumExportPercent({
        phase: "gathering",
        locationsCompleted: 5,
        locationsTotal: 10,
      }),
    ).toBe(33);
    expect(
      computeMediaAlbumExportPercent({
        phase: "gathering",
        locationsCompleted: 10,
        locationsTotal: 10,
      }),
    ).toBe(65);
  });

  it("maps image prefetch progress to 65–90%", () => {
    expect(
      computeMediaAlbumExportPercent({
        phase: "rendering",
        locationsCompleted: 4,
        locationsTotal: 4,
        renderSubphase: "images",
        imagesLoaded: 0,
        imagesTotal: 20,
      }),
    ).toBe(65);
    expect(
      computeMediaAlbumExportPercent({
        phase: "rendering",
        locationsCompleted: 4,
        locationsTotal: 4,
        renderSubphase: "images",
        imagesLoaded: 10,
        imagesTotal: 20,
      }),
    ).toBe(78);
  });

  it("maps PDF generation subphase to 95%", () => {
    expect(
      computeMediaAlbumExportPercent({
        phase: "rendering",
        locationsCompleted: 4,
        locationsTotal: 4,
        renderSubphase: "pdf",
      }),
    ).toBe(95);
  });
});
