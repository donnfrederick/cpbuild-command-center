import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import enMessages from "@/messages/en.json";
import type { InspectionsReport, SubmissionRow } from "@/app/api/projects/[id]/inspections-report/route";

vi.mock("@/hooks/use-register-offline-cache-view", () => ({
  useRegisterOfflineCacheView: vi.fn(),
}));

vi.mock("@/hooks/use-offline-status", () => ({
  useOfflineStatus: () => ({ isOnline: true, wasOffline: false }),
}));

vi.mock("@/lib/offline/snapshot-cache", () => ({
  readSnapshotData: vi.fn().mockResolvedValue(null),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function submission(
  partial: Partial<SubmissionRow> & Pick<SubmissionRow, "submissionId" | "unit">,
): SubmissionRow {
  return {
    seqNumber: 1,
    scopeTypeCode: "MILL",
    scopeTypeName: "Millwork",
    building: "A",
    level: "2",
    area: "",
    shipPhase: "",
    buildPhase: "",
    imName: "Alice IM",
    pmName: "Bob PM",
    inspectionTypeCode: "CLEAR_INSPECTION",
    inspectionTypeName: "Clear Inspection",
    submittedByName: "Inspector",
    installTeamName: "Sub Co",
    submittedAt: "2026-05-01T12:00:00.000Z",
    outcome: "PASS",
    totalDeficiencies: 0,
    isCalibration: false,
    attemptNumber: 1,
    sections: [],
    ...partial,
  };
}

const MOCK_REPORT: InspectionsReport = {
  projectStartedAt: "2026-01-01T00:00:00.000Z",
  availableInstallers: [],
  scopeTypes: [
    {
      scopeTypeCode: "MILL",
      scopeTypeName: "Millwork",
      totalInspections: 2,
      passCount: 2,
      failCount: 0,
      totalDeficiencies: 0,
      bySeverity: { Minor: 0, Major: 0, Critical: 0 },
      submissions: [
        submission({ submissionId: "sub-aaa", unit: "101", seqNumber: 1 }),
        submission({
          submissionId: "sub-bbb",
          unit: "202",
          seqNumber: 2,
          outcome: "FAIL",
          totalDeficiencies: 2,
          sections: [
            {
              sectionTitle: "General",
              passed: false,
              totalOccurrences: 2,
              questions: [],
              failingQuestions: [
                {
                  questionTitle: "Gap at countertop",
                  passed: false,
                  totalOccurrences: 2,
                  deficiencies: [{ description: "Gap too wide", count: 2 }],
                },
              ],
            },
          ],
        }),
      ],
    },
  ],
};

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {children}
    </NextIntlClientProvider>
  );
}

describe("InspectionsReportClient PDF export selection", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/inspections-report/export-pdf")) {
        return Promise.resolve({
          ok: true,
          blob: () => Promise.resolve(new Blob(["pdf"], { type: "application/pdf" })),
        });
      }
      if (url.includes("/inspections-report") && (!init || init.method === undefined)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(MOCK_REPORT),
        });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(HTMLAnchorElement.prototype, "click", {
      configurable: true,
      value: vi.fn(),
    });
    URL.createObjectURL = vi.fn(() => "blob:mock");
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exports all visible inspections from the export menu", async () => {
    const user = userEvent.setup();
    const { InspectionsReportClient } = await import("@/components/projects/InspectionsReportClient");

    render(
      <Wrapper>
        <InspectionsReportClient projectId="proj-1" projectName="Demo Project" />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByRole("table")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Export inspections report" }));
    await user.click(screen.getByRole("menuitem", { name: "Export PDF" }));

    await waitFor(() => {
      const exportCall = fetchMock.mock.calls.find(
        (call) => typeof call[0] === "string" && call[0].includes("/inspections-report/export-pdf"),
      );
      expect(exportCall).toBeTruthy();
      const body = JSON.parse(String((exportCall![1] as RequestInit).body));
      expect(body.submissionIds).toEqual(["sub-aaa", "sub-bbb"]);
      expect(body.projectName).toBe("Demo Project");
      expect(body.filterSummary).not.toBe("1 selected inspections");
    });
  }, 15_000);

  it("exports only selected submissionIds in select mode", async () => {
    const user = userEvent.setup();
    const { InspectionsReportClient } = await import("@/components/projects/InspectionsReportClient");

    render(
      <Wrapper>
        <InspectionsReportClient projectId="proj-1" projectName="Demo Project" />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByRole("table")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Select" }));

    const table = screen.getByRole("table");
    const row = within(table).getByText("101").closest("tr");
    expect(row).toBeTruthy();
    await user.click(row!);

    await user.click(screen.getByRole("button", { name: "Export selected inspections as PDF" }));

    await waitFor(() => {
      const exportCall = fetchMock.mock.calls.find(
        (call) => typeof call[0] === "string" && call[0].includes("/inspections-report/export-pdf"),
      );
      expect(exportCall).toBeTruthy();
      const body = JSON.parse(String((exportCall![1] as RequestInit).body));
      expect(body.submissionIds).toEqual(["sub-aaa"]);
      expect(body.filterSummary).toBe("1 selected inspections");
    });
  }, 15_000);

  it("shows share-only-failed toggle in select mode and filters selected exports", async () => {
    const user = userEvent.setup();
    const { InspectionsReportClient } = await import("@/components/projects/InspectionsReportClient");

    render(
      <Wrapper>
        <InspectionsReportClient projectId="proj-1" projectName="Demo Project" />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByRole("table")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Select" }));

    expect(screen.getByRole("checkbox", { name: "Share only failed items" })).toBeInTheDocument();

    const table = screen.getByRole("table");
    await user.click(within(table).getByText("101").closest("tr")!);
    await user.click(within(table).getByText("202").closest("tr")!);
    await user.click(screen.getByRole("checkbox", { name: "Share only failed items" }));
    await user.click(screen.getByRole("button", { name: "Export selected inspections as PDF" }));

    await waitFor(() => {
      const exportCall = fetchMock.mock.calls.find(
        (call) => typeof call[0] === "string" && call[0].includes("/inspections-report/export-pdf"),
      );
      expect(exportCall).toBeTruthy();
      const body = JSON.parse(String((exportCall![1] as RequestInit).body));
      expect(body.submissionIds).toEqual(["sub-bbb"]);
      expect(body.shareOnlyFailedItems).toBe(true);
      expect(body.filterSummary).toBe("2 selected inspections · Failed items only");
    });
  });

  it("shows a header clear-filters control and clears applied filters from the modal", async () => {
    const user = userEvent.setup();
    const { InspectionsReportClient } = await import("@/components/projects/InspectionsReportClient");

    render(
      <Wrapper>
        <InspectionsReportClient projectId="proj-1" projectName="Demo Project" />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByRole("table")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Filter inspections report" }));
    await user.click(screen.getByRole("button", { name: "Failed" }));
    await user.click(screen.getByRole("button", { name: "Show results" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    expect(screen.getByText("1 filter applied")).toBeInTheDocument();
    expect(screen.getByTestId("inspection-report-clear-filters-strip")).toBeInTheDocument();

    await user.click(screen.getByTestId("inspection-report-clear-filters-strip"));

    await waitFor(() => {
      expect(screen.queryByText("1 filter applied")).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Filter inspections report" }));
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
  });

  it("cancels an in-progress PDF export and dismisses the overlay", async () => {
    const user = userEvent.setup();

    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/inspections-report/export-pdf")) {
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      }
      if (url.includes("/inspections-report") && (!init || init.method === undefined)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(MOCK_REPORT),
        });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });

    const { InspectionsReportClient } = await import("@/components/projects/InspectionsReportClient");

    render(
      <Wrapper>
        <InspectionsReportClient projectId="proj-1" projectName="Demo Project" />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByRole("table")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Export inspections report" }));
    await user.click(screen.getByRole("menuitem", { name: "Export PDF" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Cancel export" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Cancel export" }));

    await waitFor(() => {
      expect(screen.queryByRole("status", { name: "Exporting PDF" })).not.toBeInTheDocument();
    });
  });
});
