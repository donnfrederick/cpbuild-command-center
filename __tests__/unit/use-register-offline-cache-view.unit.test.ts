import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { OfflineCacheViewProvider, useOfflineCacheView } from "@/hooks/offline-cache-view-context";
import { useRegisterOfflineCacheView } from "@/hooks/use-register-offline-cache-view";

function wrapper({ children }: { children: ReactNode }) {
  return createElement(OfflineCacheViewProvider, null, children);
}

describe("useRegisterOfflineCacheView", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers empty string when cached but generatedAt is null", async () => {
    const { result } = renderHook(
      () => {
        useRegisterOfflineCacheView(true, null);
        return useOfflineCacheView();
      },
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.cachedViewDate).toBe("");
    });
  });
});
