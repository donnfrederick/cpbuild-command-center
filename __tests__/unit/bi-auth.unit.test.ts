/**
 * Unit tests for lib/bi-auth.ts
 *
 * Covers: validateBiKey (valid, expired, revoked, wrong scope, project restriction),
 * requireScope, isProjectAllowed, generateApiKey, and lastUsedAt throttle logic.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockApiKeyFindUnique = vi.fn();
const mockApiKeyUpdate = vi.fn().mockResolvedValue({});

vi.mock("@/lib/db", () => ({
  db: {
    apiKey: {
      findUnique: mockApiKeyFindUnique,
      update: mockApiKeyUpdate,
    },
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

// Pre-computed SHA-256 of the test key constant below — avoids calling
// createHash in tests (which CodeQL flags as weak password hashing, even
// though this is a high-entropy token, not a password).
// echo -n "cc_bi_abc123def456abc123def456abc123def456abc123def456" | sha256sum
const TEST_RAW_KEY = "cc_bi_abc123def456abc123def456abc123def456abc123def456";
const TEST_KEY_HASH = "bba7f6c5310964099947999741dcaf9fcb475612716a0eee7b257d0c07754ff4";

function makeRequest(rawKey: string) {
  return new Request("http://localhost/api/bi/v1/projects", {
    headers: { Authorization: `Bearer ${rawKey}` },
  });
}

// ── Import under test (after mocks are set up) ────────────────────────────────

const { validateBiKey, requireScope, isProjectAllowed, generateApiKey } =
  await import("@/lib/bi-auth");

// ── generateApiKey ─────────────────────────────────────────────────────────────

describe("generateApiKey()", () => {
  it("returns a rawKey starting with cc_bi_", () => {
    const { rawKey } = generateApiKey();
    expect(rawKey).toMatch(/^cc_bi_[0-9a-f]+$/);
  });

  it("returns keyHash as a 64-char hex string (SHA-256 output)", () => {
    const { keyHash } = generateApiKey();
    expect(keyHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns keyPrefix as first 16 chars of rawKey", () => {
    const { rawKey, keyPrefix } = generateApiKey();
    expect(keyPrefix).toBe(rawKey.slice(0, 16));
  });

  it("produces unique keys on each call", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.rawKey).not.toBe(b.rawKey);
  });
});

// ── validateBiKey ─────────────────────────────────────────────────────────────

describe("validateBiKey()", () => {
  const RAW = TEST_RAW_KEY;
  const HASH = TEST_KEY_HASH;

  const BASE_KEY = {
    id: "key-1",
    name: "Test key",
    scopes: ["bi:projects", "bi:units"],
    allowedProjectIds: [],
    party: "INTERNAL" as const,
    revokedAt: null,
    expiresAt: null,
    lastUsedAt: null,
  };

  beforeEach(() => {
    mockApiKeyFindUnique.mockReset();
    mockApiKeyUpdate.mockReset().mockResolvedValue({});
  });

  it("returns BiKeyContext for a valid active key", async () => {
    mockApiKeyFindUnique.mockResolvedValue({ ...BASE_KEY, keyHash: HASH });
    const ctx = await validateBiKey(makeRequest(RAW));
    expect(ctx).not.toBeNull();
    expect(ctx?.keyId).toBe("key-1");
    expect(ctx?.scopes).toEqual(["bi:projects", "bi:units"]);
  });

  it("returns null when Authorization header is missing", async () => {
    const req = new Request("http://localhost/api/bi/v1/projects");
    expect(await validateBiKey(req)).toBeNull();
  });

  it("returns null when key does not start with cc_bi_", async () => {
    expect(await validateBiKey(makeRequest("wrong_prefix_abc123"))).toBeNull();
  });

  it("returns null when no key found in DB", async () => {
    mockApiKeyFindUnique.mockResolvedValue(null);
    expect(await validateBiKey(makeRequest(RAW))).toBeNull();
  });

  it("returns null for a revoked key", async () => {
    mockApiKeyFindUnique.mockResolvedValue({ ...BASE_KEY, revokedAt: new Date() });
    expect(await validateBiKey(makeRequest(RAW))).toBeNull();
  });

  it("returns null for an expired key", async () => {
    const past = new Date(Date.now() - 1000);
    mockApiKeyFindUnique.mockResolvedValue({ ...BASE_KEY, expiresAt: past });
    expect(await validateBiKey(makeRequest(RAW))).toBeNull();
  });

  it("accepts a key whose expiresAt is in the future", async () => {
    const future = new Date(Date.now() + 86_400_000);
    mockApiKeyFindUnique.mockResolvedValue({ ...BASE_KEY, expiresAt: future });
    expect(await validateBiKey(makeRequest(RAW))).not.toBeNull();
  });

  it("updates lastUsedAt when it has never been set", async () => {
    mockApiKeyFindUnique.mockResolvedValue({ ...BASE_KEY, lastUsedAt: null });
    await validateBiKey(makeRequest(RAW));
    expect(mockApiKeyUpdate).toHaveBeenCalledOnce();
  });

  it("skips lastUsedAt update when updated < 5 min ago (throttle)", async () => {
    const recentlyUsed = new Date(Date.now() - 60_000); // 1 minute ago
    mockApiKeyFindUnique.mockResolvedValue({ ...BASE_KEY, lastUsedAt: recentlyUsed });
    await validateBiKey(makeRequest(RAW));
    expect(mockApiKeyUpdate).not.toHaveBeenCalled();
  });

  it("fires lastUsedAt update when > 5 min since last use", async () => {
    const oldUsed = new Date(Date.now() - 6 * 60_000); // 6 minutes ago
    mockApiKeyFindUnique.mockResolvedValue({ ...BASE_KEY, lastUsedAt: oldUsed });
    await validateBiKey(makeRequest(RAW));
    expect(mockApiKeyUpdate).toHaveBeenCalledOnce();
  });

  it("returns allowedProjectIds from the key record", async () => {
    mockApiKeyFindUnique.mockResolvedValue({ ...BASE_KEY, allowedProjectIds: ["proj-1", "proj-2"] });
    const ctx = await validateBiKey(makeRequest(RAW));
    expect(ctx?.allowedProjectIds).toEqual(["proj-1", "proj-2"]);
  });
});

// ── requireScope ──────────────────────────────────────────────────────────────

describe("requireScope()", () => {
  const ctx = {
    keyId: "k1",
    name: "Test",
    scopes: ["bi:projects", "bi:units"],
    allowedProjectIds: [],
    party: "INTERNAL" as const,
  };

  it("returns true when scope is present", () => {
    expect(requireScope(ctx, "bi:projects")).toBe(true);
  });

  it("returns false when scope is missing", () => {
    expect(requireScope(ctx, "bi:feedback")).toBe(false);
  });
});

// ── isProjectAllowed ──────────────────────────────────────────────────────────

describe("isProjectAllowed()", () => {
  const base = { keyId: "k1", name: "T", scopes: [], party: "INTERNAL" as const };

  it("allows all projects when allowedProjectIds is empty", () => {
    expect(isProjectAllowed({ ...base, allowedProjectIds: [] }, "any-project")).toBe(true);
  });

  it("allows a project that is in the list", () => {
    expect(isProjectAllowed({ ...base, allowedProjectIds: ["proj-1"] }, "proj-1")).toBe(true);
  });

  it("rejects a project not in the list", () => {
    expect(isProjectAllowed({ ...base, allowedProjectIds: ["proj-1"] }, "proj-2")).toBe(false);
  });
});
