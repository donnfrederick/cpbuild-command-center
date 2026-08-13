import { describe, expect, it } from "vitest";
import {
  segmentPlainTextWithUrls,
  stripTrailingPunctuationFromUrl,
  toSafeHttpUrl,
} from "@/lib/linkify-urls";

describe("stripTrailingPunctuationFromUrl()", () => {
  it("removes trailing sentence punctuation", () => {
    expect(stripTrailingPunctuationFromUrl("https://a.com.")).toBe("https://a.com");
    expect(stripTrailingPunctuationFromUrl("https://a.com?!")).toBe("https://a.com");
  });

  it("leaves path segments unchanged", () => {
    expect(stripTrailingPunctuationFromUrl("https://a.com/foo")).toBe("https://a.com/foo");
  });
});

describe("toSafeHttpUrl()", () => {
  it("accepts http and https", () => {
    expect(toSafeHttpUrl("https://example.com/path")).toBe("https://example.com/path");
    expect(toSafeHttpUrl("http://example.com")).toBe("http://example.com/");
  });

  it("rejects non-http schemes", () => {
    expect(toSafeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(toSafeHttpUrl("data:text/html,hi")).toBeNull();
  });

  it("rejects invalid URLs", () => {
    expect(toSafeHttpUrl("not a url")).toBeNull();
  });
});

describe("segmentPlainTextWithUrls()", () => {
  it("returns a single text segment when there is no URL", () => {
    expect(segmentPlainTextWithUrls("hello world")).toEqual([{ type: "text", text: "hello world" }]);
  });

  it("detects https URL", () => {
    expect(segmentPlainTextWithUrls("see https://cp.build/x")).toEqual([
      { type: "text", text: "see " },
      { type: "url", text: "https://cp.build/x", href: "https://cp.build/x" },
    ]);
  });

  it("prepends https for www", () => {
    expect(segmentPlainTextWithUrls("x www.example.com/y z")).toEqual([
      { type: "text", text: "x " },
      { type: "url", text: "www.example.com/y", href: "https://www.example.com/y" },
      { type: "text", text: " z" },
    ]);
  });

  it("moves trailing punctuation after URL into plain text", () => {
    expect(segmentPlainTextWithUrls("link https://a.com.")).toEqual([
      { type: "text", text: "link " },
      { type: "url", text: "https://a.com", href: "https://a.com/" },
      { type: "text", text: "." },
    ]);
  });

  it("keeps invalid www-like tokens as text", () => {
    expect(segmentPlainTextWithUrls("www.")).toEqual([{ type: "text", text: "www." }]);
  });
});
