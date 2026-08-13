import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { FieldDailyReportProjectBlock } from "@/components/reports/FieldDailyReportProjectBlock";
import { emptyProjectSnapshot } from "@/lib/field-daily-report/snapshot-activity";
import type { FieldDailyReportProjectDto, FieldDailyReportSectionKey, FieldDailyReportSectionNoteDto } from "@/lib/field-daily-report/types";

function mockSectionNote(
  sectionKey: FieldDailyReportSectionKey,
  body: string,
  id: string,
): FieldDailyReportSectionNoteDto {
  return {
    id,
    sectionKey,
    itemKey: "",
    body,
    author: {
      id: "author-1",
      name: "IM User",
      roleCode: "INSTALL_MANAGER",
      isInstallManager: true,
    },
    createdAt: "2026-07-14T12:00:00.000Z",
    editedAt: null,
    replies: [],
  };
}

const messages = {
  fieldDailyReport: {
    sectionProgress: "Progress",
    sectionStatus: "Status updates",
    sectionInspections: "Inspections",
    sectionIssues: "Issues",
    sectionObservations: "Observations",
    sectionWorkforce: "Workforce",
    sectionOther: "Other",
    sectionCommentLabel: "Your notes",
    sectionNotesLabel: "Notes",
    sectionNotesEmpty: "No notes yet.",
    sectionNotePlaceholder: "Add a note for this section…",
    sectionNoteSubmit: "Submit note",
    sectionNoteAuthorInstallManager: "Install Manager",
    workforceDailyManpowerLabel: "Daily manpower",
    workforceDailyManpowerPlaceholder: "Number of people on site",
    workforceDailyManpowerInputAria: "Daily manpower — number of people on site",
    workforceDailyManpowerUpdate: "Update",
    workforceDailyManpowerSaveSuccess: "Daily manpower saved.",
    workforceDailyManpowerSaveError: "Couldn't save daily manpower",
    saving: "Saving…",
    workforceDailyManpowerHeader: "Daily manpower: {count}",
    workforceDailyManpowerSetByPrefix: "Set by:",
    workforceManpowerSummary: "{count, plural, one {# person on site} other {# people on site}}",
    missingDailyManpowerAlert: "Missing data: daily manpower info",
    progressDeltaOnly: "+{delta}%",
    progressCurrentPct: "{pct}% complete",
    headerProgressDeltaHint: "Change in install-complete progress today",
    headerProgressDeltaAria: "Install-complete progress change today: {delta}%",
    inspectionFailedSummary: "{count, plural, one {# unit failed clear inspection} other {# units failed clear inspection}}",
    inspectionPassedSummary: "{count, plural, one {# unit passed clear inspection} other {# units passed clear inspection}}",
    locationProjectLevel: "Project level",
    expandStatusGroup: "Expand {label} ({count})",
    statusUnitsMoved: "{count, plural, one {# unit} other {# units}}",
    teamsOnSiteUnassigned: "Unassigned",
    sectionTeamsOnSite: "Teams on site",
    hubPreviewStatusChanges: "{count, plural, one {# status change} other {# status changes}}",
    hubPreviewInspections: "{count, plural, one {# inspection} other {# inspections}}",
    hubPreviewIssuesReported: "{count, plural, one {# issue reported} other {# issues reported}}",
    hubPreviewOtherActivity: "{count, plural, one {# other activity item} other {# other activity items}}",
    viewPhoto: "View photo {n}",
    viewInspection: "View inspection",
  },
  units: {
    album: { viewPhoto: "View photo", photoViewerLabel: "Photo viewer" },
  },
  projects: {
    issues: {
      issueTypeBlocking: "Blocking",
      issueTypeNonBlocking: "Non-blocking",
    },
  },
};

const project: FieldDailyReportProjectDto = {
  projectId: "p1",
  projectName: "Marina Bay Condos",
  snapshot: {
    progress: {
      statusChangeCount: 0,
      installCompleteCount: 0,
      installCompleteQtyToday: 0,
      installCompleteVerifiedUnitDelta: 1,
      inspectionSubmittedCount: 2,
      issuesCreatedCount: 1,
      issuesResolvedCount: 0,
      observationsCreatedCount: 1,
      pctComplete: 7,
      pctCompleteDelta: 1,
    },
    statusUpdates: { summaryGroups: [], sourceEvents: [] },
    subcontractors: { summaryGroups: [] },
    teamsOnSite: { summaryGroups: [] },
    inspections: {
      summaryGroups: [
        { id: "insp-fail", outcome: "FAIL", items: [{ itemKey: "i1", activityLogId: "a1", createdAt: "", headline: "Clear", locationLabel: "U1" }] },
        { id: "insp-pass", outcome: "PASS", items: [{ itemKey: "i2", activityLogId: "a2", createdAt: "", headline: "Clear", locationLabel: "U2" }] },
      ],
    },
    issues: {
      items: [
        {
          itemKey: "issue-1",
          activityLogId: "a3",
          createdAt: "",
          headline: "Trade materials in the way",
          locationLabel: "TOP1U",
          badge: "BLOCKING",
          issueId: "issue-1",
        },
      ],
    },
    observations: {
      items: [
        {
          itemKey: "obs-1",
          activityLogId: "a4",
          createdAt: "",
          headline: "Trash sitting here on site",
          locationLabel: "Site",
          observationId: "obs-1",
        },
      ],
    },
  },
  sectionNotes: [
    mockSectionNote("progress", "Progress note here", "n1"),
    mockSectionNote("inspections", "Inspection note here", "n2"),
    mockSectionNote("observations", "Observation note here", "n3"),
    mockSectionNote("other", "Today was cool", "n4"),
  ],
  comments: [
    { sectionKey: "progress", itemKey: "", body: "Progress note here", updatedAt: "2026-07-14T12:00:00.000Z" },
    { sectionKey: "inspections", itemKey: "", body: "Inspection note here", updatedAt: "2026-07-14T12:00:00.000Z" },
    { sectionKey: "observations", itemKey: "", body: "Observation note here", updatedAt: "2026-07-14T12:00:00.000Z" },
    { sectionKey: "other", itemKey: "", body: "Today was cool", updatedAt: "2026-07-14T12:00:00.000Z" },
  ],
};

describe("FieldDailyReportProjectBlock read-only notes", () => {
  it("renders saved section notes in every section, not only Other", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <FieldDailyReportProjectBlock
          project={project}
          reportDate="2026-07-14"
          sheetMode
          editable={false}
          currentUserId="user-1"
          onOpenIssue={vi.fn()}
          onOpenObservation={vi.fn()}
          onOpenInspection={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Progress note here")).toBeInTheDocument();
    expect(screen.getByText("Inspection note here")).toBeInTheDocument();
    expect(screen.getByText("Observation note here")).toBeInTheDocument();
    expect(screen.getByText("Today was cool")).toBeInTheDocument();
  });
});

describe("FieldDailyReportProjectBlock accordion header", () => {
  it("shows progress percent delta in the collapsed header", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <FieldDailyReportProjectBlock
          project={project}
          reportDate="2026-07-14"
          defaultExpanded={false}
          editable={false}
          currentUserId="user-1"
          onOpenIssue={vi.fn()}
          onOpenObservation={vi.fn()}
          onOpenInspection={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("+1%")).toBeInTheDocument();
    expect(screen.queryByText("14% complete")).not.toBeInTheDocument();
  });

  it("shows activity summary below the project name when collapsed", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <FieldDailyReportProjectBlock
          project={project}
          reportDate="2026-07-14"
          defaultExpanded={false}
          editable={false}
          currentUserId="user-1"
          onOpenIssue={vi.fn()}
          onOpenObservation={vi.fn()}
          onOpenInspection={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Marina Bay Condos")).toBeInTheDocument();
    expect(screen.getByText(/2 inspections/)).toBeInTheDocument();
    expect(screen.getByText(/1 issue reported/)).toBeInTheDocument();
    expect(screen.getByText(/1 other activity item/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Marina Bay Condos/i })).toBeInTheDocument();
  });

  it("does not render an expand control when the project has no activity", () => {
    const idleProject: FieldDailyReportProjectDto = {
      projectId: "p2",
      projectName: "Idle Tower",
      snapshot: {
        ...emptyProjectSnapshot(),
        progress: {
          ...emptyProjectSnapshot().progress,
          pctComplete: 3,
          pctCompleteDelta: 0,
        },
      },
      sectionNotes: [],
      comments: [],
    };

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <FieldDailyReportProjectBlock
          project={idleProject}
          reportDate="2026-07-16"
          defaultExpanded={false}
          editable={false}
          currentUserId="user-1"
          onOpenIssue={vi.fn()}
          onOpenObservation={vi.fn()}
          onOpenInspection={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Idle Tower")).toBeInTheDocument();
    expect(screen.getByText(/0 status changes/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Idle Tower/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Progress")).not.toBeInTheDocument();
  });
});

describe("FieldDailyReportProjectBlock status update photos", () => {
  it("renders a photo strip under expanded status unit entries", async () => {
    const projectWithStatusPhotos: FieldDailyReportProjectDto = {
      ...project,
      snapshot: {
        ...project.snapshot,
        statusUpdates: {
          summaryGroups: [
            {
              id: "status-verified",
              statusLabel: "Install Complete-Verified",
              unitEntries: [
                {
                  locationLabel: "BLDG 1 · L1 · UNIT 118",
                  building: "1",
                  level: "1",
                  unit: "118",
                  scopeName: "Cabinetry",
                  activityLogIds: ["log-1"],
                  statusUpdateAttachments: [
                    {
                      id: "photo-1",
                      storageUrl: "https://example.com/status.jpg",
                      mimeType: "image/jpeg",
                      caption: "Finished install",
                    },
                  ],
                },
              ],
              sourceActivityLogIds: ["log-1"],
            },
          ],
          sourceEvents: [],
        },
      },
    };

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <FieldDailyReportProjectBlock
          project={projectWithStatusPhotos}
          reportDate="2026-07-17"
          sheetMode
          editable={false}
          currentUserId="user-1"
          onOpenIssue={vi.fn()}
          onOpenObservation={vi.fn()}
          onOpenInspection={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    const expandButton = screen.getByRole("button", {
      name: /Expand Install Complete-Verified/i,
    });
    expandButton.click();

    expect(await screen.findByRole("button", { name: "View photo 1" })).toBeInTheDocument();
    const thumb = document.querySelector(".field-note-photo-strip__thumb") as HTMLImageElement | null;
    expect(thumb?.src).toBe("https://example.com/status.jpg");
  });
});

describe("FieldDailyReportProjectBlock status subcontractor pills", () => {
  it("shows a subcontractor pill on every status unit entry", async () => {
    const projectWithStatus: FieldDailyReportProjectDto = {
      ...project,
      snapshot: {
        ...project.snapshot,
        statusUpdates: {
          summaryGroups: [
            {
              id: "status-staging",
              statusLabel: "In Staging",
              unitEntries: [
                {
                  locationLabel: "BLDG 1 · L1 · UNIT 118",
                  scopeName: "Cabinetry",
                  subcontractorLabel: "Cabinet Pros",
                  activityLogIds: ["log-1"],
                },
              ],
              sourceActivityLogIds: ["log-1"],
            },
          ],
          sourceEvents: [],
        },
        teamsOnSite: {
          summaryGroups: [
            {
              id: "team-1",
              subcontractorLabel: "Cabinet Pros",
              unitEntries: [
                {
                  locationLabel: "BLDG 1 · L1 · UNIT 118",
                  scopeName: "Cabinetry",
                  subcontractorLabel: "Cabinet Pros",
                  activityLogIds: ["log-1"],
                },
              ],
              sourceActivityLogIds: ["log-1"],
            },
          ],
        },
      },
    };

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <FieldDailyReportProjectBlock
          project={projectWithStatus}
          reportDate="2026-07-17"
          sheetMode
          editable={false}
          currentUserId="user-1"
          onOpenIssue={vi.fn()}
          onOpenObservation={vi.fn()}
          onOpenInspection={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: /Expand In Staging/i }));
    expect(await screen.findByText("Cabinet Pros")).toBeInTheDocument();
    expect(screen.queryByText("Teams on site")).not.toBeInTheDocument();
  });

  it("shows Unassigned when the unit has no subcontractor label", async () => {
    const projectWithStatus: FieldDailyReportProjectDto = {
      ...project,
      snapshot: {
        ...project.snapshot,
        statusUpdates: {
          summaryGroups: [
            {
              id: "status-staging",
              statusLabel: "In Staging",
              unitEntries: [
                {
                  locationLabel: "BLDG 1 · L1 · UNIT 118",
                  scopeName: "Cabinetry",
                  activityLogIds: ["log-1"],
                },
              ],
              sourceActivityLogIds: ["log-1"],
            },
          ],
          sourceEvents: [],
        },
      },
    };

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <FieldDailyReportProjectBlock
          project={projectWithStatus}
          reportDate="2026-07-17"
          sheetMode
          editable={false}
          currentUserId="user-1"
          onOpenIssue={vi.fn()}
          onOpenObservation={vi.fn()}
          onOpenInspection={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: /Expand In Staging/i }));
    expect(await screen.findByText("Unassigned")).toBeInTheDocument();
  });
});

describe("FieldDailyReportProjectBlock inspection viewer affordance", () => {
  it("shows a tappable card with View inspection when submissionId is present", async () => {
    const onOpenInspection = vi.fn();
    const projectWithInspection: FieldDailyReportProjectDto = {
      ...project,
      snapshot: {
        ...project.snapshot,
        inspections: {
          summaryGroups: [
            {
              id: "insp-fail",
              outcome: "FAIL",
              items: [
                {
                  itemKey: "insp-1",
                  activityLogId: "a1",
                  createdAt: "",
                  headline: "Clear Inspection",
                  locationLabel: "BLDG 1 · L1 · UNIT 119",
                  badge: "FAIL",
                  submissionId: "sub-1",
                  bodyText: "Counter alignment: [Major] Out of tolerance",
                },
              ],
            },
          ],
        },
      },
    };

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <FieldDailyReportProjectBlock
          project={projectWithInspection}
          reportDate="2026-07-17"
          sheetMode
          editable={false}
          currentUserId="user-1"
          onOpenIssue={vi.fn()}
          onOpenObservation={vi.fn()}
          onOpenInspection={onOpenInspection}
        />
      </NextIntlClientProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: /1 unit failed clear inspection/i }));
    const openButton = await screen.findByRole("button", { name: /View inspection: Clear Inspection/i });
    expect(screen.getByText("View inspection")).toBeInTheDocument();
    await userEvent.click(openButton);
    expect(onOpenInspection).toHaveBeenCalledWith("sub-1");
  });
});

describe("FieldDailyReportProjectBlock workforce", () => {
  it("shows daily manpower input in the header summary when editable", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <FieldDailyReportProjectBlock
          project={project}
          reportDate="2026-07-14"
          defaultExpanded={false}
          editable
          currentUserId="user-1"
          onOpenIssue={vi.fn()}
          onOpenObservation={vi.fn()}
          onOpenInspection={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByLabelText("Daily manpower — number of people on site")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update" })).toBeDisabled();
    expect(screen.queryByText("Workforce")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows daily manpower input in sheet mode without a workforce section", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <FieldDailyReportProjectBlock
          project={project}
          reportDate="2026-07-14"
          sheetMode
          editable
          currentUserId="user-1"
          onOpenIssue={vi.fn()}
          onOpenObservation={vi.fn()}
          onOpenInspection={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByLabelText("Daily manpower — number of people on site")).toBeInTheDocument();
    expect(screen.queryByText("Workforce")).not.toBeInTheDocument();
  });

  it("saves daily manpower via workforce API when Update is clicked", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        dailyManpower: 12,
        dailyManpowerMeta: {
          setAt: "2026-07-14T12:00:00.000Z",
          setBy: {
            id: "user-1",
            name: "Test User",
            roleCode: "ADMIN",
            isInstallManager: false,
          },
        },
        reportDate: "2026-07-14",
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const onDailyManpowerSaved = vi.fn();

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <FieldDailyReportProjectBlock
          project={project}
          reportDate="2026-07-14"
          sheetMode
          editable
          onDailyManpowerSaved={onDailyManpowerSaved}
          currentUserId="user-1"
          onOpenIssue={vi.fn()}
          onOpenObservation={vi.fn()}
          onOpenInspection={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    await userEvent.type(screen.getByLabelText("Daily manpower — number of people on site"), "12");
    const updateButton = screen.getByRole("button", { name: "Update" });
    expect(updateButton).toBeEnabled();
    await userEvent.click(updateButton);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/p1/field-daily/workforce",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ reportDate: "2026-07-14", dailyManpower: 12 }),
      }),
    );
    expect(onDailyManpowerSaved).toHaveBeenCalledWith({
      dailyManpower: 12,
      dailyManpowerMeta: expect.objectContaining({
        setAt: "2026-07-14T12:00:00.000Z",
        setBy: expect.objectContaining({ id: "user-1" }),
      }),
    });
    vi.unstubAllGlobals();
  });

  it("shows missing-data warning below the activity summary in the header", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <FieldDailyReportProjectBlock
          project={project}
          reportDate="2026-07-14"
          defaultExpanded={false}
          editable
          currentUserId="user-1"
          onOpenIssue={vi.fn()}
          onOpenObservation={vi.fn()}
          onOpenInspection={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getAllByText("Missing data: daily manpower info")).toHaveLength(1);
    expect(screen.queryByText(/Daily manpower:/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Daily manpower — number of people on site")).toBeInTheDocument();
  });

  it("prefills daily manpower in the header input when saved", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <FieldDailyReportProjectBlock
          project={{
            ...project,
            dailyManpower: 12,
          }}
          reportDate="2026-07-14"
          defaultExpanded={false}
          editable
          currentUserId="user-1"
          onOpenIssue={vi.fn()}
          onOpenObservation={vi.fn()}
          onOpenInspection={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByLabelText("Daily manpower — number of people on site")).toHaveValue(12);
    expect(screen.queryByText("Daily manpower: 12")).not.toBeInTheDocument();
    expect(screen.queryByText("Missing data: daily manpower info")).not.toBeInTheDocument();
  });

  it("renders saved daily manpower in read-only mode", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <FieldDailyReportProjectBlock
          project={{
            ...project,
            dailyManpower: 6,
          }}
          reportDate="2026-07-14"
          sheetMode
          editable={false}
          currentUserId="user-1"
          onOpenIssue={vi.fn()}
          onOpenObservation={vi.fn()}
          onOpenInspection={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("6 people on site")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows who set daily manpower when metadata is present", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <FieldDailyReportProjectBlock
          project={{
            ...project,
            dailyManpower: 6,
            dailyManpowerMeta: {
              setAt: "2026-07-14T12:00:00.000Z",
              setBy: {
                id: "im-1",
                name: "Jordan Lee",
                roleCode: "INSTALL_MANAGER",
                isInstallManager: true,
              },
            },
          }}
          reportDate="2026-07-14"
          sheetMode
          editable={false}
          currentUserId="user-1"
          onOpenIssue={vi.fn()}
          onOpenObservation={vi.fn()}
          onOpenInspection={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Set by:")).toBeInTheDocument();
    expect(screen.getByText("Jordan Lee")).toBeInTheDocument();
    expect(screen.getAllByText("Install Manager").length).toBeGreaterThanOrEqual(1);
  });
});
