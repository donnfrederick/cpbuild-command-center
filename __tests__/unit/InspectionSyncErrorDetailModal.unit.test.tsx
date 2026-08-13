import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { InspectionSyncErrorDetailModal } from "@/components/projects/inspections/InspectionSyncErrorDetailModal";
import enMessages from "@/messages/en.json";

const syncErrors = [
  {
    attempt: 1,
    message: "calibratedAgainstSubmissionId must be a valid cuid",
    httpStatus: 422,
    errorKind: "retriable" as const,
    recordedAt: "2026-06-25T10:00:00.000Z",
  },
  {
    attempt: 2,
    message: "HTTP 500: Internal Server Error",
    httpStatus: 500,
    errorKind: "retriable" as const,
    recordedAt: "2026-06-25T10:05:00.000Z",
  },
  {
    attempt: 3,
    message: "Could not reach the server after 3 tries.",
    errorKind: "exhausted" as const,
    recordedAt: "2026-06-25T10:10:00.000Z",
  },
];

function renderModal(onClose = vi.fn()) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <InspectionSyncErrorDetailModal
        metadata={{
          formName: "Calibration",
          category: "CALIBRATION_INSPECTION",
          outcome: "PASS",
          offlineMutationId: "local-abc",
          syncErrors,
        }}
        createdAt="2026-06-25T10:10:00.000Z"
        onClose={onClose}
      />
    </NextIntlClientProvider>,
  );
}

describe("InspectionSyncErrorDetailModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders attempts latest-first with attempt 3 expanded by default", () => {
    renderModal();
    const buttons = screen.getAllByRole("button").filter((el) => el.textContent?.includes("Attempt"));
    expect(buttons[0]).toHaveTextContent("Attempt 3");
    expect(buttons[0]).toHaveAttribute("aria-expanded", "true");
    expect(buttons[2]).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Could not reach the server after 3 tries.")).toBeVisible();
  });

  it("expands older attempt to show full message", async () => {
    const user = userEvent.setup();
    renderModal();
    const attempt1 = screen.getByRole("button", { name: /Attempt 1/i });
    await user.click(attempt1);
    expect(screen.getByText("calibratedAgainstSubmissionId must be a valid cuid")).toBeVisible();
  });

  it("calls onClose when close button is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderModal(onClose);
    await user.click(screen.getByRole("button", { name: enMessages.activityLog.syncErrorDetail.closeAria }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows translated unknown form label when formName is missing", () => {
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <InspectionSyncErrorDetailModal
          metadata={{ syncErrors, category: "CLEAR_INSPECTION" }}
          createdAt="2026-06-25T10:10:00.000Z"
          onClose={vi.fn()}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("dialog")).toHaveTextContent(enMessages.activityLog.unknownFormName);
  });
});
