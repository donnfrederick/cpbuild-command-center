import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ProjectHubInspectionsCard } from "@/components/projects/ProjectHubInspectionsCard";
import { listByProjectLevel } from "@/lib/inspections/submissionsApi";

vi.mock("@/lib/inspections/submissionsApi", () => ({
  listByProjectLevel: vi.fn(),
  partitionInspectionSubmissionsForPdfExport: vi.fn((subs: unknown[]) => ({
    exportable: subs,
    pendingCount: 0,
  })),
  PROJECT_LEVEL_INSPECTION_UNIT_ID: "__project__",
}));

vi.mock("@/components/projects/inspections/StartProjectInspectionSheet", () => ({
  StartProjectInspectionSheet: () => null,
}));

vi.mock("@/components/projects/inspections/InspectionFillOverlay", () => ({
  InspectionFillOverlay: () => null,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const DOC_SUBMISSION = {
  id: "sub-1",
  formId: "form-1",
  formNameSnapshot: "Daily Log",
  submittedAt: new Date().toISOString(),
  submittedBy: "Phil",
  outcome: "COMPLETE",
  deficiencyCount: 0,
  payload: {},
  source: "FORM" as const,
  templateSnapshot: { formPurpose: "documentation" },
};

describe("ProjectHubInspectionsCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listByProjectLevel).mockResolvedValue([DOC_SUBMISSION as never]);
  });

  it("does not show share-only-failed-items toggle on project overview forms", async () => {
    render(
      <ProjectHubInspectionsCard
        projectId="proj-1"
        projectName="Marina Bay"
        submittedBy="Phil"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Daily Log")).toBeInTheDocument();
    });

    expect(screen.queryByLabelText("shareOnlyFailedItems")).toBeNull();
    expect(screen.queryByText("shareOnlyFailedItems")).toBeNull();
  });
});
