import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/offline/mutation-queue", () => ({ enqueueMutation: vi.fn() }));
vi.mock("@/lib/offline/blob-store", () => ({ storeBlob: vi.fn() }));
vi.mock("@/lib/image-utils", () => ({
  burnTimestamp: vi.fn().mockResolvedValue(new Blob()),
  resolveClientMime: (f: File) => f.type || "image/jpeg",
  isFieldMediaImageFile: (f: File) => (f.type || "").startsWith("image/"),
  HEIC_LARGE_FILE_WARNING_BYTES: 20 * 1024 * 1024,
}));
vi.mock("@/lib/stage-library-field-media", () => ({
  processLibraryMediaFile: vi.fn(async (file: File) => ({ file, mimeType: file.type || "image/jpeg" })),
}));
vi.mock("@/lib/upload-with-retry", () => ({ uploadWithRetry: vi.fn() }));
vi.mock("@/lib/browser-speech", () => ({ appendTranscriptSegment: (prev: string, seg: string) => prev + seg }));
vi.mock("@/components/projects/CameraCapture", () => ({
  CameraCapture: () => null,
}));
vi.mock("@/components/projects/ImageAnnotationEditor", () => ({
  ImageAnnotationEditor: () => null,
  isFlattenAnnotationSave: () => false,
}));
vi.mock("@/components/ui/DictationButton", () => ({
  DictationButton: () => null,
}));
vi.mock("@/lib/observations/use-observation-catalog", () => ({
  useObservationCatalog: vi.fn(() => ({
    observationTypes: [
      { code: "QUALITY", displayName: "Quality" },
      { code: "PROGRESS", displayName: "Progress" },
      { code: "SAFETY", displayName: "Safety" },
      { code: "OTHER", displayName: "Other" },
    ],
    loading: false,
    error: null,
    reload: vi.fn(),
  })),
}));

// ── Messages ──────────────────────────────────────────────────────────────────

const messages = {
  common: {
    dropRejectedFileType: "That file type is not supported here.",
    heicLargeFileWarning: "Large HEIC",
  },
  units: {
    levelObsTitle: "Level Observation",
    buildingObsTitle: "Building Observation",
    projectObsTitle: "Project Observation",
    obsSelectTypeFirst: "Please select an observation type.",
    obsAddTitleFirst: "Please add a title.",
    obsSavedOffline: "Observation saved — will sync when you reconnect.",
    obsSaveOfflineFailed: "Failed to save observation offline. Please try again.",
    obsAdded: "Observation added.",
    obsSubmitFailed: "Failed to submit observation. Please try again.",
    addCaptionTitle: "Add Caption",
    saveCaptionBtn: "Save Caption",
    captionPlaceholder: "Describe what this photo shows…",
    titlePlaceholderObs: "e.g. Stairwell lighting out on Level 3",
    obsTypeLabel: "Observation Type",
    obsTypeQuality: "Quality",
    obsTypeProgress: "Progress",
    obsTypeSafety: "Safety",
    obsTypeOther: "Other",
    submit: "Submit",
    submitting: "Submitting...",
    mediaLabel: "Media",
    mediaRetryUploadAria: "Retry upload",
    mediaUploadFailedBanner: "{count} photos failed to upload.",
    mediaUploadStillFailing: '"{name}" still failed.',
    mediaAttachedCount: "{current} of {max} attached",
    descriptionPlaceholder: "Describe what you observed...",
  },
  common: {
    cancel: "Cancel",
    heicLargeFileWarning: "Large file: {filename}",
  },
  dictation: {
    fieldTitle: "Title",
    fieldNotes: "Notes",
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const { AddLocationObservationModal } = await import("@/components/projects/AddLocationObservationModal");

function renderModal(props: Partial<React.ComponentProps<typeof AddLocationObservationModal>> = {}) {
  const onClose = vi.fn();
  const onCreated = vi.fn();
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AddLocationObservationModal
        projectId="proj-1"
        building="Building A"
        onClose={onClose}
        onCreated={onCreated}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("AddLocationObservationModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the building observation title when no level is provided", () => {
    renderModal({ building: "Building A" });
    expect(screen.getByText("Building Observation")).toBeDefined();
  });

  it("renders the level observation title when a level is provided", () => {
    renderModal({ building: "Building A", level: "3" });
    expect(screen.getByText("Level Observation")).toBeDefined();
  });

  it("renders the title input immediately (no blocking picker step)", () => {
    renderModal();
    expect(screen.getByPlaceholderText("e.g. Stairwell lighting out on Level 3")).toBeDefined();
  });

  it("renders all four observation type buttons", () => {
    renderModal();
    fireEvent.focus(screen.getByPlaceholderText("e.g. Stairwell lighting out on Level 3"));
    expect(screen.getByText("Quality")).toBeDefined();
    expect(screen.getByText("Progress")).toBeDefined();
    expect(screen.getByText("Safety")).toBeDefined();
    expect(screen.getByText("Other")).toBeDefined();
  });

  it("shows optional notes field alongside the required title", () => {
    renderModal();
    expect(screen.getByPlaceholderText("Describe what you observed...")).toBeDefined();
    expect(screen.getByPlaceholderText("e.g. Stairwell lighting out on Level 3")).toBeDefined();
  });

  it("shows building badge in the header", () => {
    renderModal({ building: "Tower C" });
    expect(screen.getAllByText("Tower C").length).toBeGreaterThan(0);
  });

  it("shows building and level in the badge when level is provided", () => {
    renderModal({ building: "Tower C", level: "7" });
    expect(screen.getByText("Level 7")).toBeDefined();
  });

  it("disables the submit button when no type is selected", () => {
    renderModal();
    const submitBtn = screen.getByText("Submit");
    expect(submitBtn.closest("button")).toHaveProperty("disabled", true);
  });

  it("handles null/empty level gracefully (building-scoped unitRef)", () => {
    // level is undefined → unitRef = "BuildingA||"
    renderModal({ building: "Building A", level: undefined });
    expect(screen.getByText("Building Observation")).toBeDefined();
  });

  it("renders project-level title when projectLevel is true", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <AddLocationObservationModal
          projectId="proj-1"
          projectLevel
          onClose={() => {}}
          onCreated={() => {}}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Project Observation")).toBeDefined();
  });

  it("stages files dropped on the media area on desktop", async () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: query === "(min-width: 768px)",
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });

    renderModal();
    fireEvent.focus(screen.getByPlaceholderText("e.g. Stairwell lighting out on Level 3"));
    const mediaSection = screen.getByText("Media").closest("div");
    expect(mediaSection).toBeTruthy();

    const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    fireEvent.drop(mediaSection!, {
      dataTransfer: { files: [file], types: ["Files"], dropEffect: "copy" },
    });

    expect(await screen.findByAltText("")).toBeDefined();
  });
});
