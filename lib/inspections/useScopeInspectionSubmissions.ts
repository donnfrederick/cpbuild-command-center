"use client";

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listByScope, type InspectionSubmission } from "@/lib/inspections/submissionsApi";
import {
  deriveScopeGridInspectionFromSubmissions,
  type ScopeGridInspectionDerived,
  type ScopeGridInspectionLocalUpdates,
} from "@/lib/inspections/scope-grid-inspection-display";
import {
  latestScopeInspectionStatusSubmission,
  submissionAuthoritativeForScopeInspectionStatus,
} from "@/lib/inspections/scope-inspection-display";
import type { ScopeStage, ScopeStatus } from "@/lib/unit-scope-progress";
import type { InspectionStatus } from "@/lib/scope-square-style";

export type { ScopeGridInspectionLocalUpdates };

function submissionsForScope(
  scopeRowId: string,
  all: InspectionSubmission[],
): InspectionSubmission[] {
  return all
    .filter((s) => s.scopeRowId === scopeRowId)
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
}

/**
 * Loads inspection submissions for a scope and syncs grid tile display from
 * submission history (local-only). Optionally PATCHes project_rows.inspectionStatus
 * when the scope is already INSTALL+COMPLETE.
 */
export function useScopeInspectionSubmissions(
  scopeRowId: string,
  options?: {
    scopeStage?: ScopeStage;
    scopeStatus?: ScopeStatus;
    inspectionStatus?: InspectionStatus;
    /** Preloaded project submissions — avoids empty state on location viewer open. */
    initialSubmissions?: InspectionSubmission[];
    /** Local card state — never hits the API; keeps grid tiles in sync with submissions. */
    applyLocalScopeUpdates?: (updates: ScopeGridInspectionLocalUpdates) => void;
    patchScopeRow?: (updates: { inspectionStatus: InspectionStatus | null }) => Promise<boolean> | void;
  },
) {
  const initialForScope = useMemo(
    () => submissionsForScope(scopeRowId, options?.initialSubmissions ?? []),
    [scopeRowId, options?.initialSubmissions],
  );

  const [submissions, setSubmissions] = useState<InspectionSubmission[]>(initialForScope);
  const [hydrated, setHydrated] = useState(initialForScope.length > 0);
  const mountedRef = useRef(false);
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const applyGridFromSubmissions = useCallback((fetched: InspectionSubmission[]) => {
    const opts = optionsRef.current;
    const derived = deriveScopeGridInspectionFromSubmissions(fetched);
    opts?.applyLocalScopeUpdates?.({
      gridInspectionStatus: derived?.gridInspectionStatus ?? null,
      latestInspectionCategory: derived?.latestInspectionCategory ?? null,
    });

    const patchScopeRow = opts?.patchScopeRow;
    const latestAuthoritative = latestScopeInspectionStatusSubmission(fetched);
    if (
      patchScopeRow &&
      derived &&
      latestAuthoritative &&
      submissionAuthoritativeForScopeInspectionStatus(latestAuthoritative)
    ) {
      const atInstallComplete =
        opts.scopeStage === "INSTALL" && opts.scopeStatus === "COMPLETE";
      const expected = derived.gridInspectionStatus;
      if (atInstallComplete && opts.inspectionStatus !== expected) {
        void patchScopeRow({ inspectionStatus: expected });
      }
    } else if (patchScopeRow && !derived && opts?.inspectionStatus != null) {
      const atInstallComplete =
        opts.scopeStage === "INSTALL" && opts.scopeStatus === "COMPLETE";
      if (atInstallComplete) {
        void patchScopeRow({ inspectionStatus: null });
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (initialForScope.length === 0) return;
    startTransition(() => {
      setSubmissions(initialForScope);
      setHydrated(true);
    });
    applyGridFromSubmissions(initialForScope);
  }, [initialForScope, applyGridFromSubmissions]);

  const refresh = useCallback(() => {
    listByScope(scopeRowId)
      .then((fetched) => {
        if (!mountedRef.current) return;
        startTransition(() => {
          setSubmissions(fetched);
          setHydrated(true);
        });
        applyGridFromSubmissions(fetched);
      })
      .catch((err) => {
        if (!mountedRef.current) return;
        console.warn("[useScopeInspectionSubmissions] Failed to load", err);
        startTransition(() => setHydrated(true));
      });
  }, [scopeRowId, applyGridFromSubmissions]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { submissions, hydrated, refresh, setSubmissions };
}
