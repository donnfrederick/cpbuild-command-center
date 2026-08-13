import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string, params?: Record<string, string>) => {
    if (params) return `${ns}.${key}(${JSON.stringify(params)})`;
    return `${ns}.${key}`;
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/components/feedback/FeedbackAssistChat", () => ({
  FeedbackAssistChat: ({
    onFinalReport,
    onCancel,
    initialQuestion,
  }: {
    sessionId: string;
    feedbackType: string;
    initialTitle: string;
    initialDescription: string;
    pageUrl: string | null;
    initialTranscript?: unknown;
    initialQuestion?: { id: string; text: string; options?: { id: string; label: string }[]; allowCustom?: boolean } | null;
    initialRemainingTurns?: number;
    videoRef?: unknown;
    onFinalReport: (args: { report: { kind: string; suggestedTitle?: string; suggestedDescription?: string }; transcript: unknown[] }) => void;
    onCancel: () => void;
  }) => (
    <div data-testid="assist-chat">
      {initialQuestion && (
        <>
          <p>{initialQuestion.text}</p>
          {initialQuestion.options?.map((o) => <span key={o.id}>{o.label}</span>)}
        </>
      )}
      <button
        type="button"
        onClick={() =>
          onFinalReport({
            report: { kind: "BUG", suggestedTitle: "AI title", suggestedDescription: "AI description" },
            transcript: [],
          })
        }
      >
        complete-chat
      </button>
      <button type="button" onClick={onCancel}>
        cancel-chat
      </button>
    </div>
  ),
}));

vi.mock("@/components/feedback/FeedbackDraftPreview", () => ({
  FeedbackDraftPreview: ({
    onApply,
    onClose,
  }: {
    report: unknown;
    calibrationRounds: number;
    calibrating: boolean;
    onApply: (report: { kind: string; suggestedTitle?: string; suggestedDescription?: string }, screenshot: string | null) => void;
    onCalibrate: (instruction: string) => void;
    onClose: () => void;
  }) => (
    <div data-testid="draft-preview">
      <button
        type="button"
        onClick={() =>
          onApply({ kind: "BUG", suggestedTitle: "AI title", suggestedDescription: "AI description" }, null)
        }
      >
        apply-draft
      </button>
      <button type="button" onClick={onClose}>
        close-draft
      </button>
    </div>
  ),
}));

const mockFetch = vi.fn();

// ── Import component after mocks ───────────────────────────────────────────────

import React from "react";
import { toast } from "sonner";
import { FEEDBACK_INBOX_REFRESH_EVENT } from "@/lib/feedback-inbox-events";
const { FeedbackFormInline } = await import("@/components/feedback/FeedbackFormInline");
const { FeedbackRecordingProvider } = await import("@/components/feedback/FeedbackRecordingContext");

// ── Helpers ────────────────────────────────────────────────────────────────────

type MockResponse = { ok: boolean; status?: number; json: () => Promise<unknown> };
const mockResponseQueues: Map<string, MockResponse[]> = new Map();

function queueResponse(url: string, response: MockResponse) {
  const queue = mockResponseQueues.get(url) ?? [];
  queue.push(response);
  mockResponseQueues.set(url, queue);
}

function renderForm(props: Partial<{ pageUrl: string; onSuccess: () => void; onRecordingActiveChange: (active: boolean) => void }> = {}) {
  const onSuccess = props.onSuccess ?? vi.fn();
  render(
    <FeedbackRecordingProvider>
      <FeedbackFormInline
        pageUrl={props.pageUrl}
        onSuccess={onSuccess}
        onRecordingActiveChange={props.onRecordingActiveChange}
      />
    </FeedbackRecordingProvider>,
  );
  return { onSuccess };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("FeedbackFormInline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResponseQueues.clear();
    mockFetch.mockImplementation(async (url: string, init?: { method?: string }) => {
      const queued = mockResponseQueues.get(url)?.shift();
      if (queued) return queued;
      if (url === "/api/feedback/assist" && (!init?.method || init.method === "GET")) {
        return { ok: true, status: 200, json: async () => ({ enabled: false }) };
      }
      return { ok: false, status: 500, json: async () => ({ error: `unmocked ${url}` }) };
    });
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // ── Basic rendering ─────────────────────────────────────────────────────────

  it("renders the form fields", () => {
    renderForm();
    expect(screen.getByText("feedback.typeBug")).toBeDefined();
    expect(screen.getByText("feedback.typeFeature")).toBeDefined();
    expect(screen.getByText("feedback.submit")).toBeDefined();
  });

  // ── Validation ──────────────────────────────────────────────────────────────

  it("shows validation errors on empty submit", async () => {
    renderForm();
    const submitBtn = screen.getAllByRole("button").find((b) => b.textContent?.includes("feedback.submit"));
    fireEvent.click(submitBtn!);
    await waitFor(() => {
      expect(screen.getByText("feedback.titleRequired")).toBeDefined();
      expect(screen.getByText("feedback.descriptionRequired")).toBeDefined();
    });
    expect(
      mockFetch.mock.calls.some(([url, init]) => url === "/api/feedback" && init?.method === "POST")
    ).toBe(false);
  });

  // ── Submission ──────────────────────────────────────────────────────────────

  it("submits successfully and shows reference ID in toast", async () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    queueResponse("/api/feedback", {
      ok: true,
      json: async () => ({ id: "r1", shortId: 7 }),
    });
    renderForm();
    await userEvent.type(screen.getByRole("textbox", { name: /titleLabel/i }), "My bug");
    await userEvent.type(screen.getByRole("textbox", { name: /descriptionLabel/i }), "It breaks");
    const submitBtn = screen.getAllByRole("button").find((b) => b.textContent?.includes("feedback.submit"));
    fireEvent.click(submitBtn!);
    await waitFor(() =>
      expect(
        mockFetch.mock.calls.some(([url, init]) => url === "/api/feedback" && init?.method === "POST")
      ).toBe(true)
    );
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("0007"));
    expect(
      dispatchSpy.mock.calls.some(
        (args) =>
          args[0] instanceof CustomEvent && args[0].type === FEEDBACK_INBOX_REFRESH_EVENT
      )
    ).toBe(true);
  });

  it("shows error toast on API failure", async () => {
    queueResponse("/api/feedback", {
      ok: false,
      json: async () => ({ error: "Server error" }),
    });
    renderForm();
    await userEvent.type(screen.getByRole("textbox", { name: /titleLabel/i }), "Title");
    await userEvent.type(screen.getByRole("textbox", { name: /descriptionLabel/i }), "Desc");
    const submitBtn = screen.getAllByRole("button").find((b) => b.textContent?.includes("feedback.submit"));
    fireEvent.click(submitBtn!);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Server error"));
  });

  it("submits without aiAssisted when no AI session was started", async () => {
    queueResponse("/api/feedback", {
      ok: true,
      json: async () => ({ id: "r1", shortId: 1 }),
    });
    renderForm();
    await userEvent.type(screen.getByRole("textbox", { name: /titleLabel/i }), "Title");
    await userEvent.type(screen.getByRole("textbox", { name: /descriptionLabel/i }), "Desc");
    const submitBtn = screen.getAllByRole("button").find((b) => b.textContent?.includes("feedback.submit"));
    fireEvent.click(submitBtn!);
    await waitFor(() =>
      expect(
        mockFetch.mock.calls.some(([url, init]) => url === "/api/feedback" && init?.method === "POST")
      ).toBe(true)
    );
    const feedbackCall = mockFetch.mock.calls.find(
      ([url, init]) => url === "/api/feedback" && init?.method === "POST"
    )!;
    const body = JSON.parse(feedbackCall[1].body as string) as { aiAssisted: unknown };
    expect(body.aiAssisted).toBe(false);
  });

  // ── AI Assist — mobile parity (the bug) ────────────────────────────────────

  it("probes the AI assist endpoint on mount", async () => {
    renderForm();
    await waitFor(() =>
      expect(
        mockFetch.mock.calls.some(([url, init]) => url === "/api/feedback/assist" && (!init?.method || init.method === "GET"))
      ).toBe(true)
    );
  });

  it("shows AI Assist toggle when the endpoint reports enabled=true", async () => {
    queueResponse("/api/feedback/assist", {
      ok: true,
      status: 200,
      json: async () => ({ enabled: true }),
    });
    renderForm();
    await waitFor(() =>
      expect(
        screen.getAllByRole("button").some((b) => b.textContent?.includes("toggleCta"))
      ).toBe(true)
    );
  });

  it("Start AI Assist button is disabled (not hidden) when AI is unavailable", async () => {
    // Default mock returns enabled=false — button should render but be disabled,
    // mirroring FeedbackModal which always shows the toggle area regardless of
    // AI availability and only gates on the disabled attribute.
    renderForm();
    await waitFor(() =>
      expect(
        mockFetch.mock.calls.some(([url, init]) => url === "/api/feedback/assist" && (!init?.method || init.method === "GET"))
      ).toBe(true)
    );
    const toggleBtn = screen.getAllByRole("button").find((b) => b.textContent?.includes("toggleCta"));
    expect(toggleBtn).toBeDefined();
    expect(toggleBtn).toBeDisabled();
  });

  it("opens the AI assist chat when Start AI Assist is clicked", async () => {
    queueResponse("/api/feedback/assist", {
      ok: true,
      status: 200,
      json: async () => ({ enabled: true }),
    });
    renderForm();
    await waitFor(() =>
      expect(
        screen.getAllByRole("button").some((b) => b.textContent?.includes("toggleCta"))
      ).toBe(true)
    );
    const startBtn = screen.getAllByRole("button").find((b) => b.textContent?.includes("toggleCta"))!;
    await userEvent.setup().click(startBtn);
    expect(screen.getByTestId("assist-chat")).toBeDefined();
  });

  it("shows the draft preview after AI chat produces a final report", async () => {
    queueResponse("/api/feedback/assist", {
      ok: true,
      status: 200,
      json: async () => ({ enabled: true }),
    });
    renderForm();
    await waitFor(() =>
      expect(
        screen.getAllByRole("button").some((b) => b.textContent?.includes("toggleCta"))
      ).toBe(true)
    );
    await userEvent.setup().click(screen.getAllByRole("button").find((b) => b.textContent?.includes("toggleCta"))!);
    await userEvent.setup().click(screen.getByText("complete-chat"));
    await waitFor(() => expect(screen.getByTestId("draft-preview")).toBeDefined());
  });

  it("populates form fields when AI draft is applied", async () => {
    queueResponse("/api/feedback/assist", {
      ok: true,
      status: 200,
      json: async () => ({ enabled: true }),
    });
    renderForm();
    await waitFor(() =>
      expect(
        screen.getAllByRole("button").some((b) => b.textContent?.includes("toggleCta"))
      ).toBe(true)
    );
    await userEvent.setup().click(screen.getAllByRole("button").find((b) => b.textContent?.includes("toggleCta"))!);
    await userEvent.setup().click(screen.getByText("complete-chat"));
    await waitFor(() => expect(screen.getByTestId("draft-preview")).toBeDefined());
    await userEvent.setup().click(screen.getByText("apply-draft"));

    await waitFor(() => {
      const titleInput = screen.getByRole("textbox", { name: /titleLabel/i }) as HTMLInputElement;
      expect(titleInput.value).toBe("AI title");
    });
  });

  it("marks aiAssisted=true in the submit payload when AI metadata is present", async () => {
    queueResponse("/api/feedback/assist", {
      ok: true,
      status: 200,
      json: async () => ({ enabled: true }),
    });
    queueResponse("/api/feedback", {
      ok: true,
      json: async () => ({ id: "r1", shortId: 99 }),
    });
    renderForm();
    await waitFor(() =>
      expect(
        screen.getAllByRole("button").some((b) => b.textContent?.includes("toggleCta"))
      ).toBe(true)
    );
    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button").find((b) => b.textContent?.includes("toggleCta"))!);
    await user.click(screen.getByText("complete-chat"));
    await waitFor(() => expect(screen.getByTestId("draft-preview")).toBeDefined());
    await user.click(screen.getByText("apply-draft"));

    const submitBtn = screen.getAllByRole("button").find((b) => b.textContent?.includes("feedback.submit"));
    fireEvent.click(submitBtn!);
    await waitFor(() =>
      expect(
        mockFetch.mock.calls.some(([url, init]) => url === "/api/feedback" && init?.method === "POST")
      ).toBe(true)
    );
    const feedbackCall = mockFetch.mock.calls.find(
      ([url, init]) => url === "/api/feedback" && init?.method === "POST"
    )!;
    const body = JSON.parse(feedbackCall[1].body as string) as { aiAssisted: unknown; aiAssistMetadata: unknown };
    expect(body.aiAssisted).toBe(true);
    expect(body.aiAssistMetadata).not.toBeNull();
  });

  it("form fields render correctly when title and description are empty (null-fixture parity)", async () => {
    renderForm();
    const titleInput = screen.getByRole("textbox", { name: /titleLabel/i }) as HTMLInputElement;
    const descInput = screen.getByRole("textbox", { name: /descriptionLabel/i }) as HTMLInputElement;
    expect(titleInput.value).toBe("");
    expect(descInput.value).toBe("");
  });

  // ── Screen recording parity ─────────────────────────────────────────────────

  type MockMediaRecorderLike = {
    start: (chunkMs?: number) => void;
    stop: () => void;
    state: string;
    mimeType: string;
    ondataavailable: null | ((e: { data: Blob }) => void);
    onstop: null | (() => void);
  };

  /**
   * Stub browser APIs before render so the Record Screen CTA renders as a button.
   */
  function stubScreenRecordingSupport(): MockMediaRecorderLike {
    const mockVideoTrack = { stop: vi.fn(), onended: null as null | (() => void) };
    const mockStream = {
      getTracks: () => [mockVideoTrack],
      getVideoTracks: () => [mockVideoTrack],
      getAudioTracks: () => [],
    };
    const recorder: MockMediaRecorderLike = {
      start: vi.fn(),
      stop: vi.fn(function (this: MockMediaRecorderLike) {
        this.state = "inactive";
        this.onstop?.();
      }),
      state: "recording",
      mimeType: "video/webm",
      ondataavailable: null,
      onstop: null,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).MediaStream = function MockMediaStream() { return mockStream; };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const MockMediaRecorder = function MockMediaRecorderFn() { return recorder; } as any;
    MockMediaRecorder.isTypeSupported = () => false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).MediaRecorder = MockMediaRecorder;

    Object.defineProperty(globalThis.navigator, "mediaDevices", {
      value: {
        getDisplayMedia: vi.fn().mockResolvedValue(mockStream),
        getUserMedia: vi.fn().mockRejectedValue(new Error("no mic")),
      },
      writable: true,
      configurable: true,
    });

    return recorder;
  }

  /**
   * Clicks "Record Screen", fires a data chunk, then stops the recorder.
   * Call stubScreenRecordingSupport() before renderForm().
   */
  async function simulateRecordingStopped(recorder: MockMediaRecorderLike): Promise<MockMediaRecorderLike> {
    const user = userEvent.setup();
    const recordBtn = screen.getByText("feedback.recordScreen").closest("button")!;
    await user.click(recordBtn);

    await waitFor(() => expect(recorder.ondataavailable).not.toBeNull());
    recorder.ondataavailable!({ data: new Blob([new Uint8Array(256)], { type: "video/webm" }) });

    // Stop recording — triggers onstop → sets recordingState to "stopped" via context
    await waitFor(() => expect(recorder.onstop).not.toBeNull());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (recorder as any).stop();

    await waitFor(() => expect(screen.queryByText("feedback.recordingReady")).not.toBeNull());
    return recorder;
  }

  it("renders the Record Screen button", () => {
    stubScreenRecordingSupport();
    renderForm();
    expect(screen.getByText("feedback.recordScreen")).toBeDefined();
  });

  it("calls onRecordingActiveChange(true) when recording starts", async () => {
    const onRecordingActiveChange = vi.fn();
    const recorder = stubScreenRecordingSupport();
    renderForm({ onRecordingActiveChange });
    const user = userEvent.setup();
    const recordBtn = screen.getByText("feedback.recordScreen").closest("button")!;
    await user.click(recordBtn);

    await waitFor(() => expect(onRecordingActiveChange).toHaveBeenCalledWith(true));
    expect(recorder.start).toHaveBeenCalled();
  });

  it("renders Analyze with AI after recording stops and AI is enabled", async () => {
    queueResponse("/api/feedback/assist", {
      ok: true,
      status: 200,
      json: async () => ({ enabled: true }),
    });
    const recorder = stubScreenRecordingSupport();
    renderForm();
    await simulateRecordingStopped(recorder);
    await waitFor(() =>
      expect(
        screen.getAllByRole("button").some((b) => b.textContent?.includes("analyzeRecording"))
      ).toBe(true)
    );
  });

  it("short-circuits to form when video analysis returns a final_report", async () => {
    queueResponse("/api/feedback/assist", {
      ok: true,
      status: 200,
      json: async () => ({ enabled: true }),
    });
    queueResponse("/api/feedback/assist/video", {
      ok: true,
      status: 200,
      json: async () => ({
        kind: "final_report",
        report: {
          kind: "BUG",
          suggestedTitle: "Save button broken",
          suggestedDescription: "Clicking Save does nothing.",
          summary: "Save is broken.",
          bugDetails: {
            stepsToReproduce: ["Open Projects", "Click Save"],
            expectedBehavior: "Record saved",
            actualBehavior: "Nothing happens",
          },
        },
        turnNumber: 1,
        remainingTurns: 4,
        videoRef: {
          fileUri: "https://g/files/abc",
          mimeType: "video/webm",
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        },
      }),
    });
    const recorder = stubScreenRecordingSupport();
    renderForm();
    await simulateRecordingStopped(recorder);
    const analyzeBtn = screen.getAllByRole("button").find((b) => b.textContent?.includes("analyzeRecording"))!;
    await userEvent.setup().click(analyzeBtn);
    await waitFor(() =>
      expect(
        mockFetch.mock.calls.some(([url, init]) => url === "/api/feedback/assist/video" && init?.method === "POST")
      ).toBe(true)
    );
    await waitFor(() => {
      const titleInput = screen.getByRole("textbox", { name: /titleLabel/i }) as HTMLInputElement;
      expect(titleInput.value).toBe("Save button broken");
    });
    expect(toast.success).toHaveBeenCalled();
  });

  it("seeds the chat panel when video analysis returns a follow-up question", async () => {
    queueResponse("/api/feedback/assist", {
      ok: true,
      status: 200,
      json: async () => ({ enabled: true }),
    });
    queueResponse("/api/feedback/assist/video", {
      ok: true,
      status: 200,
      json: async () => ({
        kind: "question",
        question: {
          id: "what-did-you-expect",
          text: "What did you expect to happen?",
          options: [
            { id: "success", label: "A success message" },
            { id: "redirect", label: "Redirect to dashboard" },
          ],
          allowCustom: true,
        },
        turnNumber: 1,
        remainingTurns: 4,
        videoRef: {
          fileUri: "https://g/files/abc",
          mimeType: "video/webm",
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        },
      }),
    });
    const recorder = stubScreenRecordingSupport();
    renderForm();
    await simulateRecordingStopped(recorder);
    const analyzeBtn = screen.getAllByRole("button").find((b) => b.textContent?.includes("analyzeRecording"))!;
    await userEvent.setup().click(analyzeBtn);
    await waitFor(() => expect(screen.getByText("What did you expect to happen?")).toBeInTheDocument());
    expect(screen.getByText("A success message")).toBeInTheDocument();
  });

  it("includes videoUrl in submit payload when recording is present", async () => {
    queueResponse("/api/feedback/upload-recording", {
      ok: true,
      json: async () => ({ url: "https://supabase.co/recording.webm" }),
    });
    queueResponse("/api/feedback", {
      ok: true,
      json: async () => ({ id: "r1", shortId: 5 }),
    });
    const recorder = stubScreenRecordingSupport();
    renderForm();
    await simulateRecordingStopped(recorder);
    // Type required fields
    await userEvent.type(screen.getByRole("textbox", { name: /titleLabel/i }), "Title");
    await userEvent.type(screen.getByRole("textbox", { name: /descriptionLabel/i }), "Desc");
    const submitBtn = screen.getAllByRole("button").find((b) => b.textContent?.includes("feedback.submit"));
    fireEvent.click(submitBtn!);
    await waitFor(() =>
      expect(
        mockFetch.mock.calls.some(([url]) => url === "/api/feedback/upload-recording")
      ).toBe(true)
    );
    await waitFor(() =>
      expect(
        mockFetch.mock.calls.some(([url, init]) => url === "/api/feedback" && init?.method === "POST")
      ).toBe(true)
    );
    const feedbackCall = mockFetch.mock.calls.find(
      ([url, init]) => url === "/api/feedback" && init?.method === "POST"
    )!;
    const body = JSON.parse(feedbackCall[1].body as string) as { videoUrl: unknown };
    expect(body.videoUrl).toBe("https://supabase.co/recording.webm");
  });

  describe("multi-image screenshot uploads", () => {
    const urlCreateObjectUrlDesc = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
    const urlRevokeObjectUrlDesc = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");

    beforeEach(() => {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: vi.fn(() => "blob:test-preview"),
      });
      Object.defineProperty(URL, "revokeObjectURL", {
        configurable: true,
        value: vi.fn(),
      });
    });

    afterEach(() => {
      if (urlCreateObjectUrlDesc) {
        Object.defineProperty(URL, "createObjectURL", urlCreateObjectUrlDesc);
      } else {
        delete (URL as unknown as Record<string, unknown>).createObjectURL;
      }
      if (urlRevokeObjectUrlDesc) {
        Object.defineProperty(URL, "revokeObjectURL", urlRevokeObjectUrlDesc);
      } else {
        delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
      }
    });

    function makePngFile(name = "shot.png", sizeBytes = 512) {
      return new File([new Uint8Array(sizeBytes)], name, { type: "image/png" });
    }

    async function fillRequiredFields() {
      await userEvent.type(screen.getByRole("textbox", { name: /titleLabel/i }), "Test bug title");
      await userEvent.type(screen.getByRole("textbox", { name: /descriptionLabel/i }), "Test description");
    }

    it("calls upload-screenshot when a PNG is selected", async () => {
      queueResponse("/api/feedback/upload-screenshot", {
        ok: true,
        json: async () => ({ url: "https://supabase.co/storage/v1/object/sign/feedback-screenshots/a.png?token=1" }),
      });
      renderForm();
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      await userEvent.upload(input, makePngFile());
      await waitFor(() =>
        expect(mockFetch.mock.calls.some(([url]) => url === "/api/feedback/upload-screenshot")).toBe(true),
      );
    });

    it("shows unsupported MIME error when file type is not allowed", async () => {
      renderForm();
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const svg = new File(["<svg/>"], "icon.svg", { type: "image/svg+xml" });
      await act(async () => {
        Object.defineProperty(input, "files", { value: [svg], configurable: true });
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await waitFor(() => {
        expect(screen.getByText(/feedback\.screenshotUnsupportedMime/i)).toBeInTheDocument();
      });
    });

    it("submits screenshots array after successful upload", async () => {
      const uploadUrl = "https://supabase.co/storage/v1/object/sign/feedback-screenshots/a.png?token=1";
      queueResponse("/api/feedback/upload-screenshot", {
        ok: true,
        json: async () => ({ url: uploadUrl }),
      });
      queueResponse("/api/feedback", {
        ok: true,
        json: async () => ({ id: "r1", shortId: 7 }),
      });
      renderForm();
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      await userEvent.upload(input, makePngFile());
      await waitFor(() =>
        expect(mockFetch.mock.calls.some(([url]) => url === "/api/feedback/upload-screenshot")).toBe(true),
      );
      await fillRequiredFields();
      const submitBtn = screen.getAllByRole("button").find((b) => b.textContent?.includes("feedback.submit"));
      fireEvent.click(submitBtn!);
      await waitFor(() => {
        const feedbackCall = mockFetch.mock.calls.find(
          ([url, init]) => url === "/api/feedback" && init?.method === "POST",
        );
        expect(feedbackCall).toBeDefined();
        const body = JSON.parse(feedbackCall![1]!.body as string) as { screenshots: string[] };
        expect(body.screenshots).toEqual([uploadUrl]);
      });
    });
  });
});
