import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDesktopDetailPanel } from "@/hooks/use-desktop-detail-panel";

describe("useDesktopDetailPanel", () => {
  const listeners = new Set<() => void>();
  let matches = false;

  beforeEach(() => {
    matches = false;
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches,
        media: query,
        addEventListener: (_: string, cb: () => void) => {
          listeners.add(cb);
        },
        removeEventListener: (_: string, cb: () => void) => {
          listeners.delete(cb);
        },
      })),
    );
  });

  afterEach(() => {
    listeners.clear();
    vi.unstubAllGlobals();
  });

  it("returns false below the md breakpoint", () => {
    matches = false;
    const { result } = renderHook(() => useDesktopDetailPanel());
    expect(result.current).toBe(false);
  });

  it("returns true at md+ breakpoint", () => {
    matches = true;
    const { result } = renderHook(() => useDesktopDetailPanel());
    expect(result.current).toBe(true);
  });
});
