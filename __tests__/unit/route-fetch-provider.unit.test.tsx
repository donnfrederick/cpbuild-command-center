import React, { useEffect } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import {
  RouteFetchProvider,
  useRouteFetch,
} from "@/components/navigation/route-fetch-provider";

let mockPathname = "/projects";
let mockSearch = "";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(mockSearch),
}));

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => mockPathname,
}));

function Consumer() {
  const routeFetch = useRouteFetch();
  useEffect(() => {
    void routeFetch("/api/projects");
  }, [routeFetch]);
  return null;
}

describe("RouteFetchProvider", () => {
  beforeEach(() => {
    mockPathname = "/projects";
    mockSearch = "";
  });

  it("aborts in-flight routeFetch when pathname changes", async () => {
    const controllerSnapshots: AbortSignal[] = [];
    const fetchMock = vi.fn((_input: RequestInfo, init?: RequestInit) => {
      if (init?.signal) controllerSnapshots.push(init.signal);
      return new Promise<Response>(() => {});
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(
      <RouteFetchProvider>
        <Consumer />
      </RouteFetchProvider>,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const firstSignal = controllerSnapshots[0];
    expect(firstSignal?.aborted).toBe(false);

    mockPathname = "/feedback";
    rerender(
      <RouteFetchProvider>
        <Consumer />
      </RouteFetchProvider>,
    );

    await waitFor(() => expect(firstSignal?.aborted).toBe(true));

    vi.unstubAllGlobals();
  });
});
