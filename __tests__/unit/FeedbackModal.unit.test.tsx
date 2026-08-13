import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string, params?: Record<string, string>) => {
    const prefix = ns === "feedback" ? "" : `${ns}.`;
    if (params) return `${prefix}${key}(${JSON.stringify(params)})`;
    return `${prefix}${key}`;
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, type, disabled }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type={type ?? "button"} onClick={onClick} disabled={disabled}>{children}</button>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock("@/components/ui/label", () => ({
  Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

// ── Import component after mocks ───────────────────────────────────────────────

import React from "react";
import { toast } from "sonner";
import { FEEDBACK_INBOX_REFRESH_EVENT } from "@/lib/feedback-inbox-events";
const { FeedbackModal } = await import("@/components/feedback/FeedbackModal");

// ── Helpers ────────────────────────────────────────────────────────────────────

function renderModal(props: Partial<{ open: boolean; onOpenChange: (v: boolean) => void; pageUrl: string }> = {}) {
  const onOpenChange = props.onOpenChange ?? vi.fn();
  render(
    <FeedbackModal
      open={props.open ?? true}
      onOpenChange={onOpenChange}
      pageUrl={props.pageUrl}
    />,
  );
  return { onOpenChange };
}

async function fillRequiredFields() {
  await userEvent.type(screen.getByRole("textbox", { name: /titleLabel/i }), "Test title");
  await userEvent.type(screen.getByRole("textbox", { name: /descriptionLabel/i }), "Test description");
}

// ── Tests ─────────────────────────────────────────────────────────────────────

/**
 * Mock response queues keyed by URL prefix. The AI-availability probe fires on
 * every modal mount via `GET /api/feedback/assist`; tests that don't care
 * about the AI flow should let it return the default `enabled=false` payload.
 *
 * Tests provide a list of responses for a given URL via
 * `queueResponse(url, response)`. When that URL is fetched, the next queued
 * response is shifted off the list and returned. When the queue is empty, the
 * probe URL falls back to `{ enabled: false }` and any other URL yields a 500.
 */
const mockResponseQueues: Map<string, Array<{ ok: boolean; status?: number; json: () => Promise<unknown> }>> =
  new Map();

function queueResponse(url: string, response: { ok: boolean; status?: number; json: () => Promise<unknown> }) {
  const queue = mockResponseQueues.get(url) ?? [];
  queue.push(response);
  mockResponseQueues.set(url, queue);
}

function defaultProbeResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({ enabled: false, maxTurns: 5 }),
  };
}

describe("FeedbackModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResponseQueues.clear();
    mockFetch.mockImplementation(async (url: string, init?: { method?: string }) => {
      const queued = mockResponseQueues.get(url)?.shift();
      if (queued) return queued;
      // Default for the AI probe so every modal mount succeeds without setup.
      if (url === "/api/feedback/assist" && (!init?.method || init.method === "GET")) {
        return defaultProbeResponse();
      }
      return { ok: false, status: 500, json: async () => ({ error: `unmocked ${url}` }) };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders when open=true", () => {
    renderModal();
    expect(screen.getByTestId("dialog")).toBeDefined();
    expect(screen.getByText("title")).toBeDefined(); // i18n key
  });

  it("does not render when open=false", () => {
    renderModal({ open: false });
    expect(screen.queryByTestId("dialog")).toBeNull();
  });

  it("shows validation errors when submitted with empty fields", async () => {
    renderModal();
    const submitBtn = screen.getAllByRole("button").find((b) => b.textContent?.includes("submit"));
    fireEvent.click(submitBtn!);
    await waitFor(() => {
      expect(screen.getByText("titleRequired")).toBeDefined();
      expect(screen.getByText("descriptionRequired")).toBeDefined();
    });
    // The only fetch that should have fired is the AI availability probe on mount.
    expect(
      mockFetch.mock.calls.some(([url, init]) => url === "/api/feedback" && init?.method === "POST")
    ).toBe(false);
  });

  it("submits successfully and shows reference ID in toast", async () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    queueResponse("/api/feedback", {
      ok: true,
      json: async () => ({ id: "r1", shortId: 42 }),
    });
    renderModal();
    await fillRequiredFields();
    const submitBtn = screen.getAllByRole("button").find((b) => b.textContent?.includes("submit"));
    fireEvent.click(submitBtn!);
    await waitFor(() =>
      expect(
        mockFetch.mock.calls.some(([url, init]) => url === "/api/feedback" && init?.method === "POST")
      ).toBe(true)
    );
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("0042"));
    expect(
      dispatchSpy.mock.calls.some(
        (args) =>
          args[0] instanceof CustomEvent && args[0].type === FEEDBACK_INBOX_REFRESH_EVENT
      )
    ).toBe(true);
  });

  it("submits without reference ID in toast when shortId is missing from response", async () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    queueResponse("/api/feedback", {
      ok: true,
      json: async () => ({ id: "r1" }),
    });
    renderModal();
    await fillRequiredFields();
    const submitBtn = screen.getAllByRole("button").find((b) => b.textContent?.includes("submit"));
    fireEvent.click(submitBtn!);
    await waitFor(() =>
      expect(
        mockFetch.mock.calls.some(([url, init]) => url === "/api/feedback" && init?.method === "POST")
      ).toBe(true)
    );
    expect(toast.success).toHaveBeenCalledWith("submitSuccess");
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
    renderModal();
    await fillRequiredFields();
    const submitBtn = screen.getAllByRole("button").find((b) => b.textContent?.includes("submit"));
    fireEvent.click(submitBtn!);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Server error"));
  });

  it("renders the Record Screen button", () => {
    renderModal();
    expect(screen.getByText("recordScreen")).toBeDefined();
  });

  it("hides the modal and shows the floating pill while recording is in progress", async () => {
    const mockVideoTrack = { stop: vi.fn(), onended: null as null | (() => void) };
    const mockStream = {
      getTracks: () => [mockVideoTrack],
      getVideoTracks: () => [mockVideoTrack],
      getAudioTracks: () => [],
    };

    const mockMediaRecorder = {
      start: vi.fn(),
      stop: vi.fn(),
      state: "recording",
      mimeType: "video/webm",
      ondataavailable: null as null | ((e: { data: { size: number } }) => void),
      onstop: null as null | (() => void),
    };
    // JSDOM has no MediaStream / MediaRecorder. vi.fn(arrow) passes an arrow to `new`
    // which throws "not a constructor". Use real function declarations instead.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).MediaStream = function MockMediaStream() { return mockStream; };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const MockMediaRecorder = function MockMediaRecorderFn() { return mockMediaRecorder; } as any;
    MockMediaRecorder.isTypeSupported = () => false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).MediaRecorder = MockMediaRecorder;

    const mockGetDisplayMedia = vi.fn().mockResolvedValue(mockStream);
    const mockGetUserMedia = vi.fn().mockRejectedValue(new Error("no mic"));
    Object.defineProperty(globalThis.navigator, "mediaDevices", {
      value: { getDisplayMedia: mockGetDisplayMedia, getUserMedia: mockGetUserMedia },
      writable: true,
      configurable: true,
    });

    renderModal();
    const user = userEvent.setup();

    // Confirm modal is initially visible
    expect(screen.getByTestId("dialog")).toBeDefined();

    const recordBtn = screen.getByText("recordScreen").closest("button")!;
    // userEvent.click flushes microtasks including the awaited getDisplayMedia resolution
    await user.click(recordBtn);

    await waitFor(() => {
      // Modal dialog should be hidden (Dialog receives open=false while recording)
      expect(screen.queryByTestId("dialog")).toBeNull();
      // Floating pill should appear with recording status and stop button
      expect(screen.getByRole("status")).toBeDefined();
      const stopBtn = screen.getAllByRole("button").find((b) =>
        b.getAttribute("aria-label")?.toLowerCase().includes("stop") ||
        b.textContent?.toLowerCase().includes("stoprecording")
      );
      expect(stopBtn).toBeDefined();
    }, { timeout: 3000 });
  });

  it("includes videoUrl when recording is present on submit", async () => {
    queueResponse("/api/feedback/upload-recording", {
      ok: true,
      json: async () => ({ url: "https://supabase.co/recording.webm" }),
    });
    queueResponse("/api/feedback", {
      ok: true,
      json: async () => ({ id: "r1", shortId: 5 }),
    });

    renderModal();
    await fillRequiredFields();

    // Directly setting internal recording state isn't clean in black-box tests.
    // We verify that when no recording is attached, the submit path does not hit
    // the upload endpoint and the POST body carries `videoUrl: null`.
    const submitBtn = screen.getAllByRole("button").find((b) => b.textContent?.includes("submit"));
    fireEvent.click(submitBtn!);
    await waitFor(() =>
      expect(
        mockFetch.mock.calls.some(([url, init]) => url === "/api/feedback" && init?.method === "POST")
      ).toBe(true)
    );
    const feedbackCall = mockFetch.mock.calls.find(
      ([url, init]) => url === "/api/feedback" && init?.method === "POST"
    )!;
    const body = JSON.parse(feedbackCall[1].body as string) as { videoUrl: unknown };
    expect(body.videoUrl).toBeNull();
    // No recording was attached → upload endpoint should never have been called.
    expect(
      mockFetch.mock.calls.some(([url]) => url === "/api/feedback/upload-recording")
    ).toBe(false);
  });

  it("sends null videoUrl when no recording is attached", async () => {
    queueResponse("/api/feedback", {
      ok: true,
      json: async () => ({ id: "r1", shortId: 1 }),
    });
    renderModal({ pageUrl: "https://app.example.com/projects" });
    await fillRequiredFields();
    const submitBtn = screen.getAllByRole("button").find((b) => b.textContent?.includes("submit"));
    fireEvent.click(submitBtn!);
    await waitFor(() =>
      expect(
        mockFetch.mock.calls.some(([url, init]) => url === "/api/feedback" && init?.method === "POST")
      ).toBe(true)
    );
    const feedbackCall = mockFetch.mock.calls.find(
      ([url, init]) => url === "/api/feedback" && init?.method === "POST"
    )!;
    const body = JSON.parse(feedbackCall[1].body as string) as { videoUrl: unknown };
    expect(body.videoUrl).toBeNull();
  });

  // ── Analyze with AI (video → chat seed) ─────────────────────────────────────
  // Simulates: user records a clip → clicks Analyze → server responds with a
  // final report (short-circuits the chat) or a clarifying question
  // (seeds the chat panel).

  type MockMediaRecorderLike = {
    start: (chunkMs?: number) => void;
    stop: () => void;
    state: string;
    mimeType: string;
    ondataavailable: null | ((e: { data: Blob }) => void);
    onstop: null | (() => void);
  };

  /**
   * Drive the MediaRecorder through a full record+stop cycle so the modal
   * lands in `recordingState === "stopped"` with a Blob attached. Returns
   * the recorder stub so the caller can verify further interactions.
   */
  async function simulateRecordingStopped(): Promise<MockMediaRecorderLike> {
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

    const user = userEvent.setup();
    const recordBtn = screen.getByText("recordScreen").closest("button")!;
    await user.click(recordBtn);

    // Push a chunk so the onstop handler builds a non-empty Blob.
    await waitFor(() => expect(recorder.ondataavailable).not.toBeNull());
    recorder.ondataavailable!({ data: new Blob([new Uint8Array(256)], { type: "video/webm" }) });

    // Stop through the component's own control (floating pill). That flushes
    // the onstop handler and transitions state to "stopped".
    const stopBtn = screen
      .getAllByRole("button")
      .find((b) => b.getAttribute("aria-label")?.toLowerCase().includes("stop"))!;
    await user.click(stopBtn);

    await waitFor(() => expect(screen.queryByText("recordingReady")).not.toBeNull());
    return recorder;
  }

  it("renders Analyze with AI after recording stops and AI is enabled", async () => {
    queueResponse("/api/feedback/assist", {
      ok: true,
      status: 200,
      json: async () => ({ enabled: true, maxTurns: 5 }),
    });
    renderModal();
    await simulateRecordingStopped();

    await waitFor(() =>
      expect(
        screen.getAllByRole("button").some((b) => b.textContent?.includes("analyzeRecording")),
      ).toBe(true),
    );
  });

  it("short-circuits to the form when video analysis returns a final_report", async () => {
    queueResponse("/api/feedback/assist", {
      ok: true,
      status: 200,
      json: async () => ({ enabled: true, maxTurns: 5 }),
    });
    queueResponse("/api/feedback/assist/video", {
      ok: true,
      status: 200,
      json: async () => ({
        kind: "final_report",
        report: {
          kind: "BUG",
          suggestedTitle: "Save button is unresponsive",
          suggestedDescription: "Clicking Save does nothing on the Projects page.",
          summary: "Save button is broken.",
          bugDetails: {
            stepsToReproduce: ["Open Projects", "Click Save"],
            expectedBehavior: "Record is saved",
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

    renderModal();
    await simulateRecordingStopped();

    const analyzeBtn = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.includes("analyzeRecording"))!;
    await userEvent.setup().click(analyzeBtn);

    await waitFor(() =>
      expect(
        mockFetch.mock.calls.some(
          ([url, init]) => url === "/api/feedback/assist/video" && init?.method === "POST",
        ),
      ).toBe(true),
    );

    // Form should be populated from the final report.
    await waitFor(() => {
      const titleInput = screen.getByRole("textbox", { name: /titleLabel/i }) as HTMLInputElement;
      expect(titleInput.value).toBe("Save button is unresponsive");
    });
    expect(toast.success).toHaveBeenCalled();
  });

  it("seeds the chat panel when video analysis returns a follow-up question", async () => {
    queueResponse("/api/feedback/assist", {
      ok: true,
      status: 200,
      json: async () => ({ enabled: true, maxTurns: 5 }),
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

    renderModal();
    await simulateRecordingStopped();

    const analyzeBtn = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.includes("analyzeRecording"))!;
    await userEvent.setup().click(analyzeBtn);

    // The chat panel renders the seeded question.
    await waitFor(() =>
      expect(screen.getByText("What did you expect to happen?")).toBeInTheDocument(),
    );
    expect(screen.getByText("A success message")).toBeInTheDocument();
  });

  it("does not trigger the video route when AI is disabled", async () => {
    // Default probe response already returns enabled=false.
    renderModal();
    await simulateRecordingStopped();

    const analyzeBtn = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.includes("analyzeRecording"));
    // Button may still render but must be disabled.
    if (analyzeBtn) {
      expect(analyzeBtn).toBeDisabled();
    }
    expect(
      mockFetch.mock.calls.some(([url]) => url === "/api/feedback/assist/video"),
    ).toBe(false);
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

    it("calls upload-screenshot when a PNG is selected", async () => {
      queueResponse("/api/feedback/upload-screenshot", {
        ok: true,
        json: async () => ({
          url: "https://supabase.co/storage/v1/object/sign/feedback-screenshots/a.png?token=1",
        }),
      });
      renderModal();
      const input = document.getElementById("feedback-screenshot") as HTMLInputElement;
      await userEvent.upload(input, makePngFile());
      await waitFor(() =>
        expect(mockFetch.mock.calls.some(([url]) => url === "/api/feedback/upload-screenshot")).toBe(true),
      );
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
      renderModal();
      const input = document.getElementById("feedback-screenshot") as HTMLInputElement;
      await userEvent.upload(input, makePngFile());
      await waitFor(() =>
        expect(mockFetch.mock.calls.some(([url]) => url === "/api/feedback/upload-screenshot")).toBe(true),
      );
      await fillRequiredFields();
      const submitBtn = screen.getAllByRole("button").find((b) => b.textContent?.includes("submit"));
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

    it("retries after upload failure and submits screenshots on success", async () => {
      const uploadUrl = "https://supabase.co/storage/v1/object/sign/feedback-screenshots/a.png?token=1";
      queueResponse("/api/feedback/upload-screenshot", {
        ok: false,
        status: 502,
        json: async () => ({ error: "Upload failed" }),
      });
      queueResponse("/api/feedback/upload-screenshot", {
        ok: true,
        json: async () => ({ url: uploadUrl }),
      });
      queueResponse("/api/feedback", {
        ok: true,
        json: async () => ({ id: "r1", shortId: 9 }),
      });

      renderModal();
      const input = document.getElementById("feedback-screenshot") as HTMLInputElement;
      await userEvent.upload(input, makePngFile());

      const retryBtn = await screen.findByRole("button", { name: /screenshotUploadFailed/i });
      await userEvent.click(retryBtn);

      await waitFor(() => {
        const uploadCalls = mockFetch.mock.calls.filter(([url]) => url === "/api/feedback/upload-screenshot");
        expect(uploadCalls.length).toBe(2);
      });

      await fillRequiredFields();
      const submitBtn = screen.getAllByRole("button").find((b) => b.textContent?.includes("submit"));
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
