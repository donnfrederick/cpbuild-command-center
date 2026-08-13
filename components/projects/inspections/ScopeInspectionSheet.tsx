"use client";

/**
 * Bottom sheet opened from the scope status hub / inspection provider. Two sections
 * stacked vertically:
 *
 * 1. PICKER — published forms for this scope's canonical type. Gypcrete
 *    appears only on floor-covering scopes (TIL, LVT, …) but still submits
 *    at unit level (building|level|unit, no scopeRowId).
 *
 * 2. HISTORY — past submissions against this scope, newest first.
 *    Tapping one opens the same overlay in readonly mode so the
 *    inspector can review what was captured.
 *
 * Both sections have explicit empty states: "No forms tagged for
 * Cabinetry yet" and "No inspections yet." — Phase 1 is localStorage-
 * only, so these states are the default experience until someone
 * publishes a form and runs it.
 */

import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ClipboardCheck, FileCheck, Lock, Search } from "lucide-react";
import type {
  FormTemplate,
  InspectionCategory,
} from "@/components/forms/formTypes";
import {
  INSPECTION_CATEGORY_LABELS,
  USER_STARTABLE_INSPECTION_CATEGORIES,
} from "@/components/forms/formTypes";
import { isPublishedFormEligibleForScopeHub } from "@/lib/inspections/scope-hub-form-eligibility";
import { isFlooringCanonicalCode } from "@/lib/inspections/flooring-scope-eligibility";
import {
  listPublishedForms,
  type StoredForm,
} from "@/lib/forms/formsApi";
import {
  draftToStoredForm,
  listResumableLiveDrafts,
} from "@/lib/inspections/inspection-draft-discovery";
import type { InspectionSubmission } from "@/lib/inspections/submissionsApi";
import type { ScopeRow } from "@/components/projects/UnitCards";
import { isProjectRowInstallCompleteForClearInspection, scopeNeedsClearInspectionPrepGate } from "@/lib/inspections/clear-inspection-scope-gate";
import { ClearInspectionGateRow } from "@/components/projects/inspections/ClearInspectionGateRow";
import { InspectionBottomSheet } from "./inspectionSheetPrimitive";
import {
  describeOutcomeLong,
  formatRelativeTime,
  ordinal,
  outcomeColor,
} from "./inspectionSummary";

export function ScopeInspectionSheet({
  projectId,
  unitId,
  scope,
  submissions,
  canManageStatus,
  patchScopeRow,
  isAdmin = false,
  initialTab = "history",
  onClose,
  onStartInspection,
  onReviewSubmission,
  canShowProcoreBackfill = false,
  procoreIsEdit = false,
  onOpenBackfill,
}: {
  projectId: string;
  unitId: string;
  scope: ScopeRow;
  submissions: InspectionSubmission[];
  canManageStatus: boolean;
  patchScopeRow?: (
    updates: Partial<ScopeRow>,
    activityHints?: { subcontractorDisplayName?: string },
  ) => Promise<boolean>;
  /** When true, the subcontractor assignment is optional before starting a clear inspection. */
  isAdmin?: boolean;
  /** Which section to scroll to on open. "picker" jumps straight to the
   *  "Start a new inspection" section — used by the + button on the band. */
  initialTab?: "picker" | "history";
  onClose: () => void;
  onStartInspection: (form: StoredForm) => void;
  onReviewSubmission: (sub: InspectionSubmission, attemptNumber: number) => void;
  canShowProcoreBackfill?: boolean;
  procoreIsEdit?: boolean;
  onOpenBackfill?: () => void;
}) {
  const t = useTranslations("inspections");
  const [forms, setForms] = useState<StoredForm[]>([]);
  const [formsLoading, setFormsLoading] = useState(true);
  const [formsFromCache, setFormsFromCache] = useState(false);
  const [clearResumeLookup, setClearResumeLookup] = useState<{
    key: string;
    form: StoredForm | null;
  } | null>(null);

  const clearResumeForm =
    clearResumeLookup?.key === scope.id ? clearResumeLookup.form : null;
  const [search, setSearch] = useState("");
  const pickerRef = useRef<HTMLElement | null>(null);
  const historyRef = useRef<HTMLElement | null>(null);

  // Scroll to the requested section on first paint.
  useEffect(() => {
    const target = initialTab === "picker" ? pickerRef.current : historyRef.current;
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch published forms from API on mount.
  useEffect(() => {
    let cancelled = false;
    listPublishedForms()
      .then((result) => {
        if (cancelled) return;
        console.debug(
          "[ScopeInspectionSheet] published forms:",
          result.forms.map((f) => ({
            id: f.id,
            name: f.template.name,
            status: f.template.status,
            level: f.template.level,
            scopeTypeCodes: f.template.scopeTypeCodes,
          })),
          "| scopeCode:", scope.scopeType?.canonicalScopeType?.code ?? scope.scopeType?.code ?? null,
        );
        startTransition(() => {
          setForms(result.forms);
          setFormsFromCache(result.isFromCache);
          setFormsLoading(false);
        });
      })
      .catch((err) => {
        console.warn("[ScopeInspectionSheet] Failed to load forms", err);
        if (!cancelled) setFormsLoading(false);
      });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const lookupKey = scope.id;
    let cancelled = false;
    void listResumableLiveDrafts({
      projectId,
      unitId,
      scopeRowId: scope.id,
      category: "CLEAR_INSPECTION",
    })
      .then((drafts) => {
        if (cancelled) return;
        setClearResumeLookup({
          key: lookupKey,
          form: drafts.length > 0 ? draftToStoredForm(drafts[0]!) : null,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setClearResumeLookup({ key: lookupKey, form: null });
        }
      });
    return () => { cancelled = true; };
  }, [projectId, unitId, scope.id]);

  // Forms now store the canonical scope type code (e.g. "CAB") because
  // FormSetupModal switched to the canonical_scope_types picker. Match using
  // the canonical code first, falling back to the raw ScopeType.code for
  // any legacy forms saved before the normalization change.
  const scopeCode =
    scope.scopeType?.canonicalScopeType?.code ?? scope.scopeType?.code ?? null;
  const scopeDisplay =
    scope.scopeType?.canonicalScopeType?.displayName ??
    scope.scopeType?.name ??
    "this scope";

  // ── Clear Inspection business-rule state ───────────────────────────────────
  // Gate: scope (or every sub-scope slice) must be Install · Complete.
  const isClearInspectionAllowed = isProjectRowInstallCompleteForClearInspection({
    scopeStage: scope.scopeStage,
    scopeStatus: scope.scopeStatus,
    subScopeInstances: scope.subScopeInstances,
  });

  // Chain rule: find the latest clear inspection submission for this scope.
  const latestClearSub = useMemo(
    () =>
      [...submissions]
        .filter((s) => s.categorySnapshot === "CLEAR_INSPECTION")
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0] ?? null,
    [submissions],
  );
  const clearInspectionPassed =
    latestClearSub?.outcome === "PASS" ||
    latestClearSub?.outcome === "COMPLETE";

  // Filter + group. Scope-level forms match scopeTypeCodes; Gypcrete also
  // appears on floor-covering scopes (submitted at unit level regardless).
  const groupedForms = useMemo(() => {
    const q = search.trim().toLowerCase();
    const flooringScope = isFlooringCanonicalCode(scopeCode);
    const eligible = forms
      .map((f) => f.template)
      .filter((t): t is FormTemplate & { id: string } => Boolean(t.id))
      .filter((t) => isPublishedFormEligibleForScopeHub(t, scopeCode))
      .filter((t) =>
        q.length === 0
          ? true
          : t.name.toLowerCase().includes(q) ||
            t.description.toLowerCase().includes(q),
      );

    const byCategory = new Map<InspectionCategory, FormTemplate[]>();
    for (const t of eligible) {
      const arr = byCategory.get(t.category) ?? [];
      arr.push(t);
      byCategory.set(t.category, arr);
    }
    return USER_STARTABLE_INSPECTION_CATEGORIES.filter(
      (c) => c !== "GYPCRETE_MOISTURE_TEST" || flooringScope,
    )
      .filter((c) => (byCategory.get(c)?.length ?? 0) > 0)
      .map((c) => ({
        category: c,
        forms: byCategory.get(c) ?? [],
      }));
  }, [forms, search, scopeCode]);

  const totalEligible = groupedForms.reduce(
    (sum, g) => sum + g.forms.length,
    0,
  );

  return (
    <InspectionBottomSheet
      title={t("sheetTitle", { scopeDisplay })}
      subtitle={t("sheetSubtitle")}
      onClose={onClose}
    >
      {/* ── Start new: search + picker ── */}
      {canManageStatus && (
        <section ref={pickerRef} style={{ padding: "14px 16px 8px" }}>
          <SectionHeading>{t("startNewInspectionHeading")}</SectionHeading>
          {formsFromCache && (
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--neutral-500)" }}>
              {t("formsFromCacheBanner")}
            </p>
          )}
          <div
            style={{
              position: "relative",
              marginTop: 8,
            }}
          >
            <Search
              size={15}
              aria-hidden
              style={{
                position: "absolute",
                left: 11,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--neutral-400)",
                pointerEvents: "none",
              }}
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchForms")}
              disabled={formsLoading}
              style={{
                width: "100%",
                padding: "9px 12px 9px 34px",
                border: "1px solid var(--neutral-250)",
                borderRadius: 8,
                fontSize: 14,
                fontFamily: "inherit",
                color: "var(--neutral-900)",
                backgroundColor: "#fff",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginTop: 10 }}>
            {formsLoading ? (
              <FormPickerSkeleton />
            ) : totalEligible === 0 ? (
              <EmptyPicker
                scopeDisplay={scopeDisplay}
                hasCode={Boolean(scopeCode)}
                hasSearch={search.trim().length > 0}
              />
            ) : (
              groupedForms.map(({ category, forms: list }) => (
                <div key={category} style={{ marginBottom: 14 }}>
                  <CategoryHeading label={INSPECTION_CATEGORY_LABELS[category]} />
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      marginTop: 6,
                    }}
                  >
                    {list.map((template) => {
                      const stored = forms.find((f) => f.id === template.id);
                      if (!stored) return null;

                      // Clear Inspection: apply gate + chain rules.
                      if (template.category === "CLEAR_INSPECTION") {
                        if (clearInspectionPassed) {
                          return (
                            <LockedFormRow
                              key={template.id ?? ""}
                              template={template}
                              reason="This scope has already been cleared."
                            />
                          );
                        }
                        const needsClearPrepGate = scopeNeedsClearInspectionPrepGate(
                          scope,
                          isClearInspectionAllowed,
                        );
                        if (needsClearPrepGate) {
                          return (
                            <ClearInspectionGateRow
                              key={template.id ?? ""}
                              template={template}
                              stored={stored}
                              scope={scope}
                              isInstallComplete={isClearInspectionAllowed}
                              patchScopeRow={patchScopeRow}
                              resumeDraftForm={clearResumeForm}
                              onStartInspection={onStartInspection}
                            />
                          );
                        }
                        return (
                          <FormPickerRow
                            key={template.id ?? ""}
                            template={template}
                            onTap={() => onStartInspection(stored)}
                          />
                        );
                      }

                      return (
                        <FormPickerRow
                          key={template.id ?? ""}
                          template={template}
                          onTap={() => onStartInspection(stored)}
                        />
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {canManageStatus && canShowProcoreBackfill && onOpenBackfill && (
        <section style={{ padding: "0 16px 12px" }}>
          <button
            type="button"
            onClick={onOpenBackfill}
            style={{
              display: "flex",
              width: "100%",
              alignItems: "center",
              gap: 10,
              padding: "11px 12px",
              borderRadius: 8,
              border: "1px solid var(--neutral-200)",
              backgroundColor: "var(--neutral-50)",
              color: "var(--neutral-800)",
              fontFamily: "inherit",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <FileCheck size={16} style={{ flexShrink: 0, color: "var(--neutral-500)" }} aria-hidden />
            {procoreIsEdit ? t("procoreEditInspectionButton") : t("procoreSetInspectionButton")}
          </button>
        </section>
      )}

      {/* ── History ── */}
      <section
        ref={historyRef}
        style={{
          padding: "14px 16px 20px",
          borderTop: "1px solid var(--neutral-150)",
          marginTop: canManageStatus ? 6 : 0,
        }}
      >
        <SectionHeading>{t("historyHeading")}</SectionHeading>
        {submissions.length === 0 ? (
          <p
            style={{
              margin: "10px 0 0",
              fontSize: 13,
              color: "var(--neutral-500)",
              fontStyle: "italic",
            }}
          >
            {t("noInspectionsYet")}
          </p>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              marginTop: 8,
            }}
          >
            {(() => {
              // Count only FORM-source submissions for attempt numbering.
              const formSubs = submissions.filter((s) => s.source !== "BACKFILL");
              let formSubIdx = formSubs.length;
              return submissions.map((sub) => {
                let attemptNumber: number | null = null;
                if (sub.source !== "BACKFILL") {
                  attemptNumber = formSubIdx--;
                }
                return (
                  <HistoryRow
                    key={sub.id}
                    submission={sub}
                    attemptNumber={attemptNumber}
                    onTap={() => onReviewSubmission(sub, attemptNumber ?? 0)}
                  />
                );
              });
            })()}
          </div>
        )}
      </section>
    </InspectionBottomSheet>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3
      style={{
        margin: 0,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--neutral-500)",
      }}
    >
      {children}
    </h3>
  );
}

function CategoryHeading({ label }: { label: string }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: "var(--neutral-600)",
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}
    >
      {label}
    </div>
  );
}

function FormPickerRow({
  template,
  isRetry = false,
  onTap,
}: {
  template: FormTemplate;
  isRetry?: boolean;
  onTap: () => void;
}) {
  const t = useTranslations("inspections");
  return (
    <button
      type="button"
      onClick={onTap}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 8,
        border: "1px solid var(--neutral-200)",
        backgroundColor: "#fff",
        color: "var(--neutral-900)",
        fontFamily: "inherit",
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
      }}
    >
      <ClipboardCheck
        size={16}
        aria-hidden
        style={{ color: "var(--primary-600)", flexShrink: 0 }}
      />
      <span
        style={{
          fontSize: 14,
          fontWeight: 600,
          lineHeight: 1.3,
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {template.name.trim() || t("untitledForm")}
      </span>
      {isRetry && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--error-600)",
            backgroundColor: "var(--error-50)",
            border: "1px solid var(--error-200)",
            borderRadius: 99,
            padding: "2px 7px",
            flexShrink: 0,
          }}
        >
          Retry
        </span>
      )}
    </button>
  );
}

function LockedFormRow({
  template,
  reason,
}: {
  template: FormTemplate;
  reason: string;
}) {
  const t = useTranslations("inspections");
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 8,
        border: "1px solid var(--neutral-150)",
        backgroundColor: "var(--neutral-50)",
        opacity: 0.7,
        cursor: "not-allowed",
      }}
    >
      <Lock
        size={14}
        aria-hidden
        style={{ color: "var(--neutral-400)", flexShrink: 0 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            lineHeight: 1.3,
            color: "var(--neutral-500)",
            display: "block",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {template.name.trim() || t("untitledForm")}
        </span>
        <span
          style={{
            fontSize: 11,
            color: "var(--neutral-400)",
            display: "block",
            marginTop: 1,
          }}
        >
          {reason}
        </span>
      </div>
    </div>
  );
}

function HistoryRow({
  submission,
  attemptNumber,
  onTap,
}: {
  submission: InspectionSubmission;
  /** 1-based attempt index for FORM submissions. Null for BACKFILL records. */
  attemptNumber: number | null;
  onTap: () => void;
}) {
  const t = useTranslations("inspections");
  const isBackfill = submission.source === "BACKFILL";
  const isCalibration = submission.categorySnapshot === "CALIBRATION_INSPECTION";
  const color = outcomeColor(submission.outcome);
  return (
    <button
      type="button"
      onClick={onTap}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 8,
        border: isCalibration
          ? "1px solid var(--primary-200, #bfdbfe)"
          : `1px solid ${isBackfill ? "var(--neutral-200)" : "var(--neutral-200)"}`,
        backgroundColor: isCalibration
          ? "var(--primary-50, #eff6ff)"
          : isBackfill ? "var(--neutral-50)" : "#fff",
        fontFamily: "inherit",
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: isBackfill ? "var(--neutral-600)" : "var(--neutral-900)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {isBackfill ? "Previously Inspected — No Form" : submission.formNameSnapshot}
          </span>
          {isCalibration && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--primary-600, #2563eb)",
                backgroundColor: "var(--primary-100, #dbeafe)",
                border: "1px solid var(--primary-200, #bfdbfe)",
                borderRadius: 99,
                padding: "1px 6px",
                flexShrink: 0,
              }}
            >
              Calibration
            </span>
          )}
          {!isCalibration && isBackfill && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--neutral-500)",
                backgroundColor: "var(--neutral-150)",
                border: "1px solid var(--neutral-200)",
                borderRadius: 99,
                padding: "1px 6px",
                flexShrink: 0,
              }}
            >
              Backfilled
            </span>
          )}
        </div>
        <span style={{ fontSize: 11, color: "var(--neutral-500)" }}>
          {isBackfill
            ? `${formatRelativeTime(submission.submittedAt)} · ${submission.submittedBy}`
            : t("historyEntry", {
                ordinal: ordinal(attemptNumber ?? 1),
                time: formatRelativeTime(submission.submittedAt),
                submittedBy: submission.submittedBy,
              })}
        </span>
      </div>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "2px 8px",
          borderRadius: 99,
          border: `1px solid ${color}`,
          backgroundColor: `${color}18`,
          color,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          flexShrink: 0,
        }}
      >
        {isBackfill
          ? (submission.outcome === "PASS" ? "Pass" : "Fail")
          : describeOutcomeLong(submission, attemptNumber ?? 1)}
      </span>
    </button>
  );
}

function FormPickerSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <style>{`
        @keyframes scope-sheet-shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
      {/* Category label skeleton */}
      <div
        style={{
          height: 10,
          width: 110,
          borderRadius: 5,
          background: "linear-gradient(90deg, var(--neutral-200) 25%, var(--neutral-300) 50%, var(--neutral-200) 75%)",
          backgroundSize: "200% 100%",
          animation: "scope-sheet-shimmer 1.4s ease-in-out infinite",
        }}
      />
      {/* Form row skeletons — 2 rows mirrors the typical 1-form-per-scope result */}
      {[0, 1].map((i) => (
        <div
          key={i}
          style={{
            height: 52,
            borderRadius: 10,
            background: "linear-gradient(90deg, var(--neutral-200) 25%, var(--neutral-300) 50%, var(--neutral-200) 75%)",
            backgroundSize: "200% 100%",
            animation: "scope-sheet-shimmer 1.4s ease-in-out infinite",
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
    </div>
  );
}

function EmptyPicker({
  scopeDisplay,
  hasCode,
  hasSearch,
}: {
  scopeDisplay: string;
  hasCode: boolean;
  hasSearch: boolean;
}) {
  const t = useTranslations("inspections");
  let copy: string;
  if (!hasCode) {
    copy = t("noScopeTypeLinked");
  } else if (hasSearch) {
    copy = t("noFormsMatchSearch", { scopeDisplay });
  } else {
    copy = t("noFormsForScope", { scopeDisplay });
  }
  return (
    <p
      style={{
        margin: "6px 0 0",
        fontSize: 13,
        color: "var(--neutral-500)",
        fontStyle: "italic",
        lineHeight: 1.5,
      }}
    >
      {copy}
    </p>
  );
}
