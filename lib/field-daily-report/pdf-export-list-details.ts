import type { IssueSummary, ObsSummary } from "@/components/projects/UnitCards";
import { buildIssueScopePills, formatResponsibleParties } from "@/lib/issues/issueDisplay";

const OBS_TYPE_LABELS: Record<string, string> = {
  QUALITY: "Quality",
  PROGRESS: "Progress",
  SAFETY: "Safety",
  OTHER: "Other",
};

function humanizeEnum(value: string): string {
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Detail lines for issues — mirrors IssueLogRow body fields in plain text. */
export function buildIssuePdfDetailLines(issue: IssueSummary): string[] {
  const lines: string[] = [];
  const typeLabel = humanizeEnum(issue.issueType);
  if (typeLabel) lines.push(`Type: ${typeLabel}`);
  if (issue.isBlockingWork && issue.status !== "RESOLVED") {
    lines.push("Blocking work");
  }
  const scopePills = buildIssueScopePills(issue);
  if (scopePills.length > 0) {
    lines.push(`Scopes: ${scopePills.join(", ")}`);
  }
  const responsible = formatResponsibleParties(issue.responsibleParties, issue.responsibleParty);
  if (responsible) {
    lines.push(`Responsible: ${responsible}`);
  }
  if (issue.notes?.trim()) {
    lines.push(issue.notes.trim());
  }
  if (issue.status === "RESOLVED") {
    lines.push("Status: Resolved");
    if (issue.resolutionNote?.trim()) {
      lines.push(`Resolution: ${issue.resolutionNote.trim()}`);
    }
  }
  return lines;
}

/** Detail lines for observations — type, description, author. */
export function buildObservationPdfDetailLines(obs: ObsSummary): string[] {
  const lines: string[] = [];
  const typeLabel = OBS_TYPE_LABELS[obs.observationType] ?? humanizeEnum(obs.observationType);
  if (typeLabel) lines.push(`Type: ${typeLabel}`);
  const title = obs.title?.trim() ?? "";
  const description = obs.description?.trim() ?? "";
  if (description && description !== title) {
    lines.push(description);
  } else if (description && !title) {
    lines.push(description);
  }
  const author = obs.author.name ?? obs.author.email.split("@")[0];
  if (author) lines.push(`By ${author}`);
  return lines;
}
