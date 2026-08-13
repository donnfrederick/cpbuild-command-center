import { describe, it, expect } from "vitest";
import { sanitizeAnnouncementHtml } from "@/lib/announcements/sanitize-announcement-html";

describe("sanitizeAnnouncementHtml()", () => {
  it("preserves allowed formatting tags", () => {
    const html = "<p>Hello <strong>world</strong></p><ul><li>one</li></ul>";
    expect(sanitizeAnnouncementHtml(html)).toContain("<strong>world</strong>");
    expect(sanitizeAnnouncementHtml(html)).toContain("<ul>");
  });

  it("strips script tags and event handlers", () => {
    const malicious = '<p onclick="alert(1)">Hi<script>alert("xss")</script></p>';
    const out = sanitizeAnnouncementHtml(malicious);
    expect(out).not.toContain("<script");
    expect(out).not.toContain("onclick");
    expect(out).toContain("Hi");
  });

  it("strips javascript: hrefs from links", () => {
    const html = '<a href="javascript:alert(1)">click</a>';
    const out = sanitizeAnnouncementHtml(html);
    expect(out.toLowerCase()).not.toContain("javascript:");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(sanitizeAnnouncementHtml("   ")).toBe("");
  });

  it("repairs HTML pasted as plain text (entity-encoded tags from TipTap)", () => {
    const pasted =
      "<p>&lt;p&gt;&lt;strong&gt;New:&lt;/strong&gt; Hello&lt;/p&gt;&lt;ul&gt;&lt;li&gt;One&lt;/li&gt;&lt;/ul&gt;</p>";
    const out = sanitizeAnnouncementHtml(pasted);
    expect(out).toContain("<strong>New:</strong>");
    expect(out).toContain("<ul>");
    expect(out).not.toContain("&lt;p&gt;");
    expect(out).not.toContain("<p>&lt;");
  });
});
