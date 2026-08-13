import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  deliverPdfBlob,
  deliverPdfBlobOnUserGesture,
  isAndroidDevice,
  isDesktopOs,
  isIosDevice,
  isMobilePdfDelivery,
} from "@/lib/deliver-pdf-blob";

describe("isIosDevice()", () => {
  it("detects iPhone user agent", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" });
    expect(isIosDevice()).toBe(true);
  });

  it("returns false for desktop Chrome", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)" });
    expect(isIosDevice()).toBe(false);
  });
});

describe("isAndroidDevice()", () => {
  it("detects Android user agent", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8)" });
    expect(isAndroidDevice()).toBe(true);
  });
});

describe("isMobilePdfDelivery()", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false for desktop Chrome at any viewport width", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)", standalone: false });
    vi.stubGlobal(
      "matchMedia",
      vi.fn((q: string) => ({ matches: q.includes("max-width") })),
    );
    expect(isMobilePdfDelivery()).toBe(false);
  });

  it("returns true for Android phones", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8)", standalone: false });
    expect(isMobilePdfDelivery()).toBe(true);
  });

  it("returns false for desktop standalone PWA (Mac) — use anchor download", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)", standalone: false });
    vi.stubGlobal(
      "matchMedia",
      vi.fn((q: string) => ({ matches: q.includes("standalone") })),
    );
    expect(isMobilePdfDelivery()).toBe(false);
  });

  it("returns true for iPhone installed PWA", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      standalone: true,
    });
    expect(isMobilePdfDelivery()).toBe(true);
  });
});

describe("deliverPdfBlob()", () => {
  const blob = new Blob(["%PDF"], { type: "application/pdf" });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("triggers an anchor download on desktop browsers", async () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)", standalone: false });
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
    const createObjectURL = vi.fn(() => "blob:test");
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL: vi.fn() });

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click");

    const pdfBlob = new Blob(["%PDF"], { type: "application/pdf" });
    const result = await deliverPdfBlob(pdfBlob, "media-report.pdf");

    expect(result).toBe("downloaded");
    expect(clickSpy).toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const downloadBlob = createObjectURL.mock.calls[0][0] as Blob;
    expect(downloadBlob.type).toBe("application/octet-stream");
    const anchor = document.querySelector("a[download]");
    expect(anchor).toBeTruthy();
    expect(anchor?.getAttribute("download")).toBe("media-report.pdf");
  });
});

describe("deliverPdfBlobOnUserGesture()", () => {
  const blob = new Blob(["%PDF"], { type: "application/pdf" });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("uses navigator.share when file sharing is supported", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { share, canShare, userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8)" });
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:test"), revokeObjectURL: vi.fn() });

    const result = await deliverPdfBlobOnUserGesture(blob, "report.pdf");

    expect(share).toHaveBeenCalledOnce();
    expect(result).toBe("shared");
  });

  it("downloads on desktop Mac even when Web Share is available", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", {
      share,
      canShare,
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
    });
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:test"), revokeObjectURL: vi.fn() });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click");

    const result = await deliverPdfBlobOnUserGesture(blob, "report.pdf");

    expect(share).not.toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(result).toBe("downloaded");
  });

  it("opens a new tab on iOS when share is unavailable", async () => {
    const open = vi.fn().mockReturnValue({ focus: vi.fn() });
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" });
    vi.stubGlobal("open", open);
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:test"), revokeObjectURL: vi.fn() });

    const result = await deliverPdfBlobOnUserGesture(blob, "report.pdf");

    expect(open).toHaveBeenCalledWith("blob:test", "_blank", "noopener,noreferrer");
    expect(result).toBe("opened");
  });

  it("downloads on Android when share is unavailable", async () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8)" });
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:test"), revokeObjectURL: vi.fn() });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click");

    const result = await deliverPdfBlobOnUserGesture(blob, "report.pdf");

    expect(clickSpy).toHaveBeenCalled();
    expect(result).toBe("downloaded");
  });

  it("throws on empty blob", async () => {
    await expect(deliverPdfBlobOnUserGesture(new Blob([]), "empty.pdf")).rejects.toThrow("Empty PDF");
  });
});
