/**
 * Trust gate for bot-authored PRs that agents may rerun CI on and auto-merge
 * without Phil manually clicking "Approve and run" in GitHub Actions.
 *
 * Dependabot: always eligible (subject to security-sensitive path check elsewhere).
 * github-actions: only docs-only metrics or session-checklist refreshes.
 */

export const BOT_PR_SECURITY_SENSITIVE_PATHS = [
  "lib/auth.ts",
  "lib/permissions.ts",
  "lib/auth/",
  "prisma/schema.prisma",
  "proxy.ts",
  ".github/workflows/deploy.yml",
] as const;

export interface BotPrTrustInput {
  authorLogin: string;
  labels: string[];
  changedFiles: string[];
}

export function isDependabotAuthor(authorLogin: string): boolean {
  return /dependabot/i.test(authorLogin);
}

export function isGitHubActionsAuthor(authorLogin: string): boolean {
  return /github-actions/i.test(authorLogin);
}

export function touchesSecuritySensitivePath(changedFiles: string[]): boolean {
  return changedFiles.some((file) =>
    BOT_PR_SECURITY_SENSITIVE_PATHS.some(
      (pattern) => file === pattern || file.startsWith(pattern)
    )
  );
}

/** Docs-only session-checklist refresh from distill-learnings.yml */
export function isSessionChecklistOnlyPr(changedFiles: string[]): boolean {
  return (
    changedFiles.length > 0 &&
    changedFiles.every(
      (f) => f === "docs/agent-context/session-checklist.md"
    )
  );
}

/** Rolling metrics PR from track-copilot-rounds.yml */
export function isMetricsAutoPr(labels: string[]): boolean {
  return labels.includes("metrics-auto");
}

export function isMetricsAutoFilesOnly(changedFiles: string[]): boolean {
  const allowed = new Set([
    "docs/COPILOT_ROUNDS_METRICS.jsonl",
    "docs/agent-context/copilot-rounds-dashboard.md",
  ]);
  return (
    changedFiles.length > 0 &&
    changedFiles.every((f) => allowed.has(f))
  );
}

/**
 * Returns true when agents may rerun blocked CI and auto-merge without Phil.
 */
export function isTrustedBotPrForAutoMerge(input: BotPrTrustInput): boolean {
  if (touchesSecuritySensitivePath(input.changedFiles)) {
    return false;
  }

  if (isDependabotAuthor(input.authorLogin)) {
    return true;
  }

  if (!isGitHubActionsAuthor(input.authorLogin)) {
    return false;
  }

  return (
    isMetricsAutoPr(input.labels) ||
    isMetricsAutoFilesOnly(input.changedFiles) ||
    isSessionChecklistOnlyPr(input.changedFiles)
  );
}
