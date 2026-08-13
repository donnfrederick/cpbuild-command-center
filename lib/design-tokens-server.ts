/**
 * Server-side helpers for design token persistence.
 * Import only in Server Components, API routes, and Server Actions.
 */

import { db } from "@/lib/db";

const SNAPSHOT_ID = "current";

export interface TokenSnapshot {
  overrides: Record<string, string>;
  savedById: string | null;
  savedByName: string | null;
  savedAt: Date | null;
}

/**
 * Read the active design token overrides from the database.
 * Returns an empty object if no snapshot exists yet.
 * Never throws — on DB error returns empty overrides.
 */
export async function getDesignTokenOverrides(): Promise<TokenSnapshot> {
  try {
    const row = await db.designTokenSnapshot.findUnique({
      where: { id: SNAPSHOT_ID },
    });
    if (!row) return { overrides: {}, savedById: null, savedByName: null, savedAt: null };
    return {
      overrides: (row.overrides as Record<string, string>) ?? {},
      savedById: row.savedById,
      savedByName: row.savedByName,
      savedAt: row.savedAt,
    };
  } catch {
    return { overrides: {}, savedById: null, savedByName: null, savedAt: null };
  }
}

/**
 * Persist a new set of token overrides.
 * Creates the snapshot row if it doesn't exist, otherwise updates it.
 */
export async function saveDesignTokenOverrides(
  overrides: Record<string, string>,
  userId: string,
  userName: string
): Promise<void> {
  await db.designTokenSnapshot.upsert({
    where:  { id: SNAPSHOT_ID },
    create: { id: SNAPSHOT_ID, overrides, savedById: userId, savedByName: userName },
    update: { overrides, savedById: userId, savedByName: userName },
  });
}

/**
 * Produce a single-line CSS string suitable for injection into a <style> tag.
 * Sanitises values — strips anything that could escape the declaration block.
 */
export function buildInlineTokenCSS(overrides: Record<string, string>): string {
  const entries = Object.entries(overrides);
  if (!entries.length) return "";

  const declarations = entries
    .filter(([key]) => key.startsWith("--"))          // only CSS vars
    .map(([key, value]) => {
      // Strip characters that could break out of a CSS rule string
      const safeKey   = key.replace(/[^a-zA-Z0-9-]/g, "");
      const safeValue = value.replace(/[;<>{}]/g, "");
      return `${safeKey}:${safeValue}`;
    })
    .join(";");

  return declarations ? `:root{${declarations}}` : "";
}
