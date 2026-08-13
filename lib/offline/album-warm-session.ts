/**
 * Session-scoped album warm policy for background resync (not full pre-download).
 *
 * - First background resync per project per browser tab: warm all unit album routes
 *   (restores offline album access without manual pre-download).
 * - Later resyncs: warm only units the user has viewed this session (touched refs).
 *
 * Full explicit pre-download (`warmHtml: true`) always warms all units and bypasses this.
 */

import { albumWarmApiUrls } from "@/lib/offline/project-warm-paths";

const SESSION_FULL_WARM_PREFIX = "cc-album-full-warm:";
const TOUCHED_UNITS_PREFIX = "cc-album-touched:";

function readSessionFlag(key: string): boolean {
  if (typeof sessionStorage === "undefined") return false;
  return sessionStorage.getItem(key) === "1";
}

function writeSessionFlag(key: string): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(key, "1");
}

function fullWarmKey(projectId: string): string {
  return `${SESSION_FULL_WARM_PREFIX}${projectId}`;
}

function touchedKey(projectId: string): string {
  return `${TOUCHED_UNITS_PREFIX}${projectId}`;
}

export function hasSessionFullAlbumWarm(projectId: string): boolean {
  return readSessionFlag(fullWarmKey(projectId));
}

export function markSessionFullAlbumWarm(projectId: string): void {
  writeSessionFlag(fullWarmKey(projectId));
}

/** Record that the user opened this unit's detail/media this session. */
export function markUnitAlbumTouched(projectId: string, unitRef: string): void {
  if (typeof sessionStorage === "undefined" || !unitRef) return;
  const key = touchedKey(projectId);
  const raw = sessionStorage.getItem(key);
  let refs: string[] = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        refs = parsed.filter((r): r is string => typeof r === "string" && r.length > 0);
      }
    } catch {
      refs = [];
    }
  }
  if (refs.includes(unitRef)) return;
  refs.push(unitRef);
  sessionStorage.setItem(key, JSON.stringify(refs));
}

export function getTouchedUnitRefs(projectId: string): string[] {
  if (typeof sessionStorage === "undefined") return [];
  const raw = sessionStorage.getItem(touchedKey(projectId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((r): r is string => typeof r === "string" && r.length > 0);
  } catch {
    return [];
  }
}

export interface BackgroundAlbumWarmPlan {
  urls: string[];
  /** Call after album batch succeeds — marks first full warm complete for these projects. */
  markFullWarmProjectIds: string[];
}

/**
 * Album URLs to warm during a background resync (not full pre-download).
 */
export function planBackgroundAlbumWarm(
  projectIds: string[],
  unitRefsByProjectId: Readonly<Record<string, string[]>>,
): BackgroundAlbumWarmPlan {
  const urls: string[] = [];
  const markFullWarmProjectIds: string[] = [];

  for (const projectId of projectIds) {
    const allRefs = unitRefsByProjectId[projectId] ?? [];
    if (allRefs.length === 0) continue;

    if (!hasSessionFullAlbumWarm(projectId)) {
      urls.push(...albumWarmApiUrls(projectId, allRefs));
      markFullWarmProjectIds.push(projectId);
      continue;
    }

    const touched = getTouchedUnitRefs(projectId);
    if (touched.length > 0) {
      urls.push(...albumWarmApiUrls(projectId, touched));
    }
  }

  return { urls, markFullWarmProjectIds };
}

/** Test helper — reset session keys for a project. */
export function resetAlbumWarmSessionForProject(projectId: string): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(fullWarmKey(projectId));
  sessionStorage.removeItem(touchedKey(projectId));
}
