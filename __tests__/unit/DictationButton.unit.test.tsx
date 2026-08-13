import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { DictationButton } from "@/components/ui/DictationButton";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const messages = {
  dictation: {
    start: "Dictate",
    stop: "Stop dictation",
    errorPermission: "Permission denied",
    errorGeneric: "Voice failed",
    fieldTitle: "Title",
  },
};

function renderBtn(onAppendText: (t: string) => void) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DictationButton onAppendText={onAppendText} fieldLabel={messages.dictation.fieldTitle} />
    </NextIntlClientProvider>
  );
}

describe("DictationButton", () => {
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  const originalSpeech = w.SpeechRecognition;
  const originalWebkit = w.webkitSpeechRecognition;

  beforeEach(() => {
    delete w.SpeechRecognition;
    delete w.webkitSpeechRecognition;
  });

  afterEach(() => {
    if (originalSpeech !== undefined) w.SpeechRecognition = originalSpeech;
    else delete w.SpeechRecognition;
    if (originalWebkit !== undefined) w.webkitSpeechRecognition = originalWebkit;
    else delete w.webkitSpeechRecognition;
  });

  it("renders nothing when Web Speech API is unavailable", async () => {
    renderBtn(vi.fn());
    await waitFor(() => {
      expect(screen.queryByRole("button")).toBeNull();
    });
  });

  it("renders mic toggle when webkitSpeechRecognition exists", async () => {
    w.webkitSpeechRecognition = class {
      lang = "";
      continuous = false;
      interimResults = false;
      onresult: ((ev: unknown) => void) | null = null;
      onerror: ((ev: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start(): void {}
      stop(): void {}
    };

    renderBtn(vi.fn());

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /title: dictate/i })).toBeInTheDocument();
    });
  });

  it("focuses focusTargetRef when dictation starts", async () => {
    const user = userEvent.setup();
    w.webkitSpeechRecognition = class {
      lang = "";
      continuous = false;
      interimResults = false;
      onresult: ((ev: unknown) => void) | null = null;
      onerror: ((ev: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start(): void {}
      stop(): void {}
    };

    const target = document.createElement("input");
    document.body.appendChild(target);
    const focusSpy = vi.spyOn(target, "focus");
    const focusTargetRef = { current: target };

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DictationButton
          onAppendText={vi.fn()}
          fieldLabel={messages.dictation.fieldTitle}
          focusTargetRef={focusTargetRef}
        />
      </NextIntlClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /title: dictate/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /title: dictate/i }));

    await waitFor(() => {
      expect(focusSpy).toHaveBeenCalled();
    });

    focusSpy.mockRestore();
    document.body.removeChild(target);
  });
});
