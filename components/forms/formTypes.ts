export type ResponseType =
  | "PASS_FAIL"              // Pass / Fail / N/A buttons
  | "PASS_FAIL_DEFICIENCIES" // Pass / Fail + if fail, document each deficiency
  | "YES_NO"                 // Yes / No buttons
  | "MULTIPLE_CHOICE"        // Radio options — user defines
  | "CHECKBOXES"             // Checkbox options — user defines
  | "SHORT_ANSWER"           // Single-line text
  | "PARAGRAPH"              // Multi-line text
  | "NUMBER"                 // Numeric input
  | "RATING";                // 1–5 star rating

export interface FormQuestion {
  id: string;
  title: string;
  description: string;
  responseType: ResponseType;
  required: boolean;
  photoRequired: boolean;
  /**
   * When `responseType === "PASS_FAIL_DEFICIENCIES"`, controls whether
   * inspectors must attach a photo to each documented deficiency.
   * Defaults to `false` so photo evidence is optional unless the form
   * author explicitly requires it.
   */
  deficiencyPhotoRequired: boolean;
  /**
   * When `responseType === "PASS_FAIL_DEFICIENCIES"`, controls whether
   * inspectors are shown a free-text description field on each deficiency.
   * Descriptions are always optional — severity is still required on fail.
   * Defaults to `true` (description shown).
   */
  deficiencyDescriptionEnabled?: boolean;
  /**
   * When `responseType === "PASS_FAIL_DEFICIENCIES"`, controls whether
   * inspectors can tap "Add another deficiency" to document more than one
   * distinct deficiency on a failed item. Omitted or `false` = single row
   * only (occurrence count can still be > 1). Set to `true` to allow
   * multiple distinct deficiency rows.
   */
  allowAdditionalDeficiencies?: boolean;
  /**
   * When true, inspectors see an optional comment field under this question
   * (independent of pass/fail answer). Comments never block submission.
   */
  commentsEnabled?: boolean;
  /** Option labels for MULTIPLE_CHOICE and CHECKBOXES */
  options: string[];
  /**
   * When `responseType === "YES_NO"`, show a third N/A button on the parent.
   * Defaults to false so existing forms stay Yes/No only.
   */
  showNotApplicable?: boolean;
  /**
   * Optional follow-up questions keyed by parent choice (yes/no/na or pass/fail/na).
   * Answers use `{parentId}__followup__{trigger}`; legacy fail-only uses `{parentId}__followup`.
   */
  choiceFollowUps?: Partial<
    Record<"yes" | "no" | "na" | "pass" | "fail", FormQuestion>
  >;
  /**
   * @deprecated Prefer `choiceFollowUps.fail`. Kept in sync on read/write for PASS_FAIL.
   */
  failFollowUp?: FormQuestion;
}

/** Opt-in — omitted or false = disabled; only explicit `true` allows multiple rows. */
export function allowsAdditionalDeficiencies(
  question: Pick<FormQuestion, "allowAdditionalDeficiencies">,
): boolean {
  return question.allowAdditionalDeficiencies === true;
}

/**
 * Forms are always organized into one or more sections. Every form starts
 * with a single default section — users can rename it, add more, reorder,
 * or delete all but the last one.
 */
export interface FormSection {
  id: string;
  title: string;
  /** Optional description shown below the section title in both the builder and the fill/record view. */
  description?: string;
  questions: FormQuestion[];
}

/**
 * Whether a form is run against a single scope on a unit, or against
 * the unit as a whole.
 *
 * - `scope`: the form is scope-specific. Examples: clear inspection on
 *   cabinetry, 2-area clear for drywall, pre-install verification for
 *   framing. Started from a scope card in the unit detail modal.
 * - `unit`: the form applies to the unit as a whole. Example: gypcrete
 *   moisture testing — always unit-level; floor-covering scopes on the
 *   unit only determine eligibility to run/view the test.
 * - `project`: the form applies to the whole project (e.g. daily update).
 *   Started from the project hub; submissions use unitId sentinel `||`.
 *
 * This field drives where the form surfaces in the inspection picker.
 * Scope-level forms only appear when an inspector starts an inspection
 * from a scope card (and only if the form's `scopeTypeCodes` includes
 * that scope's canonical type); unit-level forms only appear in the
 * unit-level inspection picker; project-level forms only on the project hub.
 */
export type FormLevel = "scope" | "unit" | "project";

/**
 * Whether a form participates in pass/fail inspection rollup or is
 * documentation-only (daily logs, project updates, etc.).
 */
export type FormPurpose = "inspection" | "documentation";

export const FORM_PURPOSES = ["inspection", "documentation"] as const;

export function normalizeFormPurpose(
  purpose: FormPurpose | string | null | undefined,
): FormPurpose {
  return purpose === "documentation" ? "documentation" : "inspection";
}

/**
 * Inspection life-cycle categories. These group forms in the picker so
 * an inspector standing on a scope can scan vertically to the right
 * phase (e.g. "I'm here to do a two-area clear" vs. "I'm here to
 * clear the install").
 *
 * Intentionally an enum, not a free-form string, so the picker can
 * render stable category headings and org-wide analytics can
 * aggregate consistently. The list is ordered roughly in the order
 * inspections happen on a typical job — the order is preserved in
 * the picker grouping and the category radio list in the setup modal.
 *
 * Extend this list as new inspection types emerge — the builder UI
 * and the picker both key off this constant and will pick up the new
 * value automatically.
 */
export const INSPECTION_CATEGORIES = [
  "TWO_AREA_CLEAR",
  "FIELD_VERIFICATION",
  "GYPCRETE_MOISTURE_TEST",
  "CLEAR_INSPECTION",
  "CALIBRATION_INSPECTION",
  "OTHER",
] as const;

export type InspectionCategory = (typeof INSPECTION_CATEGORIES)[number];

/** Categories stored/submitted at unit level (building|level|unit, no scopeRowId). */
export function isUnitLevelInspectionCategory(
  category: InspectionCategory,
): boolean {
  return category === "GYPCRETE_MOISTURE_TEST";
}

/** @deprecated Prefer isUnitLevelInspectionCategory — scope hub shows Gypcrete on flooring scopes. */
export function isScopePickerInspectionCategory(
  category: InspectionCategory,
): boolean {
  return !isUnitLevelInspectionCategory(category);
}

/**
 * Categories an inspector can pick when starting a new inspection from
 * "+ Add" or the scope inspection sheet. Calibration is excluded — it
 * reuses a prior submission's form and is only launched from the scope
 * card's "Calibrate" pill after an inspection already exists.
 */
export const USER_STARTABLE_INSPECTION_CATEGORIES = INSPECTION_CATEGORIES.filter(
  (category): category is Exclude<InspectionCategory, "CALIBRATION_INSPECTION"> =>
    category !== "CALIBRATION_INSPECTION",
);

/**
 * Human-readable labels for the category enum. Used anywhere the
 * category is rendered (picker headings, builder dropdown, history
 * chips). Keep in sync with `INSPECTION_CATEGORIES`.
 */
export const INSPECTION_CATEGORY_LABELS: Record<InspectionCategory, string> = {
  TWO_AREA_CLEAR: "2 Area Clear",
  FIELD_VERIFICATION: "Field Verification",
  GYPCRETE_MOISTURE_TEST: "Gypcrete Moisture Test",
  CLEAR_INSPECTION: "Clear Inspection",
  CALIBRATION_INSPECTION: "Calibration Inspection",
  OTHER: "Other",
};

export interface FormTemplate {
  id: string | null;
  name: string;
  description: string;
  status: "draft" | "published";
  /**
   * Whether this form runs against a scope or the unit as a whole.
   * Defaults to "scope" when missing (legacy forms pre-dating this
   * field). Scope is the common case.
   */
  level: FormLevel;
  /**
   * `ScopeType.code` values this form applies to (e.g. ["CAB",
   * "DRYW"]). These are the real lookup-table codes served by
   * /api/lookups → scopeTypes — NOT canonical_scope_types roll-ups.
   * Matched against `scope.scopeType.code` on the project scope row
   * when filtering the inspection picker. Multi-valued because some
   * inspections legitimately apply to several scopes.
   *
   * Only meaningful when `level === "scope"`. Ignored for unit-level
   * forms. An empty array means the form isn't surfaced in any
   * scope's picker — useful as a builder-time "not ready to publish"
   * signal rather than as a universal match.
   *
   * Source of truth: users pick these codes in `FormSetupModal`,
   * backed by /api/lookups. Never set from the builder page itself.
   */
  scopeTypeCodes: string[];
  /**
   * Life-cycle category used to group the form in the picker. See
   * `INSPECTION_CATEGORIES`.
   */
  category: InspectionCategory;
  /** Defaults to `"inspection"` when missing on legacy templates. */
  formPurpose?: FormPurpose;
  sections: FormSection[];
  /** Latest published version number (populated from API responses; absent for local-only drafts). */
  versionNumber?: number;
  /** Latest published FormVersion id (populated from API responses). */
  latestVersionId?: string;
}

export const RESPONSE_META: Record<ResponseType, { label: string; icon: string }> = {
  PASS_FAIL:              { label: "Pass / Fail",                 icon: "✓✗" },
  PASS_FAIL_DEFICIENCIES: { label: "Pass / Fail + deficiencies",  icon: "⚠︎" },
  YES_NO:                 { label: "Yes / No",                    icon: "◐"  },
  MULTIPLE_CHOICE:        { label: "Multiple choice",             icon: "◉"  },
  CHECKBOXES:             { label: "Checkboxes",                  icon: "☑"  },
  SHORT_ANSWER:           { label: "Short answer",                icon: "─"  },
  PARAGRAPH:              { label: "Paragraph",                   icon: "≡"  },
  NUMBER:                 { label: "Number",                      icon: "#"  },
  RATING:                 { label: "Rating (1–5)",                icon: "★"  },
};

export const ALL_RESPONSE_TYPES: ResponseType[] = [
  "PASS_FAIL",
  "PASS_FAIL_DEFICIENCIES",
  "YES_NO",
  "MULTIPLE_CHOICE",
  "CHECKBOXES",
  "SHORT_ANSWER",
  "PARAGRAPH",
  "NUMBER",
  "RATING",
];

// ── Deficiency-tracking constants ─────────────────────────────────────────────

/**
 * Fixed, org-wide severity options for `PASS_FAIL_DEFICIENCIES` questions.
 * Intentionally not configurable per-form — keeping the list universal
 * guarantees that deficiency reporting/analytics can aggregate across every
 * inspection in the system. Update this one constant if the org ever changes
 * its severity taxonomy.
 *
 * Order matters — the pills render left-to-right in this order, and the
 * taxonomy runs from least to most severe so the inspector reads it like
 * a scale (Minor → Major → Critical).
 */
export const DEFICIENCY_SEVERITIES = ["Minor", "Major", "Critical"] as const;

export type DeficiencySeverity = (typeof DEFICIENCY_SEVERITIES)[number];

/**
 * Visual tokens for each severity. Used in the builder preview and at fill
 * time to keep severities visually consistent everywhere they appear.
 */
export const DEFICIENCY_SEVERITY_STYLES: Record<
  DeficiencySeverity,
  { bg: string; fg: string; border: string }
> = {
  Minor:    { bg: "var(--form-severity-minor-bg)",    fg: "var(--form-severity-minor-fg)",    border: "transparent" },
  Major:    { bg: "var(--form-severity-major-bg)",    fg: "var(--form-severity-major-fg)",    border: "transparent" },
  Critical: { bg: "var(--form-severity-critical-bg)", fg: "var(--form-severity-critical-fg)", border: "transparent" },
};

/** BEM modifier slug for severity-scoped CSS classes (e.g. `--major`). */
export function deficiencySeverityModifier(severity: DeficiencySeverity): string {
  return severity.toLowerCase();
}

/**
 * The shape of an individual deficiency, captured at fill time when an
 * inspector marks a `PASS_FAIL_DEFICIENCIES` question as "Fail". This is
 * exported so the eventual fill-time renderer and any submission-layer
 * code use the same structure.
 *
 * `severity` is intentionally optional: new deficiencies are created with
 * no severity picked, forcing the inspector to make an explicit choice.
 * Auto-defaulting to "Minor" (our previous behavior) encouraged rubber-
 * stamping — inspectors could breeze past the severity selector without
 * actually considering which tier applied.
 *
 * Deficiencies live inline on form submissions for now. All contextual
 * metadata (project / unit / scope / user) comes from the submission
 * envelope, not from the deficiency itself.
 */
/**
 * A piece of media captured locally on-device (photo, video, or audio).
 * The blob lives in memory during the session and is submitted alongside
 * the form answers. Works offline — capture is fully local.
 */
export interface CapturedMediaItem {
  /** Object URL created from the captured blob — valid for this session only. */
  localUrl: string;
  mimeType: string;
  /** The underlying File/Blob — present during active capture only; omitted after local defer or JSON storage. */
  file?: File;
  /**
   * Permanent server URL set after the file has been uploaded to storage.
   * Replaces localUrl for display once the upload completes, and is the only
   * URL that survives JSON round-trips (e.g. when viewing a previous attempt).
   */
  serverUrl?: string;
  /**
   * When set, the File was stored in cc-offline-blobs during submit and will
   * be uploaded during inspection sync (local-first submit path).
   */
  pendingBlobId?: string;
}

export interface Deficiency {
  id: string;
  description: string;
  /**
   * How many times this specific deficiency is occurring.
   * Defaults to 1. Lets inspectors group repeated identical deficiencies
   * (e.g. same cabinet door issue in 5 units) into one entry with shared
   * photos, rather than filing a separate entry per occurrence.
   */
  count?: number;
  severity?: DeficiencySeverity;
  /** Media captured for this entire group of deficiencies (photo / video / audio). Offline-friendly. */
  capturedFiles?: CapturedMediaItem[];
  /** Documented on a retry attempt when the inspector marks this deficiency resolved. */
  resolutionNote?: string;
  /** Optional photo evidence attached when resolving on a retry attempt. */
  resolutionCapturedFiles?: CapturedMediaItem[];
}

/**
 * Reserved payload keys for the auto-appended Inspector Notes & Media section.
 * Every form always has this section at the bottom regardless of template content.
 * Using reserved `__`-prefixed keys keeps them separated from question IDs (UUIDs).
 */
export const AUTO_NOTES_KEY = "__inspector_notes__";
export const AUTO_MEDIA_KEY = "__inspector_media__";
