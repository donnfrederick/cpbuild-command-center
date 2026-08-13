/**
 * Unit tests for lib/image-utils.ts
 *
 * burnTimestamp runs in the browser (canvas API), so we mock the DOM surface
 * that it needs: Image, HTMLCanvasElement.getContext, and URL.createObjectURL.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  burnTimestamp,
  formatTimestamp,
  formatLocationLine,
  resolveClientMime,
  HEIC_LARGE_FILE_WARNING_BYTES,
  prepareLibraryImageForFieldUpload,
  convertHeicToJpegFile,
  isHeicOrHeifFile,
  isFieldMediaImageFile,
} from "@/lib/image-utils";

vi.mock("heic2any", () => ({
  default: vi.fn(async () => new Blob(["fake-jpeg"], { type: "image/jpeg" })),
}));

// ── DOM mocks ─────────────────────────────────────────────────────────────────

/** Track the last canvas dimensions set by burnTimestamp. */
let lastCanvasWidth = 0;
let lastCanvasHeight = 0;
/** Track all fillText calls so we can assert on watermark content. */
const fillTextCalls: string[] = [];
/** Track all fillRect calls so we can assert on background panel rendering. */
const fillRectCalls: Array<{ x: number; y: number; w: number; h: number; fill: string }> = [];
/** Track fill style changes so we can correlate them with fillRect/fillText calls. */
let currentFillStyle = "";
/** Track the order of drawing operations for sequencing assertions. */
const drawOps: Array<"fillRect" | "fillText"> = [];

function makeMockCanvas(outputBlob: Blob) {
  return {
    getContext: () => ({
      drawImage: vi.fn(),
      fillText: vi.fn((text: string) => {
        fillTextCalls.push(text);
        drawOps.push("fillText");
      }),
      fillRect: vi.fn((x: number, y: number, w: number, h: number) => {
        fillRectCalls.push({ x, y, w, h, fill: currentFillStyle });
        drawOps.push("fillRect");
      }),
      measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
      get font() { return ""; },
      set font(_v: string) { /* no-op */ },
      get textBaseline() { return ""; },
      set textBaseline(_v: string) { /* no-op */ },
      get shadowColor() { return ""; },
      set shadowColor(_v: string) { /* no-op */ },
      get shadowBlur() { return 0; },
      set shadowBlur(_v: number) { /* no-op */ },
      get shadowOffsetX() { return 0; },
      set shadowOffsetX(_v: number) { /* no-op */ },
      get shadowOffsetY() { return 0; },
      set shadowOffsetY(_v: number) { /* no-op */ },
      get fillStyle() { return currentFillStyle; },
      set fillStyle(v: string) { currentFillStyle = v; },
    }),
    toBlob: (cb: (b: Blob | null) => void) => cb(outputBlob),
    get width() { return lastCanvasWidth; },
    set width(v: number) { lastCanvasWidth = v; },
    get height() { return lastCanvasHeight; },
    set height(v: number) { lastCanvasHeight = v; },
  };
}

function setupImageMock(naturalWidth: number, naturalHeight: number, outputBlob: Blob) {
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:fake"),
    revokeObjectURL: vi.fn(),
  });

  vi.stubGlobal("document", {
    createElement: (tag: string) => {
      if (tag === "canvas") return makeMockCanvas(outputBlob);
      return {};
    },
  });

  // Simulate Image loading
  class FakeImage {
    naturalWidth = naturalWidth;
    naturalHeight = naturalHeight;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_: string) {
      // trigger onload synchronously in the next microtask
      Promise.resolve().then(() => this.onload?.());
    }
  }
  vi.stubGlobal("Image", FakeImage);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("HEIC_LARGE_FILE_WARNING_BYTES", () => {
  it("is 8 MB", () => {
    expect(HEIC_LARGE_FILE_WARNING_BYTES).toBe(8 * 1024 * 1024);
  });
});

describe("formatTimestamp()", () => {
  it("formats a date in English locale", () => {
    const d = new Date("2026-04-07T15:30:00");
    const result = formatTimestamp(d);
    expect(result).toMatch(/Apr/);
    expect(result).toMatch(/2026/);
  });
});

describe("resolveClientMime()", () => {
  it("returns the file's declared MIME type when present", () => {
    const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    expect(resolveClientMime(file)).toBe("image/jpeg");
  });

  it("falls back to extension for HEIC files with no MIME type", () => {
    const file = new File(["x"], "photo.heic", { type: "" });
    expect(resolveClientMime(file)).toBe("image/heic");
  });

  it("falls back to extension for HEIF files", () => {
    const file = new File(["x"], "photo.heif", { type: "" });
    expect(resolveClientMime(file)).toBe("image/heif");
  });

  it("returns application/octet-stream for unknown extensions", () => {
    const file = new File(["x"], "data.xyz", { type: "" });
    expect(resolveClientMime(file)).toBe("application/octet-stream");
  });
});

describe("burnTimestamp()", () => {
  const outputBlob = new Blob(["fake-jpeg"], { type: "image/jpeg" });

  beforeEach(() => {
    vi.unstubAllGlobals();
    fillTextCalls.length = 0;
    fillRectCalls.length = 0;
    drawOps.length = 0;
    currentFillStyle = "";
  });

  it("resolves with a Blob", async () => {
    setupImageMock(800, 600, outputBlob);
    const input = new Blob(["img"], { type: "image/jpeg" });
    const result = await burnTimestamp(input, new Date());
    expect(result).toBeInstanceOf(Blob);
  });

  it("does not scale up images already under maxPx", async () => {
    setupImageMock(800, 600, outputBlob);
    const input = new Blob(["img"], { type: "image/jpeg" });
    await burnTimestamp(input, new Date(), { maxPx: 2048 });
    // scale = min(1, 2048/800) = 1 → canvas stays at original size
    expect(lastCanvasWidth).toBe(800);
    expect(lastCanvasHeight).toBe(600);
  });

  it("scales down images whose longest side exceeds maxPx (landscape)", async () => {
    setupImageMock(4032, 3024, outputBlob);
    const input = new Blob(["img"], { type: "image/jpeg" });
    await burnTimestamp(input, new Date(), { maxPx: 2048 });
    // scale = 2048 / 4032 ≈ 0.508 → 2048 × 1535
    expect(lastCanvasWidth).toBe(Math.round(4032 * (2048 / 4032)));
    expect(lastCanvasHeight).toBe(Math.round(3024 * (2048 / 4032)));
    expect(lastCanvasWidth).toBeLessThanOrEqual(2048);
    expect(lastCanvasHeight).toBeLessThanOrEqual(2048);
  });

  it("scales down portrait images correctly", async () => {
    setupImageMock(3024, 4032, outputBlob);
    const input = new Blob(["img"], { type: "image/jpeg" });
    await burnTimestamp(input, new Date(), { maxPx: 2048 });
    // longest side is height 4032 → scale = 2048/4032
    expect(lastCanvasHeight).toBeLessThanOrEqual(2048);
    expect(lastCanvasWidth).toBeLessThanOrEqual(2048);
  });

  it("respects a custom maxPx option", async () => {
    setupImageMock(3000, 2000, outputBlob);
    const input = new Blob(["img"], { type: "image/jpeg" });
    await burnTimestamp(input, new Date(), { maxPx: 1500 });
    // scale = 1500/3000 = 0.5 → 1500 × 1000
    expect(lastCanvasWidth).toBe(1500);
    expect(lastCanvasHeight).toBe(1000);
  });

  it("prefixes timestamp with 'Uploaded' when uploaded=true", async () => {
    setupImageMock(800, 600, outputBlob);
    const input = new Blob(["img"], { type: "image/jpeg" });
    const date = new Date("2026-04-09T14:22:00");
    await burnTimestamp(input, date, { uploaded: true });
    expect(fillTextCalls.some((t) => t.startsWith("Uploaded "))).toBe(true);
  });

  it("does NOT prefix timestamp when uploaded is omitted (camera capture path)", async () => {
    setupImageMock(800, 600, outputBlob);
    const input = new Blob(["img"], { type: "image/jpeg" });
    const date = new Date("2026-04-09T14:22:00");
    await burnTimestamp(input, date);
    expect(fillTextCalls.some((t) => t.startsWith("Uploaded "))).toBe(false);
    expect(fillTextCalls.length).toBeGreaterThan(0);
  });

  it("draws a dark semi-transparent background panel before the timestamp text (ensures visibility on light backgrounds)", async () => {
    setupImageMock(800, 600, outputBlob);
    const input = new Blob(["img"], { type: "image/jpeg" });
    await burnTimestamp(input, new Date());

    // A fillRect should have been called with a dark/semi-transparent fill
    const darkRects = fillRectCalls.filter((r) => r.fill.startsWith("rgba(0,0,0"));
    expect(darkRects.length).toBeGreaterThan(0);
  });

  it("draws the dark background before the timestamp text (panel is behind text)", async () => {
    setupImageMock(800, 600, outputBlob);
    const input = new Blob(["img"], { type: "image/jpeg" });
    await burnTimestamp(input, new Date());

    const firstFillRect = drawOps.indexOf("fillRect");
    const firstFillText = drawOps.indexOf("fillText");
    // Background panel must be drawn before the first text element
    expect(firstFillRect).toBeGreaterThanOrEqual(0);
    expect(firstFillRect).toBeLessThan(firstFillText);
  });

  it("draws the background panel spanning the full canvas width", async () => {
    setupImageMock(800, 600, outputBlob);
    const input = new Blob(["img"], { type: "image/jpeg" });
    await burnTimestamp(input, new Date());

    const darkRects = fillRectCalls.filter((r) => r.fill.startsWith("rgba(0,0,0"));
    // The background strip should span the canvas width (800px)
    expect(darkRects.some((r) => r.w === 800)).toBe(true);
  });

  it("renders the location line when location is provided (requires measureText)", async () => {
    setupImageMock(800, 600, outputBlob);
    const input = new Blob(["img"], { type: "image/jpeg" });
    await burnTimestamp(input, new Date(), {
      location: { building: "A", level: "3", unit: "301" },
    });
    // Location segments produce icon-text pairs; text for each segment is drawn
    expect(fillTextCalls.some((t) => t.includes("Level 3"))).toBe(true);
    expect(fillTextCalls.some((t) => t.includes("Unit 301"))).toBe(true);
  });

  it("renders the status update line when scopeName and statusLabel are provided", async () => {
    setupImageMock(800, 600, outputBlob);
    const input = new Blob(["img"], { type: "image/jpeg" });
    await burnTimestamp(input, new Date(), {
      scopeName: "Framing",
      statusLabel: "In Progress",
    });
    const statusCall = fillTextCalls.find((t) => t.includes("Status Update"));
    expect(statusCall).toBeDefined();
    expect(statusCall).toContain("Framing");
    expect(statusCall).toContain("In Progress");
  });

  it("renders all three watermark lines when location and burnOptions are both provided", async () => {
    setupImageMock(800, 600, outputBlob);
    const input = new Blob(["img"], { type: "image/jpeg" });
    const date = new Date("2026-06-23T12:00:00");
    await burnTimestamp(input, date, {
      location: { building: "B", level: "2", unit: "202" },
      scopeName: "Framing",
      statusLabel: "Complete",
    });
    // Timestamp line
    expect(fillTextCalls.some((t) => t.includes("2026"))).toBe(true);
    // Location line
    expect(fillTextCalls.some((t) => t.includes("Level 2") || t.includes("Unit 202"))).toBe(true);
    // Status line
    expect(fillTextCalls.some((t) => t.includes("Status Update"))).toBe(true);
    // Dark background panel
    expect(fillRectCalls.some((r) => r.fill.startsWith("rgba(0,0,0"))).toBe(true);
  });

  it("rejects when canvas context is unavailable", async () => {
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:fake"), revokeObjectURL: vi.fn() });
    vi.stubGlobal("document", {
      createElement: () => ({ getContext: () => null, toBlob: vi.fn(), width: 0, height: 0 }),
    });
    class FakeImage {
      naturalWidth = 100; naturalHeight = 100;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_: string) { Promise.resolve().then(() => this.onload?.()); }
    }
    vi.stubGlobal("Image", FakeImage);

    const input = new Blob(["img"], { type: "image/jpeg" });
    await expect(burnTimestamp(input, new Date())).rejects.toThrow("Could not get canvas 2D context");
  });
});

// ── formatLocationLine ────────────────────────────────────────────────────────

describe("formatLocationLine()", () => {
  it("returns null when all fields are empty", () => {
    expect(formatLocationLine({ building: "", level: "", unit: "", area: "" })).toBeNull();
  });

  it("returns null when all fields are undefined", () => {
    expect(formatLocationLine({})).toBeNull();
  });

  it("omits fields that are '0' placeholder", () => {
    // level "0" and unit stay, building "A" has no prefix — only level and unit get labels
    expect(formatLocationLine({ building: "A", level: "0", unit: "101" })).toBe("A · Unit 101");
  });

  it("omits fields with only whitespace", () => {
    expect(formatLocationLine({ building: "  ", level: "1", unit: "102" })).toBe("Level 1 · Unit 102");
  });

  it("joins all non-empty fields in order: building · Level · Unit", () => {
    expect(formatLocationLine({ building: "Bldg A", level: "2", unit: "201" })).toBe("Bldg A · Level 2 · Unit 201");
  });

  it("includes area (labeled) between building and level", () => {
    expect(formatLocationLine({ building: "B", area: "Lobby", level: "1", unit: "C01" })).toBe("B · Area Lobby · Level 1 · Unit C01");
  });

  it("returns only the non-empty field when just building is set", () => {
    expect(formatLocationLine({ building: "North Wing" })).toBe("North Wing");
  });

  it("returns null when only '0' placeholders are provided", () => {
    expect(formatLocationLine({ building: "0", level: "0", unit: "0" })).toBeNull();
  });

  it("labels level and unit but not building (typical field data)", () => {
    expect(formatLocationLine({ building: "B", level: "1", unit: "109" })).toBe("B · Level 1 · Unit 109");
  });
});

describe("isHeicOrHeifFile()", () => {
  it("detects HEIC by extension when MIME is octet-stream", () => {
    const f = new File(["x"], "photo.heic", { type: "application/octet-stream" });
    expect(isHeicOrHeifFile(f)).toBe(true);
    expect(isFieldMediaImageFile(f)).toBe(true);
  });
});

describe("convertHeicToJpegFile()", () => {
  it("returns a JPEG File with .jpg extension", async () => {
    const heic = new File(["heic-bytes"], "IMG_001.heic", { type: "image/heic" });
    const out = await convertHeicToJpegFile(heic);
    expect(out.type).toBe("image/jpeg");
    expect(out.name).toBe("IMG_001.jpg");
  });
});

describe("prepareLibraryImageForFieldUpload()", () => {
  const outputBlob = new Blob(["fake-jpeg"], { type: "image/jpeg" });

  beforeEach(() => {
    vi.unstubAllGlobals();
    fillTextCalls.length = 0;
    setupImageMock(800, 600, outputBlob);
  });

  it("converts HEIC to JPEG and applies burnTimestamp", async () => {
    const heic = new File(["heic-bytes"], "library.heic", { type: "image/heic" });
    const { file, mimeType } = await prepareLibraryImageForFieldUpload(heic, { uploaded: true });
    expect(mimeType).toBe("image/jpeg");
    expect(file.name).toBe("library.jpg");
    expect(fillTextCalls.some((t) => t.startsWith("Uploaded "))).toBe(true);
  });

  it("converts HEIC with octet-stream MIME to JPEG", async () => {
    const heic = new File(["heic-bytes"], "library.heic", { type: "application/octet-stream" });
    const { file, mimeType } = await prepareLibraryImageForFieldUpload(heic, { uploaded: true });
    expect(mimeType).toBe("image/jpeg");
    expect(file.name).toBe("library.jpg");
  });

  it("passes through JPEG without HEIC conversion", async () => {
    const jpeg = new File(["jpeg-bytes"], "photo.jpg", { type: "image/jpeg" });
    const { mimeType } = await prepareLibraryImageForFieldUpload(jpeg, { uploaded: true });
    expect(mimeType).toBe("image/jpeg");
  });

  it("marks wasCompressed for large JPEG inputs", async () => {
    const largeBytes = new Uint8Array(6 * 1024 * 1024);
    const jpeg = new File([largeBytes], "large.jpg", { type: "image/jpeg" });
    const { wasCompressed, mimeType } = await prepareLibraryImageForFieldUpload(jpeg, {
      uploaded: true,
    });
    expect(mimeType).toBe("image/jpeg");
    expect(wasCompressed).toBe(true);
  });

  it("throws when a non-HEIC image cannot be decoded (does not call heic2any)", async () => {
    class FailImage {
      naturalWidth = 0;
      naturalHeight = 0;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_: string) {
        Promise.resolve().then(() => this.onerror?.());
      }
    }
    vi.stubGlobal("Image", FailImage);

    const corrupt = new File(["bad-jpeg"], "photo.jpg", { type: "image/jpeg" });
    await expect(prepareLibraryImageForFieldUpload(corrupt, { uploaded: true })).rejects.toThrow(
      "FIELD_IMAGE_DECODE_FAILED",
    );
  });
});
