export function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof Error && err.name === "AbortError") return true;
  return false;
}

function mergeAbortSignals(routeSignal: AbortSignal, callerSignal?: AbortSignal | null): AbortSignal {
  if (!callerSignal) return routeSignal;
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([routeSignal, callerSignal]);
  }
  if (callerSignal.aborted) return callerSignal;
  if (routeSignal.aborted) return routeSignal;
  const controller = new AbortController();
  const abort = () => controller.abort();
  routeSignal.addEventListener("abort", abort, { once: true });
  callerSignal.addEventListener("abort", abort, { once: true });
  return controller.signal;
}

export type RouteFetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function createRouteFetch(getRouteSignal: () => AbortSignal): RouteFetchFn {
  return (input, init) => {
    const routeSignal = getRouteSignal();
    const signal = mergeAbortSignals(routeSignal, init?.signal);
    return fetch(input, { ...init, signal });
  };
}
