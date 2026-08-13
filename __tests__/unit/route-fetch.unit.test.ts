import { describe, it, expect, vi } from "vitest";
import { createRouteFetch, isAbortError } from "@/lib/route-fetch";

describe("isAbortError", () => {
  it("detects DOMException AbortError", () => {
    expect(isAbortError(new DOMException("aborted", "AbortError"))).toBe(true);
  });

  it("detects Error AbortError", () => {
    expect(isAbortError(Object.assign(new Error("aborted"), { name: "AbortError" }))).toBe(true);
  });

  it("returns false for other errors", () => {
    expect(isAbortError(new Error("network"))).toBe(false);
  });
});

describe("createRouteFetch", () => {
  it("passes the route abort signal to fetch", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    const routeFetch = createRouteFetch(() => controller.signal);
    await routeFetch("/api/projects");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects",
      expect.objectContaining({ signal: controller.signal }),
    );

    vi.unstubAllGlobals();
  });

  it("aborts in-flight requests when the route signal aborts", async () => {
    const controller = new AbortController();
    let receivedSignal: AbortSignal | undefined;

    vi.stubGlobal(
      "fetch",
      vi.fn((_input: RequestInfo, init?: RequestInit) => {
        receivedSignal = init?.signal ?? undefined;
        return new Promise<Response>(() => {});
      }),
    );

    const routeFetch = createRouteFetch(() => controller.signal);
    void routeFetch("/api/projects");
    controller.abort();

    expect(receivedSignal?.aborted).toBe(true);

    vi.unstubAllGlobals();
  });
});
