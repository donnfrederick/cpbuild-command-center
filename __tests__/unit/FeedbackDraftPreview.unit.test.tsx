import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import en from "../../messages/en.json";
import { FeedbackDraftPreview } from "@/components/feedback/FeedbackDraftPreview";
import type { AssistFinalReport } from "@/lib/feedback-assist-schema";

const BASE_REPORT: AssistFinalReport = {
  kind: "BUG",
  suggestedTitle: "Filter button crashes",
  suggestedDescription: "When I click Filter on Projects, the page goes blank.",
  summary: "Crash on filter",
  proactivePrompts: ["Add browser version"],
  imagePrompt: "Attach a screenshot of the blank page",
};

function renderPreview(
  props: Partial<React.ComponentProps<typeof FeedbackDraftPreview>> = {},
) {
  const onApply = props.onApply ?? vi.fn();
  const onCalibrate = props.onCalibrate ?? vi.fn();
  const onClose = props.onClose ?? vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ feedback: en.feedback, common: en.common }}>
      <FeedbackDraftPreview
        report={BASE_REPORT}
        calibrationRounds={0}
        calibrating={false}
        onApply={onApply}
        onCalibrate={onCalibrate}
        onClose={onClose}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return { onApply, onCalibrate, onClose };
}

describe("<FeedbackDraftPreview />", () => {
  it("renders draft title and description", () => {
    renderPreview();
    expect(screen.getByText("Filter button crashes")).toBeInTheDocument();
    expect(
      screen.getByText("When I click Filter on Projects, the page goes blank."),
    ).toBeInTheDocument();
  });

  it("shows proactive prompt chips and image prompt", () => {
    renderPreview();
    expect(screen.getByText("Add browser version")).toBeInTheDocument();
    expect(screen.getByText("Attach a screenshot of the blank page")).toBeInTheDocument();
    expect(screen.getByText(en.feedback.attachScreenshot)).toBeInTheDocument();
  });

  it("calls onApply with report and null screenshot when Apply is clicked", async () => {
    const user = userEvent.setup();
    const { onApply } = renderPreview();
    await user.click(screen.getByRole("button", { name: en.feedback.ai.applyDraft }));
    expect(onApply).toHaveBeenCalledWith(BASE_REPORT, null, null);
  });

  it("opens calibrate panel and submits instruction", async () => {
    const user = userEvent.setup();
    const { onCalibrate } = renderPreview();
    await user.click(screen.getByRole("button", { name: en.feedback.ai.calibrate }));
    const textarea = screen.getByLabelText(en.feedback.ai.calibratePlaceholder);
    await user.type(textarea, "Make it more concise");
    await user.click(screen.getByRole("button", { name: en.feedback.ai.calibrateSubmit }));
    expect(onCalibrate).toHaveBeenCalledWith("Make it more concise");
  });

  it("shows calibrated badge when calibrationRounds > 0", () => {
    renderPreview({ calibrationRounds: 2 });
    expect(screen.getByText(en.feedback.ai.calibratedBadge)).toBeInTheDocument();
  });

  it("shows calibrating status when calibrating prop is true", () => {
    renderPreview({ calibrating: true });
    expect(screen.getByText(en.feedback.ai.calibrating)).toBeInTheDocument();
  });
});
