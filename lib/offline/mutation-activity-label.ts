/**
 * English activity-log labels for queued mutation rows (server metadata + summaries).
 */

import type { MutationType, QueuedMutation } from "@/lib/offline/mutation-queue";
import { combinedOptionDisplay } from "@/lib/scope-combined-options";
import type { ScopeStage, ScopeStatus } from "@/lib/unit-scope-progress";

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function truncate(value: string, max = 56): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function formatUnitRef(unitRef: string | null | undefined): string {
  if (!unitRef) return "";
  const [building = "", level = "", unit = ""] = unitRef.split("|");
  if (unit.trim()) return unit.trim();
  return [building, level].filter(Boolean).join(" · ");
}

function formatDirectLocation(body: Record<string, unknown>): string {
  const unit = String(body.unit ?? "").trim();
  if (unit) return unit;
  const building = String(body.building ?? "").trim();
  const level = String(body.level ?? "").trim();
  return [building, level].filter(Boolean).join(" · ");
}

function formatScopeStatus(body: Record<string, unknown>): string {
  const stage = typeof body.scopeStage === "string" ? body.scopeStage : null;
  const status = typeof body.scopeStatus === "string" ? body.scopeStatus : null;
  if (stage && status) {
    return combinedOptionDisplay(stage as ScopeStage, status as ScopeStatus).label;
  }
  return [stage, status].filter(Boolean).join(" / ");
}

/** Short English label stored on MUTATION_SYNC_FAILED activity metadata. */
export function mutationActivityItemSummary(mutation: Pick<QueuedMutation, "type" | "body">): string {
  const body = asRecord(mutation.body);
  switch (mutation.type) {
    case "unit-status": {
      const location = formatDirectLocation(body);
      const status = formatScopeStatus(body) || "—";
      return location
        ? `Scope status · ${location} → ${status}`
        : `Scope status → ${status}`;
    }
    case "create-observation": {
      const title = truncate(String(body.title ?? body.description ?? ""));
      const location = formatUnitRef(typeof body.unitRef === "string" ? body.unitRef : null);
      if (title && location) return `Observation · ${location} · "${title}"`;
      if (title) return `Observation · "${title}"`;
      if (location) return `Observation · ${location}`;
      return "Observation";
    }
    case "update-observation": {
      const title = truncate(String(body.title ?? body.description ?? ""));
      return title ? `Observation update · "${title}"` : "Observation update";
    }
    case "create-issue": {
      const description = truncate(String(body.shortDescription ?? ""));
      const location = formatUnitRef(typeof body.unitRef === "string" ? body.unitRef : null);
      if (description && location) return `Issue · ${location} · "${description}"`;
      if (description) return `Issue · "${description}"`;
      if (location) return `Issue · ${location}`;
      return "Issue";
    }
    case "add-comment": {
      const preview = truncate(String(body.body ?? ""));
      return preview ? `Comment · "${preview}"` : "Comment";
    }
    case "link-status-album-photo": {
      const location = truncate(String(body.sourceLabel ?? ""));
      return location ? `Status photo · ${location}` : "Status photo";
    }
    case "create-custom-site-location": {
      const name = truncate(String(body.name ?? ""));
      return name ? `Custom location · "${name}"` : "Custom location";
    }
    case "create-project-note":
    case "edit-project-note": {
      const preview = truncate(String(body.body ?? ""));
      return preview ? `Project note · "${preview}"` : "Project note";
    }
    case "delete-project-note":
      return "Project note deletion";
    case "pin-project-note":
      return Boolean(body.pinned) ? "Pin project note" : "Unpin project note";
    default:
      return "Queued change";
  }
}

export function mutationActivityTypeLabel(type: MutationType): string {
  switch (type) {
    case "unit-status":
      return "Scope status";
    case "create-observation":
      return "Observation";
    case "update-observation":
      return "Observation update";
    case "create-issue":
      return "Issue";
    case "add-comment":
      return "Comment";
    case "link-status-album-photo":
      return "Status photo";
    case "create-custom-site-location":
      return "Custom location";
    case "create-project-note":
      return "Project note";
    case "edit-project-note":
      return "Project note update";
    case "delete-project-note":
      return "Project note deletion";
    case "pin-project-note":
      return "Pin project note";
    default:
      return "Queued change";
  }
}
