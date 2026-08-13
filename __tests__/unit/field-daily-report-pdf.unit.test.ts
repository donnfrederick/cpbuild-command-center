import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildFieldDailyReportExportHtml } from "@/lib/pdf/field-daily-report-pdf";
import { buildFieldDailyReportPdfPayload, fieldDailyReportPdfFilename } from "@/lib/field-daily-report/pdf-export";
import type { FieldDailyReportPdfLabels } from "@/lib/field-daily-report/pdf-export";
import type { FieldDailyReportProjectDto } from "@/lib/field-daily-report/types";

const EXPORT_LABELS: FieldDailyReportPdfLabels = {
  documentTitle: "Field Daily Report",
  reportDateHeading: "Report date",
  exportedAtHeading: "Exported",
  filterHeading: "Filters",
  projectsHeading: "projects",
  sectionProgress: "Progress",
  sectionStatus: "Status updates",
  sectionTeamsOnSite: "Teams on site",
  sectionSubcontractors: "Subcontractors",
  sectionInspections: "Inspections",
  sectionIssues: "Issues",
  sectionObservations: "Observations",
  sectionWorkforce: "Workforce",
  sectionOther: "Other",
  notesLabel: "Your notes",
  workforceDailyManpowerLabel: "Daily manpower",
  missingDailyManpowerAlert: "Missing data: daily manpower info",
  workforceManpowerSummary: "{count} people on site",
  workforceDailyManpowerHeader: "Daily manpower: {count}",
  progressDeltaOnly: "+{delta}%",
  progressCurrentPct: "{pct}% complete",
  progressUnavailable: "Unavailable",
  noFieldActivity: "No activity for this day.",
  generatedAt: "Generated",
  confidentialFooter: "CP Build — Internal use only",
  locationProjectLevel: "Project level",
  previewLabels: {
    statusChanges: "0 status changes",
    inspections: "2 inspections",
    issuesReported: "1 issue reported",
    otherActivity: "0 other activity items",
  },
};

const activeProject: FieldDailyReportProjectDto = {
  projectId: "p1",
  projectName: "Marina Bay Condos",
  generatedAt: "2026-07-16T18:30:00.000Z",
  snapshot: {
    progress: {
      statusChangeCount: 0,
      installCompleteCount: 0,
      installCompleteQtyToday: 0,
      inspectionSubmittedCount: 2,
      issuesCreatedCount: 1,
      issuesResolvedCount: 0,
      observationsCreatedCount: 0,
      pctComplete: 7,
      pctCompleteDelta: 1,
    },
    statusUpdates: { summaryGroups: [], sourceEvents: [] },
    subcontractors: { summaryGroups: [] },
    teamsOnSite: { summaryGroups: [] },
    inspections: {
      summaryGroups: [
        {
          id: "insp-fail",
          outcome: "FAIL",
          items: [
            {
              itemKey: "i1",
              activityLogId: "a1",
              createdAt: "",
              headline: "Clear inspection",
              locationLabel: "Unit 101",
            },
          ],
        },
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
        },
      ],
    },
    observations: { items: [] },
  },
  sectionNotes: [],
  comments: [
    { sectionKey: "progress", itemKey: "", body: "Progress note here", updatedAt: "2026-07-16T12:00:00.000Z" },
    { sectionKey: "inspections", itemKey: "", body: "Inspection note here", updatedAt: "2026-07-16T12:00:00.000Z" },
  ],
};

function buildPayload(projects: FieldDailyReportProjectDto[] = [activeProject]) {
  return buildFieldDailyReportPdfPayload({
    reportDate: "2026-07-16",
    locale: "en",
    labels: EXPORT_LABELS,
    projects,
    filterSummary: "",
    exportedAt: new Date("2026-07-16T20:00:00.000Z"),
  });
}

describe("buildFieldDailyReportPdfPayload", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-16T20:00:00.000Z"));
  });

  it("maps project sections, progress line, and filter summary", () => {
    const payload = buildPayload();
    expect(payload.reportDate).toBe("2026-07-16");
    expect(payload.filterSummary).toBe("");
    expect(payload.projects).toHaveLength(1);
    expect(payload.projects[0].projectName).toBe("Marina Bay Condos");
    expect(payload.projects[0].hasFieldActivity).toBe(true);
    expect(payload.projects[0].progressLine).toBeUndefined();
    const progressSection = payload.projects[0].sections.find((s) => s.title === "Progress");
    expect(progressSection?.progressDetail?.pct).toContain("7%");
    expect(progressSection?.progressDetail?.delta).toContain("+1%");
    expect(payload.projects[0].exportedAtLabel).toContain("Exported");
    expect(payload.projects[0].reportDateDisplay).toBe("Jul 16, 2026");
    expect(payload.projects[0].sections.some((s) => s.title === "Inspections")).toBe(true);
    expect(payload.projects[0].sections.some((s) => s.title === "Issues")).toBe(true);
    expect(payload.projects[0].sections.some((s) => s.title === "Progress")).toBe(true);
  });

  it("includes every status-change unit entry even when the on-screen group would be collapsed", () => {
    const statusEntries = Array.from({ length: 12 }, (_, index) => ({
      locationLabel: `Building A · Level 2 · Unit ${index + 1}`,
      scopeName: "Cabinets",
      subcontractorLabel: "Premier Cabinets",
      activityLogIds: [`log-${index}`],
    }));

    const project: FieldDailyReportProjectDto = {
      ...activeProject,
      snapshot: {
        ...activeProject.snapshot,
        progress: {
          ...activeProject.snapshot.progress,
          statusChangeCount: 12,
        },
        statusUpdates: {
          summaryGroups: [
            {
              id: "status-1",
              statusLabel: "Install: In Progress",
              unitEntries: statusEntries,
              sourceActivityLogIds: statusEntries.flatMap((e) => e.activityLogIds),
            },
          ],
          sourceEvents: [],
        },
      },
    };

    const payload = buildPayload([project]);
    const statusSection = payload.projects[0].sections.find((s) => s.title === "Status updates");
    expect(statusSection?.groups[0]?.lines).toHaveLength(12);
    expect(statusSection?.groups[0]?.lines[0]?.text).toContain("Unit 1");
    expect(statusSection?.groups[0]?.lines[0]?.text).toContain("Cabinets");
    expect(statusSection?.groups[0]?.lines[0]?.text).toContain("Premier Cabinets");

    const html = buildFieldDailyReportExportHtml(payload);
    for (let i = 1; i <= 12; i += 1) {
      expect(html).toContain(`Unit ${i}`);
    }
  });
});

describe("fieldDailyReportPdfFilename", () => {
  it("slugifies the project name for a stable download filename", () => {
    expect(fieldDailyReportPdfFilename("Marina Bay Condos", "2026-07-16")).toBe(
      "field-daily-report-marina-bay-condos-2026-07-16.pdf",
    );
  });
});

describe("buildFieldDailyReportExportHtml", () => {
  it("renders cover metadata and project blocks from the payload", () => {
    const html = buildFieldDailyReportExportHtml(buildPayload());

    expect(html).toContain("Field Daily Report");
    expect(html).toContain("Marina Bay Condos");
    expect(html).not.toContain("projects</span>");
    expect(html).not.toMatch(/cover-sub/);
    expect(html).toContain("project-date");
    expect(html).toContain("Jul 16, 2026");
    expect(html).not.toContain("Report date:");
    expect(html).toContain("Exported:");
    expect(html).toContain("progress-delta");
    expect(html).toContain("progress-pct");
    expect(html).toContain("Progress");
    expect(html).not.toContain("progress-line");
    expect(html).toContain("Inspections");
    expect(html).toContain("Progress");
    expect(html).toContain("Trade materials in the way");
    expect(html).toContain("Progress note here");
    expect(html).toContain("CP Build — Internal use only");
  });

  it("renders status-update photos in the status section when media is provided", () => {
    const projectWithStatusPhoto: FieldDailyReportProjectDto = {
      ...activeProject,
      snapshot: {
        ...activeProject.snapshot,
        statusUpdates: {
          summaryGroups: [
            {
              id: "status-1",
              statusLabel: "Install Complete-Verified",
              scopeStage: "INSTALL",
              scopeStatus: "COMPLETE",
              unitEntries: [
                {
                  locationLabel: "BLDG 1 · L1 · UNIT 118",
                  building: "1",
                  level: "1",
                  unit: "118",
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

    const payload = buildFieldDailyReportPdfPayload({
      reportDate: "2026-07-16",
      locale: "en",
      labels: EXPORT_LABELS,
      projects: [projectWithStatusPhoto],
      filterSummary: "",
      exportedAt: new Date("2026-07-16T20:00:00.000Z"),
      media: {
        statusPhotoRows: [
          {
            storageUrl: "https://example.com/status.jpg",
            storageKey: "status/118.jpg",
            mimeType: "image/jpeg",
            caption: "Finished install",
            unitPhotoUnitRef: "1|1|118",
            unitPhotoSourceLabel: "Cabinetry · Install Complete-Verified",
          },
        ],
        inspectionImagesBySubmissionId: new Map(),
      },
    });

    const statusSection = payload.projects[0].sections.find((s) => s.title === "Status updates");
    expect(statusSection?.groups[0]?.lines[0]?.images).toHaveLength(1);
    expect(statusSection?.groups[0]?.headingStyle?.backgroundColor).toBe("#15803D");
    expect(statusSection?.groups[0]?.headingStyle?.color).toBe("#FFFFFF");

    const cache = new Map([["status/118.jpg", "data:image/jpeg;base64,status"]]);
    const html = buildFieldDailyReportExportHtml(payload, cache);
    expect(html).toContain("<ul class=\"group-lines\">");
    expect(html).toContain("photo-grid--1");
    expect(html).toContain("group-heading--badge");
    expect(html).toContain("background-color: #15803D");
    expect(html).toContain("BLDG 1 · L1 · UNIT 118");
    expect(html).toContain("data:image/jpeg;base64,status");
    expect(html).toContain("Finished install");
  });

  it("uses a multi-column photo grid when a status entry has two or more photos", () => {
    const projectWithTwoPhotos: FieldDailyReportProjectDto = {
      ...activeProject,
      snapshot: {
        ...activeProject.snapshot,
        statusUpdates: {
          summaryGroups: [
            {
              id: "status-1",
              statusLabel: "Install Complete-Verified",
              scopeStage: "INSTALL",
              scopeStatus: "COMPLETE",
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
                      id: "p1",
                      storageUrl: "https://example.com/one.jpg",
                      storageKey: "one.jpg",
                      mimeType: "image/jpeg",
                      caption: null,
                    },
                    {
                      id: "p2",
                      storageUrl: "https://example.com/two.jpg",
                      storageKey: "two.jpg",
                      mimeType: "image/jpeg",
                      caption: null,
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

    const payload = buildFieldDailyReportPdfPayload({
      reportDate: "2026-07-16",
      locale: "en",
      labels: EXPORT_LABELS,
      projects: [projectWithTwoPhotos],
      filterSummary: "",
      exportedAt: new Date("2026-07-16T20:00:00.000Z"),
      media: { statusPhotoRows: [], inspectionImagesBySubmissionId: new Map() },
    });

    const cache = new Map([
      ["one.jpg", "data:image/jpeg;base64,one"],
      ["two.jpg", "data:image/jpeg;base64,two"],
    ]);
    const html = buildFieldDailyReportExportHtml(payload, cache);
    expect(html).toContain("photo-grid--2");
    expect(html).not.toContain("status-entry-grid");
  });

  it("renders embedded photos when the image cache is populated", () => {
    const projectWithPhoto: FieldDailyReportProjectDto = {
      ...activeProject,
      snapshot: {
        ...activeProject.snapshot,
        issues: {
          items: [
            {
              itemKey: "issue-1",
              activityLogId: "a3",
              createdAt: "",
              headline: "Trade materials in the way",
              locationLabel: "TOP1U",
              badge: "BLOCKING",
              issueRecord: {
                id: "issue-1",
                issueType: "OTHER",
                responsibleParty: "GC",
                isBlockingWork: true,
                status: "OPEN",
                shortDescription: "Trade materials in the way",
                notes: null,
                createdAt: "",
                resolvedAt: null,
                resolutionNote: null,
                unitRef: null,
                buildPhaseTag: null,
                areaTag: null,
                bulkGroupId: null,
                createdBy: { id: "u1", name: "Pat", email: "pat@example.com" },
                resolvedBy: null,
                attachments: [
                  {
                    id: "att-1",
                    storageUrl: "https://example.com/photo.jpg",
                    storageKey: "issues/photo.jpg",
                    mimeType: "image/jpeg",
                    fileSizeBytes: 100,
                    caption: "Blocked aisle",
                    transcriptStatus: "NONE",
                    transcriptOriginal: null,
                  },
                ],
                scopeTags: [],
                subScopeTags: [],
                _count: { comments: 0 },
              },
            },
          ],
        },
      },
    };

    const payload = buildFieldDailyReportPdfPayload({
      reportDate: "2026-07-16",
      locale: "en",
      labels: EXPORT_LABELS,
      projects: [projectWithPhoto],
      filterSummary: "",
      exportedAt: new Date("2026-07-16T20:00:00.000Z"),
      media: {
        statusPhotoRows: [],
        inspectionImagesBySubmissionId: new Map(),
      },
    });

    const issueSection = payload.projects[0].sections.find((s) => s.title === "Issues");
    expect(issueSection?.items[0]?.images).toHaveLength(1);

    const cache = new Map([["issues/photo.jpg", "data:image/jpeg;base64,abc"]]);
    const html = buildFieldDailyReportExportHtml(payload, cache);
    expect(html).toContain("photo-grid");
    expect(html).toContain("data:image/jpeg;base64,abc");
    expect(html).toContain("Blocked aisle");
  });

  it("renders inspection deficiency detail lines and embedded photos", () => {
    const projectWithInspection: FieldDailyReportProjectDto = {
      ...activeProject,
      snapshot: {
        ...activeProject.snapshot,
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
                  bodyText: "Counter alignment: [Major] Out of tolerance\nInspector notes: Revisit seam",
                  inspectionDetailBlocks: [
                    {
                      heading: "Counter alignment",
                      lines: ["[Major] Out of tolerance"],
                      attachments: [
                        {
                          id: "photo-1",
                          storageUrl: "https://example.com/deficiency.jpg",
                          storageKey: "inspections/deficiency.jpg",
                          mimeType: "image/jpeg",
                          caption: "Counter alignment",
                        },
                      ],
                    },
                    {
                      heading: "Inspector notes",
                      lines: ["Revisit seam"],
                    },
                  ],
                  attachments: [
                    {
                      id: "photo-1",
                      storageUrl: "https://example.com/deficiency.jpg",
                      storageKey: "inspections/deficiency.jpg",
                      mimeType: "image/jpeg",
                      caption: null,
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    };

    const payload = buildFieldDailyReportPdfPayload({
      reportDate: "2026-07-16",
      locale: "en",
      labels: EXPORT_LABELS,
      projects: [projectWithInspection],
      filterSummary: "",
      exportedAt: new Date("2026-07-16T20:00:00.000Z"),
      media: {
        statusPhotoRows: [],
        inspectionImagesBySubmissionId: new Map([
          [
            "sub-1",
            [
              {
                storageUrl: "https://example.com/deficiency.jpg",
                storageKey: "inspections/deficiency.jpg",
                mimeType: "image/jpeg",
                caption: null,
              },
            ],
          ],
        ]),
      },
    });

    const inspectionSection = payload.projects[0].sections.find((s) => s.title === "Inspections");
    const line = inspectionSection?.groups[0]?.lines[0];
    expect(line?.text).toContain("Clear Inspection");
    expect(line?.text).toContain("BLDG 1 · L1 · UNIT 119");
    expect(line?.text).toContain("FAIL");
    expect(line?.detailBlocks).toHaveLength(2);
    expect(line?.detailBlocks?.[0]?.heading).toBe("Counter alignment");
    expect(line?.detailBlocks?.[0]?.lines[0]).toContain("Out of tolerance");
    expect(line?.detailBlocks?.[0]?.images).toHaveLength(1);
    expect(line?.detailBlocks?.[1]?.heading).toBe("Inspector notes");
    expect(line?.images).toBeUndefined();

    const cache = new Map([["inspections/deficiency.jpg", "data:image/jpeg;base64,def"]]);
    const html = buildFieldDailyReportExportHtml(payload, cache);
    expect(html).toContain("line-detail-block");
    expect(html).toContain("line-detail-text");
    expect(html).toContain("photo-grid--compact");
    expect(html).toContain("Counter alignment");
    expect(html).toContain("Out of tolerance");
    expect(html).toContain("Revisit seam");
    expect(html).toContain("photo-grid");
    expect(html).toContain("background-color: #FEE2E2");
    expect(html).toContain("data:image/jpeg;base64,def");
    expect(html.match(/<p class="photo-caption">/g)?.length ?? 0).toBe(0);
  });

  it("includes full issue detail lines and a three-column photo grid", () => {
    const projectWithIssueDetails: FieldDailyReportProjectDto = {
      ...activeProject,
      snapshot: {
        ...activeProject.snapshot,
        issues: {
          items: [
            {
              itemKey: "issue-1",
              activityLogId: "a3",
              createdAt: "",
              headline: "Trade materials in the way",
              locationLabel: "TOP1U",
              badge: "BLOCKING",
              issueRecord: {
                id: "issue-1",
                issueType: "OTHER",
                responsibleParty: "SUBCONTRACTOR",
                isBlockingWork: true,
                status: "OPEN",
                shortDescription: "Trade materials in the way",
                notes: "Materials stacked in the hallway blocking access.",
                createdAt: "",
                resolvedAt: null,
                resolutionNote: null,
                unitRef: null,
                buildPhaseTag: null,
                areaTag: null,
                bulkGroupId: null,
                createdBy: { id: "u1", name: "Pat", email: "pat@example.com" },
                resolvedBy: null,
                attachments: [],
                scopeTags: [{ row: { id: "r1", scopeType: { name: "Countertops" } } }],
                subScopeTags: [],
                _count: { comments: 0 },
              },
            },
          ],
        },
      },
    };

    const payload = buildPayload([projectWithIssueDetails]);
    const issueSection = payload.projects[0].sections.find((s) => s.title === "Issues");
    expect(issueSection?.items[0]?.detailLines).toEqual(
      expect.arrayContaining([
        "Type: Other",
        "Blocking work",
        "Scopes: Countertops",
        "Responsible: SUBCONTRACTOR",
        "Materials stacked in the hallway blocking access.",
      ]),
    );

    const html = buildFieldDailyReportExportHtml(payload);
    expect(html).toContain("Materials stacked in the hallway blocking access.");
    expect(html).toContain("item-detail");
  });

  it("includes workforce section and missing-data alert when daily manpower is unset", () => {
    const payload = buildPayload([activeProject]);
    const workforceSection = payload.projects[0].sections.find((s) => s.title === "Workforce");
    expect(workforceSection?.detailLines).toEqual(["Missing data: daily manpower info"]);
    expect(payload.projects[0].workforceManpowerHeaderLabel).toBe(
      "Missing data: daily manpower info",
    );
    expect(payload.projects[0].workforceManpowerHeaderIsMissing).toBe(true);
    expect(payload.projects[0].missingDataAlerts).toBeUndefined();

    const html = buildFieldDailyReportExportHtml(payload);
    expect(html).toContain("Missing data: daily manpower info");
    expect(html).toContain("workforce-manpower-header--missing");
    expect(html).not.toContain('class="missing-data-alert"');
  });

  it("includes workforce headcount when saved on the report", () => {
    const payload = buildPayload([
      {
        ...activeProject,
        dailyManpower: 8,
      },
    ]);
    const workforceSection = payload.projects[0].sections.find((s) => s.title === "Workforce");
    expect(workforceSection?.detailLines).toEqual(["8 people on site"]);
    expect(payload.projects[0].workforceManpowerHeaderLabel).toBe("Daily manpower: 8");
    expect(payload.projects[0].workforceManpowerHeaderIsMissing).toBe(false);
    expect(payload.projects[0].missingDataAlerts).toBeUndefined();

    const html = buildFieldDailyReportExportHtml(payload);
    expect(html).toContain('class="workforce-manpower-header">Daily manpower: 8</p>');
    expect(html).toContain("8 people on site");
  });

  it("formats workforce summary from simple PDF templates rather than ICU plural strings", () => {
    const payload = buildFieldDailyReportPdfPayload({
      reportDate: "2026-07-16",
      locale: "en",
      labels: {
        ...EXPORT_LABELS,
        workforceManpowerSummary:
          "{count, plural, one {# person on site} other {# people on site}}",
      },
      projects: [{ ...activeProject, dailyManpower: 3 }],
      filterSummary: "",
      exportedAt: new Date("2026-07-16T20:00:00.000Z"),
    });
    const workforceSection = payload.projects[0].sections.find((s) => s.title === "Workforce");
    expect(workforceSection?.detailLines?.[0]).not.toContain("NaN");
  });
});
