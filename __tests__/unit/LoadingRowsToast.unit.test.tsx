import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoadingRowsToast } from "@/components/ui/LoadingRowsToast";

describe("LoadingRowsToast", () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  it("renders progress and loading label", async () => {
    render(
      <LoadingRowsToast
        show
        testId="load-toast"
        progressText="250 of 1,846 rows loaded"
        loading
        loadingLabel="Loading more…"
      />
    );
    expect(await screen.findByText("250 of 1,846 rows loaded")).toBeTruthy();
    expect(screen.getByText("Loading more…")).toBeTruthy();
    expect(screen.getByTestId("load-toast")).toBeTruthy();
    expect(screen.getByTestId("load-toast")).toHaveClass("loading-rows-toast");
  });

  it("renders error and retry when provided", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <LoadingRowsToast
        show
        loading={false}
        loadingLabel=""
        errorMessage="Network error"
        onRetry={onRetry}
        retryLabel="Try again"
        testId="load-toast"
      />
    );
    expect(await screen.findByText("Network error")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when show is false", async () => {
    render(
      <LoadingRowsToast show={false} loading={false} loadingLabel="x" progressText="a" testId="load-toast" />
    );
    await waitFor(() => {
      expect(screen.queryByTestId("load-toast")).toBeNull();
    });
  });

  it("hides progress after idleDismissMs when not loading", async () => {
    vi.useFakeTimers();
    render(
      <LoadingRowsToast
        show
        loading={false}
        loadingLabel="Loading more…"
        progressText="10 of 100 rows loaded"
        idleDismissMs={2000}
        testId="load-toast"
      />
    );
    // findByText/waitFor use real timers internally; with fake timers they never resolve.
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("10 of 100 rows loaded")).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.queryByTestId("load-toast")).toBeNull();
  });

  it("stays visible while loading even after idle time would pass", async () => {
    vi.useFakeTimers();
    render(
      <LoadingRowsToast
        show
        loading
        loadingLabel="Loading more…"
        progressText="10 of 100 rows loaded"
        idleDismissMs={2000}
        testId="load-toast"
      />
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("Loading more…")).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByTestId("load-toast")).toBeTruthy();
  });
});
