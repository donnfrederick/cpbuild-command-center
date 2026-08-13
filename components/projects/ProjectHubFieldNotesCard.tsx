"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Eye,
  Loader2,
  MessageSquare,
  Plus,
} from "lucide-react";
import type { IssueSummary, ObsSummary } from "@/components/projects/UnitCards";
import { ObservationDetailModal } from "@/components/projects/ObservationDetailModal";
import { IssueDetailModal } from "@/components/projects/IssueDetailModal";
import { AddProjectObservationModal } from "@/components/projects/AddLocationObservationModal";
import { AddProjectIssueModal } from "@/components/projects/AddProjectIssueModal";
import { IssueLogRow } from "@/components/projects/issues/IssueLogRow";
import { unitContextFromUnitRef } from "@/lib/field-notes-scope";
import {
  readSnapshotProjectLevelIssues,
  readSnapshotProjectLevelObservations,
} from "@/lib/offline/snapshot-project-reads";
import { useFieldNotesLocationLabels } from "@/components/projects/useFieldNotesLocationLabels";
import { PROJECT_HUB_CARD_STYLE, ProjectHubCardHeader } from "@/components/projects/ProjectHubCardHeader";
import { useObservationCatalog } from "@/lib/observations/use-observation-catalog";
import { resolveObservationTypeBadgeMeta } from "@/lib/observations/observationDisplay";

interface ProjectHubFieldNotesCardProps {
  projectId: string;
  projectName: string;
  currentUserId: string;
  currentUserRole: string;
}

function formatHubFieldNoteTime(
  iso: string,
  t: (key: "hubFieldNotesTimeJustNow" | "hubFieldNotesTimeMinutes" | "hubFieldNotesTimeHours" | "hubFieldNotesTimeDays", values?: { n: number }) => string,
): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return t("hubFieldNotesTimeJustNow");
  if (diff < 3600) return t("hubFieldNotesTimeMinutes", { n: Math.floor(diff / 60) });
  if (diff < 86400) return t("hubFieldNotesTimeHours", { n: Math.floor(diff / 3600) });
  if (diff < 604800) return t("hubFieldNotesTimeDays", { n: Math.floor(diff / 86400) });
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function HubCollapsibleSection({
  label,
  count,
  expanded,
  expandLoading = false,
  onToggleExpanded,
  addAriaLabel,
  onAdd,
  emptyMessage,
  showMoreLabel,
  showLessLabel,
  children,
}: {
  label: string;
  count: number;
  expanded: boolean;
  expandLoading?: boolean;
  onToggleExpanded: () => void;
  addAriaLabel: string;
  onAdd: () => void;
  emptyMessage: string;
  showMoreLabel: string;
  showLessLabel: string;
  children: React.ReactNode;
}) {
  const items = Array.isArray(children) ? children : children != null ? [children] : [];
  const preview = items[0] ?? null;
  const rest = items.slice(1);
  const hasMore = count > 1;

  return (
    <div
      style={{
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
        border: "1px solid var(--neutral-200)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          backgroundColor: "var(--neutral-50)",
          borderBottom: count > 0 ? "1px solid var(--neutral-200)" : "none",
        }}
      >
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--neutral-700)" }}>
          {label}
        </span>
        {count > 0 && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--neutral-500)",
              backgroundColor: "var(--neutral-100)",
              borderRadius: 99,
              padding: "2px 8px",
            }}
          >
            {count}
          </span>
        )}
        <button
          type="button"
          onClick={onAdd}
          aria-label={addAriaLabel}
          title={addAriaLabel}
          style={{
            width: 32,
            height: 32,
            flexShrink: 0,
            borderRadius: "var(--radius-md)",
            border: "none",
            backgroundColor: "var(--control-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "var(--color-accent-hover)",
          }}
        >
          <Plus size={16} aria-hidden />
        </button>
      </div>
      {count > 0 && preview && (
        <div>
          {preview}
          {expanded && !expandLoading && rest}
          {expanded && expandLoading && (
            <div style={{ display: "flex", justifyContent: "center", padding: "10px 12px" }}>
              <Loader2 size={16} className="animate-spin" aria-hidden style={{ color: "var(--neutral-400)" }} />
            </div>
          )}
          {hasMore && (
            <button
              type="button"
              onClick={onToggleExpanded}
              disabled={expandLoading}
              aria-expanded={expanded}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                width: "100%",
                padding: "8px 12px",
                border: "none",
                borderTop: "1px solid var(--neutral-100)",
                backgroundColor: "var(--color-surface)",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--primary-700)",
              }}
            >
              <ChevronDown
                size={14}
                aria-hidden
                style={{
                  transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.15s",
                }}
              />
              {expanded ? showLessLabel : showMoreLabel}
            </button>
          )}
        </div>
      )}
      {count === 0 && (
        <p
          style={{
            margin: 0,
            padding: "10px 12px 12px",
            fontSize: "var(--text-caption)",
            color: "var(--color-text-tertiary)",
          }}
        >
          {emptyMessage}
        </p>
      )}
    </div>
  );
}

function HubObsRow({
  obs,
  typeCatalog,
  onClick,
  tProjects,
  tUnits,
}: {
  obs: ObsSummary;
  typeCatalog: Array<{ code: string; displayName: string }>;
  onClick: () => void;
  tProjects: ReturnType<typeof useTranslations<"projects">>;
  tUnits: ReturnType<typeof useTranslations<"units">>;
}) {
  const typeMeta = resolveObservationTypeBadgeMeta(obs.observationType, typeCatalog, tUnits);
  const authorName = obs.author.name ?? obs.author.email.split("@")[0];

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        width: "100%",
        padding: "10px 12px",
        backgroundColor: "var(--color-surface)",
        border: "none",
        borderBottom: "1px solid var(--neutral-100)",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, overflow: "hidden" }}>
          <span
            style={{
              flexShrink: 0,
              padding: "2px 8px",
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              backgroundColor: typeMeta.bg,
              color: typeMeta.color,
            }}
          >
            {typeMeta.label}
          </span>
          <p
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 600,
              color: "var(--neutral-900)",
              lineHeight: 1.35,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
            }}
          >
            {obs.title || obs.description || tProjects("hubFieldNotesObsFallbackTitle")}
          </p>
        </div>
        <span style={{ fontSize: 12, color: "var(--neutral-500)", marginTop: 3, display: "block" }}>
          {authorName} · {formatHubFieldNoteTime(obs.createdAt, tProjects)}
        </span>
        {obs._count.comments > 0 && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              marginTop: 6,
              fontSize: 11,
              fontWeight: 600,
              color: "var(--primary-600)",
              backgroundColor: "var(--primary-50)",
              borderRadius: 99,
              padding: "2px 8px",
            }}
          >
            <MessageSquare size={11} aria-hidden />
            {obs._count.comments}
          </span>
        )}
      </div>
      <ChevronRight size={14} style={{ color: "var(--neutral-300)", flexShrink: 0, marginTop: 4 }} aria-hidden />
    </button>
  );
}

export function ProjectHubFieldNotesCard({
  projectId,
  projectName,
  currentUserId,
  currentUserRole,
}: ProjectHubFieldNotesCardProps) {
  const t = useTranslations("projects");
  const tUnits = useTranslations("units");
  const fieldNotesLabels = useFieldNotesLocationLabels();
  const { observationTypes } = useObservationCatalog(projectId);

  const [observations, setObservations] = useState<ObsSummary[]>([]);
  const [issues, setIssues] = useState<IssueSummary[]>([]);
  const [obsTotalCount, setObsTotalCount] = useState(0);
  const [issuesTotalCount, setIssuesTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [obsExpandLoading, setObsExpandLoading] = useState(false);
  const [issuesExpandLoading, setIssuesExpandLoading] = useState(false);

  const [obsExpanded, setObsExpanded] = useState(false);
  const [issuesExpanded, setIssuesExpanded] = useState(false);

  const [selectedObs, setSelectedObs] = useState<ObsSummary | null>(null);
  const [selectedIssueIndex, setSelectedIssueIndex] = useState<number | null>(null);

  const [showAddObs, setShowAddObs] = useState(false);
  const [showAddIssue, setShowAddIssue] = useState(false);

  const fetchObservations = useCallback(async (previewOnly: boolean) => {
    const url = previewOnly
      ? `/api/projects/${projectId}/observations?projectLevel=true&limit=1`
      : `/api/projects/${projectId}/observations?projectLevel=true`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load observations");
      const data: { observations: ObsSummary[]; totalCount?: number } = await res.json();
      setObservations(data.observations ?? []);
      setObsTotalCount(data.totalCount ?? data.observations?.length ?? 0);
    } catch {
      const cached = await readSnapshotProjectLevelObservations(projectId);
      if (!cached) throw new Error("Failed to load observations");
      const rows = cached.data as ObsSummary[];
      setObservations(previewOnly ? rows.slice(0, 1) : rows);
      setObsTotalCount(rows.length);
    }
  }, [projectId]);

  const fetchIssues = useCallback(async (previewOnly: boolean) => {
    const url = previewOnly
      ? `/api/projects/${projectId}/issues?projectLevel=true&limit=1`
      : `/api/projects/${projectId}/issues?projectLevel=true`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load issues");
      const data: { issues: IssueSummary[]; totalCount?: number } = await res.json();
      setIssues(data.issues ?? []);
      setIssuesTotalCount(data.totalCount ?? data.issues?.length ?? 0);
    } catch {
      const cached = await readSnapshotProjectLevelIssues(projectId);
      if (!cached) throw new Error("Failed to load issues");
      const rows = cached.data as IssueSummary[];
      setIssues(previewOnly ? rows.slice(0, 1) : rows);
      setIssuesTotalCount(rows.length);
    }
  }, [projectId]);

  const fetchPreview = useCallback(async () => {
    setError(null);
    try {
      await Promise.all([fetchObservations(true), fetchIssues(true)]);
    } catch {
      setError(t("hubFieldNotesLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [fetchObservations, fetchIssues, t]);

  const handleToggleObsExpanded = useCallback(async () => {
    const next = !obsExpanded;
    setObsExpanded(next);
    if (next && obsTotalCount > observations.length) {
      setObsExpandLoading(true);
      try {
        await fetchObservations(false);
      } catch {
        setError(t("hubFieldNotesLoadFailed"));
        setObsExpanded(false);
      } finally {
        setObsExpandLoading(false);
      }
    }
  }, [obsExpanded, obsTotalCount, observations.length, fetchObservations, t]);

  const handleToggleIssuesExpanded = useCallback(async () => {
    const next = !issuesExpanded;
    setIssuesExpanded(next);
    if (next && issuesTotalCount > issues.length) {
      setIssuesExpandLoading(true);
      try {
        await fetchIssues(false);
      } catch {
        setError(t("hubFieldNotesLoadFailed"));
        setIssuesExpanded(false);
      } finally {
        setIssuesExpandLoading(false);
      }
    }
  }, [issuesExpanded, issuesTotalCount, issues.length, fetchIssues, t]);

  const refreshFieldNotes = useCallback(async () => {
    setLoading(true);
    setObsExpanded(false);
    setIssuesExpanded(false);
    await fetchPreview();
  }, [fetchPreview]);

  useEffect(() => {
    void fetchPreview();
  }, [fetchPreview]);

  const handleObsUpdated = (updated: ObsSummary) => {
    setObservations((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
    setSelectedObs(updated);
  };

  const handleIssueUpdated = (updated: IssueSummary) => {
    setIssues((prev) => prev.map((i) => (i.id === updated.id ? { ...i, ...updated } : i)));
  };

  const handleIssueDeleted = (issueId: string) => {
    setIssues((prev) => prev.filter((i) => i.id !== issueId));
    setSelectedIssueIndex(null);
  };

  const selectedObsIndex = selectedObs
    ? observations.findIndex((o) => o.id === selectedObs.id)
    : -1;

  const obsDetailNavTotal =
    obsExpanded && observations.length >= obsTotalCount
      ? obsTotalCount
      : observations.length;
  const issuesDetailNavTotal =
    issuesExpanded && issues.length >= issuesTotalCount
      ? issuesTotalCount
      : issues.length;

  return (
    <>
      <div style={PROJECT_HUB_CARD_STYLE}>
        <ProjectHubCardHeader icon={Eye} title={t("hubFieldNotesTitle")} />

        {loading ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 0",
              color: "var(--color-text-tertiary)",
              fontSize: "var(--text-caption)",
            }}
          >
            <Loader2 size={14} className="animate-spin" aria-hidden />
            {t("hubFieldNotesLoading")}
          </div>
        ) : error ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "4px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--error-600)", fontSize: "var(--text-caption)" }}>
              <AlertTriangle size={14} aria-hidden />
              {error}
            </div>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                void refreshFieldNotes();
              }}
              style={{
                alignSelf: "flex-start",
                fontSize: "var(--text-caption)",
                color: "var(--primary-700)",
                background: "none",
                border: "none",
                cursor: "pointer",
                textDecoration: "underline",
                padding: 0,
              }}
            >
              {t("hubFieldNotesRetry")}
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <HubCollapsibleSection
              label={t("hubFieldNotesObservations")}
              count={obsTotalCount}
              expanded={obsExpanded}
              expandLoading={obsExpandLoading}
              onToggleExpanded={() => void handleToggleObsExpanded()}
              addAriaLabel={t("hubFieldNotesAddObservation")}
              onAdd={() => setShowAddObs(true)}
              emptyMessage={t("hubFieldNotesNoObservations")}
              showMoreLabel={t("hubFieldNotesShowMore", { count: Math.max(0, obsTotalCount - 1) })}
              showLessLabel={t("hubFieldNotesShowLess")}
            >
              {observations.map((obs) => (
                <HubObsRow
                  key={obs.id}
                  obs={obs}
                  typeCatalog={observationTypes}
                  tProjects={t}
                  tUnits={tUnits}
                  onClick={() => setSelectedObs(obs)}
                />
              ))}
            </HubCollapsibleSection>

            <HubCollapsibleSection
              label={t("hubFieldNotesIssues")}
              count={issuesTotalCount}
              expanded={issuesExpanded}
              expandLoading={issuesExpandLoading}
              onToggleExpanded={() => void handleToggleIssuesExpanded()}
              addAriaLabel={t("hubFieldNotesAddIssue")}
              onAdd={() => setShowAddIssue(true)}
              emptyMessage={t("hubFieldNotesNoIssues")}
              showMoreLabel={t("hubFieldNotesShowMore", { count: Math.max(0, issuesTotalCount - 1) })}
              showLessLabel={t("hubFieldNotesShowLess")}
            >
              {issues.map((issue) => (
                <IssueLogRow
                  key={issue.id}
                  issue={issue}
                  variant="log"
                  showResponsible
                  onView={() => setSelectedIssueIndex(issues.findIndex((i) => i.id === issue.id))}
                />
              ))}
            </HubCollapsibleSection>
          </div>
        )}
      </div>

      {showAddObs && (
        <AddProjectObservationModal
          projectId={projectId}
          onClose={() => setShowAddObs(false)}
          onCreated={() => {
            setShowAddObs(false);
            void refreshFieldNotes();
          }}
        />
      )}

      {showAddIssue && (
        <AddProjectIssueModal
          projectId={projectId}
          onClose={() => setShowAddIssue(false)}
          onCreated={() => {
            setShowAddIssue(false);
            void refreshFieldNotes();
          }}
        />
      )}

      {selectedObs && (
        <ObservationDetailModal
          obs={selectedObs}
          unitContext={unitContextFromUnitRef(selectedObs.unitRef, fieldNotesLabels)}
          projectId={projectId}
          projectName={projectName}
          currentUserId={currentUserId}
          currentIndex={selectedObsIndex >= 0 ? selectedObsIndex : undefined}
          total={obsDetailNavTotal}
          onPrev={
            selectedObsIndex > 0
              ? () => setSelectedObs(observations[selectedObsIndex - 1])
              : undefined
          }
          onNext={
            selectedObsIndex >= 0 && selectedObsIndex < observations.length - 1
              ? () => setSelectedObs(observations[selectedObsIndex + 1])
              : undefined
          }
          onClose={() => setSelectedObs(null)}
          onUpdated={handleObsUpdated}
        />
      )}

      {selectedIssueIndex !== null && issues[selectedIssueIndex] && (
        <IssueDetailModal
          key={issues[selectedIssueIndex].id}
          issue={issues[selectedIssueIndex]}
          unitContext={unitContextFromUnitRef(issues[selectedIssueIndex].unitRef, fieldNotesLabels)}
          projectId={projectId}
          projectName={projectName}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          onClose={() => setSelectedIssueIndex(null)}
          onUpdated={handleIssueUpdated}
          onDeleted={handleIssueDeleted}
          issueIndex={selectedIssueIndex + 1}
          issueTotal={issuesDetailNavTotal}
          onPrev={
            selectedIssueIndex > 0
              ? () => setSelectedIssueIndex((i) => (i !== null ? i - 1 : i))
              : undefined
          }
          onNext={
            selectedIssueIndex < issues.length - 1
              ? () => setSelectedIssueIndex((i) => (i !== null ? i + 1 : i))
              : undefined
          }
        />
      )}
    </>
  );
}
