import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { FileDropOverlay } from "@/components/ui/FileDropOverlay";

vi.mock("@/hooks/use-file-drop", () => ({
  useIsDesktopViewport: vi.fn(() => true),
}));

import { useIsDesktopViewport } from "@/hooks/use-file-drop";

const messages = {
  common: {
    dropFilesHint: "Or drag and drop files here",
  },
};

function renderOverlay(props: React.ComponentProps<typeof FileDropOverlay>) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <FileDropOverlay {...props} />
    </NextIntlClientProvider>,
  );
}

describe("FileDropOverlay", () => {
  beforeEach(() => {
    vi.mocked(useIsDesktopViewport).mockReturnValue(true);
  });

  it("renders idle hint on desktop", () => {
    renderOverlay({});
    expect(screen.getByTestId("file-drop-hint")).toBeInTheDocument();
    expect(screen.getByText("Or drag and drop files here")).toBeInTheDocument();
  });

  it("hides hint on mobile viewport", () => {
    vi.mocked(useIsDesktopViewport).mockReturnValue(false);
    renderOverlay({});
    expect(screen.queryByTestId("file-drop-hint")).not.toBeInTheDocument();
  });

  it("hides hint when disabled", () => {
    renderOverlay({ disabled: true });
    expect(screen.queryByTestId("file-drop-hint")).not.toBeInTheDocument();
  });

  it("renders custom hint label", () => {
    renderOverlay({ hint: "Drop a spreadsheet here" });
    expect(screen.getByText("Drop a spreadsheet here")).toBeInTheDocument();
  });
});
