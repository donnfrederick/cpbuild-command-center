import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    $queryRaw: vi.fn(),
  },
}));

import { db } from "@/lib/db";
import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.mocked(db.$queryRaw).mockResolvedValue([{ "?column?": 1 }]);
  });

  it("returns 200 with status ok when DB is reachable", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
    expect(body.version).toBeDefined();
  });

  it("returns a valid ISO timestamp", async () => {
    const res = await GET();
    const body = await res.json();
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it("returns 503 with db_unreachable when DB ping fails", async () => {
    vi.mocked(db.$queryRaw).mockRejectedValueOnce(new Error("connection refused"));
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("error");
    expect(body.reason).toBe("db_unreachable");
    expect(body.timestamp).toBeDefined();
  });
});
