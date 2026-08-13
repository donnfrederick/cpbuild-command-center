import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { FieldDailyObservationRow } from "@/components/reports/FieldDailyObservationRow";
import type { ObsSummary } from "@/components/projects/UnitCards";

const messages = {
  projects: {
    hubFieldNotesObsFallbackTitle: "Observation",
    hubFieldNotesTimeJustNow: "just now",
    hubFieldNotesTimeMinutes: "{n}m ago",
    hubFieldNotesTimeHours: "{n}h ago",
    hubFieldNotesTimeDays: "{n}d ago",
  },
  units: {
    obsTypeOther: "Other",
    obsTypeQuality: "Quality",
    obsTypeProgress: "Progress",
    obsTypeSafety: "Safety",
    album: {
      photoViewerLabel: "Photo viewer",
      of: "of",
    },
  },
  fieldDailyReport: {
    viewPhoto: "View photo {n}",
    close: "Close",
  },
};

function renderRow(obs: ObsSummary, onClick = vi.fn()) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <FieldDailyObservationRow obs={obs} onClick={onClick} />
    </NextIntlClientProvider>,
  );
}

const baseObs: ObsSummary = {
  id: "obs-1",
  observationType: "OTHER",
  title: "Trash on site",
  description: "Lots of trash sitting here",
  unitRef: null,
  buildPhaseTag: null,
  areaTag: null,
  createdAt: new Date().toISOString(),
  author: { id: "u1", name: "Admin", email: "admin@test.com" },
  attachments: [],
  scopeTags: [],
  _count: { comments: 0 },
};

describe("FieldDailyObservationRow", () => {
  it("renders observation title and description", () => {
    renderRow(baseObs);
    expect(screen.getByText("Trash on site")).toBeInTheDocument();
    expect(screen.getByText("Lots of trash sitting here")).toBeInTheDocument();
  });

  it("renders up to five photo thumbnails when attachments exist", () => {
    const obs: ObsSummary = {
      ...baseObs,
      attachments: Array.from({ length: 6 }, (_, i) => ({
        id: `att-${i}`,
        storageKey: `key-${i}`,
        storageUrl: `https://cdn.example/photo-${i}.jpg`,
        mimeType: "image/jpeg",
        fileSizeBytes: 1000,
        caption: null,
        transcriptStatus: null,
        transcriptOriginal: null,
      })),
    };
    renderRow(obs);
    expect(screen.getAllByRole("button", { name: /View photo/ })).toHaveLength(5);
    expect(screen.getByText("+1")).toBeInTheDocument();
  });

  it("opens lightbox when a thumbnail is tapped without firing row onClick", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const obs: ObsSummary = {
      ...baseObs,
      attachments: [
        {
          id: "att-1",
          storageKey: "key-1",
          storageUrl: "https://cdn.example/photo.jpg",
          mimeType: "image/jpeg",
          fileSizeBytes: 1000,
          caption: null,
          transcriptStatus: null,
          transcriptOriginal: null,
        },
      ],
    };
    renderRow(obs, onClick);
    await user.click(screen.getByRole("button", { name: "View photo 1" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onClick).not.toHaveBeenCalled();
  });
});
