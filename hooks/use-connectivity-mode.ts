"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearConnectivityCache,
  type ConnectivityQuality,
  notifyConnectivityQualityChange,
  probeConnectivityQuality,
} from "@/lib/offline/connectivity";

const PROBE_INTERVAL_MS = 60_000;

export interface ConnectivityMode {
  quality: ConnectivityQuality;
  /** True when online but probe says slow, or browser is offline. */
  isDegraded: boolean;
  isOnline: boolean;
}

/**
 * Tracks connectivity quality beyond navigator.onLine.
 * Probes on mount, on online/offline, visibility change, and every 60s while focused.
 */
export function useConnectivityMode(): ConnectivityMode {
  const [quality, setQuality] = useState<ConnectivityQuality>("good");
  const [isOnline, setIsOnline] = useState(true);
  const previousQualityRef = useRef<ConnectivityQuality>("good");

  const runProbe = useCallback(async () => {
    if (typeof navigator === "undefined") return;

    const next = navigator.onLine ? await probeConnectivityQuality() : "offline";
    setIsOnline(navigator.onLine);
    const prev = previousQualityRef.current;
    previousQualityRef.current = next;
    setQuality(next);
    notifyConnectivityQualityChange(prev, next);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    queueMicrotask(() => {
      void runProbe();
    });

    function handleOnline() {
      clearConnectivityCache();
      void runProbe();
    }

    function handleOffline() {
      clearConnectivityCache();
      const prev = previousQualityRef.current;
      previousQualityRef.current = "offline";
      setIsOnline(false);
      setQuality("offline");
      notifyConnectivityQualityChange(prev, "offline");
    }

    function handleVisibility() {
      if (document.visibilityState === "visible") {
        void runProbe();
      }
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibility);

    const intervalId = setInterval(() => {
      if (document.visibilityState === "visible") {
        void runProbe();
      }
    }, PROBE_INTERVAL_MS);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
      clearInterval(intervalId);
    };
  }, [runProbe]);

  const isDegraded = !isOnline || quality !== "good";

  return { quality, isDegraded, isOnline };
}

export { subscribeConnectivityQuality } from "@/lib/offline/connectivity";
