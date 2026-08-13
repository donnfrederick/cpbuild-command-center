import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { warmPageViaHiddenFrame } from "@/lib/offline/warm-page-via-frame";

describe("warmPageViaHiddenFrame", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("resolves after iframe load plus chunk delay", async () => {
    const promise = warmPageViaHiddenFrame("/en/projects/p1");
    const iframe = document.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("src")).toContain("/en/projects/p1");

    iframe?.onload?.(new Event("load"));
    await vi.advanceTimersByTimeAsync(1_500);
    await promise;

    expect(document.querySelector("iframe")).toBeNull();
  });

  it("resolves on abort without hanging", async () => {
    const controller = new AbortController();
    const promise = warmPageViaHiddenFrame("/en/projects/p1", controller.signal);
    controller.abort();
    await promise;
    expect(document.querySelector("iframe")).toBeNull();
  });
});
