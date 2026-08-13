"use client";

/**
 * EagerSyncActivator — mounts inside the project workspace layout.
 *
 * Two responsibilities:
 *  1. Auto-warm on entry (once per 5 min, silent): fetches the offline snapshot
 *     + project API endpoints into the SW cache. Uses warmHtml: "minimal" (en only,
 *     hub + units + log) so common field routes work offline without the full
 *     20-page pre-download blast. Uses autoForce so any navigable project is cached.
 *  2. Eager sync interval: for projects that have offline enabled, starts a
 *     2-minute interval that silently re-syncs and flushes queued mutations.
 */

import { useEffect } from "react";
import {
  activateEagerSync,
  deactivateEagerSync,
  triggerResync,
} from "@/lib/offline/background-sync";
import { OFFLINE_SNAPSHOT_SYNCED_EVENT } from "@/lib/offline/events";

interface Props {
  projectId: string;
}

// Per-project auto-warm cooldown — sessionStorage survives Fast Refresh module resets in dev.
const AUTO_WARM_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes
const AUTO_WARM_STORAGE_PREFIX = "cc-auto-warm:";

function readAutoWarmTimestamp(projectId: string): number {
  if (typeof sessionStorage === "undefined") return 0;
  const raw = sessionStorage.getItem(`${AUTO_WARM_STORAGE_PREFIX}${projectId}`);
  const parsed = raw ? Number(raw) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function writeAutoWarmTimestamp(projectId: string, timestamp: number): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(`${AUTO_WARM_STORAGE_PREFIX}${projectId}`, String(timestamp));
}

export function EagerSyncActivator({ projectId }: Props) {
  useEffect(() => {
    // 1. Silent one-time auto-warm: cache snapshot + API data on entry.
    //    warmHtml is false — HTML pages are cached naturally as users navigate.
    //    Guarded by online check and per-project 5-minute cooldown.
    if (typeof navigator !== "undefined" && navigator.onLine) {
      const now = Date.now();
      const lastRan = readAutoWarmTimestamp(projectId);
      if (now - lastRan > AUTO_WARM_THROTTLE_MS) {
        writeAutoWarmTimestamp(projectId, now);
        triggerResync([projectId], undefined, {
          warmHtml: "minimal",
          autoForce: true,
        }).then((result) => {
          if (result.ok && result.syncedAt && typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent(OFFLINE_SNAPSHOT_SYNCED_EVENT, {
                detail: { projectId, syncedAt: result.syncedAt },
              })
            );
          }
        }).catch(() => {/* non-critical — offline or network error */});
      }
    }

    // 2. Eager 2-min interval for opted-in projects.
    activateEagerSync(projectId);
    return () => {
      deactivateEagerSync();
    };
  }, [projectId]);

  return null;
}
