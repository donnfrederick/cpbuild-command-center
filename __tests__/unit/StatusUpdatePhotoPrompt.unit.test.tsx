/**
 * Unit tests for StatusUpdatePhotoPrompt.
 *
 * Covers all three decision paths:
 *   1. Skip  → onSaveStatus() + onDone() called without any upload
 *   2. Add Photos → CameraCapture fires, photos are uploaded to the album,
 *      then onSaveStatus() + onDone() are called
 *   3. Cancel → onCancel() called, no upload, no save
 *
 * Offline: auto-saves status on mount; optional photos queue via mutation queue.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

vi.mock("react-dom", async (importActual) => {
  const actual = await importActual<typeof import("react-dom")>();
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const mockIsOnline = vi.hoisted(() => ({ current: true }));
vi.mock("@/hooks/use-offline-status", () => ({
  useOfflineStatus: () => ({ isOnline: mockIsOnline.current, wasOffline: false }),
}));

const mockEnqueueStatusPhotoMutation = vi.fn();
vi.mock("@/lib/offline/status-photo-queue", () => ({
  enqueueStatusPhotoMutation: (...args: unknown[]) => mockEnqueueStatusPhotoMutation(...args),
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

const mockOnCapture = vi.fn();
let capturedMaxItems: number | undefined;
vi.mock("@/components/projects/CameraCapture", () => ({
  CameraCapture: ({
    onCapture,
    onClose,
    maxItems,
  }: {
    onCapture: (items: Array<{ file: File; localUrl: string; mimeType: string }>) => void;
    onClose: () => void;
    maxItems?: number;
  }) => {
    mockOnCapture.mockImplementation(onCapture);
    capturedMaxItems = maxItems;
    return (
      <div data-testid="camera-capture">
        <button type="button" onClick={() => onClose()}>close-camera</button>
      </div>
    );
  },
}));

vi.mock("@/components/projects/SubcontractorPicker", () => ({
  SubcontractorPicker: ({
    onChange,
  }: {
    onChange: (id: string | null, displayName?: string | null) => void;
  }) => (
    <button type="button" onClick={() => onChange("sub-42", "Acme Sub")}>
      pick-subcontractor
    </button>
  ),
}));

import { StatusUpdatePhotoPrompt } from "@/components/projects/StatusUpdatePhotoPrompt";
import { MAX_PHOTOS_PER_CAPTURE_SESSION } from "@/lib/media-attachment-limits";

const BASE_PROPS = {
  scopeName: "Framing",
  statusDisplayLabel: "In Progress",
  projectId: "proj-1",
  unitRef: "BuildingA|1|101",
  location: { building: "A", level: "1", unit: "101" },
} as const;

function makeFile(name = "photo.jpg", type = "image/jpeg"): File {
  return new File(["data"], name, { type });
}

function mockFetchSuccess() {
  return vi.fn((url: string, init?: RequestInit) => {
    if (typeof url === "string" && url.includes("/api/upload/field-media")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            storageKey: "key/photo.jpg",
            storageUrl: "https://cdn.example.com/photo.jpg",
            mimeType: "image/jpeg",
            fileSizeBytes: 1024,
          }),
          { status: 200 },
        ),
      );
    }
    if (typeof url === "string" && url.includes("/album")) {
      const body = init?.body ? JSON.parse(init.body as string) : {};
      return Promise.resolve(
        new Response(
          JSON.stringify({
            item: {
              id: "item-1",
              storageUrl: "https://cdn.example.com/photo.jpg",
              mimeType: "image/jpeg",
              fileSizeBytes: 1024,
              caption: null,
              createdAt: new Date().toISOString(),
              source: {
                type: body.sourceType ?? "general",
                label: body.sourceLabel ?? null,
                entityId: null,
              },
            },
          }),
          { status: 201 },
        ),
      );
    }
    return Promise.resolve(new Response("{}", { status: 200 }));
  });
}

function renderPrompt(overrides: Partial<{
  onSaveStatus: () => void;
  onDone: () => void;
  onCancel: () => void;
}> = {}) {
  const onSaveStatus = overrides.onSaveStatus ?? vi.fn();
  const onDone = overrides.onDone ?? vi.fn();
  const onCancel = overrides.onCancel ?? vi.fn();
  render(
    <StatusUpdatePhotoPrompt
      {...BASE_PROPS}
      onSaveStatus={onSaveStatus}
      onDone={onDone}
      onCancel={onCancel}
    />,
  );
  return { onSaveStatus, onDone, onCancel };
}

describe("StatusUpdatePhotoPrompt", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockIsOnline.current = true;
    mockOnCapture.mockReset();
    mockEnqueueStatusPhotoMutation.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();
    mockEnqueueStatusPhotoMutation.mockResolvedValue(undefined);
    capturedMaxItems = undefined;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("renders scope name and status label in the header", () => {
    renderPrompt();
    expect(screen.getByText("Framing — In Progress")).toBeDefined();
  });

  it("skip path — calls onSaveStatus and onDone, does not call onCancel", async () => {
    globalThis.fetch = mockFetchSuccess();
    const { onSaveStatus, onDone, onCancel } = renderPrompt();

    fireEvent.click(screen.getByText("skip"));

    await waitFor(() => expect(onSaveStatus).toHaveBeenCalledOnce());
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(onCancel).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("add-photos path — uploads with status_update source, then saves status", async () => {
    const fetchMock = mockFetchSuccess();
    globalThis.fetch = fetchMock;
    const { onSaveStatus, onDone } = renderPrompt();

    fireEvent.click(screen.getByText("addPhotos"));
    await mockOnCapture([
      { file: makeFile("shot1.jpg"), localUrl: "blob:x", mimeType: "image/jpeg" },
    ]);

    await waitFor(() => expect(onSaveStatus).toHaveBeenCalledOnce());
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());

    const albumCall = (fetchMock.mock.calls as Array<[string, RequestInit?]>).find(
      ([url]) => String(url).includes("/album"),
    );
    expect(albumCall).toBeDefined();
    const albumBody = JSON.parse(albumCall![1]?.body as string);
    expect(albumBody.sourceType).toBe("status_update");
    expect(albumBody.sourceLabel).toBe("Framing · In Progress");
  });

  it("add-photos path — upload error shows error message and does NOT save status", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network error"));
    const { onSaveStatus, onDone } = renderPrompt();

    fireEvent.click(screen.getByText("addPhotos"));
    await mockOnCapture([
      { file: makeFile(), localUrl: "blob:x", mimeType: "image/jpeg" },
    ]);

    await waitFor(() => expect(screen.getByText("uploadError")).toBeDefined());
    expect(onSaveStatus).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("cancel path — calls onCancel, does not save status", async () => {
    const { onSaveStatus, onCancel } = renderPrompt();
    fireEvent.click(screen.getByText("cancel"));
    expect(onSaveStatus).not.toHaveBeenCalled();
    await waitFor(() => expect(onCancel).toHaveBeenCalled());
  });

  describe("offline", () => {
    beforeEach(() => {
      mockIsOnline.current = false;
    });

    it("auto-saves status on mount and shows offline UI", async () => {
      const { onSaveStatus } = renderPrompt();
      await waitFor(() => expect(onSaveStatus).toHaveBeenCalledOnce());
      expect(screen.getByText("offlineTitle")).toBeDefined();
      expect(screen.getByText("offlineDone")).toBeDefined();
      expect(screen.getByText("offlineAddPhotos")).toBeDefined();
    });

    it("queues album mutations when adding photos offline", async () => {
      const { onDone } = renderPrompt();

      fireEvent.click(screen.getByText("offlineAddPhotos"));
      await mockOnCapture([
        { file: makeFile(), localUrl: "blob:x", mimeType: "image/jpeg" },
      ]);

      await waitFor(() => expect(mockEnqueueStatusPhotoMutation).toHaveBeenCalledWith(
        expect.objectContaining({
          albumUrl: expect.stringContaining("/album"),
          sourceLabel: "Framing · In Progress",
          file: expect.any(File),
        }),
      ));
      expect(mockToastSuccess).toHaveBeenCalledWith("offlinePhotosQueued");
      await waitFor(() => expect(onDone).toHaveBeenCalled());
    });

    it("offline done closes without calling onSaveStatus again", async () => {
      const { onSaveStatus, onDone } = renderPrompt();
      await waitFor(() => expect(onSaveStatus).toHaveBeenCalledOnce());
      fireEvent.click(screen.getByText("offlineDone"));
      await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
      expect(onSaveStatus).toHaveBeenCalledOnce();
    });
  });

  // ── Photo limit ───────────────────────────────────────────────────────────────

  it("passes maxItems matching MAX_PHOTOS_PER_CAPTURE_SESSION (30) to CameraCapture", () => {
    renderPrompt();

    fireEvent.click(screen.getByText("addPhotos"));
    expect(screen.getByTestId("camera-capture")).toBeDefined();

    expect(capturedMaxItems).toBe(MAX_PHOTOS_PER_CAPTURE_SESSION);
    expect(capturedMaxItems).toBe(30);
  });

  it("requires subcontractor selection before skip when requireSubcontractorAssignment is true", async () => {
    globalThis.fetch = mockFetchSuccess();
    const onSaveStatus = vi.fn();
    const onDone = vi.fn();
    render(
      <StatusUpdatePhotoPrompt
        {...BASE_PROPS}
        requireSubcontractorAssignment
        onSaveStatus={onSaveStatus}
        onDone={onDone}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("skip"));
    expect(onSaveStatus).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("pick-subcontractor"));
    fireEvent.click(screen.getByText("skip"));

    await waitFor(() =>
      expect(onSaveStatus).toHaveBeenCalledWith({
        unifierSubId: "sub-42",
        subcontractorDisplayName: "Acme Sub",
      }),
    );
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
  });
});
