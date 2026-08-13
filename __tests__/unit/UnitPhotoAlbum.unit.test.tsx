import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.json";
import { UnitPhotoAlbum } from "@/components/projects/UnitPhotoAlbum";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/hooks/use-offline-status", () => ({
  useOfflineStatus: () => ({ isOnline: true }),
}));
vi.mock("@/lib/image-utils", () => ({
  resolveClientMime: (f: File) => f.type || "application/octet-stream",
}));

const fetchMock = vi.fn();
global.fetch = fetchMock;

function wrapper(children: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

const PROJECT_ID = "proj1";
const UNIT_REF = "BuildingA|1|101";

describe("UnitPhotoAlbum", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: empty album
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    } as unknown as Response);
  });

  it("renders Camera and Library buttons when online", async () => {
    render(wrapper(<UnitPhotoAlbum projectId={PROJECT_ID} unitRef={UNIT_REF} />));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /camera/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /library/i })).toBeInTheDocument();
    });
  });

  it("shows empty state text when no photos exist", async () => {
    render(wrapper(<UnitPhotoAlbum projectId={PROJECT_ID} unitRef={UNIT_REF} />));
    await waitFor(() => {
      expect(screen.getByText(/no photos yet/i)).toBeInTheDocument();
    });
  });

  it("fetches album on mount with correct unitRef", async () => {
    render(wrapper(<UnitPhotoAlbum projectId={PROJECT_ID} unitRef={UNIT_REF} />));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(`unitRef=${encodeURIComponent(UNIT_REF)}`),
        expect.objectContaining({ cache: "no-store" }),
      );
    });
  });

  it("renders photo thumbnails when items are returned", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "a1",
            storageUrl: "https://storage.example.com/photo.jpg",
            mimeType: "image/jpeg",
            fileSizeBytes: 100000,
            caption: "Crack in wall",
            createdAt: "2026-04-01T10:00:00Z",
            source: { type: "observation", label: "Crack in wall", entityId: "obs1" },
          },
        ],
      }),
    } as unknown as Response);

    render(wrapper(<UnitPhotoAlbum projectId={PROJECT_ID} unitRef={UNIT_REF} />));
    // The thumb button renders with the caption as aria-label
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /crack in wall/i })).toBeInTheDocument();
    });
    // Source badge should appear
    expect(screen.getByText(/observation/i)).toBeInTheDocument();
  });

  it("opens lightbox when a photo thumbnail is clicked", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "a1",
            storageUrl: "https://storage.example.com/photo.jpg",
            mimeType: "image/jpeg",
            fileSizeBytes: null,
            caption: "Test caption",
            createdAt: "2026-04-01T10:00:00Z",
            source: { type: "general", label: null, entityId: null },
          },
        ],
      }),
    } as unknown as Response);

    render(wrapper(<UnitPhotoAlbum projectId={PROJECT_ID} unitRef={UNIT_REF} />));

    const thumb = await screen.findByRole("button", { name: /test caption/i });
    await userEvent.click(thumb);

    // Lightbox dialog should appear
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // Shows "1 of 1"
    expect(screen.getByText(/1 of 1/i)).toBeInTheDocument();
  });

  it("reloads album when unit-album:updated fires for this location", async () => {
    const { UNIT_ALBUM_UPDATED_EVENT } = await import("@/lib/media/unit-album-client-cache");

    render(wrapper(<UnitPhotoAlbum projectId={PROJECT_ID} unitRef={UNIT_REF} />));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "a2",
            storageUrl: "https://storage.example.com/status.jpg",
            mimeType: "image/jpeg",
            fileSizeBytes: 1000,
            caption: null,
            createdAt: "2026-07-24T12:00:00.000Z",
            source: { type: "status_update", label: "Cabinets · In Staging", entityId: null },
          },
        ],
      }),
    } as unknown as Response);

    window.dispatchEvent(
      new CustomEvent(UNIT_ALBUM_UPDATED_EVENT, {
        detail: { projectId: PROJECT_ID, unitRef: UNIT_REF },
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(screen.getByText(/status update/i)).toBeInTheDocument();
    });
  });

  it("does not show upload button when offline", async () => {
    vi.resetModules();
    vi.doMock("@/hooks/use-offline-status", () => ({
      useOfflineStatus: () => ({ isOnline: false }),
    }));

    const { UnitPhotoAlbum: AlbumOffline } = await import("@/components/projects/UnitPhotoAlbum");
    render(wrapper(<AlbumOffline projectId={PROJECT_ID} unitRef={UNIT_REF} />));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /camera/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /library/i })).not.toBeInTheDocument();
    });
  });
});
