/**
 * Shared issue display helpers — type pills, scope pills, age labels.
 */

export type IssueTypeKey =
  | "SUBSTRATE_CONDITION"
  | "DAMAGED_MATERIALS"
  | "MISSING_MATERIALS"
  | "TRADE_DAMAGE_REPAIR"
  | "OTHER";

export const ISSUE_TYPE_KEYS: IssueTypeKey[] = [
  "SUBSTRATE_CONDITION",
  "DAMAGED_MATERIALS",
  "MISSING_MATERIALS",
  "TRADE_DAMAGE_REPAIR",
  "OTHER",
];

/** Maps issue type code to display label — prefers catalog, then legacy i18n, then humanized code. */
export function resolveIssueTypeDisplayName(
  issueType: string | null | undefined,
  t?: (key: string) => string,
  catalog?: Array<{ code: string; displayName: string }>,
): string {
  const code = issueType?.trim() || "OTHER";
  const fromCatalog = catalog?.find((row) => row.code === code)?.displayName;
  if (fromCatalog) return fromCatalog;
  if (t && code in ISSUE_TYPE_I18N) {
    return t(ISSUE_TYPE_I18N[code as IssueTypeKey]);
  }
  return code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** @deprecated Use resolveIssueTypeDisplayName with catalog when available. */
export const ISSUE_TYPE_I18N: Record<IssueTypeKey, string> = {
  SUBSTRATE_CONDITION: "issueTypeSubstrate",
  DAMAGED_MATERIALS: "issueTypeDamagedMaterials",
  MISSING_MATERIALS: "issueTypeMissingMaterials",
  TRADE_DAMAGE_REPAIR: "issueTypeTradeDamage",
  OTHER: "issueTypeOther",
};

/** Maps issue type to a BEM modifier on `.issue-log-type-pill`. */
export function issueTypePillClass(issueType: string | null | undefined): string {
  const slug = (issueType?.trim() || "other").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `issue-log-type-pill issue-log-type-pill--${slug || "other"}`;
}

export type IssueRowVisualState = "resolved" | "blocking" | "open";

export function issueRowStateClass(
  status: string,
  isBlockingWork: boolean,
): IssueRowVisualState {
  if (status === "RESOLVED") return "resolved";
  if (isBlockingWork) return "blocking";
  return "open";
}

export function formatResponsibleParty(party: string): string {
  return party.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Format one or more responsible parties for display (comma-separated). */
export function formatResponsibleParties(
  parties: string[] | undefined,
  fallbackParty?: string,
): string {
  const list =
    parties && parties.length > 0
      ? parties
      : fallbackParty
        ? [fallbackParty]
        : [];
  return list.map(formatResponsibleParty).join(", ");
}

export function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export function formatIssueAgeLabel(
  issue: {
    status: string;
    createdAt: string;
    resolvedAt?: string | null;
  },
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  const isResolved = issue.status === "RESOLVED";
  const days = daysSince(issue.createdAt);

  if (isResolved) {
    const resolvedDays = daysSince(issue.resolvedAt ?? issue.createdAt);
    return t("issueAgeResolved", { days: resolvedDays });
  }
  if (days === 0) return t("issueAgeToday");
  if (days === 1) return t("issueAgeOneDay");
  return t("issueAgeDaysOpen", { days });
}

export function issueAgeTone(
  issue: { status: string; createdAt: string },
): "neutral" | "warning" | "critical" | "resolved" {
  if (issue.status === "RESOLVED") return "resolved";
  const days = daysSince(issue.createdAt);
  if (days >= 30) return "critical";
  if (days >= 14) return "warning";
  return "neutral";
}

interface ScopeTagRow {
  row?: { scopeType?: { name: string } | null } | null;
}

interface SubScopeTagRow {
  subScopeInstance?: {
    subScope?: { name: string };
    row?: { scopeType?: { name: string } | null };
  };
}

/** Build scope / sub-scope pill labels for an issue row. */
export function buildIssueScopePills(issue: {
  scopeTags?: ScopeTagRow[];
  subScopeTags?: SubScopeTagRow[];
}): string[] {
  const subsByScope: Record<string, string[]> = {};
  for (const st of issue.subScopeTags ?? []) {
    const inst = st.subScopeInstance;
    if (!inst) continue;
    const scopeName = inst.row?.scopeType?.name ?? "?";
    const child = inst.subScope?.name;
    if (!child) continue;
    (subsByScope[scopeName] ??= []).push(child);
  }

  const pills: string[] = [];
  const seenScopes = new Set<string>();

  for (const st of issue.scopeTags ?? []) {
    const scopeName = st.row?.scopeType?.name;
    if (!scopeName || seenScopes.has(scopeName)) continue;
    seenScopes.add(scopeName);
    const subs = subsByScope[scopeName];
    if (subs && subs.length > 0) {
      for (const sub of subs) pills.push(`${scopeName}: ${sub}`);
    } else {
      pills.push(scopeName);
    }
  }

  // Sub-scopes whose parent scope tag is missing
  for (const [parent, children] of Object.entries(subsByScope)) {
    if (seenScopes.has(parent)) continue;
    for (const child of children) pills.push(`${parent}: ${child}`);
  }

  return pills;
}
