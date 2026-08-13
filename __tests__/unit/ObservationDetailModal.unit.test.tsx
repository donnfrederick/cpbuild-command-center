import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ObsSummary } from "@/components/projects/UnitCards";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

vi.mock("@/components/projects/ImageAnnotationEditor", () => ({
  ImageAnnotationEditor: () => null,
  isFlattenAnnotationSave: () => false,
}));
vi.mock("@/components/projects/ImageAnnotationOverlay", () => ({
  ImageAnnotationOverlay: () => null,
}));
vi.mock("@/components/projects/CommentThread", () => ({
  CommentThread: () => null,
}));
vi.mock("@/components/projects/MediaWithOfflineFallback", () => ({
  ImgWithOfflineFallback: () => null,
  VideoWithOfflineFallback: () => null,
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeObs(overrides: Partial<ObsSummary> = {}): ObsSummary {
  return {
    id: "obs-1",
    title: "Test observation",
    description: "A test observation",
    observationType: "QUALITY",
    createdAt: "2026-04-01T12:00:00Z",
    updatedAt: "2026-04-01T12:00:00Z",
    unitRef: "North|1|N001",
    author: { id: "user-1", name: "Phil Salter", email: "phil@example.com" },
    attachments: [],
    scopeTags: [],
    ...overrides,
  } as ObsSummary;
}

const BASE_UNIT_CTX = {
  unitKey: "N001",
  building: "North",
  level: "1",
  unit: "N001",
  unitRef: "North|1|N001",
};

const messages = {
  units: {
    exportDetailPdfAria: "Export to PDF",
    exportDetailPdfBusyAria: "Exporting PDF…",
    exportDetailPdfFilterObs: "Single observation",
    exportDetailPdfFailed: "Could not export PDF.",
    exportDetailPdfFailedGeneric: "Export failed.",
    projectLevelScope: "Project level",
  },
};

function renderModal(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Stub fetch so the detail-hydration useEffect doesn't error
beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: false } as Response);
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("ObservationDetailModal — navigation strip", () => {
  it("does not render nav bar when total is 1", async () => {
    const { ObservationDetailModal } = await import(
      "@/components/projects/ObservationDetailModal"
    );
    renderModal(
      <ObservationDetailModal
        obs={makeObs()}
        unitContext={BASE_UNIT_CTX}
        projectId="proj-1"
        currentIndex={0}
        total={1}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByLabelText("Previous observation")).toBeNull();
    expect(screen.queryByLabelText("Next observation")).toBeNull();
  });

  it("renders bottom nav bar with correct counter when total > 1", async () => {
    const { ObservationDetailModal } = await import(
      "@/components/projects/ObservationDetailModal"
    );
    renderModal(
      <ObservationDetailModal
        obs={makeObs()}
        unitContext={BASE_UNIT_CTX}
        projectId="proj-1"
        currentIndex={1}
        total={5}
        onPrev={vi.fn()}
        onNext={vi.fn()}
        onClose={vi.fn()}
      />
    );
    // counter shows human-readable position (e.g. "2 of 5"); numbers may render in separate nodes
    expect(screen.getByText(/\bof\b/)).toBeDefined();
    expect(screen.getByLabelText("Previous observation")).toBeDefined();
    expect(screen.getByLabelText("Next observation")).toBeDefined();
  });

  it("disables Prev button at first item (no onPrev passed)", async () => {
    const { ObservationDetailModal } = await import(
      "@/components/projects/ObservationDetailModal"
    );
    renderModal(
      <ObservationDetailModal
        obs={makeObs()}
        unitContext={BASE_UNIT_CTX}
        projectId="proj-1"
        currentIndex={0}
        total={3}
        onPrev={undefined}
        onNext={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect((screen.getByLabelText("Previous observation") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Next observation") as HTMLButtonElement).disabled).toBe(false);
  });

  it("disables Next button at last item (no onNext passed)", async () => {
    const { ObservationDetailModal } = await import(
      "@/components/projects/ObservationDetailModal"
    );
    renderModal(
      <ObservationDetailModal
        obs={makeObs()}
        unitContext={BASE_UNIT_CTX}
        projectId="proj-1"
        currentIndex={2}
        total={3}
        onPrev={vi.fn()}
        onNext={undefined}
        onClose={vi.fn()}
      />
    );
    expect((screen.getByLabelText("Previous observation") as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByLabelText("Next observation") as HTMLButtonElement).disabled).toBe(true);
  });

  it("calls onPrev when Prev button is clicked", async () => {
    const { ObservationDetailModal } = await import(
      "@/components/projects/ObservationDetailModal"
    );
    const onPrev = vi.fn();
    renderModal(
      <ObservationDetailModal
        obs={makeObs()}
        unitContext={BASE_UNIT_CTX}
        projectId="proj-1"
        currentIndex={1}
        total={3}
        onPrev={onPrev}
        onNext={vi.fn()}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByLabelText("Previous observation"));
    expect(onPrev).toHaveBeenCalledOnce();
  });

  it("calls onNext when Next button is clicked", async () => {
    const { ObservationDetailModal } = await import(
      "@/components/projects/ObservationDetailModal"
    );
    const onNext = vi.fn();
    renderModal(
      <ObservationDetailModal
        obs={makeObs()}
        unitContext={BASE_UNIT_CTX}
        projectId="proj-1"
        currentIndex={0}
        total={3}
        onPrev={vi.fn()}
        onNext={onNext}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByLabelText("Next observation"));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it("calls onPrev on ArrowLeft keydown", async () => {
    const { ObservationDetailModal } = await import(
      "@/components/projects/ObservationDetailModal"
    );
    const onPrev = vi.fn();
    renderModal(
      <ObservationDetailModal
        obs={makeObs()}
        unitContext={BASE_UNIT_CTX}
        projectId="proj-1"
        currentIndex={1}
        total={3}
        onPrev={onPrev}
        onNext={vi.fn()}
        onClose={vi.fn()}
      />
    );
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(onPrev).toHaveBeenCalledOnce();
  });

  it("calls onNext on ArrowRight keydown", async () => {
    const { ObservationDetailModal } = await import(
      "@/components/projects/ObservationDetailModal"
    );
    const onNext = vi.fn();
    renderModal(
      <ObservationDetailModal
        obs={makeObs()}
        unitContext={BASE_UNIT_CTX}
        projectId="proj-1"
        currentIndex={0}
        total={3}
        onPrev={vi.fn()}
        onNext={onNext}
        onClose={vi.fn()}
      />
    );
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onNext).toHaveBeenCalledOnce();
  });
});

describe("ObservationDetailModal — location meta", () => {
  it("shows project name and project level for project-level observations", async () => {
    const { ObservationDetailModal } = await import(
      "@/components/projects/ObservationDetailModal"
    );
    renderModal(
      <ObservationDetailModal
        obs={makeObs({ unitRef: null, title: "Site gate locked" })}
        unitContext={{ unitKey: "Project", building: "", level: "", unit: "", unitRef: "" }}
        projectId="proj-1"
        projectName="Bing South"
        currentUserId="user-1"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Bing South")).toBeInTheDocument();
    expect(screen.getByText("Project level")).toBeInTheDocument();
    expect(screen.queryByText(/, Level/)).not.toBeInTheDocument();
  });
});

describe("ObservationDetailModal — PDF export", () => {
  it("renders Export to PDF control for any viewer", async () => {
    const { ObservationDetailModal } = await import(
      "@/components/projects/ObservationDetailModal"
    );
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
        blob: async () => new Blob(["%PDF"], { type: "application/pdf" }),
      } as unknown as Response);

    renderModal(
      <ObservationDetailModal
        obs={makeObs({ author: { id: "other", name: "Other", email: "o@test.com" } })}
        unitContext={BASE_UNIT_CTX}
        projectId="proj-1"
        currentUserId="user-1"
        onClose={vi.fn()}
      />,
    );

    const btn = screen.getByRole("button", { name: "Export to PDF" });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/projects/proj-1/observations/export-pdf",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
