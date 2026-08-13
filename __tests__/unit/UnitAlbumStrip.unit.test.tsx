import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AlbumLightbox, AlbumThumb } from "@/components/projects/UnitAlbumStrip";
import type { AlbumItem } from "@/lib/media/album-types";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/hooks/use-offline-status", () => ({
  useOfflineStatus: () => ({ isOnline: true }),
}));

const baseItem: AlbumItem = {
  id: "att-1",
  storageUrl: "https://example.com/photo.jpg",
  mimeType: "image/jpeg",
  fileSizeBytes: 1000,
  caption: null,
  createdAt: "2026-07-24T12:00:00.000Z",
  source: { type: "status_update", label: "Cabinets · In Staging", entityId: null, scopeCodes: ["CAB"] },
};

describe("AlbumThumb", () => {
  it("shows status label pill on status_update thumbnails", () => {
    render(<AlbumThumb item={baseItem} onClick={() => {}} />);
    expect(screen.getByText("In Staging")).toBeTruthy();
  });
});

describe("AlbumLightbox", () => {
  it("renders capture metadata panel when album item has captureContext", () => {
    render(
      <AlbumLightbox
        items={[{
          ...baseItem,
          captureContext: {
            captureRecordedAt: "2026-07-24T12:00:00.000Z",
            gpsStatus: "granted",
            latitude: 40.77,
            longitude: -111.89,
            accuracyMeters: 10,
            distanceFromProjectMeters: 420,
            projectSiteAddressAtCapture: "348 East South Temple, UT",
            projectGeocodeAvailable: true,
            deviceType: "iPhone",
            browser: "Safari",
            appShell: "pwa_installed",
            captureMethod: "native_camera",
          },
        }]}
        initialIndex={0}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText("sectionLocation")).toBeTruthy();
    expect(screen.getByText("sectionDevice")).toBeTruthy();
    expect(screen.getByText("iPhone")).toBeTruthy();
  });

  it("omits capture metadata panel for legacy album items without captureContext", () => {
    render(
      <AlbumLightbox
        items={[baseItem]}
        initialIndex={0}
        onClose={() => {}}
      />,
    );

    expect(screen.queryByText("sectionLocation")).toBeNull();
  });
});
