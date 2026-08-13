"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  getBrowserOnlineSnapshot,
  initBrowserOnlineStatusTracking,
  subscribeBrowserOnlineStatus,
} from "@/lib/offline/browser-online-status";

export function useOfflineStatus() {
  const [wasOffline, setWasOffline] = useState(false);
  const prevOnlineRef = useRef(true);
  const wasOfflineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    initBrowserOnlineStatusTracking();
  }, []);

  const isOnline = useSyncExternalStore(
    subscribeBrowserOnlineStatus,
    getBrowserOnlineSnapshot,
    () => true,
  );

  useEffect(() => {
    const prev = prevOnlineRef.current;

    queueMicrotask(() => {
      if (isOnline && !prev) {
        setWasOffline(true);
        if (wasOfflineTimerRef.current) clearTimeout(wasOfflineTimerRef.current);
        wasOfflineTimerRef.current = setTimeout(() => setWasOffline(false), 4000);
      }

      if (!isOnline) {
        setWasOffline(false);
        if (wasOfflineTimerRef.current) {
          clearTimeout(wasOfflineTimerRef.current);
          wasOfflineTimerRef.current = null;
        }
      }
    });

    prevOnlineRef.current = isOnline;
  }, [isOnline]);

  useEffect(() => {
    return () => {
      if (wasOfflineTimerRef.current) clearTimeout(wasOfflineTimerRef.current);
    };
  }, []);

  return { isOnline, wasOffline };
}
