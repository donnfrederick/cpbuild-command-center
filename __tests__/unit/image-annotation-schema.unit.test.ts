import { describe, it, expect } from "vitest";
import {
  imageAnnotationV1Schema,
  imageAnnotationV2Schema,
  parseImageAnnotation,
  isImageAnnotationPayload,
  serializeImageAnnotationLayered,
  serializeImageAnnotationV1,
  deserializeImageAnnotationToEditorState,
  deserializeImageAnnotationV1ToEditorState,
} from "@/lib/image-annotation-schema";
import { applyEraserSamples } from "@/lib/image-annotation-eraser";

describe("imageAnnotationV1Schema", () => {
  it("parses minimal valid v1 payload", () => {
    const raw = {
      schemaVersion: 1,
      canvasRef: { width: 100, height: 80 },
      strokes: [
        {
          kind: "stroke",
          color: "#fff",
          widthNorm: 0.05,
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
        },
      ],
      textItems: [
        {
          id: "t1",
          text: "Hi",
          color: "#fff",
          xNorm: 0.5,
          yNorm: 0.5,
          fontSizeNorm: 0.06,
        },
      ],
    };
    const parsed = imageAnnotationV1Schema.safeParse(raw);
    expect(parsed.success).toBe(true);
  });
});

describe("imageAnnotationV2Schema", () => {
  it("parses v2 with shapeItems", () => {
    const raw = {
      schemaVersion: 2,
      canvasRef: { width: 100, height: 100 },
      strokes: [],
      textItems: [],
      shapeItems: [
        {
          id: "s1",
          kind: "rectangle",
          color: "#fff",
          strokeWidthNorm: 0.02,
          x1: 0.1,
          y1: 0.1,
          x2: 0.9,
          y2: 0.9,
        },
      ],
    };
    expect(imageAnnotationV2Schema.safeParse(raw).success).toBe(true);
  });
});

describe("parseImageAnnotation", () => {
  it("rejects when total stroke points exceed cap", () => {
    const pts = Array.from({ length: 9000 }, (_, i) => ({
      x: (i % 100) / 100,
      y: (i % 50) / 100,
    }));
    const raw = {
      schemaVersion: 1,
      canvasRef: { width: 100, height: 100 },
      strokes: [{ kind: "stroke" as const, color: "#fff", widthNorm: 0.02, points: pts }],
      textItems: [],
    };
    expect(parseImageAnnotation(raw)).toBeNull();
  });
});

describe("serializeImageAnnotationLayered round-trip", () => {
  it("preserves normalized geometry for strokes and text (v2)", () => {
    const canvasRect = {
      width: 200,
      height: 150,
      left: 100,
      top: 50,
      right: 300,
      bottom: 200,
      x: 100,
      y: 50,
      toJSON: () => "",
    } as DOMRectReadOnly;
    const containerRect = {
      width: 240,
      height: 180,
      left: 80,
      top: 40,
      right: 320,
      bottom: 220,
      x: 80,
      y: 40,
      toJSON: () => "",
    } as DOMRectReadOnly;

    const serialized = serializeImageAnnotationLayered({
      canvasWidth: 200,
      canvasHeight: 150,
      strokes: [
        {
          kind: "stroke",
          color: "#ff0000",
          width: 6,
          points: [
            { x: 0, y: 0 },
            { x: 200, y: 150 },
          ],
        },
      ],
      shapeItems: [],
      textItems: [
        { id: "x", text: "A", color: "#fff", xPct: 0.5, yPct: 0.5, fontSize: 20 },
      ],
      canvasRect,
      containerRect,
    });

    expect(serialized.schemaVersion).toBe(2);
    const parsed = parseImageAnnotation(serialized);
    expect(parsed).not.toBeNull();
    expect(parsed!.schemaVersion).toBe(2);
    expect(parsed!.strokes).toHaveLength(1);
    expect(parsed!.strokes[0].points[0]).toEqual({ x: 0, y: 0 });
    expect(parsed!.strokes[0].points[1]).toEqual({ x: 1, y: 1 });
  });
});

describe("serializeImageAnnotationV1 (deprecated)", () => {
  it("still produces v1 for legacy callers", () => {
    const canvasRect = {
      width: 200,
      height: 150,
      left: 0,
      top: 0,
      right: 200,
      bottom: 150,
      x: 0,
      y: 0,
      toJSON: () => "",
    } as DOMRectReadOnly;

    const v1 = serializeImageAnnotationV1({
      canvasWidth: 200,
      canvasHeight: 150,
      strokes: [],
      textItems: [],
      canvasRect,
      containerRect: canvasRect,
    });
    expect(v1.schemaVersion).toBe(1);
    expect(parseImageAnnotation(v1)).not.toBeNull();
  });
});

describe("isImageAnnotationPayload", () => {
  it("returns true for a valid v1 payload", () => {
    const raw = {
      schemaVersion: 1,
      canvasRef: { width: 100, height: 100 },
      strokes: [{ kind: "stroke", color: "#fff", widthNorm: 0.05, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }],
      textItems: [],
    };
    expect(isImageAnnotationPayload(raw)).toBe(true);
  });

  it("returns false for garbage input", () => {
    expect(isImageAnnotationPayload(null)).toBe(false);
    expect(isImageAnnotationPayload({ foo: "bar" })).toBe(false);
    expect(isImageAnnotationPayload("string")).toBe(false);
  });
});

describe("serializeImageAnnotationLayered with shapes", () => {
  const canvasRect = {
    width: 200, height: 150, left: 0, top: 0,
    right: 200, bottom: 150, x: 0, y: 0, toJSON: () => "",
  } as DOMRectReadOnly;

  it("serializes shape items (rectangle, ellipse, arrow) into v2", () => {
    const serialized = serializeImageAnnotationLayered({
      canvasWidth: 200,
      canvasHeight: 150,
      strokes: [],
      textItems: [],
      shapeItems: [
        { id: "r1", kind: "rectangle", color: "#f00", width: 4, x1: 20, y1: 30, x2: 100, y2: 90 },
        { id: "e1", kind: "ellipse",   color: "#0f0", width: 2, x1: 10, y1: 10, x2:  80, y2: 80 },
        { id: "a1", kind: "arrow",     color: "#00f", width: 3, x1:  0, y1:  0, x2: 200, y2: 150 },
      ],
      canvasRect,
      containerRect: canvasRect,
    });

    expect(serialized.schemaVersion).toBe(2);
    expect(serialized.shapeItems).toHaveLength(3);
    expect(serialized.shapeItems[0].kind).toBe("rectangle");
    expect(serialized.shapeItems[1].kind).toBe("ellipse");
    expect(serialized.shapeItems[2].kind).toBe("arrow");
    // Coordinates are normalized to [0,1]
    expect(serialized.shapeItems[0].x1).toBeCloseTo(20 / 200);
    expect(serialized.shapeItems[0].y1).toBeCloseTo(30 / 150);
    expect(parseImageAnnotation(serialized)).not.toBeNull();
  });
});

describe("deserializeImageAnnotationToEditorState", () => {
  const canvasRect = {
    width: 200, height: 150, left: 0, top: 0,
    right: 200, bottom: 150, x: 0, y: 0, toJSON: () => "",
  } as DOMRectReadOnly;

  it("round-trips a v2 annotation with strokes and shapes", () => {
    const v2 = serializeImageAnnotationLayered({
      canvasWidth: 200,
      canvasHeight: 150,
      strokes: [{ kind: "stroke", color: "#f00", width: 6, points: [{ x: 0, y: 0 }, { x: 200, y: 150 }] }],
      shapeItems: [{ id: "s1", kind: "rectangle", color: "#0f0", width: 4, x1: 20, y1: 30, x2: 100, y2: 90 }],
      textItems: [],
      canvasRect,
      containerRect: canvasRect,
    });

    const state = deserializeImageAnnotationToEditorState(v2, 200, 150, canvasRect, canvasRect);

    expect(state.strokes).toHaveLength(1);
    expect(state.shapeItems).toHaveLength(1);
    expect(state.textItems).toHaveLength(0);
    // Origin point should round-trip to canvas origin
    expect(state.strokes[0].points[0]).toMatchObject({ x: 0, y: 0 });
    expect(state.shapeItems[0].kind).toBe("rectangle");
  });

  it("returns empty shapeItems for a v1 payload (no shapes)", () => {
    const v1 = {
      schemaVersion: 1 as const,
      canvasRef: { width: 200, height: 150 },
      strokes: [],
      textItems: [],
    };
    const state = deserializeImageAnnotationToEditorState(v1, 200, 150, canvasRect, canvasRect);
    expect(state.shapeItems).toHaveLength(0);
  });
});

describe("deserializeImageAnnotationV1ToEditorState (deprecated)", () => {
  const canvasRect = {
    width: 200, height: 150, left: 0, top: 0,
    right: 200, bottom: 150, x: 0, y: 0, toJSON: () => "",
  } as DOMRectReadOnly;

  it("returns strokes and textItems without shapeItems", () => {
    const v1 = {
      schemaVersion: 1 as const,
      canvasRef: { width: 200, height: 150 },
      strokes: [{ kind: "stroke" as const, color: "#fff", widthNorm: 0.02, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }],
      textItems: [],
    };
    const state = deserializeImageAnnotationV1ToEditorState(v1, 200, 150, canvasRect, canvasRect);
    expect("shapeItems" in state).toBe(false);
    expect(state.strokes).toHaveLength(1);
  });
});

describe("applyEraserSamples", () => {
  it("removes a stroke when eraser passes through", () => {
    const strokes = [
      {
        kind: "stroke" as const,
        color: "#fff",
        width: 4,
        points: [
          { x: 0, y: 10 },
          { x: 100, y: 10 },
        ],
      },
    ];
    const out = applyEraserSamples({
      strokes,
      shapes: [],
      textItems: [],
      samples: [{ x: 50, y: 10 }],
      radiusPx: 30,
      containerW: 200,
      containerH: 200,
    });
    expect(out.strokes).toHaveLength(0);
  });

  it("keeps a stroke that the eraser does not touch", () => {
    const strokes = [
      { kind: "stroke" as const, color: "#fff", width: 2, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
    ];
    const out = applyEraserSamples({
      strokes,
      shapes: [],
      textItems: [],
      samples: [{ x: 100, y: 100 }],
      radiusPx: 5,
      containerW: 200,
      containerH: 200,
    });
    expect(out.strokes).toHaveLength(1);
  });

  it("removes a rectangle shape when eraser touches its edge", () => {
    const shapes = [
      { id: "r1", kind: "rectangle" as const, color: "#f00", width: 4, x1: 0, y1: 0, x2: 100, y2: 100 },
    ];
    const out = applyEraserSamples({
      strokes: [],
      shapes,
      textItems: [],
      samples: [{ x: 50, y: 0 }],
      radiusPx: 10,
      containerW: 200,
      containerH: 200,
    });
    expect(out.shapes).toHaveLength(0);
  });

  it("removes a text item when eraser covers it", () => {
    const textItems = [
      { id: "t1", text: "Hello", color: "#fff", xPct: 0.5, yPct: 0.5, fontSize: 20 },
    ];
    const out = applyEraserSamples({
      strokes: [],
      shapes: [],
      textItems,
      samples: [{ x: 100, y: 100 }],
      radiusPx: 60,
      containerW: 200,
      containerH: 200,
    });
    expect(out.textItems).toHaveLength(0);
  });

  it("returns unchanged state when samples is empty", () => {
    const strokes = [
      { kind: "stroke" as const, color: "#fff", width: 4, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
    ];
    const out = applyEraserSamples({
      strokes,
      shapes: [],
      textItems: [],
      samples: [],
      radiusPx: 50,
      containerW: 200,
      containerH: 200,
    });
    expect(out.strokes).toBe(strokes);
  });
});
