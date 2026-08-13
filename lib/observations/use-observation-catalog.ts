"use client";

import { useCallback, useEffect, useState } from "react";
import type { PublicObservationTypeCatalogItem } from "@/lib/observations/observation-catalog";
import { readSnapshotModule } from "@/lib/offline/snapshot-cache";

export interface ObservationCatalogPayload {
  observationTypes: PublicObservationTypeCatalogItem[];
}

export interface ObservationCatalogState extends ObservationCatalogPayload {
  loading: boolean;
  error: string | null;
  reload: () => void;
}

const EMPTY_CATALOG: ObservationCatalogPayload = {
  observationTypes: [],
};

export async function fetchObservationCatalogClient(
  projectId?: string,
): Promise<ObservationCatalogPayload> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const cached = await readSnapshotModule<ObservationCatalogPayload>(
      "observation-catalog",
      projectId,
    );
    if (cached?.data?.observationTypes?.length) return cached.data;
  }

  const res = await fetch("/api/observation-catalog");
  if (!res.ok) {
    throw new Error(`observation-catalog:${res.status}`);
  }
  return (await res.json()) as ObservationCatalogPayload;
}

export function useObservationCatalog(projectId?: string): ObservationCatalogState {
  const [catalog, setCatalog] = useState<ObservationCatalogPayload>(EMPTY_CATALOG);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => {
    setReloadToken((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const data = await fetchObservationCatalogClient(projectId);
        if (!cancelled) setCatalog(data);
      } catch {
        if (!cancelled) {
          setCatalog(EMPTY_CATALOG);
          setError("load_failed");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, reloadToken]);

  return { ...catalog, loading, error, reload };
}

export function resolveObservationTypeLabel(
  code: string,
  observationTypes: PublicObservationTypeCatalogItem[],
  fallback?: (code: string) => string,
): string {
  const row = observationTypes.find((t) => t.code === code);
  if (row?.displayName) return row.displayName;
  return fallback ? fallback(code) : code.replace(/_/g, " ");
}
