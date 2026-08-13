import sanitizeHtml from "sanitize-html";

const MAX_BODY_BYTES = 8 * 1024;

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "strong", "em", "ul", "ol", "li", "a", "img"],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    img: ["src", "alt"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowProtocolRelative: false,
};

/** Decode entities TipTap writes when HTML source is pasted as plain text. */
export function decodeHtmlEntities(encoded: string): string {
  return encoded
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * When HTML is pasted into TipTap as plain text, tags are stored entity-encoded
 * (or as raw tag text inside a single <p>). Repair before sanitize/render.
 */
export function repairPastedHtmlAsPlainText(html: string): string {
  let candidate = html.trim();
  if (!candidate) return candidate;

  if (/&lt;\/?(p|strong|em|ul|ol|li|br|a)\b/i.test(candidate)) {
    candidate = decodeHtmlEntities(candidate);
  }

  const wrapped = /^<p>([\s\S]+)<\/p>$/i.exec(candidate);
  if (wrapped?.[1]) {
    const inner = wrapped[1].trim();
    if (
      /^<(p|ul|ol)\b/i.test(inner) &&
      /<\/?(p|strong|em|ul|ol|li|br|a)\b/i.test(inner)
    ) {
      candidate = inner;
    }
  }

  return candidate;
}

/**
 * Sanitize announcement HTML on write and before render.
 * Uses sanitize-html (Node-safe — no jsdom) so API routes work in Next.js dev/prod.
 */
export function sanitizeAnnouncementHtml(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const repaired = repairPastedHtmlAsPlainText(trimmed);
  const sanitized = sanitizeHtml(repaired, SANITIZE_OPTIONS);

  const encoder = new TextEncoder();
  const bytes = encoder.encode(sanitized);
  if (bytes.length > MAX_BODY_BYTES) {
    const truncated = bytes.slice(0, MAX_BODY_BYTES);
    return new TextDecoder().decode(truncated);
  }

  return sanitized;
}

export const ANNOUNCEMENT_HTML_MAX_BYTES = MAX_BODY_BYTES;
