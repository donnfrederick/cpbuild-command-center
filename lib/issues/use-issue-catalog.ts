"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  PublicIssueTypeCatalogItem,
  PublicResponsiblePartyCatalogItem,
} from "@/lib/issues/issue-catalog";
import { readSnapshotModule } from "@/lib/offline/snapshot-cache";

export interface IssueCatalogPayload {
  issueTypes: PublicIssueTypeCatalogItem[];
  responsibleParties: PublicResponsiblePartyCatalogItem[];
}

export interface IssueCatalogState extends IssueCatalogPayload {
  loading: boolean;
  error: string | null;
  reload: () => void;
}

const EMPTY_CATALOG: IssueCatalogPayload = {
  issueTypes: [],
  responsibleParties: [],
};

export async function fetchIssueCatalogClient(
  projectId?: string,
): Promise<IssueCatalogPayload> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const cached = await readSnapshotModule<IssueCatalogPayload>("issue-catalog", projectId);
    if (cached?.data?.issueTypes?.length) return cached.data;
  }

  const res = await fetch("/api/issue-catalog");
  if (!res.ok) {
    throw new Error(`issue-catalog:${res.status}`);
  }
  return (await res.json()) as IssueCatalogPayload;
}

export function useIssueCatalog(projectId?: string): IssueCatalogState {
  const [catalog, setCatalog] = useState<IssueCatalogPayload>(EMPTY_CATALOG);
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
        const data = await fetchIssueCatalogClient(projectId);
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

export function issueTypeRequiresVisual(
  code: string,
  issueTypes: PublicIssueTypeCatalogItem[],
): boolean {
  return issueTypes.find((row) => row.code === code)?.requiresVisual === true;
}

export function resolveIssueTypeLabel(
  code: string,
  issueTypes: PublicIssueTypeCatalogItem[],
  fallback?: (code: string) => string,
): string {
  const row = issueTypes.find((t) => t.code === code);
  if (row?.displayName) return row.displayName;
  return fallback ? fallback(code) : code.replace(/_/g, " ");
}

export function resolvePartyLabel(
  code: string,
  parties: PublicResponsiblePartyCatalogItem[],
  fallback?: (code: string) => string,
): string {
  const row = parties.find((p) => p.code === code);
  if (row?.displayName) return row.displayName;
  return fallback ? fallback(code) : code.replace(/_/g, " ");
}
