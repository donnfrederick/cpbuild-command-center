/**
 * Split plain text into segments of literal text vs detected http(s) / www URLs.
 * Used for safe React rendering (no HTML injection).
 */

export type PlainTextSegment =
  | { type: "text"; text: string }
  | { type: "url"; text: string; href: string };

/** Strip trailing punctuation that is usually sentence-ending, not part of the URL. */
export function stripTrailingPunctuationFromUrl(s: string): string {
  return s.replace(/[.,;:!?]+$/u, "");
}

export function toSafeHttpUrl(hrefCandidate: string): string | null {
  try {
    const u = new URL(hrefCandidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}

function mergeAdjacentText(segments: PlainTextSegment[]): PlainTextSegment[] {
  const out: PlainTextSegment[] = [];
  for (const seg of segments) {
    if (seg.type === "text" && seg.text === "") continue;
    const prev = out[out.length - 1];
    if (prev?.type === "text" && seg.type === "text") {
      prev.text += seg.text;
    } else if (seg.type === "url") {
      out.push({ type: "url", text: seg.text, href: seg.href });
    } else {
      out.push({ type: "text", text: seg.text });
    }
  }
  return out;
}

/**
 * Detects `http://`, `https://`, and `www.` URLs in a plain string (no HTML).
 */
export function segmentPlainTextWithUrls(text: string): PlainTextSegment[] {
  const re = /\b(https?:\/\/[^\s<>'"]+|www\.[^\s<>'"]+)/gi;
  const segments: PlainTextSegment[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ type: "text", text: text.slice(lastIndex, m.index) });
    }
    const raw = m[0];
    const urlCore = stripTrailingPunctuationFromUrl(raw);
    const suffix = raw.slice(urlCore.length);
    const hrefCandidate = urlCore.startsWith("www.") ? `https://${urlCore}` : urlCore;
    const safe = urlCore.length > 0 ? toSafeHttpUrl(hrefCandidate) : null;
    if (safe) {
      segments.push({ type: "url", text: urlCore, href: safe });
      if (suffix) segments.push({ type: "text", text: suffix });
    } else {
      segments.push({ type: "text", text: raw });
    }
    lastIndex = m.index + raw.length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: "text", text: text.slice(lastIndex) });
  }
  return mergeAdjacentText(segments);
}
