import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import React from "react";

// ── Component under test ──────────────────────────────────────────────────────

const { PerformanceMeasurePatch } = await import(
  "@/components/shared/PerformanceMeasurePatch"
);

// ── Helpers ───────────────────────────────────────────────────────────────────

const NEGATIVE_TS_ERROR = new TypeError(
  "Failed to execute 'measure' on 'Performance': '\u200bProjectsPage' cannot have a negative time stamp."
);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PerformanceMeasurePatch", () => {
  let originalMeasure: typeof performance.measure;

  beforeEach(() => {
    // Save the raw reference (not a bound copy) so .toBe() works correctly
    // after unmount — the component now restores the exact original reference.
    originalMeasure = performance.measure;
    vi.stubEnv("NODE_ENV", "development");
  });

  afterEach(() => {
    performance.measure = originalMeasure;
    vi.unstubAllEnvs();
  });

  it("replaces performance.measure on mount and restores it on unmount", () => {
    const { unmount } = render(<PerformanceMeasurePatch />);
    const patched = performance.measure;
    expect(patched).not.toBe(originalMeasure);

    unmount();
    expect(performance.measure).toBe(originalMeasure);
  });

  it("suppresses the negative-timestamp TypeError from React's RSC instrumentation", () => {
    render(<PerformanceMeasurePatch />);

    const throwingMeasure = vi.fn().mockImplementation(() => {
      throw NEGATIVE_TS_ERROR;
    });
    performance.measure = throwingMeasure as unknown as typeof performance.measure;

    // Re-apply the patch on top of the throwing stub so the catch fires
    const { unmount } = render(<PerformanceMeasurePatch />);

    expect(() =>
      performance.measure("\u200bProjectsPage", { start: -Infinity })
    ).not.toThrow();

    unmount();
  });

  it("rethrows errors that are not the negative-timestamp TypeError", () => {
    render(<PerformanceMeasurePatch />);

    const otherError = new TypeError("some other measure error");
    const throwingMeasure = vi.fn().mockImplementation(() => {
      throw otherError;
    });
    performance.measure = throwingMeasure as unknown as typeof performance.measure;

    const { unmount } = render(<PerformanceMeasurePatch />);

    expect(() =>
      performance.measure("anything")
    ).toThrow(otherError);

    unmount();
  });

  it("renders nothing (returns null)", () => {
    const { container } = render(<PerformanceMeasurePatch />);
    expect(container.firstChild).toBeNull();
  });
});
