/**
 * Shared observation display helpers — type pills and badge colors.
 */

export type LegacyObservationTypeKey = "QUALITY" | "PROGRESS" | "SAFETY" | "OTHER";

export const LEGACY_OBSERVATION_TYPE_KEYS: LegacyObservationTypeKey[] = [
  "QUALITY",
  "PROGRESS",
  "SAFETY",
  "OTHER",
];

/** Legacy i18n keys for the four seeded observation types. */
export const OBSERVATION_TYPE_I18N: Record<LegacyObservationTypeKey, string> = {
  QUALITY: "obsTypeQuality",
  PROGRESS: "obsTypeProgress",
  SAFETY: "obsTypeSafety",
  OTHER: "obsTypeOther",
};

export interface ObservationTypeBadgeMeta {
  label: string;
  bg: string;
  color: string;
}

const LEGACY_OBS_TYPE_BADGE: Record<LegacyObservationTypeKey, ObservationTypeBadgeMeta> = {
  QUALITY: { label: "Quality", bg: "var(--primary-50)", color: "var(--primary-700)" },
  PROGRESS: { label: "Progress", bg: "var(--success-50)", color: "var(--success-700)" },
  SAFETY: { label: "Safety", bg: "var(--warning-50)", color: "var(--warning-700)" },
  OTHER: { label: "Other", bg: "var(--neutral-100)", color: "var(--neutral-600)" },
};

const CUSTOM_BADGE: ObservationTypeBadgeMeta = {
  label: "",
  bg: "var(--neutral-100)",
  color: "var(--neutral-700)",
};

/** Hex colors for PDF export (Puppeteer HTML cannot use CSS variables). */
const LEGACY_OBS_TYPE_PDF: Record<LegacyObservationTypeKey, ObservationTypeBadgeMeta> = {
  QUALITY: { label: "Quality", bg: "#eff6ff", color: "#1d4ed8" },
  PROGRESS: { label: "Progress", bg: "#f0fdf4", color: "#166534" },
  SAFETY: { label: "Safety", bg: "#fff7ed", color: "#9a3412" },
  OTHER: { label: "Other", bg: "#f9fafb", color: "#374151" },
};

const CUSTOM_PDF_BADGE: ObservationTypeBadgeMeta = {
  label: "",
  bg: "#f9fafb",
  color: "#374151",
};

export function resolveObservationTypeDisplayName(
  observationType: string | null | undefined,
  t?: (key: string) => string,
  catalog?: Array<{ code: string; displayName: string }>,
): string {
  const code = observationType?.trim() || "OTHER";
  const fromCatalog = catalog?.find((row) => row.code === code)?.displayName;
  if (fromCatalog) return fromCatalog;
  if (t && code in OBSERVATION_TYPE_I18N) {
    return t(OBSERVATION_TYPE_I18N[code as LegacyObservationTypeKey]);
  }
  if (code in OBSERVATION_TYPE_I18N) {
    return LEGACY_OBS_TYPE_BADGE[code as LegacyObservationTypeKey].label;
  }
  return code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function resolveObservationTypeBadgeMeta(
  observationType: string | null | undefined,
  catalog?: Array<{ code: string; displayName: string }>,
  t?: (key: string) => string,
): ObservationTypeBadgeMeta {
  const code = observationType?.trim() || "OTHER";
  const label = resolveObservationTypeDisplayName(code, t, catalog);
  const legacy = LEGACY_OBS_TYPE_BADGE[code as LegacyObservationTypeKey];
  if (legacy) {
    return { ...legacy, label };
  }
  return { ...CUSTOM_BADGE, label };
}

/** PDF-safe badge meta (hex colors, catalog-aware labels). */
export function resolveObservationTypePdfMeta(
  observationType: string | null | undefined,
  catalog?: Array<{ code: string; displayName: string }>,
): ObservationTypeBadgeMeta {
  const code = observationType?.trim() || "OTHER";
  const label = resolveObservationTypeDisplayName(code, undefined, catalog);
  const legacy = LEGACY_OBS_TYPE_PDF[code as LegacyObservationTypeKey];
  if (legacy) {
    return { ...legacy, label };
  }
  return { ...CUSTOM_PDF_BADGE, label };
}

export function observationTypePillClass(observationType: string | null | undefined): string {
  const slug = (observationType?.trim() || "other").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `obs-log-type-pill obs-log-type-pill--${slug || "other"}`;
}
