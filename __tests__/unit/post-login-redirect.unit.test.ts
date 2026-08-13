import { describe, expect, it } from "vitest";
import { postLoginRedirectPath } from "@/lib/post-login-redirect";

describe("postLoginRedirectPath()", () => {
  it("returns / for null or empty", () => {
    expect(postLoginRedirectPath(null)).toBe("/");
    expect(postLoginRedirectPath("")).toBe("/");
  });

  it("accepts safe relative paths", () => {
    expect(postLoginRedirectPath("/en")).toBe("/en");
    expect(postLoginRedirectPath("/en/projects/x")).toBe("/en/projects/x");
  });

  it("decodes URL-encoded paths", () => {
    expect(postLoginRedirectPath("%2Fen%2Fdashboard")).toBe("/en/dashboard");
  });

  it("rejects open redirects", () => {
    expect(postLoginRedirectPath("//evil.com")).toBe("/");
    expect(postLoginRedirectPath("https://evil.com")).toBe("/");
  });
});
