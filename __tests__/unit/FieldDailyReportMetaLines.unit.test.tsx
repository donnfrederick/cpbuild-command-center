import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { FieldDailyReportMetaLines } from "@/components/reports/FieldDailyReportMetaLines";

const messages = {
  fieldDailyReport: {
    generatedManual: "Generated",
    generatedScheduled: "Auto-generated",
    reportLastUpdated: "Last updated {time}",
    reportActivityThrough: "Activity through {time}",
  },
};

describe("FieldDailyReportMetaLines", () => {
  it("renders last updated and activity through timestamps", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <FieldDailyReportMetaLines
          generatedAt="2026-07-14T18:49:54.000Z"
          activityThrough="2026-07-14T18:49:54.000Z"
          trigger="MANUAL"
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText(/Last updated/)).toBeInTheDocument();
    expect(screen.getByText(/Activity through/)).toBeInTheDocument();
  });
});
