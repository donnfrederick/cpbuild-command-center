/**
 * Client-side image processing utilities.
 * All functions run in the browser — do not import in server components or API routes.
 */

/**
 * HEIC/HEIF files from iPhones cannot be decoded by the browser canvas API,
 * so they bypass resize+compress and upload at their original size.
 * Warn the user when a single HEIC file exceeds this threshold so they know
 * the upload may take longer than usual on a slow connection.
 */
export const HEIC_LARGE_FILE_WARNING_BYTES = 8 * 1024 * 1024; // 8 MB

/** Images above this size are aggressively compressed before field upload (UN-0053). */
export const FIELD_IMAGE_AUTO_COMPRESS_BYTES = 5 * 1024 * 1024; // 5 MB

export interface BurnLocation {
  building?: string | null;
  area?: string | null;
  level?: string | null;
  unit?: string | null;
}

export type GpsWatermark =
  | { kind: "success"; distanceLabel: string; coordLabel: string }
  | { kind: "failure"; reason: "denied" | "timeout" | "unavailable"; line: string };

// ── Inline Lucide SVG icon data URIs (white stroke, for canvas drawImage) ────

function makeLucideUri(innerSvg: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${innerSvg}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const ICON_BUILDING2 = makeLucideUri(
  '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/>' +
  '<path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>' +
  '<path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 0-2 2h-2"/>' +
  '<path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>',
);

const ICON_MAPPIN = makeLucideUri(
  '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>' +
  '<circle cx="12" cy="10" r="3"/>',
);

const ICON_LAYERS = makeLucideUri(
  '<polygon points="12 2 2 7 12 12 22 7 12 2"/>' +
  '<polyline points="2 17 12 22 22 17"/>' +
  '<polyline points="2 12 12 17 22 12"/>',
);

const ICON_HASH = makeLucideUri(
  '<line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/>' +
  '<line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/>',
);

const ICON_CHECKSQUARE = makeLucideUri(
  '<polyline points="9 11 12 14 22 4"/>' +
  '<path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
);

// ── Internal helpers ──────────────────────────────────────────────────────────

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

interface LocationSegment {
  iconUri: string;
  text: string;
}

function buildLocationSegments(loc: BurnLocation): LocationSegment[] {
  const clean = (v: string | null | undefined) => (v ?? "").trim();
  const building = clean(loc.building);
  const area = clean(loc.area);
  const level = clean(loc.level);
  const unit = clean(loc.unit);

  const segments: LocationSegment[] = [];
  if (building && building !== "0") segments.push({ iconUri: ICON_BUILDING2, text: building });
  if (area && area !== "0") segments.push({ iconUri: ICON_MAPPIN, text: `Area ${area}` });
  if (level && level !== "0") segments.push({ iconUri: ICON_LAYERS, text: `Level ${level}` });
  if (unit && unit !== "0") segments.push({ iconUri: ICON_HASH, text: `Unit ${unit}` });
  return segments;
}

/**
 * Draw a row of [icon + text] segments onto a canvas context, left-to-right.
 * Separator " · " (no icon) is drawn between segments.
 * Returns the total rendered width for layout purposes.
 */
function drawIconTextRow(
  ctx: CanvasRenderingContext2D,
  segments: Array<{ icon: HTMLImageElement; text: string }>,
  startX: number,
  baselineY: number,
  fontSize: number,
): number {
  const iconSize = Math.round(fontSize * 0.88);
  // Vertically centre icon relative to text cap height (~0.72 × fontSize above baseline)
  const iconY = baselineY - iconSize - Math.round((fontSize * 0.72 - iconSize) / 2);
  const iconGap = Math.round(fontSize * 0.22);
  const sepWidth = ctx.measureText(" · ").width;

  let curX = startX;
  for (let i = 0; i < segments.length; i++) {
    if (i > 0) {
      ctx.fillText(" · ", curX, baselineY);
      curX += sepWidth;
    }
    ctx.drawImage(segments[i].icon, curX, iconY, iconSize, iconSize);
    curX += iconSize + iconGap;
    ctx.fillText(segments[i].text, curX, baselineY);
    curX += ctx.measureText(segments[i].text).width;
  }
  return curX - startX;
}

/**
 * Format location fields into a plain-text watermark line (legacy / non-canvas fallback).
 *
 * Output example: "B · Area Lobby · Level 1 · Unit 109"
 * Omits empty values and the placeholder "0" used for area.
 * Returns null when no meaningful location data exists.
 */
export function formatLocationLine(loc: BurnLocation): string | null {
  const clean = (v: string | null | undefined) => (v ?? "").trim();
  const building = clean(loc.building);
  const area = clean(loc.area);
  const level = clean(loc.level);
  const unit = clean(loc.unit);

  const parts: string[] = [];
  if (building && building !== "0") parts.push(building);
  if (area && area !== "0") parts.push(`Area ${area}`);
  if (level && level !== "0") parts.push(`Level ${level}`);
  if (unit && unit !== "0") parts.push(`Unit ${unit}`);

  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Burn a timestamp watermark into an image blob.
 *
 * Bottom-left watermark layout (when all options provided):
 *   Line 1 (top)    — bold timestamp
 *   Line 2 (middle) — location with icons: [Building] B · [Pin] Area X · [Layers] Level 1 · [#] Unit 109
 *   Line 3 (bottom) — status update: [✓] Status Update · Scope · Status label
 *
 * The image is scaled so its longest dimension does not exceed `maxPx` before encoding.
 */
export async function burnTimestamp(
  blob: Blob,
  date: Date,
  {
    maxPx = 2048,
    quality = 0.6,
    location,
    uploaded = false,
    scopeName,
    statusLabel,
    gpsWatermark,
  }: {
    maxPx?: number;
    quality?: number;
    location?: BurnLocation;
    uploaded?: boolean;
    /** Scope name to include in a "Status Update" line (line 3). */
    scopeName?: string;
    /** Human-readable status label to pair with scopeName (line 3). */
    statusLabel?: string;
    /** Optional GPS proximity lines (smallest font tier, bottom of watermark stack). */
    gpsWatermark?: GpsWatermark;
  } = {},
): Promise<Blob> {
  // Capture the object URL so we can revoke it after decode; not revoking here
  // leaks a blob reference in memory for every capture in a session.
  const objectUrl = URL.createObjectURL(blob);
  let img: HTMLImageElement;
  try {
    img = await loadHtmlImage(objectUrl);
  } catch (err) {
    URL.revokeObjectURL(objectUrl);
    throw err;
  }
  URL.revokeObjectURL(objectUrl);

  const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas 2D context");

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const timestampLabel = uploaded ? `Uploaded ${formatTimestamp(date)}` : formatTimestamp(date);

  const baseFontSize = Math.max(14, Math.round(canvas.width * 0.028));
  const locationFontSize = Math.round(baseFontSize * 0.82);
  const statusFontSize = Math.round(baseFontSize * 0.78);
  const lineGap = Math.round(baseFontSize * 0.35);
  const padding = Math.round(baseFontSize * 0.6);

  // Pre-load icon images (only those needed)
  const locationSegments = location ? buildLocationSegments(location) : [];
  const hasStatusLine = !!(scopeName || statusLabel);
  const gpsLineCount =
    gpsWatermark?.kind === "success"
      ? gpsWatermark.distanceLabel
        ? 1
        : 0
      : gpsWatermark?.kind === "failure"
        ? 1
        : 0;
  const hasGpsBlock = gpsLineCount > 0;

  const [locIcons, statusIcon] = await Promise.all([
    locationSegments.length > 0
      ? Promise.all(locationSegments.map((s) => loadHtmlImage(s.iconUri)))
      : Promise.resolve([]),
    hasStatusLine ? loadHtmlImage(ICON_CHECKSQUARE) : Promise.resolve(null),
  ]);

  const loadedLocSegments = locationSegments.map((s, i) => ({ icon: locIcons[i], text: s.text }));

  const x = padding;

  // ── Dark background panel ────────────────────────────────────────────────────
  // Drawn before any text so the white watermark is visible on any background
  // (light walls, bright skies, etc. make white-on-shadow text illegible).
  let blockHeight = baseFontSize; // timestamp is always present
  if (loadedLocSegments.length > 0) blockHeight += lineGap + locationFontSize;
  if (hasStatusLine) blockHeight += lineGap + statusFontSize;
  if (hasGpsBlock) blockHeight += lineGap + gpsLineCount * statusFontSize + (gpsLineCount > 1 ? lineGap : 0);

  const panelTopY = Math.max(0, canvas.height - padding - blockHeight - Math.round(lineGap * 0.5));
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, panelTopY, canvas.width, canvas.height - panelTopY);

  // ── Text rendering ───────────────────────────────────────────────────────────
  // Shadow for additional legibility on any background
  ctx.shadowColor = "rgba(0,0,0,0.75)";
  ctx.shadowBlur = baseFontSize * 0.5;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.textBaseline = "bottom";

  // Calculate y positions bottom-up
  let bottomY = canvas.height - padding;

  if (hasGpsBlock && gpsWatermark) {
    ctx.font = `${statusFontSize}px 'SF Pro Text', -apple-system, Arial, sans-serif`;
    if (gpsWatermark.kind === "failure") {
      ctx.fillText(gpsWatermark.line, x, bottomY);
      bottomY -= statusFontSize + lineGap;
    } else if (gpsWatermark.distanceLabel) {
      ctx.fillText(gpsWatermark.distanceLabel, x, bottomY);
      bottomY -= statusFontSize + lineGap;
    }
  }

  if (hasStatusLine) {
    // Status update line (bottommost)
    const statusParts: string[] = [];
    if (scopeName) statusParts.push(scopeName);
    if (statusLabel) statusParts.push(statusLabel);
    const statusText = statusParts.join(" · ");

    ctx.font = `${statusFontSize}px 'SF Pro Text', -apple-system, Arial, sans-serif`;
    const statusIconSize = Math.round(statusFontSize * 0.88);
    const statusIconY = bottomY - statusIconSize - Math.round((statusFontSize * 0.72 - statusIconSize) / 2);
    if (statusIcon) {
      ctx.drawImage(statusIcon, x, statusIconY, statusIconSize, statusIconSize);
      ctx.fillText(`Status Update · ${statusText}`, x + statusIconSize + Math.round(statusFontSize * 0.22), bottomY);
    } else {
      ctx.fillText(`Status Update · ${statusText}`, x, bottomY);
    }
    bottomY -= statusFontSize + lineGap;
  }

  if (loadedLocSegments.length > 0) {
    // Location line with icons
    ctx.font = `${locationFontSize}px 'SF Pro Text', -apple-system, Arial, sans-serif`;
    drawIconTextRow(ctx, loadedLocSegments, x, bottomY, locationFontSize);
    bottomY -= locationFontSize + lineGap;
  }

  // Timestamp (topmost of the watermark block)
  ctx.font = `bold ${baseFontSize}px 'SF Pro Text', -apple-system, Arial, sans-serif`;
  ctx.fillText(timestampLabel, x, bottomY);

  // Reset shadow
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (output) => {
        if (!output) {
          reject(new Error("canvas.toBlob returned null"));
          return;
        }
        resolve(output);
      },
      "image/jpeg",
      quality,
    );
  });
}

/**
 * Format a Date as "Mar 27, 2026 4:20 PM"
 */
export function formatTimestamp(date: Date): string {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Resolve the client-side MIME type of a File, with HEIC fallback.
 */
export function resolveClientMime(file: File): string {
  if (file.type && file.type !== "application/octet-stream") return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    heic: "image/heic",
    heif: "image/heif",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
    ogg: "audio/ogg",
  };
  return map[ext] ?? "application/octet-stream";
}

/** True when the file is HEIC/HEIF by MIME type or extension (Mac Photos library picks). */
export function isHeicOrHeifFile(file: File): boolean {
  const mime = resolveClientMime(file);
  return mime.includes("heic") || mime.includes("heif") || /\.(heic|heif)$/i.test(file.name);
}

/** True for library-picked still images, including HEIC with missing/wrong MIME. */
export function isFieldMediaImageFile(file: File): boolean {
  if (isHeicOrHeifFile(file)) return true;
  const mime = resolveClientMime(file);
  if (mime.startsWith("image/")) return true;
  return /\.(jpe?g|png|gif|webp|tiff?|bmp)$/i.test(file.name);
}

async function canBrowserDecodeImage(file: File): Promise<boolean> {
  const url = URL.createObjectURL(file);
  try {
    await loadHtmlImage(url); 
    return true;
  } catch {
    return false;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Convert iPhone/Mac HEIC/HEIF library picks to JPEG so preview + upload work in Chrome. */
export async function convertHeicToJpegFile(file: File): Promise<File> {
  const mod = await import("heic2any");
  const heic2any = (mod as { default?: (args: {
    blob: Blob;
    toType?: string;
    quality?: number;
  }) => Promise<Blob | Blob[]> }).default ?? mod;
  if (typeof heic2any !== "function") {
    throw new Error("HEIC converter failed to load");
  }
  const result = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.85,
  });
  const blob = Array.isArray(result) ? result[0] : result;
  if (!blob) throw new Error("HEIC conversion returned no data");
  const baseName = file.name.replace(/\.(heic|heif)$/i, "") || "photo";
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
}

export interface PrepareLibraryImageOptions {
  location?: BurnLocation;
  uploaded?: boolean;
  gpsWatermark?: GpsWatermark;
}

export interface PrepareLibraryImageResult {
  file: File;
  mimeType: string;
  wasCompressed?: boolean;
}

/**
 * Normalize a library-picked image for field upload: HEIC→JPEG when needed, then timestamp burn.
 * Returns a browser-displayable file suitable for preview thumbnails and storage.
 */
export async function prepareLibraryImageForFieldUpload(
  file: File,
  options: PrepareLibraryImageOptions = {},
): Promise<PrepareLibraryImageResult> {
  const mime = resolveClientMime(file);
  if (mime.startsWith("video/") || mime.startsWith("audio/")) {
    return { file, mimeType: mime };
  }
  if (!isFieldMediaImageFile(file)) {
    return { file, mimeType: mime };
  }

  let working = file;
  let workingMime = resolveClientMime(working);
  const needsCompress = file.size > FIELD_IMAGE_AUTO_COMPRESS_BYTES;

  if (isHeicOrHeifFile(file)) {
    working = await convertHeicToJpegFile(working);
    workingMime = "image/jpeg";
  } else if (workingMime.startsWith("image/")) {
    const decodable = await canBrowserDecodeImage(working);
    if (!decodable) {
      if (needsCompress) {
        throw new Error("FIELD_IMAGE_TOO_LARGE");
      }
      throw new Error("FIELD_IMAGE_DECODE_FAILED");
    }
  }

  const burnOptions = {
    location: options.location,
    uploaded: options.uploaded ?? true,
    gpsWatermark: options.gpsWatermark,
    ...(needsCompress || working.size > FIELD_IMAGE_AUTO_COMPRESS_BYTES
      ? { maxPx: 1600, quality: 0.55 }
      : {}),
  };

  if (
    workingMime.startsWith("image/") &&
    !workingMime.includes("heic") &&
    !workingMime.includes("heif")
  ) {
    try {
      const stamped = await burnTimestamp(working, new Date(), burnOptions);
      const baseName = working.name.replace(/\.[^.]+$/, "") || "photo";
      const compressed =
        needsCompress || stamped.size < working.size * 0.95;
      return {
        file: new File([stamped], `${baseName}.jpg`, { type: "image/jpeg" }),
        mimeType: "image/jpeg",
        ...(compressed ? { wasCompressed: true } : {}),
      };
    } catch (err) {
      if (needsCompress) {
        throw new Error("FIELD_IMAGE_TOO_LARGE");
      }
      // Fall back to the displayable working file without watermark.
    }
  }

  if (needsCompress && working.size > FIELD_IMAGE_AUTO_COMPRESS_BYTES) {
    throw new Error("FIELD_IMAGE_TOO_LARGE");
  }

  return { file: working, mimeType: workingMime };
}
