/**
 * Flatten a layered ImageAnnotationPayload onto a base image blob, producing a
 * composite JPEG.
 *
 * The annotation schema stores all coordinates as 0–1 normalized fractions so
 * this function needs no DOM measurements — it simply multiplies each normalized
 * value by the target canvas dimensions.
 *
 * Run in the browser only (uses HTMLImageElement and HTMLCanvasElement).
 */

import type { ImageAnnotationPayload } from "@/lib/image-annotation-schema";

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Failed to load image")); };
    img.src = url;
  });
}

function paintArrowhead(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number, x2: number, y2: number,
  headLen: number,
) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const a1 = angle + Math.PI * 0.82;
  const a2 = angle - Math.PI * 0.82;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 + Math.cos(a1) * headLen, y2 + Math.sin(a1) * headLen);
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 + Math.cos(a2) * headLen, y2 + Math.sin(a2) * headLen);
  ctx.stroke();
}

/**
 * Render `annotation` over `baseBlob` and return a JPEG blob.
 *
 * @param baseBlob   The original unannotated image blob.
 * @param annotation A validated ImageAnnotationPayload (v1 or v2).
 * @param quality    JPEG quality, 0–1. Default 0.6 matches the camera capture quality.
 */
export async function flattenAnnotationToBlob(
  baseBlob: Blob,
  annotation: ImageAnnotationPayload,
  quality = 0.6,
): Promise<Blob> {
  const img = await loadImage(baseBlob);

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const W = canvas.width;
  const H = canvas.height;
  const minDim = Math.min(W, H);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2D canvas context");

  // Draw base image
  ctx.drawImage(img, 0, 0, W, H);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // ── Strokes ────────────────────────────────────────────────────────────────
  for (const s of annotation.strokes) {
    if (s.points.length < 2) continue;
    ctx.beginPath();
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.widthNorm * minDim;
    ctx.moveTo(s.points[0].x * W, s.points[0].y * H);
    for (let i = 1; i < s.points.length; i++) {
      ctx.lineTo(s.points[i].x * W, s.points[i].y * H);
    }
    ctx.stroke();
  }

  // ── Shapes (v2 only) ──────────────────────────────────────────────────────
  if (annotation.schemaVersion === 2) {
    for (const sh of annotation.shapeItems) {
      ctx.strokeStyle = sh.color;
      ctx.lineWidth = sh.strokeWidthNorm * minDim;

      const x1 = sh.x1 * W;
      const y1 = sh.y1 * H;
      const x2 = sh.x2 * W;
      const y2 = sh.y2 * H;

      if (sh.kind === "rectangle") {
        ctx.beginPath();
        ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      } else if (sh.kind === "ellipse") {
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        const rx = Math.abs(x2 - x1) / 2;
        const ry = Math.abs(y2 - y1) / 2;
        if (rx >= 1 && ry >= 1) {
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (sh.kind === "arrow") {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        const headLen = Math.max(12, sh.strokeWidthNorm * minDim * 4);
        paintArrowhead(ctx, x1, y1, x2, y2, headLen);
      }
    }
  }

  // ── Text items ────────────────────────────────────────────────────────────
  if (annotation.textItems.length > 0) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const t of annotation.textItems) {
      const canX = t.xNorm * W;
      const canY = t.yNorm * H;
      const fontSize = Math.max(18, Math.round(t.fontSizeNorm * H));
      ctx.font = `bold ${fontSize}px Arial, sans-serif`;
      ctx.fillStyle = t.color;
      ctx.shadowColor = "rgba(0,0,0,0.85)";
      ctx.shadowBlur = 8;
      ctx.fillText(t.text, canX, canY);
    }
    ctx.shadowBlur = 0;
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("canvas.toBlob returned null"))),
      "image/jpeg",
      quality,
    );
  });
}
