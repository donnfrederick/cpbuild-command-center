/** True for iPhone / iPad / iPod (excludes legacy IE11 "phone" mode). */
export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const w = window as Window & { MSStream?: unknown };
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !w.MSStream;
}

/** True for Android phones and tablets. */
export function isAndroidDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

/** True when the UA is not iOS or Android (Mac/Windows/Linux desktop browsers). */
export function isDesktopOs(): boolean {
  return !isIosDevice() && !isAndroidDevice();
}

import { isInstalledPwa as isInstalledPwaClient } from "@/lib/client-app-shell";

/** True when the app is running as an installed PWA (standalone or fullscreen display mode). */
function isInstalledPwa(): boolean {
  return isInstalledPwaClient();
}

/**
 * True on phones and tablets — callers must deliver the PDF on a fresh user
 * gesture (share sheet or open-in-tab). Desktop/laptop browsers (including
 * narrow viewports and installed desktop PWAs) use automatic download via
 * {@link deliverPdfBlob} instead.
 */
export function isMobilePdfDelivery(): boolean {
  if (typeof window === "undefined") return false;
  if (isDesktopOs()) return false;
  return isIosDevice() || isAndroidDevice() || isInstalledPwa();
}

export function supportsPdfFileShare(): boolean {
  if (typeof navigator === "undefined") return false;
  if (typeof navigator.share !== "function" || typeof navigator.canShare !== "function") {
    return false;
  }
  try {
    const probe = new File(["%PDF"], "probe.pdf", { type: "application/pdf" });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

function canSharePdfFile(file: File): boolean {
  return (
    typeof navigator !== "undefined"
    && typeof navigator.share === "function"
    && typeof navigator.canShare === "function"
    && navigator.canShare({ files: [file] })
  );
}

function sanitizePdfFileName(fileName: string): string {
  const trimmed = fileName.trim() || "export.pdf";
  const withExt = trimmed.toLowerCase().endsWith(".pdf") ? trimmed : `${trimmed}.pdf`;
  return withExt.replace(/[/\\?%*:|"<>]/g, "-");
}

/**
 * Chrome's built-in PDF viewer can hijack `<a download>` when the blob MIME is
 * `application/pdf`, navigating the current tab instead of saving. Octet-stream
 * forces a download; the `.pdf` extension on the anchor preserves association.
 */
function blobForAnchorDownload(blob: Blob): Blob {
  if (!blob.size) return blob;
  return new Blob([blob], { type: "application/octet-stream" });
}

function openPdfBlobInNewTab(url: string): boolean {
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (opened) return true;

  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return true;
}

function triggerAnchorDownload(url: string, fileName: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = sanitizePdfFileName(fileName);
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 60_000);
}

export type PdfDeliveryMethod = "shared" | "opened" | "downloaded";

/**
 * Delivers a PDF after a fresh user gesture (tap). Prefer the native share sheet;
 * on Android fall back to download; on iOS fall back to open in a new tab.
 */
export async function deliverPdfBlobOnUserGesture(
  blob: Blob,
  fileName: string,
): Promise<PdfDeliveryMethod> {
  if (!blob.size) {
    throw new Error("Empty PDF");
  }

  const safeName = sanitizePdfFileName(fileName);
  const file = new File([blob], safeName, { type: "application/pdf" });

  // Desktop share sheets (e.g. macOS Safari/Chrome) omit "Save to Downloads".
  if (isDesktopOs()) {
    triggerAnchorDownload(URL.createObjectURL(blobForAnchorDownload(blob)), safeName);
    return "downloaded";
  }

  if (canSharePdfFile(file)) {
    try {
      await navigator.share({ files: [file], title: safeName });
      return "shared";
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err;
    }
  }

  if (!isIosDevice()) {
    triggerAnchorDownload(URL.createObjectURL(blobForAnchorDownload(blob)), safeName);
    return "downloaded";
  }

  const viewUrl = URL.createObjectURL(blob);
  openPdfBlobInNewTab(viewUrl);
  setTimeout(() => URL.revokeObjectURL(viewUrl), 120_000);
  return "opened";
}

/**
 * Desktop-style immediate download to the browser's default Downloads folder.
 * On mobile, callers should use {@link deliverPdfBlobOnUserGesture} after async work.
 */
export async function deliverPdfBlob(blob: Blob, fileName: string): Promise<PdfDeliveryMethod> {
  if (!blob.size) {
    throw new Error("Empty PDF");
  }

  if (isMobilePdfDelivery()) {
    return deliverPdfBlobOnUserGesture(blob, fileName);
  }

  const url = URL.createObjectURL(blobForAnchorDownload(blob));
  triggerAnchorDownload(url, fileName);
  return "downloaded";
}
