"use client";

/**
 * useOfflineData — fetch hook with offline snapshot fallback.
 *
 * Priority:
 *  1. Online → normal fetch (SW automatically caches to project-api-v1)
 *  2. Offline + SW cache hit → SW serves stale response transparently (hook sees success)
 *  3. Any fetch failure → reads offline-data-v1 snapshot, extracts the requested module
 *
 * Returns { data, loading, isFromCache, cacheDate }.
 * `isFromCache` is true only for case 3 (explicit snapshot fallback).
 */

import { useEffect, useRef, useState } from "react";
import { readSnapshotModule } from "@/lib/offline/snapshot-cache";

interface UseOfflineDataResult<T> {
  data: T | null;
  loading: boolean;
  isFromCache: boolean;
  cacheDate: string | null;
}

export function useOfflineData<T>(
  url: string,
  snapshotModule: string,
  snapshotExtractor: (data: unknown) => T,
  projectId?: string,
): UseOfflineDataResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFromCache, setIsFromCache] = useState(false);
  const [cacheDate, setCacheDate] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    let cancelled = false;

    async function loadFromSnapshot(): Promise<boolean> {
      const cached = await readSnapshotModule<unknown>(snapshotModule, projectId);
      if (!cached || cancelled) return false;
      setData(snapshotExtractor(cached.data));
      setIsFromCache(true);
      setCacheDate(cached.generatedAt);
      return true;
    }

    async function load() {
      setLoading(true);
      setIsFromCache(false);
      setCacheDate(null);

      try {
        const res = await fetch(url, { signal: ctrl.signal });
        if (res.status === 401 || res.status === 403) {
          if (!cancelled) {
            setData(null);
            setLoading(false);
          }
          return;
        }
        if (!cancelled && res.ok) {
          const json = (await res.json()) as T;
          setData(json);
          setLoading(false);
          return;
        }
      } catch {
        // Network failure or SW miss — fall through to snapshot
      }

      await loadFromSnapshot();
      if (!cancelled) setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [url, snapshotModule, snapshotExtractor, projectId]);

  return { data, loading, isFromCache, cacheDate };
}
