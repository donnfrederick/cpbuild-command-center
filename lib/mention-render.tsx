/**
 * Client-only React rendering for @mention syntax.
 * Import this only from client components — NOT from API routes or server modules.
 *
 * For pure string utilities (extractMentionIds, stripMentionSyntax, etc.)
 * see lib/mention-utils.ts which is safe to use anywhere.
 */

import { Fragment, type ReactNode } from "react";
import { segmentPlainTextWithUrls } from "@/lib/linkify-urls";
import { MENTION_REGEX } from "@/lib/mention-utils";

function linkifyPlainStringToNodes(
  text: string,
  keyPrefix: string,
  linkOpensNewTabSuffix: string
): ReactNode {
  const segs = segmentPlainTextWithUrls(text);
  if (segs.length === 0) return text;
  if (segs.length === 1 && segs[0].type === "text") return segs[0].text;
  return (
    <>
      {segs.map((seg, i) =>
        seg.type === "text" ? (
          <Fragment key={`${keyPrefix}-${i}`}>{seg.text}</Fragment>
        ) : (
          <a
            key={`${keyPrefix}-${i}`}
            href={seg.href}
            target="_blank"
            rel="noopener noreferrer"
            className="break-words font-medium text-[var(--primary-600)] underline decoration-[var(--primary-400)] underline-offset-2"
          >
            {seg.text}
            <span className="sr-only"> {linkOpensNewTabSuffix}</span>
          </a>
        )
      )}
    </>
  );
}

/**
 * Render @[Name](userId) mentions as highlighted React spans, preserving
 * surrounding plain text. Safe — no dangerouslySetInnerHTML.
 */
export function renderMentionNodes(text: string): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  const re = new RegExp(MENTION_REGEX.source, "g");
  let match;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const name = match[1] ?? "";
    parts.push(
      <span
        key={match.index}
        style={{
          color: "var(--primary-700)",
          backgroundColor: "var(--primary-50)",
          borderRadius: 4,
          padding: "0 3px",
          fontWeight: 600,
          fontSize: "0.95em",
        }}
      >
        @{name}
      </span>
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 1 && typeof parts[0] === "string" ? parts[0] : <>{parts}</>;
}

/**
 * Like {@link renderMentionNodes} but turns http(s) and www. URLs in plain segments into
 * external anchor tags (for feedback comments and similar).
 */
export function renderMentionNodesWithLinkifiedUrls(
  text: string,
  options: { linkOpensNewTabSuffix: string }
): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  const re = new RegExp(MENTION_REGEX.source, "g");
  let match;
  let fragIndex = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(
        <Fragment key={`linkify-${fragIndex++}`}>
          {linkifyPlainStringToNodes(
            text.slice(last, match.index),
            `s-${match.index}`,
            options.linkOpensNewTabSuffix
          )}
        </Fragment>
      );
    }
    const name = match[1] ?? "";
    parts.push(
      <span
        key={`m-${match.index}`}
        style={{
          color: "var(--primary-700)",
          backgroundColor: "var(--primary-50)",
          borderRadius: 4,
          padding: "0 3px",
          fontWeight: 600,
          fontSize: "0.95em",
        }}
      >
        @{name}
      </span>
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    parts.push(
      <Fragment key={`linkify-${fragIndex++}`}>
        {linkifyPlainStringToNodes(text.slice(last), `s-tail-${last}`, options.linkOpensNewTabSuffix)}
      </Fragment>
    );
  }
  if (parts.length === 0) return text;
  return <>{parts}</>;
}
