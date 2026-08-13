import { describe, it, expect } from "vitest";
import { getClientIpFromHeaders } from "@/lib/request-client-ip";

describe("getClientIpFromHeaders()", () => {
  it("returns first x-forwarded-for hop", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.1, 10.0.0.1" });
    expect(getClientIpFromHeaders(h)).toBe("203.0.113.1");
  });

  it("falls back to x-real-ip", () => {
    const h = new Headers({ "x-real-ip": "198.51.100.2" });
    expect(getClientIpFromHeaders(h)).toBe("198.51.100.2");
  });

  it("returns unknown when absent", () => {
    expect(getClientIpFromHeaders(new Headers())).toBe("unknown");
  });
});
