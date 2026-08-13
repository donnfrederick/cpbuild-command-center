import { describe, it, expect } from "vitest";
import {
  feedbackBridgeTimingSafeEqual,
  verifyFeedbackBridgeBearer,
} from "@/lib/feedback-bridge-auth";
import { NextRequest } from "next/server";

describe("feedbackBridgeTimingSafeEqual()", () => {
  it("returns true for equal strings", () => {
    expect(feedbackBridgeTimingSafeEqual("a", "a")).toBe(true);
  });

  it("returns false for different strings", () => {
    expect(feedbackBridgeTimingSafeEqual("a", "b")).toBe(false);
  });
});

describe("verifyFeedbackBridgeBearer()", () => {
  it("returns false when FEEDBACK_BRIDGE_SECRET is unset", () => {
    const prev = process.env.FEEDBACK_BRIDGE_SECRET;
    delete process.env.FEEDBACK_BRIDGE_SECRET;
    const req = new NextRequest("http://localhost", {
      headers: { Authorization: "Bearer x" },
    });
    expect(verifyFeedbackBridgeBearer(req)).toBe(false);
    process.env.FEEDBACK_BRIDGE_SECRET = prev;
  });

  it("returns true for matching Bearer token", () => {
    process.env.FEEDBACK_BRIDGE_SECRET = "bridge-test-secret";
    const req = new NextRequest("http://localhost", {
      headers: { Authorization: "Bearer bridge-test-secret" },
    });
    expect(verifyFeedbackBridgeBearer(req)).toBe(true);
  });

  it("returns false for wrong token", () => {
    process.env.FEEDBACK_BRIDGE_SECRET = "bridge-test-secret";
    const req = new NextRequest("http://localhost", {
      headers: { Authorization: "Bearer other" },
    });
    expect(verifyFeedbackBridgeBearer(req)).toBe(false);
  });
});
