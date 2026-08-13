/**
 * GitHub activity fetcher for the Morning Briefing pipeline.
 *
 * Fetches merged PRs and commits from the cp-build-dev-ops/command-center-reboot
 * repo using the GITHUB_TOKEN env var. Returns empty arrays when the token is
 * absent so the briefing degrades gracefully in local dev.
 */

import type { MergedPR, OpenPR, RecentCommit } from "@/lib/ai/types";

const REPO = "cp-build-dev-ops/command-center-reboot";
const GITHUB_API = "https://api.github.com";

function getToken(): string | null {
  return process.env.GITHUB_TOKEN ?? null;
}

function githubHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

/** Returns the start-of-day (midnight UTC) for a Date. */
function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Fetch PRs that were merged on `targetDate` (UTC).
 *
 * Uses the GitHub Search API (merged:YYYY-MM-DD) instead of the closed-PRs
 * list endpoint. The list endpoint sorts by `updated_at`, so Copilot comments
 * on old PRs push recently-merged PRs off the first page. The Search API
 * filters by merge date at the query level and always returns the correct set.
 *
 * Rate limit: 30 authenticated requests/min — fine for a daily briefing.
 */
export async function fetchMergedPRs(targetDate: Date): Promise<MergedPR[]> {
  const token = getToken();
  if (!token) return [];

  const dateStr = targetDate.toISOString().slice(0, 10); // YYYY-MM-DD UTC

  try {
    const q = encodeURIComponent(
      `repo:${REPO} is:pr is:merged merged:${dateStr}`
    );
    const url = `${GITHUB_API}/search/issues?q=${q}&per_page=100&sort=updated&order=desc`;
    const res = await fetch(url, { headers: githubHeaders(token) });

    if (!res.ok) {
      console.warn(`[github-activity] PRs search failed: ${res.status} ${res.statusText}`);
      return [];
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: { items: any[] } = await res.json();

    return (body.items ?? []).map((item) => ({
      number: item.number as number,
      title: item.title as string,
      url: item.html_url as string,
      // Search API pull_request object contains URLs but merged_at is not always
      // populated. closed_at is a reliable fallback: for is:merged PRs, closed
      // and merged happen simultaneously.
      mergedAt: (item.pull_request?.merged_at ?? item.closed_at ?? "") as string,
      author: (item.user?.login ?? "unknown") as string,
      body: ((item.body ?? "") as string).slice(0, 1000),
    }));
  } catch (err) {
    console.warn("[github-activity] Failed to fetch merged PRs:", err);
    return [];
  }
}

/**
 * Fetch commits pushed to the default branch on `targetDate` (UTC).
 * Capped at 50 commits — enough for a daily summary.
 */
export async function fetchRecentCommits(targetDate: Date): Promise<RecentCommit[]> {
  const token = getToken();
  if (!token) return [];

  const since = startOfDay(targetDate).toISOString();
  const until = new Date(startOfDay(targetDate).getTime() + 24 * 60 * 60 * 1000).toISOString();

  try {
    const url = `${GITHUB_API}/repos/${REPO}/commits?since=${since}&until=${until}&per_page=50`;
    const res = await fetch(url, { headers: githubHeaders(token) });

    if (!res.ok) {
      console.warn(`[github-activity] Commits fetch failed: ${res.status} ${res.statusText}`);
      return [];
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const commits: any[] = await res.json();

    return commits.map((c) => ({
      sha: (c.sha as string).slice(0, 7),
      message: (c.commit?.message ?? "") as string,
      author: (c.commit?.author?.name ?? c.author?.login ?? "unknown") as string,
      date: (c.commit?.author?.date ?? "") as string,
      url: (c.html_url ?? "") as string,
    }));
  } catch (err) {
    console.warn("[github-activity] Failed to fetch commits:", err);
    return [];
  }
}

/**
 * Fetch currently open PRs (up to 30) for the in-flight section of the briefing.
 */
export async function fetchOpenPRs(): Promise<OpenPR[]> {
  const token = getToken();
  if (!token) return [];

  try {
    const url = `${GITHUB_API}/repos/${REPO}/pulls?state=open&sort=updated&direction=desc&per_page=30`;
    const res = await fetch(url, { headers: githubHeaders(token) });

    if (!res.ok) {
      console.warn(`[github-activity] Open PRs fetch failed: ${res.status} ${res.statusText}`);
      return [];
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pulls: any[] = await res.json();

    return pulls.map((pr) => ({
      number: pr.number as number,
      title: pr.title as string,
      url: pr.html_url as string,
      draft: (pr.draft ?? false) as boolean,
      author: (pr.user?.login ?? "unknown") as string,
      createdAt: (pr.created_at ?? "") as string,
      labels: ((pr.labels ?? []) as { name: string }[]).map((l) => l.name),
    }));
  } catch (err) {
    console.warn("[github-activity] Failed to fetch open PRs:", err);
    return [];
  }
}

/**
 * Convenience: fetch merged PRs, commits, and open PRs in parallel.
 * Always resolves — individual fetch failures return empty arrays.
 */
export async function fetchYesterdayActivity(yesterday: Date): Promise<{
  mergedPRs: MergedPR[];
  recentCommits: RecentCommit[];
  openPRs: OpenPR[];
}> {
  const [mergedPRs, recentCommits, openPRs] = await Promise.all([
    fetchMergedPRs(yesterday),
    fetchRecentCommits(yesterday),
    fetchOpenPRs(),
  ]);
  return { mergedPRs, recentCommits, openPRs };
}
