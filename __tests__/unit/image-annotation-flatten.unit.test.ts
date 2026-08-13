/**
 * Unit tests: flattenAnnotationToBlob
 *
 * The function is browser-only (uses HTMLCanvasElement + HTMLImageElement).
 * We stub both so the test can run in the Node/jsdom environment Vitest uses.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { ImageAnnotationPayload } from "@/lib/image-annotation-schema";

// ── DOM stubs ─────────────────────────────────────────────────────────────────
// Must be applied before any module that uses these globals is imported.

// Capture descriptors before we install stubs so afterAll can restore them.
// Properties added with Object.defineProperty are NOT removed by vi.unstubAllGlobals()
// or vi.restoreAllMocks(), so we must do it ourselves.
const urlCreateObjectUrlDesc = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
const urlRevokeObjectUrlDesc = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");

beforeAll(() => {
  // URL.createObjectURL / revokeObjectURL — jsdom doesn't implement these.
  // Always use defineProperty (with configurable: true so afterAll can restore)
  // rather than branching on vi.spyOn, which produces a different teardown path.
  Object.defineProperty(URL, "createObjectURL", {
    value: vi.fn(() => "blob:test-url"),
    writable: true,
    configurable: true,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    value: vi.fn(() => undefined),
    writable: true,
    configurable: true,
  });

  // HTMLImageElement: set src → fire onload synchronously with known dimensions
  vi.stubGlobal("Image", class {
    naturalWidth = 100;
    naturalHeight = 80;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_: string) {
      // Call onload on the next microtask so the promise can settle normally
      Promise.resolve().then(() => { this.onload?.(); }).catch(() => undefined);
    }
  });

  // HTMLCanvasElement: return a real-enough 2d context stub and produce a tiny blob in toBlob
  const mockCtx = {
    drawImage: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    ellipse: vi.fn(),
    fillText: vi.fn(),
    set strokeStyle(_: string) { /* noop */ },
    get strokeStyle() { return "#000"; },
    set lineWidth(_: number) { /* noop */ },
    get lineWidth() { return 1; },
    set lineCap(_: string) { /* noop */ },
    get lineCap() { return "round"; },
    set lineJoin(_: string) { /* noop */ },
    get lineJoin() { return "round"; },
    set fillStyle(_: string) { /* noop */ },
    get fillStyle() { return "#000"; },
    set font(_: string) { /* noop */ },
    get font() { return "10px sans-serif"; },
    set textAlign(_: string) { /* noop */ },
    get textAlign() { return "start"; },
    set textBaseline(_: string) { /* noop */ },
    get textBaseline() { return "alphabetic"; },
    set shadowColor(_: string) { /* noop */ },
    get shadowColor() { return "transparent"; },
    set shadowBlur(_: number) { /* noop */ },
    get shadowBlur() { return 0; },
  };

  class MockCanvas {
    width = 0;
    height = 0;
    getContext(_id: string) { return mockCtx; }
    toBlob(cb: (b: Blob | null) => void, _type?: string, _quality?: number) {
      cb(new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" }));
    }
  }

  vi.stubGlobal("HTMLCanvasElement", MockCanvas);

  // Patch `document.createElement` so that `document.createElement("canvas")` returns
  // our MockCanvas instance (the flattenAnnotationToBlob function calls this).
  const originalCreateElement = globalThis.document?.createElement?.bind(globalThis.document);
  if (originalCreateElement) {
    vi.spyOn(globalThis.document, "createElement").mockImplementation((tag: string, ...args) => {
      if (tag === "canvas") return new MockCanvas() as unknown as HTMLCanvasElement;
      return originalCreateElement(tag, ...args);
    });
  }
});

afterAll(() => {
  // Restore URL.createObjectURL / revokeObjectURL to whatever they were before
  // this file ran. vi.unstubAllGlobals() / vi.restoreAllMocks() don't touch
  // properties installed via Object.defineProperty, so we must do it ourselves.
  if (urlCreateObjectUrlDesc) {
    Object.defineProperty(URL, "createObjectURL", urlCreateObjectUrlDesc);
  } else {
    delete (URL as unknown as Record<string, unknown>).createObjectURL;
  }
  if (urlRevokeObjectUrlDesc) {
    Object.defineProperty(URL, "revokeObjectURL", urlRevokeObjectUrlDesc);
  } else {
    delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
  }

  // Restore everything else (Image, HTMLCanvasElement, document.createElement spy).
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── Minimal valid annotation payloads ─────────────────────────────────────────

const minimalV2Annotation: ImageAnnotationPayload = {
  schemaVersion: 2,
  canvasRef: { width: 100, height: 80 },
  strokes: [
    {
      kind: "stroke",
      color: "#ff0000",
      widthNorm: 0.01,
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.9, y: 0.9 },
      ],
    },
  ],
  textItems: [
    {
      id: "t1",
      text: "Test label",
      color: "#ffffff",
      xNorm: 0.5,
      yNorm: 0.5,
      fontSizeNorm: 0.05,
    },
  ],
  shapeItems: [
    {
      id: "s1",
      kind: "rectangle",
      color: "#00ff00",
      strokeWidthNorm: 0.01,
      x1: 0.1, y1: 0.1, x2: 0.8, y2: 0.7,
    },
    {
      id: "s2",
      kind: "ellipse",
      color: "#0000ff",
      strokeWidthNorm: 0.01,
      x1: 0.2, y1: 0.2, x2: 0.6, y2: 0.6,
    },
    {
      id: "s3",
      kind: "arrow",
      color: "#ffff00",
      strokeWidthNorm: 0.01,
      x1: 0.1, y1: 0.5, x2: 0.9, y2: 0.5,
    },
  ],
};

const minimalV1Annotation: ImageAnnotationPayload = {
  schemaVersion: 1,
  canvasRef: { width: 100, height: 80 },
  strokes: [
    {
      kind: "stroke",
      color: "#00ff00",
      widthNorm: 0.02,
      points: [
        { x: 0.0, y: 0.0 },
        { x: 0.5, y: 0.5 },
      ],
    },
  ],
  textItems: [],
};

const baseBlob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: "image/jpeg" });

describe("flattenAnnotationToBlob", () => {
  it("produces a non-empty Blob for a v2 annotation with strokes, shapes, and text", async () => {
    const { flattenAnnotationToBlob } = await import("@/lib/image-annotation-flatten");
    const result = await flattenAnnotationToBlob(baseBlob, minimalV2Annotation);
    expect(result).toBeInstanceOf(Blob);
    expect(result.size).toBeGreaterThan(0);
  });

  it("produces a non-empty Blob for a v1 annotation (strokes only)", async () => {
    const { flattenAnnotationToBlob } = await import("@/lib/image-annotation-flatten");
    const result = await flattenAnnotationToBlob(baseBlob, minimalV1Annotation);
    expect(result).toBeInstanceOf(Blob);
    expect(result.size).toBeGreaterThan(0);
  });

  it("returns a Blob with MIME type image/jpeg", async () => {
    const { flattenAnnotationToBlob } = await import("@/lib/image-annotation-flatten");
    const result = await flattenAnnotationToBlob(baseBlob, minimalV2Annotation);
    expect(result.type).toBe("image/jpeg");
  });

  it("respects the quality parameter without throwing", async () => {
    const { flattenAnnotationToBlob } = await import("@/lib/image-annotation-flatten");
    const r1 = await flattenAnnotationToBlob(baseBlob, minimalV2Annotation, 0.9);
    const r2 = await flattenAnnotationToBlob(baseBlob, minimalV2Annotation, 0.1);
    expect(r1).toBeInstanceOf(Blob);
    expect(r2).toBeInstanceOf(Blob);
  });

  it("handles annotation with no strokes, no text, no shapes", async () => {
    const { flattenAnnotationToBlob } = await import("@/lib/image-annotation-flatten");
    const emptyAnnotation: ImageAnnotationPayload = {
      schemaVersion: 2,
      canvasRef: { width: 100, height: 80 },
      strokes: [],
      textItems: [],
      shapeItems: [],
    };
    const result = await flattenAnnotationToBlob(baseBlob, emptyAnnotation);
    expect(result).toBeInstanceOf(Blob);
    expect(result.size).toBeGreaterThan(0);
  });
});
