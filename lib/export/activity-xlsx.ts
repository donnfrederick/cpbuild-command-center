import * as XLSX from "xlsx";
import {
  buildActivityExportSummary,
  getActivityEventTypeLabel,
  getActivityExportLocation,
  type ActivityEventForPdf,
} from "@/lib/export/activity-export-format";
import {
  formatOfflineCacheDurationCompactEn,
  offlineQueuedAtIso,
  resolveOfflineCacheDurationMs,
} from "@/lib/activity/offline-replay-display";

export interface BuildActivityXlsxOptions {
  events: ActivityEventForPdf[];
  /** When set, adds a Project column resolved through this map. */
  projectLabelById?: Map<string, string>;
}

function fmtExportDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtExportTime(d: Date): string {
  return d.toISOString().slice(11, 16);
}

function locationParts(event: ActivityEventForPdf): { building: string; level: string; unit: string } {
  const m = event.metadata;
  return {
    building: (m.building as string | null) ?? "",
    level: (m.level as string | null) ?? "",
    unit: (m.unit as string | null) ?? "",
  };
}

export function buildActivityXlsx(opts: BuildActivityXlsxOptions): Buffer {
  const { events, projectLabelById } = opts;
  const includeProject = !!projectLabelById;

  const headers = includeProject
    ? ["Date", "Time", "Event Type", "Summary", "Location", "Building", "Level", "Unit", "Queued At (offline)", "Cache Duration", "Project", "User"]
    : ["Date", "Time", "Event Type", "Summary", "Location", "Building", "Level", "Unit", "Queued At (offline)", "Cache Duration", "User"];

  const rows = events.map((event) => {
    const createdAt = new Date(event.createdAt);
    const { building, level, unit } = locationParts(event);
    const queuedAt = offlineQueuedAtIso(event.metadata);
    const cacheMs = resolveOfflineCacheDurationMs(
      event.metadata,
      createdAt.toISOString(),
    );
    const base = [
      fmtExportDate(createdAt),
      fmtExportTime(createdAt),
      getActivityEventTypeLabel(event.eventType),
      buildActivityExportSummary(event),
      getActivityExportLocation(event),
      building,
      level,
      unit,
      queuedAt ? queuedAt.slice(0, 16).replace("T", " ") : "",
      cacheMs !== null ? formatOfflineCacheDurationCompactEn(cacheMs) : "",
    ];

    if (includeProject) {
      return [
        ...base,
        projectLabelById.get(event.projectId ?? "") ?? event.projectId ?? "",
        event.userName ?? "",
      ];
    }

    return [...base, event.userName ?? ""];
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Activity Log");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
