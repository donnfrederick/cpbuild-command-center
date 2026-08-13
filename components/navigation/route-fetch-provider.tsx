"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import { usePathname } from "@/i18n/navigation";
import { createRouteFetch, type RouteFetchFn } from "@/lib/route-fetch";

type RouteFetchContextValue = {
  routeFetch: RouteFetchFn;
  getRouteSignal: () => AbortSignal;
};

const RouteFetchContext = createContext<RouteFetchContextValue | null>(null);

export function RouteFetchProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams?.toString() ?? "";
  const controllerRef = useRef<AbortController>(new AbortController());

  useLayoutEffect(() => {
    controllerRef.current.abort();
    controllerRef.current = new AbortController();
  }, [pathname, searchKey]);

  const getRouteSignal = useCallback(() => controllerRef.current.signal, []);

  const routeFetch = useCallback<RouteFetchFn>(
    (input, init) => createRouteFetch(getRouteSignal)(input, init),
    [getRouteSignal],
  );

  const value = useMemo(
    () => ({
      getRouteSignal,
      routeFetch,
    }),
    [getRouteSignal, routeFetch],
  );

  return (
    <RouteFetchContext.Provider value={value}>{children}</RouteFetchContext.Provider>
  );
}

export function useRouteFetch(): RouteFetchFn {
  const ctx = useContext(RouteFetchContext);
  if (!ctx) {
    throw new Error("useRouteFetch must be used within RouteFetchProvider");
  }
  return ctx.routeFetch;
}

/** Falls back to global `fetch` when rendered outside RouteFetchProvider (e.g. isolated unit tests). */
export function useOptionalRouteFetch(): RouteFetchFn {
  const ctx = useContext(RouteFetchContext);
  return ctx?.routeFetch ?? fetch;
}

export function useRouteFetchSignal(): AbortSignal {
  const ctx = useContext(RouteFetchContext);
  if (!ctx) {
    throw new Error("useRouteFetchSignal must be used within RouteFetchProvider");
  }
  return ctx.getRouteSignal();
}
