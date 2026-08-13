import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InspectionSyncStatusStrip } from "@/components/projects/inspections/InspectionSyncStatusStrip";
import {
  dismissInspectionSyncStatus,
  showInspectionSyncStatus,
} from "@/lib/inspections/inspection-sync-status";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      syncStatusDismissAria: "Dismiss status message",
    };
    return map[key] ?? key;
  },
}));

vi.mock("@/lib/inspections/inspection-sync-status", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/inspections/inspection-sync-status")>();
  return {
    ...actual,
    dismissInspectionSyncStatus: vi.fn(),
  };
});

describe("InspectionSyncStatusStrip", () => {
  it("renders nothing until a status event is shown", () => {
    const { container } = render(<InspectionSyncStatusStrip />);
    expect(container.firstChild).toBeNull();
  });

  it("shows queued status without a Retry button", () => {
    render(<InspectionSyncStatusStrip />);
    act(() => {
      showInspectionSyncStatus({
        variant: "queued",
        title: "Inspection saved",
        description: "Syncing in the background.",
      });
    });
    expect(screen.getByTestId("inspection-sync-status-strip")).toBeInTheDocument();
    expect(screen.getByText("Inspection saved")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
  });

  it("dismisses when the user taps the close control", async () => {
    const user = userEvent.setup();
    render(<InspectionSyncStatusStrip />);
    act(() => {
      showInspectionSyncStatus({
        variant: "success",
        title: "Inspection saved",
      });
    });

    await user.click(screen.getByRole("button", { name: "Dismiss status message" }));
    expect(dismissInspectionSyncStatus).toHaveBeenCalled();
  });
});
