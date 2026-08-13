import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import React from "react";
import en from "../../messages/en.json";
import { FeedbackAssistChat } from "@/components/feedback/FeedbackAssistChat";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function renderChat(props: Partial<React.ComponentProps<typeof FeedbackAssistChat>> = {}) {
  const onFinalReport = props.onFinalReport ?? vi.fn();
  const onCancel = props.onCancel ?? vi.fn();
  const handle = render(
    <NextIntlClientProvider locale="en" messages={{ feedback: en.feedback, common: en.common }}>
      <FeedbackAssistChat
        sessionId="sess-test"
        feedbackType="BUG"
        initialTitle=""
        initialDescription="The Filter button crashes the Projects page."
        pageUrl="/en/projects"
        onFinalReport={onFinalReport}
        onCancel={onCancel}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return { ...handle, onFinalReport, onCancel };
}

function questionResponse(overrides: Partial<{ optionsCount: number; allowCustom: boolean }> = {}) {
  const optionsCount = overrides.optionsCount ?? 2;
  return {
    ok: true,
    status: 200,
    json: async () => ({
      kind: "question",
      question: {
        id: "q1",
        text: "What were you trying to do?",
        options: Array.from({ length: optionsCount }, (_, i) => ({
          id: `opt-${i}`,
          label: `Option ${i}`,
        })),
        allowCustom: overrides.allowCustom ?? true,
      },
      turnNumber: 1,
      remainingTurns: 4,
    }),
  };
}

describe("<FeedbackAssistChat />", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fires the first assistant turn on mount and renders the question", async () => {
    mockFetch.mockResolvedValueOnce(questionResponse());
    renderChat();

    await waitFor(() => {
      expect(screen.getByText("What were you trying to do?")).toBeInTheDocument();
    });
    expect(screen.getByText("Option 0")).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/feedback/assist",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("sends the user's selected option and renders the next question", async () => {
    mockFetch
      .mockResolvedValueOnce(questionResponse())
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          kind: "question",
          question: {
            id: "q2",
            text: "When did it first happen?",
            options: [{ id: "today", label: "Today" }],
            allowCustom: false,
          },
          turnNumber: 2,
          remainingTurns: 3,
        }),
      });

    renderChat();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText("Option 0")).toBeInTheDocument());

    await user.click(screen.getByText("Option 0"));
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText("When did it first happen?")).toBeInTheDocument();
    });

    const secondCallBody = JSON.parse(
      (mockFetch.mock.calls[1][1] as { body: string }).body,
    );
    expect(secondCallBody.transcript).toHaveLength(2);
    expect(secondCallBody.transcript[1]).toMatchObject({
      role: "user",
      questionId: "q1",
      selectedOptionIds: ["opt-0"],
    });
  });

  it("emits onFinalReport when the AI returns a final_report", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        kind: "final_report",
        report: {
          kind: "BUG",
          suggestedTitle: "Filter crashes page",
          suggestedDescription: "Steps:\n1. Open Projects\n2. Click Filter",
          summary: "Filter button crashes.",
        },
        turnNumber: 1,
      }),
    });

    const { onFinalReport } = renderChat();

    await waitFor(() => {
      expect(onFinalReport).toHaveBeenCalledTimes(1);
    });
    const arg = onFinalReport.mock.calls[0][0] as {
      report: { kind: string; suggestedTitle: string };
    };
    expect(arg.report.kind).toBe("BUG");
    expect(arg.report.suggestedTitle).toBe("Filter crashes page");
  });

  it("shows the rate-limit message when the server returns 429", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ error: "RATE_LIMITED" }),
    });
    renderChat();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        en.feedback.ai.rateLimited,
      );
    });
  });

  it("calls onCancel when the user hits Cancel", async () => {
    mockFetch.mockResolvedValueOnce(questionResponse());
    const { onCancel } = renderChat();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText("Option 0")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: en.feedback.ai.cancelAssist }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("renders a seeded transcript without firing an initial POST", async () => {
    const seededQuestion = {
      id: "seed-q",
      text: "Was this the expected Save behaviour?",
      options: [
        { id: "yes", label: "Yes" },
        { id: "no", label: "No" },
      ],
      allowCustom: false,
    };
    renderChat({
      initialTranscript: [{ role: "assistant", question: seededQuestion }],
      initialQuestion: seededQuestion,
      initialRemainingTurns: 4,
    });

    expect(
      screen.getByText("Was this the expected Save behaviour?"),
    ).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("forwards videoRef on subsequent POSTs when seeded with a recording", async () => {
    const seededQuestion = {
      id: "seed-q",
      text: "What did you expect instead?",
      options: [{ id: "ok", label: "OK" }],
      allowCustom: false,
    };
    const videoRef = {
      fileUri: "https://g/files/vid",
      mimeType: "video/webm",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        kind: "final_report",
        report: {
          kind: "BUG",
          suggestedTitle: "T",
          suggestedDescription: "D",
          summary: "S",
        },
        turnNumber: 2,
        remainingTurns: 3,
      }),
    });

    renderChat({
      initialTranscript: [{ role: "assistant", question: seededQuestion }],
      initialQuestion: seededQuestion,
      initialRemainingTurns: 4,
      videoRef,
    });

    const user = userEvent.setup();
    await user.click(screen.getByText("OK"));
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body: string }).body,
    );
    expect(body.videoRef).toEqual(videoRef);
  });
});
