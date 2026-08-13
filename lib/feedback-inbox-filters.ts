/**
 * Pure helpers for the feedback inbox list — used by FeedbackInbox (client) and unit tests.
 */

export type FeedbackInboxView = "all" | "mine";

export type FeedbackInboxTypeFilter = "ALL" | "BUG" | "FEATURE_REQUEST";

export type FeedbackInboxPriorityFilter = "ALL" | "NONE" | "LOW" | "MEDIUM" | "HIGH";

export type FeedbackInboxEnvironmentFilter = "ALL" | "development" | "production";

export interface FeedbackInboxRowShape {
  assignee?: { id: string; name?: string | null; email?: string | null } | null;
  status: string;
  type: string;
  priority?: string | null;
  title: string;
  description: string;
  environment?: string;
}

export interface FeedbackInboxFilterCriteria {
  view: FeedbackInboxView;
  currentUserId: string;
  typeFilter: FeedbackInboxTypeFilter;
  priorityFilter: FeedbackInboxPriorityFilter;
  environmentFilter: FeedbackInboxEnvironmentFilter;
  /** Lowercased trimmed search string (caller normalizes). */
  search: string;
}

export function filterFeedbackInboxRows<T extends FeedbackInboxRowShape>(
  rows: T[],
  criteria: FeedbackInboxFilterCriteria
): T[] {
  let out = rows;

  if (criteria.view === "mine") {
    out = out.filter((r) => r.assignee?.id === criteria.currentUserId);
  }

  if (criteria.typeFilter !== "ALL") {
    out = out.filter((r) => r.type === criteria.typeFilter);
  }

  if (criteria.priorityFilter === "NONE") {
    out = out.filter((r) => r.priority == null);
  } else if (criteria.priorityFilter !== "ALL") {
    out = out.filter((r) => r.priority === criteria.priorityFilter);
  }

  if (criteria.environmentFilter !== "ALL") {
    out = out.filter((r) => {
      const env = r.environment ?? "development";
      return env === criteria.environmentFilter;
    });
  }

  if (criteria.search.length > 0) {
    const q = criteria.search;
    out = out.filter((r) => {
      const t = `${r.title} ${r.description}`.toLowerCase();
      return t.includes(q);
    });
  }

  return out;
}
