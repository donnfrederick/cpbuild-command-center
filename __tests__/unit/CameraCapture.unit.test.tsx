/**
 * Unit tests for CameraCapture — focused on the "Save to Photos" toggle
 * that was added as a persistent user preference.
 *
 * The full camera/video capture overlay requires getUserMedia, MediaRecorder,
 * and canvas — all limited in jsdom. These tests cover isolated behaviour:
 *  - State initialises from localStorage
 *  - Toggle updates localStorage and flips the state
 *  - Web Share API is called (with the captured files) when preference is on
 *  - Web Share errors are swallowed and onCapture still fires
 *  - Photo zoom crop math maps the preview zoom to the captured frame
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// ── Mocks required before importing the component ────────────────────────────

// jsdom has no getUserMedia
Object.defineProperty(globalThis.navigator, "mediaDevices", {
  value: { getUserMedia: vi.fn().mockRejectedValue(new DOMException("NotAllowedError")) },
  writable: true,
});

// Silence createPortal — jsdom body exists but portals can confuse React renders
vi.mock("react-dom", async (importActual) => {
  const actual = await importActual<typeof import("react-dom")>();
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

vi.mock("@/lib/field-media/stamp-field-photo-with-capture", () => ({
  prefetchProjectGeocode: vi.fn(async () => null),
  stampFieldPhotoWithCapture: vi.fn(async (blob: Blob) => ({
    blob,
    captureMetadata: {
      gpsStatus: "unavailable",
      captureRecordedAt: new Date().toISOString(),
      deviceType: "Unknown",
      browser: "Browser",
      appShell: "browser_tab",
      captureMethod: "native_camera",
      userAgent: "test",
    },
  })),
}));

vi.mock("@/lib/image-utils", () => ({
  burnTimestamp: vi.fn(async (blob: Blob) => blob),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockLocalStorage(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initial };
  return {
    getItem: vi.fn((k: string) => store[k] ?? null),
    setItem: vi.fn((k: string, v: string) => { store[k] = v; }),
    removeItem: vi.fn((k: string) => { delete store[k]; }),
    clear: vi.fn(() => { Object.keys(store).forEach((k) => delete store[k]); }),
    store,
  };
}

function stubObjectUrls() {
  let nextId = 0;
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => `blob:camera-test-${++nextId}`),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
}


// ── Tests ─────────────────────────────────────────────────────────────────────

describe("CameraCapture — Save to Photos toggle", () => {
  const onCapture = vi.fn();
  const onClose = vi.fn();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    onCapture.mockClear();
    onClose.mockClear();
  });

  it("toggle is OFF by default when localStorage has no saved preference", async () => {
    const ls = mockLocalStorage();
    vi.stubGlobal("localStorage", ls);
    vi.stubGlobal("navigator", { ...navigator, share: vi.fn(), canShare: vi.fn(() => true) });

    const { CameraCapture } = await import("@/components/projects/CameraCapture");
    const { unmount } = render(<CameraCapture onCapture={onCapture} onClose={onClose} />);

    const btn = screen.queryByRole("button", { name: /saveToPhotosAriaOff/i });
    expect(btn).not.toBeNull();
    unmount();
    vi.unstubAllGlobals();
  });

  it("toggle is ON when localStorage has cc-save-to-photos=true", async () => {
    const ls = mockLocalStorage({ "cc-save-to-photos": "true" });
    vi.stubGlobal("localStorage", ls);
    vi.stubGlobal("navigator", { ...navigator, share: vi.fn(), canShare: vi.fn(() => true) });

    const { CameraCapture } = await import("@/components/projects/CameraCapture");
    const { unmount } = render(<CameraCapture onCapture={onCapture} onClose={onClose} />);

    const btn = screen.queryByRole("button", { name: /saveToPhotosAriaOn/i });
    expect(btn).not.toBeNull();
    unmount();
    vi.unstubAllGlobals();
  });

  it("shows Library and Save toggles together in photo mode", async () => {
    const ls = mockLocalStorage();
    vi.stubGlobal("localStorage", ls);
    vi.stubGlobal("navigator", { ...navigator, share: vi.fn(), canShare: vi.fn(() => true) });

    const { CameraCapture } = await import("@/components/projects/CameraCapture");
    const { unmount } = render(<CameraCapture onCapture={onCapture} onClose={onClose} />);

    expect(screen.getByRole("button", { name: /chooseFromLibrary/i })).not.toBeNull();
    expect(screen.getByRole("button", { name: /saveToPhotosAriaOff/i })).not.toBeNull();
    screen.getByText("library");
    screen.getByText("saveToPhotos");

    unmount();
    vi.unstubAllGlobals();
  });

  it("clicking the toggle flips state and writes to localStorage", async () => {
    const ls = mockLocalStorage();
    vi.stubGlobal("localStorage", ls);
    vi.stubGlobal("navigator", { ...navigator, share: vi.fn(), canShare: vi.fn(() => true) });

    const { CameraCapture } = await import("@/components/projects/CameraCapture");
    const { unmount } = render(<CameraCapture onCapture={onCapture} onClose={onClose} />);

    const offBtn = screen.getByRole("button", { name: /saveToPhotosAriaOff/i });
    fireEvent.click(offBtn);

    expect(ls.setItem).toHaveBeenCalledWith("cc-save-to-photos", "true");
    screen.getByRole("button", { name: /saveToPhotosAriaOn/i });

    const onBtn = screen.getByRole("button", { name: /saveToPhotosAriaOn/i });
    fireEvent.click(onBtn);
    expect(ls.setItem).toHaveBeenCalledWith("cc-save-to-photos", "false");

    unmount();
    vi.unstubAllGlobals();
  });

  it("save toggle is NOT rendered on devices without Web Share API", async () => {
    const ls = mockLocalStorage();
    vi.stubGlobal("localStorage", ls);
    // navigator with no share property
    vi.stubGlobal("navigator", { mediaDevices: navigator.mediaDevices });

    const { CameraCapture } = await import("@/components/projects/CameraCapture");
    const { unmount } = render(<CameraCapture onCapture={onCapture} onClose={onClose} />);

    expect(screen.queryByRole("button", { name: /saveToPhotosAria/i })).toBeNull();
    unmount();
    vi.unstubAllGlobals();
  });

  it("opens native video capture when switching to video mode", async () => {
    const ls = mockLocalStorage();
    vi.stubGlobal("localStorage", ls);
    vi.stubGlobal("navigator", { ...navigator, share: vi.fn(), canShare: vi.fn(() => true) });
    const inputClick = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});

    const { CameraCapture } = await import("@/components/projects/CameraCapture");
    const { unmount } = render(<CameraCapture onCapture={onCapture} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: /^Video$/i }));

    await waitFor(() => expect(inputClick).toHaveBeenCalledTimes(1));

    unmount();
    vi.unstubAllGlobals();
  });

  it("opens native video capture again when tapping the active video tab", async () => {
    const ls = mockLocalStorage();
    vi.stubGlobal("localStorage", ls);
    vi.stubGlobal("navigator", { ...navigator, share: vi.fn(), canShare: vi.fn(() => true) });
    const inputClick = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});

    const { CameraCapture } = await import("@/components/projects/CameraCapture");
    const { unmount } = render(<CameraCapture onCapture={onCapture} onClose={onClose} />);
    const videoTab = screen.getByRole("button", { name: /^Video$/i });

    fireEvent.click(videoTab);
    fireEvent.click(videoTab);

    await waitFor(() => expect(inputClick).toHaveBeenCalledTimes(2));

    unmount();
    vi.unstubAllGlobals();
  });

  it("default maxItems matches MAX_PHOTOS_PER_CAPTURE_SESSION (30, not the old 10)", async () => {
    const ls = mockLocalStorage();
    vi.stubGlobal("localStorage", ls);
    vi.stubGlobal("navigator", { mediaDevices: navigator.mediaDevices });

    const { MAX_PHOTOS_PER_CAPTURE_SESSION } = await import("@/lib/media-attachment-limits");
    expect(MAX_PHOTOS_PER_CAPTURE_SESSION).toBe(30);

    const { CameraCapture } = await import("@/components/projects/CameraCapture");
    const { unmount } = render(<CameraCapture onCapture={onCapture} onClose={onClose} />);

    // The "max items reached" message uses the maxItems value — it should not show at 0 captures
    expect(screen.queryByText(/maxItemsReached/i)).toBeNull();

    unmount();
    vi.unstubAllGlobals();
  });

  it("allows selecting multiple photos from the library", async () => {
    const ls = mockLocalStorage();
    const onCapture = vi.fn();
    const onClose = vi.fn();
    stubObjectUrls();
    vi.stubGlobal("localStorage", ls);
    vi.stubGlobal("navigator", { mediaDevices: navigator.mediaDevices });

    const { CameraCapture } = await import("@/components/projects/CameraCapture");
    const { container, unmount } = render(
      <CameraCapture maxItems={5} onCapture={onCapture} onClose={onClose} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /chooseFromLibrary/i }));

    const photoInput = container.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement;
    expect(photoInput.multiple).toBe(true);

    const first = new File(["one"], "one.jpg", { type: "image/jpeg" });
    const second = new File(["two"], "two.jpg", { type: "image/jpeg" });
    Object.defineProperty(photoInput, "files", {
      configurable: true,
      value: [first, second],
    });

    fireEvent.change(photoInput);
    await screen.findByText("Use 2");
    fireEvent.click(screen.getByRole("button", { name: "Use 2 items" }));

    expect(onCapture).toHaveBeenCalledTimes(1);
    expect(onCapture.mock.calls[0][0]).toHaveLength(2);
    expect(onClose).toHaveBeenCalledTimes(1);

    unmount();
    vi.unstubAllGlobals();
  });

  it("calls navigator.share when save preference is on and user taps Use", async () => {
    const ls = mockLocalStorage({ "cc-save-to-photos": "true" });
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    stubObjectUrls();
    vi.stubGlobal("localStorage", ls);
    vi.stubGlobal("navigator", { ...navigator, share, canShare, mediaDevices: navigator.mediaDevices });

    const { CameraCapture } = await import("@/components/projects/CameraCapture");
    const { container, unmount } = render(
      <CameraCapture maxItems={5} onCapture={onCapture} onClose={onClose} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /chooseFromLibrary/i }));
    const photoInput = container.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement;
    const photo = new File(["one"], "one.jpg", { type: "image/jpeg" });
    Object.defineProperty(photoInput, "files", { configurable: true, value: [photo] });
    fireEvent.change(photoInput);

    await screen.findByText("Use 1");
    fireEvent.click(screen.getByRole("button", { name: "Use 1 item" }));

    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(onCapture).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);

    unmount();
    vi.unstubAllGlobals();
  });

  it("still calls onCapture when share is cancelled", async () => {
    const ls = mockLocalStorage({ "cc-save-to-photos": "true" });
    const share = vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError"));
    const canShare = vi.fn().mockReturnValue(true);
    stubObjectUrls();
    vi.stubGlobal("localStorage", ls);
    vi.stubGlobal("navigator", { ...navigator, share, canShare, mediaDevices: navigator.mediaDevices });

    const { CameraCapture } = await import("@/components/projects/CameraCapture");
    const { container, unmount } = render(
      <CameraCapture maxItems={5} onCapture={onCapture} onClose={onClose} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /chooseFromLibrary/i }));
    const photoInput = container.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement;
    const photo = new File(["one"], "one.jpg", { type: "image/jpeg" });
    Object.defineProperty(photoInput, "files", { configurable: true, value: [photo] });
    fireEvent.change(photoInput);

    await screen.findByText("Use 1");
    fireEvent.click(screen.getByRole("button", { name: "Use 1 item" }));

    await waitFor(() => expect(onCapture).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);

    unmount();
    vi.unstubAllGlobals();
  });

  it("skips share when save preference is off", async () => {
    const ls = mockLocalStorage();
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    stubObjectUrls();
    vi.stubGlobal("localStorage", ls);
    vi.stubGlobal("navigator", { ...navigator, share, canShare, mediaDevices: navigator.mediaDevices });

    const { CameraCapture } = await import("@/components/projects/CameraCapture");
    const { container, unmount } = render(
      <CameraCapture maxItems={5} onCapture={onCapture} onClose={onClose} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /chooseFromLibrary/i }));
    const photoInput = container.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement;
    const photo = new File(["one"], "one.jpg", { type: "image/jpeg" });
    Object.defineProperty(photoInput, "files", { configurable: true, value: [photo] });
    fireEvent.change(photoInput);

    await screen.findByText("Use 1");
    fireEvent.click(screen.getByRole("button", { name: "Use 1 item" }));

    await waitFor(() => expect(onCapture).toHaveBeenCalledTimes(1));
    expect(share).not.toHaveBeenCalled();

    unmount();
    vi.unstubAllGlobals();
  });
});

describe("CameraCapture — flash toggle", () => {
  const onCapture = vi.fn();
  const onClose = vi.fn();

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function makeMockStream(torchCapable: boolean) {
    // jsdom's HTMLMediaElement.play() returns undefined — mock it to return a resolved Promise
    // so that the component's `void videoRef.current.play().catch(...)` call doesn't crash.
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);

    const applyConstraints = vi.fn().mockResolvedValue(undefined);
    const getCapabilities = vi.fn().mockReturnValue(torchCapable ? { torch: true } : {});
    const track = { applyConstraints, getCapabilities, stop: vi.fn() } as unknown as MediaStreamTrack;
    const stream = {
      getVideoTracks: vi.fn(() => [track]),
      getTracks: vi.fn(() => [track]),
    } as unknown as MediaStream;
    return { stream, track, applyConstraints };
  }

  it("flash button is NOT rendered when getUserMedia fails (no stream)", async () => {
    const ls = mockLocalStorage();
    vi.stubGlobal("localStorage", ls);
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(new DOMException("NotAllowedError")) },
    });

    const { CameraCapture } = await import("@/components/projects/CameraCapture");
    const { unmount } = render(<CameraCapture onCapture={onCapture} onClose={onClose} />);

    expect(screen.queryByRole("button", { name: /flash/i })).toBeNull();
    unmount();
  });

  it("flash button is NOT rendered when stream is available but torch is unsupported", async () => {
    const ls = mockLocalStorage();
    vi.stubGlobal("localStorage", ls);
    const { stream } = makeMockStream(false);
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });

    const { CameraCapture } = await import("@/components/projects/CameraCapture");
    const { unmount } = render(<CameraCapture onCapture={onCapture} onClose={onClose} />);

    // Wait for stream to be established
    await waitFor(() => expect(screen.queryByRole("button", { name: /flip camera/i })).not.toBeNull());
    expect(screen.queryByRole("button", { name: /flash/i })).toBeNull();
    unmount();
  });

  it("flash button IS rendered and defaults OFF when torch is supported", async () => {
    const ls = mockLocalStorage();
    vi.stubGlobal("localStorage", ls);
    const { stream } = makeMockStream(true);
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });

    const { CameraCapture } = await import("@/components/projects/CameraCapture");
    const { unmount } = render(<CameraCapture onCapture={onCapture} onClose={onClose} />);

    await waitFor(() => expect(screen.queryByRole("button", { name: /flashOff/i })).not.toBeNull());
    const flashBtn = screen.getByRole("button", { name: /flashOff/i });
    expect(flashBtn).toHaveAttribute("aria-pressed", "false");
    unmount();
  });

  it("clicking the flash button toggles it on and off", async () => {
    const ls = mockLocalStorage();
    vi.stubGlobal("localStorage", ls);
    const { stream } = makeMockStream(true);
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });

    const { CameraCapture } = await import("@/components/projects/CameraCapture");
    const { unmount } = render(<CameraCapture onCapture={onCapture} onClose={onClose} />);

    // Wait for flash button to appear
    await waitFor(() => expect(screen.queryByRole("button", { name: /flashOff/i })).not.toBeNull());

    // Toggle ON
    fireEvent.click(screen.getByRole("button", { name: /flashOff/i }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /flashOn/i })).not.toBeNull());
    expect(screen.getByRole("button", { name: /flashOn/i })).toHaveAttribute("aria-pressed", "true");

    // Toggle OFF
    fireEvent.click(screen.getByRole("button", { name: /flashOn/i }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /flashOff/i })).not.toBeNull());
    expect(screen.getByRole("button", { name: /flashOff/i })).toHaveAttribute("aria-pressed", "false");

    unmount();
  });

  it("applyConstraints is called with torch:true when flash is toggled on", async () => {
    const ls = mockLocalStorage();
    vi.stubGlobal("localStorage", ls);
    const { stream, applyConstraints } = makeMockStream(true);
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });

    const { CameraCapture } = await import("@/components/projects/CameraCapture");
    const { unmount } = render(<CameraCapture onCapture={onCapture} onClose={onClose} />);

    await waitFor(() => expect(screen.queryByRole("button", { name: /flashOff/i })).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /flashOff/i }));

    await waitFor(() =>
      expect(applyConstraints).toHaveBeenCalledWith(
        expect.objectContaining({ advanced: [{ torch: true }] }),
      ),
    );
    unmount();
  });

  it("flash button is not shown in video mode", async () => {
    const ls = mockLocalStorage();
    vi.stubGlobal("localStorage", ls);
    const { stream } = makeMockStream(true);
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
      share: vi.fn(),
      canShare: vi.fn(() => true),
    });

    const { CameraCapture } = await import("@/components/projects/CameraCapture");
    const { unmount } = render(<CameraCapture onCapture={onCapture} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: /^Video$/i }));

    // Flash button should not exist in video mode
    await waitFor(() => expect(screen.queryByRole("button", { name: /flash/i })).toBeNull());
    unmount();
  });
});

describe("CameraCapture — photo zoom crop", () => {
  it("returns the full source frame at 1x zoom", async () => {
    const { getZoomDrawRect } = await import("@/components/projects/CameraCapture");

    expect(getZoomDrawRect(1600, 900, 1)).toEqual({
      sx: 0,
      sy: 0,
      sw: 1600,
      sh: 900,
    });
  });

  it("centers the cropped source frame at higher zoom levels", async () => {
    const { getZoomDrawRect } = await import("@/components/projects/CameraCapture");

    expect(getZoomDrawRect(1600, 900, 2)).toEqual({
      sx: 400,
      sy: 225,
      sw: 800,
      sh: 450,
    });
  });

  it("clamps unsupported zoom values to the photo zoom range", async () => {
    const { getZoomDrawRect } = await import("@/components/projects/CameraCapture");

    expect(getZoomDrawRect(900, 900, 0.25)).toEqual({
      sx: 0,
      sy: 0,
      sw: 900,
      sh: 900,
    });
    expect(getZoomDrawRect(900, 900, 9)).toEqual({
      sx: 300,
      sy: 300,
      sw: 300,
      sh: 300,
    });
  });

  it("maps pinch distance changes to photo zoom", async () => {
    const { getPinchPhotoZoom } = await import("@/components/projects/CameraCapture");

    expect(getPinchPhotoZoom(1, 100, 200)).toBe(2);
    expect(getPinchPhotoZoom(1, 100, 120)).toBe(1.2);
    expect(getPinchPhotoZoom(1, 100, 123)).toBe(1.23);
    expect(getPinchPhotoZoom(1, 100, 50)).toBe(0.5);
    expect(getPinchPhotoZoom(2, 100, 300)).toBe(3);
  });
});

