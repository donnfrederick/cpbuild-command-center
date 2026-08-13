import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { DailyReportHubPreview } from "@/components/reports/DailyReportHubPreview";
import type { FieldDailyReportProjectSnapshot } from "@/lib/field-daily-report/types";

const messages = {
  fieldDailyReport: {
    hubPreviewStatusChanges: "{count, plural, one {# status change} other {# status changes}}",
    hubPreviewInspections: "{count, plural, one {# inspection} other {# inspections}}",
    hubPreviewIssuesReported: "{count, plural, one {# issue reported} other {# issues reported}}",
    hubPreviewOtherActivity: "{count, plural, one {# other activity item} other {# other activity items}}",
  },
};

const snapshot: FieldDailyReportProjectSnapshot = {
  progress: {
    statusChangeCount: 5,
    installCompleteCount: 3,
    installCompleteQtyToday: 3,
    inspectionSubmittedCount: 2,
    issuesCreatedCount: 1,
    issuesResolvedCount: 0,
    observationsCreatedCount: 0,
  },
  statusUpdates: {
    summaryGroups: [
      {
        id: "status-0",
        statusLabel: "Install: In Progress",
        unitEntries: Array.from({ length: 47 }, (_, i) => ({
          locationLabel: `Unit ${i + 1}`,
          activityLogIds: ["bulk-1"],
        })),
        sourceActivityLogIds: ["bulk-1"],
      },
    ],
    sourceEvents: [],
  },
  subcontractors: { summaryGroups: [] },
  teamsOnSite: { summaryGroups: [] },
  inspections: { summaryGroups: [] },
  issues: { items: [] },
  observations: { items: [] },
};

describe("DailyReportHubPreview", () => {
  it("renders status, inspections, and issues without percent complete", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DailyReportHubPreview snapshot={snapshot} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText(/47 status changes/)).toBeInTheDocument();
    expect(screen.getByText(/2 inspections/)).toBeInTheDocument();
    expect(screen.getByText(/1 issue reported/)).toBeInTheDocument();
    expect(screen.queryByText(/7%/)).not.toBeInTheDocument();
  });
});
