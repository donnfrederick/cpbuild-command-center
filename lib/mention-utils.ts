/**
 * Utilities for @mention syntax used in comment bodies and issue notes.
 *
 * Stored format: @[Display Name](userId)
 * Rendered format: @Display Name (highlighted span in UI)
 */

export const MENTION_REGEX = /@\[([^\]]+)\]\(([^)]+)\)/g;

/**
 * Extract all unique user IDs from a string that contains @[Name](userId) mentions.
 */
export function extractMentionIds(text: string): string[] {
  const ids = new Set<string>();
  const regex = new RegExp(MENTION_REGEX.source, "g");
  let match;
  while ((match = regex.exec(text)) !== null) {
    const userId = match[2];
    if (userId) ids.add(userId);
  }
  return Array.from(ids);
}

/**
 * Replace @[Name](userId) syntax with plain @Name for use in email bodies.
 */
export function stripMentionSyntax(text: string): string {
  return text.replace(new RegExp(MENTION_REGEX.source, "g"), "@$1");
}

/**
 * Replace @[Name](userId) syntax with an HTML <span> for rendering in the UI.
 * Safe to inject into dangerouslySetInnerHTML only if the surrounding text
 * has already been plain-text escaped.
 */
export function renderMentionsAsHtml(text: string): string {
  return text.replace(
    new RegExp(MENTION_REGEX.source, "g"),
    (_match, name: string) =>
      `<span class="mention">@${name.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</span>`
  );
}

