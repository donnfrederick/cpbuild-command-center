import { describe, it, expect } from "vitest";

import { GET } from "@/app/api/connectivity/route";

describe("GET /api/connectivity", () => {
  it("returns 204 with no-store cache control and no body", async () => {
    const res = await GET();
    expect(res.status).toBe(204);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.text()).toBe("");
  });
});
