import { describe, it, expect } from "vitest";
import { extractStaticAssetPaths } from "@/lib/offline/warm-page-static-assets";

describe("warm-page-static-assets", () => {
  it("extractStaticAssetPaths finds /_next/static/ URLs in HTML", () => {
    const html = `
      <link href="/_next/static/css/abc123.css" rel="stylesheet" />
      <script src="/_next/static/chunks/main-xyz.js" async></script>
    `;
    expect(extractStaticAssetPaths(html)).toEqual([
      "/_next/static/css/abc123.css",
      "/_next/static/chunks/main-xyz.js",
    ]);
  });

  it("deduplicates paths and strips query strings", () => {
    const html =
      '<script src="/_next/static/chunks/a.js?v=1"></script><script src="/_next/static/chunks/a.js?v=2"></script>';
    expect(extractStaticAssetPaths(html)).toEqual(["/_next/static/chunks/a.js"]);
  });
});
