"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, ClipboardCheck, Loader2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { formatRole } from "@/lib/permissions";
import { FieldDailyExpandableGroup } from "@/components/reports/FieldDailyExpandableGroup";
import { FieldDailyObservationRow } from "@/components/reports/FieldDailyObservationRow";
import { FieldDailyReportMetaLines } from "@/components/reports/FieldDailyReportMetaLines";
import { FieldDailyScopeStatusBadge } from "@/components/reports/FieldDailyScopeStatusBadge";
import {
  useFieldDailyReportDiscardRegistration,
  useFieldDailyReportSaveRegistration,
  useFieldDailyReportSaveReporter,
} from "@/components/reports/FieldDailyReportSaveStatus";
import { IssueLogRow } from "@/components/projects/issues/IssueLogRow";
import { FieldNotePhotoStrip } from "@/components/shared/FieldNotePhotoStrip";
import { DailyReportActivityPreviewLine } from "@/components/reports/DailyReportActivityPreviewLine";
import { FieldDailyReportExportButton } from "@/components/reports/FieldDailyReportExportButton";
import { FieldDailySectionNoteThread } from "@/components/reports/FieldDailySectionNoteThread";
import { buildHubActivityPreviewCounts } from "@/lib/field-daily-report/hub-activity-preview";
import {
  progressPercentDeltaColor,
  resolveProgressPercentDelta,
} from "@/lib/field-daily-report/install-complete-verified-delta-display";
import { snapshotHasFieldActivity } from "@/lib/field-daily-report/snapshot-activity";
import {
  isDailyManpowerMissing,
  legacyWorkforceCommentBody,
  resolveDailyManpower,
} from "@/lib/field-daily-report/workforce-manpower";
import { resolveUnitDetailTarget } from "@/lib/field-daily-report/unit-entry-target";
import type {
  FieldDailyReportCommentDto,
  FieldDailyReportDailyManpowerMetaDto,
  FieldDailyReportDailyManpowerSavePayload,
  FieldDailyReportProjectDto,
  FieldDailyReportSectionKey,
  FieldDailyReportSectionNoteDto,
  FieldDailyReportListedItem,
  FieldDailyReportStatusUnitEntry,
} from "@/lib/field-daily-report/types";
import type { FieldDailySectionSaveStatus } from "@/lib/field-daily-report/aggregate-save-status";
import { isOpaqueSubcontractorId } from "@/lib/subcontractor-display";

function formatSubcontractorDisplayLabel(
  label: string,
  t: ReturnType<typeof useTranslations<"fieldDailyReport">>,
): string {
  if (label === "Unassigned") return t("teamsOnSiteUnassigned");
  if (isOpaqueSubcontractorId(label)) return t("teamsOnSiteUnknownSubcontractor");
  return label;
}

interface FieldDailyReportProjectBlockProps {
  project: FieldDailyReportProjectDto;
  reportDate: string;
  defaultExpanded?: boolean;
  /** When true, render sections only (no project title accordion) — for hub bottom sheet. */
  sheetMode?: boolean;
  /** When false, section note composer is hidden (read-only view). */
  editable?: boolean;
  currentUserId: string;
  onOpenIssue: (issueId: string) => void;
  onOpenObservation: (observationId: string) => void;
  onOpenInspection: (submissionId: string) => void;
  onOpenUnit?: (target: { building: string; level: string; unit: string }) => void;
  onSectionNotesChange?: (sectionNotes: FieldDailyReportSectionNoteDto[]) => void;
  onDailyManpowerSaved?: (payload: FieldDailyReportDailyManpowerSavePayload) => void;
}

function ReportSection({ children }: { children: ReactNode }) {
  return (
    <section
      style={{
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
        border: "1px solid var(--neutral-200)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      {children}
    </section>
  );
}

function SectionBody({ children }: { children: ReactNode }) {
  return <div style={{ padding: "10px 12px 12px" }}>{children}</div>;
}

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div
      className="form-fill-section-header"
      style={{
        margin: 0,
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        borderTop: "none",
      }}
    >
      <h4 className="form-fill-section-header__title" style={{ margin: 0 }}>
        {title}
      </h4>
      {typeof count === "number" && count > 0 && (
        <span className="form-fill-section-header__counter" style={{ marginBottom: 0 }}>
          {count}
        </span>
      )}
    </div>
  );
}

function commentFor(
  comments: FieldDailyReportCommentDto[],
  sectionKey: FieldDailyReportSectionKey,
  itemKey = "",
): string {
  return comments.find((c) => c.sectionKey === sectionKey && c.itemKey === itemKey)?.body ?? "";
}

function sectionHasNotes(
  notes: FieldDailyReportSectionNoteDto[],
  sectionKey: FieldDailyReportSectionKey,
  itemKey = "",
): boolean {
  return notes.some((note) => note.sectionKey === sectionKey && note.itemKey === itemKey);
}

function WorkforceManpowerMeta({ meta }: { meta: FieldDailyReportDailyManpowerMetaDto }) {
  const t = useTranslations("fieldDailyReport");
  const format = useFormatter();
  const [now] = useState(() => Date.now());
  const roleLabel = meta.setBy.isInstallManager
    ? t("sectionNoteAuthorInstallManager")
    : formatRole(meta.setBy.roleCode);

  return (
    <p style={{ margin: "4px 0 0", fontSize: "var(--text-caption)", color: "var(--neutral-500)" }}>
      <span>{t("workforceDailyManpowerSetByPrefix")} </span>
      <span style={{ fontWeight: 600, color: "var(--neutral-700)" }}>{meta.setBy.name}</span>
      {" · "}
      <span>{roleLabel}</span>
      {" · "}
      <time dateTime={meta.setAt}>{format.relativeTime(new Date(meta.setAt), now)}</time>
    </p>
  );
}

function WorkforceManpowerReadOnly({
  count,
  meta,
}: {
  count: number | null;
  meta: FieldDailyReportDailyManpowerMetaDto | null | undefined;
}) {
  const t = useTranslations("fieldDailyReport");
  if (count === null) {
    return (
      <p
        style={{
          margin: 0,
          fontSize: "var(--text-body)",
          color: "var(--neutral-500)",
          fontStyle: "italic",
        }}
      >
        {t("missingDailyManpowerAlert")}
      </p>
    );
  }
  return (
    <>
      <p style={{ margin: 0, fontSize: "var(--text-body)", color: "var(--neutral-800)" }}>
        {t("workforceManpowerSummary", { count })}
      </p>
      {meta ? <WorkforceManpowerMeta meta={meta} /> : null}
    </>
  );
}

function WorkforceManpowerInput({
  projectId,
  reportDate,
  initialValue,
  initialMeta,
  onSaved,
}: {
  projectId: string;
  reportDate: string;
  initialValue: number | null;
  initialMeta: FieldDailyReportDailyManpowerMetaDto | null | undefined;
  onSaved?: (payload: FieldDailyReportDailyManpowerSavePayload) => void;
}) {
  const t = useTranslations("fieldDailyReport");
  const sectionKey = "workforce" as FieldDailyReportSectionKey;
  const reportStatus = useFieldDailyReportSaveReporter();
  const registerFlushHandler = useFieldDailyReportSaveRegistration();
  const registerDiscardHandler = useFieldDailyReportDiscardRegistration();
  const [body, setBody] = useState(initialValue === null ? "" : String(initialValue));
  const [savedMeta, setSavedMeta] = useState(initialMeta ?? null);
  const [status, setStatus] = useState<FieldDailySectionSaveStatus>("idle");
  const bodyRef = useRef(body);
  const savedBodyRef = useRef(body);

  useEffect(() => {
    bodyRef.current = body;
  }, [body]);

  useEffect(() => {
    const nextBody = initialValue === null ? "" : String(initialValue);
    savedBodyRef.current = nextBody;
    setBody(nextBody);
    setSavedMeta(initialMeta ?? null);
    setStatus("idle");
    reportStatus?.(sectionKey, "idle");
  }, [initialValue, initialMeta, reportStatus]);

  const syncReportStatus = useCallback(
    (nextStatus: FieldDailySectionSaveStatus) => {
      reportStatus?.(sectionKey, nextStatus);
    },
    [reportStatus],
  );

  const isDirty = body !== savedBodyRef.current;

  useEffect(() => {
    if (status === "error") {
      syncReportStatus("error");
      return;
    }
    if (status === "saving") {
      syncReportStatus("saving");
      return;
    }
    syncReportStatus(isDirty ? "dirty" : "idle");
  }, [body, isDirty, status, syncReportStatus]);

  const save = useCallback(
    async (raw: string): Promise<boolean> => {
      const dailyManpower = raw.trim() === "" ? null : Number.parseInt(raw, 10);
      if (raw.trim() !== "" && (dailyManpower === null || Number.isNaN(dailyManpower))) {
        return false;
      }
      setStatus("saving");
      syncReportStatus("saving");
      try {
        const res = await fetch(`/api/projects/${projectId}/field-daily/workforce`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reportDate, dailyManpower }),
        });
        if (!res.ok) throw new Error("save failed");
        const data = (await res.json()) as FieldDailyReportDailyManpowerSavePayload & {
          reportDate: string;
        };
        onSaved?.({
          dailyManpower: data.dailyManpower,
          dailyManpowerMeta: data.dailyManpowerMeta,
        });
        setSavedMeta(data.dailyManpowerMeta);
        savedBodyRef.current = raw;
        setStatus("idle");
        syncReportStatus("idle");
        toast.success(t("workforceDailyManpowerSaveSuccess"));
        return true;
      } catch {
        setStatus("error");
        toast.error(t("workforceDailyManpowerSaveError"));
        return false;
      }
    },
    [projectId, reportDate, onSaved, syncReportStatus, t],
  );

  useEffect(() => {
    if (!registerFlushHandler) return;
    return registerFlushHandler(sectionKey, async () => {
      if (bodyRef.current === savedBodyRef.current) return true;
      return save(bodyRef.current);
    });
  }, [registerFlushHandler, save, sectionKey]);

  useEffect(() => {
    if (!registerDiscardHandler) return;
    return registerDiscardHandler(sectionKey, () => {
      setBody(savedBodyRef.current);
      setStatus("idle");
      syncReportStatus("idle");
    });
  }, [registerDiscardHandler, sectionKey, syncReportStatus]);

  const handleChange = (raw: string) => {
    if (raw === "") {
      setBody("");
      return;
    }
    if (!/^\d+$/.test(raw)) return;
    const value = Number.parseInt(raw, 10);
    if (value > 9999) return;
    setBody(raw);
  };

  const handleUpdate = () => {
    void save(body);
  };

  return (
    <div>
      <label
        htmlFor={`${projectId}-workforce-manpower`}
        style={{
          display: "block",
          fontSize: "var(--text-caption)",
          color: "var(--neutral-500)",
          marginBottom: 4,
        }}
      >
        {t("workforceDailyManpowerLabel")}
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <input
          id={`${projectId}-workforce-manpower`}
          type="number"
          inputMode="numeric"
          min={0}
          max={9999}
          step={1}
          value={body}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={t("workforceDailyManpowerPlaceholder")}
          aria-label={t("workforceDailyManpowerInputAria")}
          style={{
            width: "100%",
            maxWidth: 160,
            fontSize: "var(--text-body)",
            padding: "8px 10px",
            borderRadius: "var(--radius-sm)",
            border:
              status === "error"
                ? "1px solid var(--error-300)"
                : "1px solid var(--neutral-200)",
          }}
        />
        <button
          type="button"
          onClick={handleUpdate}
          disabled={!isDirty || status === "saving"}
          aria-busy={status === "saving"}
          style={{
            padding: "8px 12px",
            borderRadius: "var(--radius-sm)",
            border: "none",
            backgroundColor:
              !isDirty || status === "saving" ? "var(--neutral-200)" : "var(--primary-600)",
            color: !isDirty || status === "saving" ? "var(--neutral-500)" : "var(--neutral-0)",
            fontSize: "var(--text-caption)",
            fontWeight: 600,
            cursor: !isDirty || status === "saving" ? "not-allowed" : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {status === "saving" ? t("saving") : t("workforceDailyManpowerUpdate")}
        </button>
      </div>
      {savedMeta && body === savedBodyRef.current && body.trim() !== "" ? (
        <WorkforceManpowerMeta meta={savedMeta} />
      ) : null}
    </div>
  );
}

function LocationPill({ label }: { label: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.03em",
        textTransform: "uppercase",
        color: "var(--neutral-600)",
        backgroundColor: "var(--neutral-100)",
        padding: "3px 8px",
        borderRadius: 4,
      }}
    >
      {label}
    </span>
  );
}

function SubcontractorPill({
  label,
  t,
}: {
  label: string;
  t: ReturnType<typeof useTranslations<"fieldDailyReport">>;
}) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.02em",
        color: "var(--primary-700)",
        backgroundColor: "var(--primary-50)",
        padding: "3px 8px",
        borderRadius: 4,
        flexShrink: 0,
      }}
    >
      {formatSubcontractorDisplayLabel(label, t)}
    </span>
  );
}

function UnitEntryList({
  entries,
  projectLevelLabel,
  onOpenUnit,
  showSubcontractorPill = true,
}: {
  entries: FieldDailyReportStatusUnitEntry[];
  projectLevelLabel: string;
  onOpenUnit?: (target: { building: string; level: string; unit: string }) => void;
  /** Hide team pill when the parent section is already grouped by subcontractor. */
  showSubcontractorPill?: boolean;
}) {
  const t = useTranslations("fieldDailyReport");

  return (
    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
      {entries.map((u, idx) => {
        const target = resolveUnitDetailTarget(u);
        const canOpen = Boolean(target && onOpenUnit);

        const photoStrip =
          u.statusUpdateAttachments && u.statusUpdateAttachments.length > 0 ? (
            <FieldNotePhotoStrip attachments={u.statusUpdateAttachments} />
          ) : null;

        const content = (
          <>
            <LocationPill label={u.locationLabel || projectLevelLabel} />
            {showSubcontractorPill ? (
              <SubcontractorPill label={u.subcontractorLabel?.trim() || "Unassigned"} t={t} />
            ) : null}
            {u.scopeName && (
              <span style={{ fontSize: "var(--text-caption)", color: "var(--neutral-600)" }}>{u.scopeName}</span>
            )}
          </>
        );

        if (!canOpen) {
          return (
            <li
              key={`unit-${idx}`}
              style={{ display: "flex", flexDirection: "column", gap: 6, padding: "6px 0" }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                {content}
              </div>
              {photoStrip}
            </li>
          );
        }

        return (
          <li key={`unit-${idx}`} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <button
              type="button"
              onClick={() => onOpenUnit!(target!)}
              style={{
                width: "100%",
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 6,
                padding: "8px 10px",
                border: "none",
                borderRadius: "var(--radius-sm)",
                background: "var(--neutral-50)",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              {content}
            </button>
            {photoStrip ? <div style={{ paddingLeft: 10, paddingRight: 10 }}>{photoStrip}</div> : null}
          </li>
        );
      })}
    </ul>
  );
}

function inspectionOutcomeStyle(outcome: string): { bg: string; color: string } {
  const key = outcome.toUpperCase();
  if (key === "PASS" || key === "PASSED") {
    return { bg: "var(--success-100)", color: "var(--success-700)" };
  }
  if (key === "FAIL" || key === "FAILED") {
    return { bg: "var(--error-100)", color: "var(--error-700)" };
  }
  return { bg: "var(--neutral-100)", color: "var(--neutral-700)" };
}

function FieldDailyInspectionItem({
  item,
  outcomeStyle,
  projectLevelLabel,
  onOpenInspection,
}: {
  item: FieldDailyReportListedItem;
  outcomeStyle: { bg: string; color: string };
  projectLevelLabel: string;
  onOpenInspection: (submissionId: string) => void;
}) {
  const t = useTranslations("fieldDailyReport");
  const canOpen = Boolean(item.submissionId);

  const photoStrip =
    item.attachments && item.attachments.length > 0 ? (
      <FieldNotePhotoStrip attachments={item.attachments} />
    ) : null;

  const content = (
    <>
      <LocationPill label={item.locationLabel || projectLevelLabel} />
      <div
        style={{
          fontSize: "var(--text-body)",
          fontWeight: 600,
          color: "var(--neutral-900)",
          marginTop: 4,
        }}
      >
        {item.headline}
      </div>
      {item.bodyText?.trim() ? (
        <p
          style={{
            margin: "6px 0 0",
            fontSize: "var(--text-caption)",
            color: "var(--neutral-700)",
            lineHeight: 1.45,
            whiteSpace: "pre-wrap",
          }}
        >
          {item.bodyText}
        </p>
      ) : null}
      {item.badge ? (
        <span
          style={{
            display: "inline-block",
            marginTop: 4,
            fontSize: "var(--text-caption)",
            fontWeight: 700,
            textTransform: "uppercase",
            color: outcomeStyle.color,
            backgroundColor: outcomeStyle.bg,
            padding: "2px 8px",
            borderRadius: 4,
          }}
        >
          {item.badge}
        </span>
      ) : null}
      {canOpen ? (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            marginTop: 8,
            fontSize: 11,
            fontWeight: 700,
            color: "var(--primary-600)",
          }}
        >
          <ClipboardCheck size={12} aria-hidden />
          {t("viewInspection")}
        </span>
      ) : null}
    </>
  );

  if (!canOpen) {
    return (
      <li style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ padding: "8px 10px" }}>{content}</div>
        {photoStrip}
      </li>
    );
  }

  return (
    <li style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <button
        type="button"
        aria-label={`${t("viewInspection")}: ${item.headline}`}
        onClick={() => onOpenInspection(item.submissionId!)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          textAlign: "left",
          border: "1px solid var(--neutral-150)",
          borderRadius: "var(--radius-sm)",
          background: "var(--neutral-50)",
          padding: "8px 10px",
          cursor: "pointer",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>{content}</div>
        <ChevronRight
          size={16}
          aria-hidden
          style={{ color: "var(--neutral-400)", flexShrink: 0, marginTop: 2 }}
        />
      </button>
      {photoStrip ? <div style={{ paddingLeft: 10, paddingRight: 10 }}>{photoStrip}</div> : null}
    </li>
  );
}

function ProgressDeltaBadge({
  progress,
  t,
}: {
  progress: FieldDailyReportProjectDto["snapshot"]["progress"];
  t: ReturnType<typeof useTranslations<"fieldDailyReport">>;
}) {
  if (typeof progress.pctComplete !== "number") return null;

  const delta = resolveProgressPercentDelta(progress);

  return (
    <span
      title={t("headerProgressDeltaHint")}
      aria-label={t("headerProgressDeltaAria", { delta })}
      style={{
        fontSize: 13,
        fontWeight: 800,
        fontVariantNumeric: "tabular-nums",
        color: progressPercentDeltaColor(delta),
        flexShrink: 0,
      }}
    >
      {t("progressDeltaOnly", { delta })}
    </span>
  );
}

function ProgressHero({
  progress,
  t,
}: {
  progress: FieldDailyReportProjectDto["snapshot"]["progress"];
  t: ReturnType<typeof useTranslations>;
}) {
  const pct = progress.pctComplete;
  const delta = typeof progress.pctCompleteDelta === "number" ? progress.pctCompleteDelta : 0;

  if (typeof pct !== "number") {
    return (
      <div
        style={{
          padding: "10px 12px",
          backgroundColor: "var(--neutral-0)",
          border: "1px solid var(--neutral-200)",
          borderRadius: "var(--radius-sm)",
        }}
      >
        <span style={{ fontSize: "var(--text-body)", color: "var(--neutral-600)" }}>{t("progressUnavailable")}</span>
      </div>
    );
  }

  const deltaColor = progressPercentDeltaColor(delta);

  return (
    <div
      style={{
        padding: "10px 12px",
        backgroundColor: "var(--neutral-0)",
        border: "1px solid var(--neutral-200)",
        borderRadius: "var(--radius-sm)",
      }}
    >
      <div style={{ fontSize: 28, fontWeight: 800, color: deltaColor, lineHeight: 1 }}>
        {t("progressDeltaOnly", { delta })}
      </div>
      <div style={{ fontSize: "var(--text-body)", color: "var(--primary-600)", marginTop: 6, fontWeight: 700 }}>
        {t("progressCurrentPct", { pct })}
      </div>
    </div>
  );
}

export function FieldDailyReportProjectBlock({
  project,
  reportDate,
  defaultExpanded = false,
  sheetMode = false,
  editable = true,
  currentUserId,
  onOpenIssue,
  onOpenObservation,
  onOpenInspection,
  onOpenUnit,
  onSectionNotesChange,
  onDailyManpowerSaved,
}: FieldDailyReportProjectBlockProps) {
  const t = useTranslations("fieldDailyReport");
  const [expanded, setExpanded] = useState(defaultExpanded);
  const snap = project.snapshot;
  const { progress } = snap;
  const inspectionGroups = snap.inspections?.summaryGroups ?? [];
  const legacyWorkforceBody = legacyWorkforceCommentBody(project.comments);
  const resolvedDailyManpower = resolveDailyManpower(project.dailyManpower, legacyWorkforceBody);
  const workforceMissing = editable && isDailyManpowerMissing(project.dailyManpower, legacyWorkforceBody);
  const hasActivity = snapshotHasFieldActivity(snap);
  const minimalEditableSections = editable && !hasActivity;
  const sectionNotes = project.sectionNotes ?? [];

  const sectionComment = (sectionKey: FieldDailyReportSectionKey, itemKey = "") => (
    <FieldDailySectionNoteThread
      projectId={project.projectId}
      reportDate={reportDate}
      sectionKey={sectionKey}
      itemKey={itemKey}
      notes={sectionNotes}
      currentUserId={currentUserId}
      editable={editable}
      onNotesChange={(notes) => onSectionNotesChange?.(notes)}
    />
  );

  const dailyManpowerBlock = (
    <div
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      role="presentation"
    >
      {editable && workforceMissing ? (
        <p
          style={{
            margin: "0 0 6px",
            fontSize: "var(--text-caption)",
            fontWeight: 600,
            color: "var(--error-700)",
          }}
        >
          {t("missingDailyManpowerAlert")}
        </p>
      ) : null}
      {editable ? (
        <WorkforceManpowerInput
          projectId={project.projectId}
          reportDate={reportDate}
          initialValue={resolvedDailyManpower}
          initialMeta={project.dailyManpowerMeta}
          onSaved={onDailyManpowerSaved}
        />
      ) : (
        <WorkforceManpowerReadOnly
          count={resolvedDailyManpower}
          meta={project.dailyManpowerMeta}
        />
      )}
    </div>
  );

  const inspectionSummary = (outcome: string, count: number) => {
    const key = outcome.toUpperCase();
    if (key === "PASS" || key === "PASSED") return t("inspectionPassedSummary", { count });
    if (key === "FAIL" || key === "FAILED") return t("inspectionFailedSummary", { count });
    return t("inspectionOutcomeSummary", { count, outcome });
  };

  const sectionsBody = (
    <div style={{ padding: sheetMode ? 0 : "10px 12px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
          {sheetMode ? dailyManpowerBlock : null}
          {!sheetMode && project.generatedAt && project.activityThrough && project.trigger ? (
            <FieldDailyReportMetaLines
              generatedAt={project.generatedAt}
              activityThrough={project.activityThrough}
              trigger={project.trigger}
            />
          ) : null}
          {minimalEditableSections ? (
            <>
              {(editable || sectionHasNotes(sectionNotes, "other")) && (
                <ReportSection>
                  <SectionHeader title={t("sectionOther")} />
                  <SectionBody>
                    {sectionComment("other")}
                  </SectionBody>
                </ReportSection>
              )}
            </>
          ) : (
            <>
          <ReportSection>
            <SectionHeader title={t("sectionProgress")} />
            <SectionBody>
              <ProgressHero progress={progress} t={t} />
              {sectionComment("progress")}
            </SectionBody>
          </ReportSection>

          {snap.statusUpdates.summaryGroups.length > 0 && (
            <ReportSection>
              <SectionHeader title={t("sectionStatus")} count={snap.statusUpdates.summaryGroups.length} />
              <SectionBody>
                {snap.statusUpdates.summaryGroups.map((g) => {
                  const count = g.unitEntries?.length ?? 0;
                  return (
                    <FieldDailyExpandableGroup
                      key={g.id}
                      ariaLabel={t("expandStatusGroup", { label: g.statusLabel, count })}
                      summary={
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            width: "100%",
                            minWidth: 0,
                          }}
                        >
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <FieldDailyScopeStatusBadge
                              scopeStage={g.scopeStage}
                              scopeStatus={g.scopeStatus}
                              label={g.statusLabel}
                            />
                          </div>
                          <span
                            style={{
                              fontSize: "var(--text-body)",
                              fontWeight: 600,
                              color: "var(--neutral-800)",
                              whiteSpace: "nowrap",
                              flexShrink: 0,
                              textAlign: "right",
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {t("statusUnitsMoved", { count })}
                          </span>
                        </div>
                      }
                    >
                      <UnitEntryList
                        entries={g.unitEntries ?? []}
                        projectLevelLabel={t("locationProjectLevel")}
                        onOpenUnit={onOpenUnit}
                      />
                    </FieldDailyExpandableGroup>
                  );
                })}
                {sectionComment("statusUpdates")}
              </SectionBody>
            </ReportSection>
          )}

          {(snap.subcontractors?.summaryGroups.length ?? 0) > 0 && (
            <ReportSection>
              <SectionHeader
                title={t("sectionSubcontractors")}
                count={snap.subcontractors?.summaryGroups.length}
              />
              <SectionBody>
                {snap.subcontractors?.summaryGroups.map((g) => {
                  const count = g.unitEntries.length;
                  return (
                    <FieldDailyExpandableGroup
                      key={g.id}
                      ariaLabel={t("expandSubcontractorGroup", { name: g.subcontractorLabel, count })}
                      summary={
                        <span style={{ fontSize: "var(--text-body)", fontWeight: 600, color: "var(--primary-700)" }}>
                          {t("subcontractorUnitsAssigned", { count, name: g.subcontractorLabel })}
                        </span>
                      }
                    >
                      <UnitEntryList
                        entries={g.unitEntries}
                        projectLevelLabel={t("locationProjectLevel")}
                        onOpenUnit={onOpenUnit}
                      />
                    </FieldDailyExpandableGroup>
                  );
                })}
                {sectionComment("subcontractors")}
              </SectionBody>
            </ReportSection>
          )}

          {inspectionGroups.length > 0 && (
            <ReportSection>
              <SectionHeader title={t("sectionInspections")} count={inspectionGroups.length} />
              <SectionBody>
              {inspectionGroups.map((group) => {
                const count = group.items.length;
                const outcomeStyle = inspectionOutcomeStyle(group.outcome);
                return (
                  <FieldDailyExpandableGroup
                    key={group.id}
                    ariaLabel={inspectionSummary(group.outcome, count)}
                    summary={
                      <span style={{ fontSize: "var(--text-body)", fontWeight: 600, color: "var(--neutral-800)" }}>
                        {inspectionSummary(group.outcome, count)}
                      </span>
                    }
                  >
                    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                      {group.items.map((item) => (
                        <FieldDailyInspectionItem
                          key={item.itemKey}
                          item={item}
                          outcomeStyle={outcomeStyle}
                          projectLevelLabel={t("locationProjectLevel")}
                          onOpenInspection={onOpenInspection}
                        />
                      ))}
                    </ul>
                  </FieldDailyExpandableGroup>
                );
              })}
              {sectionComment("inspections")}
              </SectionBody>
            </ReportSection>
          )}

          {snap.issues.items.length > 0 && (
            <ReportSection>
              <SectionHeader title={t("sectionIssues")} count={snap.issues.items.length} />
              <SectionBody>
              <div className="issue-log-list">
                {snap.issues.items.map((item) =>
                  item.issueRecord ? (
                    <IssueLogRow
                      key={item.itemKey}
                      issue={item.issueRecord}
                      variant="log"
                      showResponsible
                      onView={() => item.issueId && onOpenIssue(item.issueId)}
                    />
                  ) : (
                    <button
                      key={item.itemKey}
                      type="button"
                      onClick={() => item.issueId && onOpenIssue(item.issueId)}
                      className="issue-log-row issue-log-row--split"
                      style={{ width: "100%" }}
                    >
                      <span className="issue-log-row__title">{item.headline}</span>
                    </button>
                  ),
                )}
              </div>
              {sectionComment("issues")}
              </SectionBody>
            </ReportSection>
          )}

          {snap.observations.items.length > 0 && (
            <ReportSection>
              <SectionHeader title={t("sectionObservations")} count={snap.observations.items.length} />
              <SectionBody>
              <div style={{ border: "1px solid var(--neutral-200)", borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
                {snap.observations.items.map((item) =>
                  item.observationRecord ? (
                    <FieldDailyObservationRow
                      key={item.itemKey}
                      obs={item.observationRecord}
                      onClick={() => item.observationId && onOpenObservation(item.observationId)}
                    />
                  ) : (
                    <button
                      key={item.itemKey}
                      type="button"
                      onClick={() => item.observationId && onOpenObservation(item.observationId)}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "10px 12px",
                        textAlign: "left",
                        border: "none",
                        borderBottom: "1px solid var(--neutral-100)",
                        background: "var(--color-surface)",
                        cursor: "pointer",
                      }}
                    >
                      {item.headline}
                    </button>
                  ),
                )}
              </div>
              {sectionComment("observations")}
              </SectionBody>
            </ReportSection>
          )}

          {(editable || commentFor(project.comments, "other").trim().length > 0) && (
            <ReportSection>
              <SectionHeader title={t("sectionOther")} />
              <SectionBody>
                {sectionComment("other")}
              </SectionBody>
            </ReportSection>
          )}
            </>
          )}
        </div>
  );

  if (sheetMode) {
    return sectionsBody;
  }

  const activityPreview = buildHubActivityPreviewCounts(snap);

  const headerTitleBlock = (
    <span
      style={{
        display: "block",
        flex: 1,
        minWidth: 0,
        fontWeight: 700,
        fontSize: "var(--text-body)",
        color: hasActivity ? "var(--neutral-900)" : "var(--neutral-700)",
      }}
    >
      {project.projectName}
    </span>
  );

  const headerSummaryPaddingLeft = hasActivity || editable ? 38 : 12;

  const headerSummaryBlock = (
    <div
      style={{
        padding: `0 12px 10px ${headerSummaryPaddingLeft}px`,
        background: "var(--neutral-0)",
        borderBottom: expanded ? "1px solid var(--neutral-200)" : "none",
      }}
    >
      <DailyReportActivityPreviewLine counts={activityPreview} />
      <div style={{ marginTop: 8 }}>{dailyManpowerBlock}</div>
    </div>
  );

  const headerBody = (
    <>
      {headerTitleBlock}
      <ProgressDeltaBadge progress={progress} t={t} />
      <FieldDailyReportExportButton project={project} reportDate={reportDate} />
    </>
  );

  const rowPadding = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    background: "var(--neutral-0)",
  } as const;

  if (!hasActivity && !editable) {
    return (
      <div
        style={{
          border: "1px solid var(--neutral-200)",
          borderRadius: "var(--radius-lg)",
          backgroundColor: "var(--color-surface)",
          overflow: "hidden",
          boxShadow: "var(--shadow-1)",
        }}
      >
        <div style={rowPadding}>{headerBody}</div>
        {headerSummaryBlock}
      </div>
    );
  }

  if (!hasActivity && editable) {
    return (
      <div
        style={{
          border: "1px solid var(--neutral-200)",
          borderRadius: "var(--radius-lg)",
          backgroundColor: "var(--color-surface)",
          overflow: "hidden",
          boxShadow: "var(--shadow-1)",
        }}
      >
        <div style={{ display: "flex", alignItems: "stretch" }}>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 12px",
              border: "none",
              background: "var(--neutral-0)",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            {expanded ? <ChevronDown size={18} aria-hidden /> : <ChevronRight size={18} aria-hidden />}
            {headerTitleBlock}
            <ProgressDeltaBadge progress={progress} t={t} />
          </button>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              paddingRight: 8,
              background: "var(--neutral-0)",
            }}
          >
            <FieldDailyReportExportButton project={project} reportDate={reportDate} />
          </div>
        </div>
        {headerSummaryBlock}
        {expanded ? sectionsBody : null}
      </div>
    );
  }

  return (
    <div
      style={{
        border: "1px solid var(--neutral-200)",
        borderRadius: "var(--radius-lg)",
        backgroundColor: "var(--color-surface)",
        overflow: "hidden",
        boxShadow: "var(--shadow-1)",
      }}
    >
      <div style={{ display: "flex", alignItems: "stretch" }}>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 12px",
            border: "none",
            background: "var(--neutral-0)",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          {expanded ? <ChevronDown size={18} aria-hidden /> : <ChevronRight size={18} aria-hidden />}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
            {headerTitleBlock}
            <ProgressDeltaBadge progress={progress} t={t} />
          </div>
        </button>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            paddingRight: 8,
            background: "var(--neutral-0)",
          }}
        >
          <FieldDailyReportExportButton project={project} reportDate={reportDate} />
        </div>
      </div>
      {headerSummaryBlock}
      {expanded ? sectionsBody : null}
    </div>
  );
}
