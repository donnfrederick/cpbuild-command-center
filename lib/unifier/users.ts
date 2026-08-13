/**
 * Unifier user service — fetch and match Unifier users to Field Tracker users.
 *
 * Uses the same 5-minute TTL cache pattern as service.ts.
 *
 * Key functions:
 *   getUnifierUsers()       — fetch all users from UNIFIER_SYS_USER_INFO
 *   suggestUserLinks(ccUsers) — auto-match by email, return suggestions
 */

import { fetchAllRows } from "./client";

// ── Types ─────────────────────────────────────────────────────────────────

export interface UnifierUserRaw {
  USERID: string;
  USERNAME: string | null;
  FULLNAME: string | null;
  EMAIL: string | null;
  TITLE: string | null;
  CREATEDATE: string | null;
}

export interface UnifierUser {
  userId: string;
  username: string | null;
  fullName: string | null;
  email: string | null;
  title: string | null;
  createDate: string | null;
}

export interface UserLinkSuggestion {
  ccUserId: string;
  ccEmail: string;
  ccName: string | null;
  unifierUserId: string;
  unifierUsername: string | null;
  unifierFullName: string | null;
  unifierEmail: string | null;
  /** 'exact' = emails match exactly (case-insensitive) */
  confidence: "exact";
}

const UNIFIER_USER_COLUMNS: string[] = [
  "USERID",
  "USERNAME",
  "FULLNAME",
  "EMAIL",
  "TITLE",
  "CREATEDATE",
];

// ── Cache ─────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const userCache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = userCache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    userCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached<T>(key: string, data: T): void {
  userCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── Normalizer ────────────────────────────────────────────────────────────

function normalizeUser(raw: UnifierUserRaw): UnifierUser {
  return {
    userId: raw.USERID,
    username: raw.USERNAME ?? null,
    fullName: raw.FULLNAME ?? null,
    email: raw.EMAIL ?? null,
    title: raw.TITLE ?? null,
    createDate: raw.CREATEDATE ?? null,
  };
}

// ── Public API ────────────────────────────────────────────────────────────

const USERS_CACHE_KEY = "unifier:users";

/**
 * Returns all users from UNIFIER_SYS_USER_INFO, cached 5 minutes.
 */
export async function getUnifierUsers(): Promise<UnifierUser[]> {
  const cached = getCached<UnifierUser[]>(USERS_CACHE_KEY);
  if (cached) return cached;

  const raw = await fetchAllRows<UnifierUserRaw>(
    "UNIFIER_SYS_USER_INFO",
    UNIFIER_USER_COLUMNS
  );

  const users = raw.map(normalizeUser);
  setCached(USERS_CACHE_KEY, users);
  return users;
}

/**
 * Given a list of CC users (id, email, name), returns link suggestions by
 * matching Unifier users by email (case-insensitive exact match).
 *
 * Only returns suggestions for CC users that are not yet linked
 * (i.e. have no unifierUserId) AND have a match in Unifier.
 */
export async function suggestUserLinks(
  ccUsers: Array<{ id: string; email: string; name: string | null; unifierUserId?: string | null }>
): Promise<UserLinkSuggestion[]> {
  const unifierUsers = await getUnifierUsers();

  // Build a lookup map: lowercase email → UnifierUser
  const emailMap = new Map<string, UnifierUser>();
  for (const u of unifierUsers) {
    if (u.email) {
      emailMap.set(u.email.toLowerCase().trim(), u);
    }
  }

  const suggestions: UserLinkSuggestion[] = [];

  for (const cc of ccUsers) {
    // Skip already-linked users
    if (cc.unifierUserId) continue;

    const match = emailMap.get(cc.email.toLowerCase().trim());
    if (!match) continue;

    suggestions.push({
      ccUserId: cc.id,
      ccEmail: cc.email,
      ccName: cc.name,
      unifierUserId: match.userId,
      unifierUsername: match.username,
      unifierFullName: match.fullName,
      unifierEmail: match.email,
      confidence: "exact",
    });
  }

  return suggestions;
}
