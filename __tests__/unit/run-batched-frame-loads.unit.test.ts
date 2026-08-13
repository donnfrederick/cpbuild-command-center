import { describe, it, expect, vi, beforeEach } from "vitest";
import { runBatchedFrameLoads } from "@/lib/offline/run-batched-frame-loads";

vi.mock("@/lib/offline/warm-page-via-frame", () => ({
  warmPageViaHiddenFrame: vi.fn().mockResolvedValue(undefined),
}));

import { warmPageViaHiddenFrame } from "@/lib/offline/warm-page-via-frame";

describe("runBatchedFrameLoads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads each URL sequentially when parallel is 1", async () => {
    const onBatchDone = vi.fn();
    await runBatchedFrameLoads(["/a", "/b"], { parallel: 1, onBatchDone });

    expect(warmPageViaHiddenFrame).toHaveBeenCalledTimes(2);
    expect(onBatchDone).toHaveBeenCalledWith(1, 2);
    expect(onBatchDone).toHaveBeenCalledWith(2, 2);
  });

  it("loads urls in parallel batches when parallel > 1", async () => {
    const onBatchDone = vi.fn();
    await runBatchedFrameLoads(["/a", "/b", "/c"], { parallel: 2, onBatchDone });

    expect(warmPageViaHiddenFrame).toHaveBeenCalledTimes(3);
    expect(onBatchDone).toHaveBeenCalledWith(2, 3);
    expect(onBatchDone).toHaveBeenCalledWith(3, 3);
  });

  it("throws AbortError when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      runBatchedFrameLoads(["/a", "/b"], { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
