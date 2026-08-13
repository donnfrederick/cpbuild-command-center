"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { Search, X, ChevronRight, ChevronLeft, Loader2, CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";
import type { UnifierProject } from "@/lib/unifier/types";
import type { Project } from "@/lib/projects";
import { parseUPM, parseUPMFromFile, validateUPMRows, formatUPMValidationError, type UPMValidationError } from "@/lib/upm-parse";
import { CC_UNIFIER_LINKED_COUNT_HEADER } from "@/lib/unifier/projects-list-header";
import { formatUnifierSiteLocation } from "@/lib/unifier/site-location-display";
import {
  TOUR_DEMO_UNIFIER_PROJECT,
  TOUR_DEMO_PROJECT,
  TOUR_DEMO_UPM_HEADERS,
  TOUR_DEMO_UPM_ROWS,
} from "@/lib/tour-demo-data";
import { UpmPreviewTable } from "@/components/projects/UpmPreviewTable";
import { FileDropOverlay } from "@/components/ui/FileDropOverlay";
import { useFileDrop } from "@/hooks/use-file-drop";
import { ScopeLinkingModal, type UnlinkedScopeType } from "@/components/projects/ScopeLinkingModal";
import { LocationBuilderAppendProgressOverlay } from "@/components/projects/LocationBuilderAppendProgressOverlay";
import { LocationBuilderSpreadsheetParsingOverlay } from "@/components/projects/LocationBuilderSpreadsheetParsingOverlay";
import type { AppendRowsProgress } from "@/lib/field-tracker-append-rows";
import {
  createProjectWithUpmRows,
  CreateProjectCancelledError,
  revertCreateProjectAttempt,
} from "@/lib/create-project-with-upm";

interface CreateProjectModalProps {
  onClose: () => void;
  onCreated: (project: Project) => void;
  /** Whether the current user has EDIT_UPM — required to resolve the scope linking modal. */
  canEditUpm?: boolean;
}

type Step = "search" | "confirm" | "upm";

const STATUS_LABELS: Record<string, string> = {
  Active: "Active",
  OnHold: "On Hold",
  Completed: "Completed",
  Planning: "Planning",
};

/** Maps Unifier shell status (`UUU_SHELL_STATUS`) → short lifecycle label for the confirm-step summary (not API `Project.status`). */
function formatStatus(raw: string | null): string {
  if (!raw) return "Planning";
  const lower = raw.trim().toLowerCase();
  if (lower === "active") return "Active";
  if (lower === "on hold") return "On Hold";
  if (lower === "inactive" || lower === "complete" || lower === "completed") return "Completed";
  return "Planning";
}

/** Unifier “Status” column in confirm step: project phase when present, else shell-derived CC label. */
function unifierStatusDisplay(project: UnifierProject): string {
  const phase = (project.status ?? project.projectPhase ?? "").trim();
  if (phase) return phase;
  return formatStatus(project.shellStatus);
}

export type { UPMValidationError } from "@/lib/upm-parse";

// ─── Main component ─────────────────────────────────────────────────────────────

export function CreateProjectModal({ onClose, onCreated, canEditUpm = false }: CreateProjectModalProps) {
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");
  const [step, setStep] = useState<Step>("search");
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<UnifierProject[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [linkedUnifierProjectCount, setLinkedUnifierProjectCount] = useState(0);
  const [selected, setSelected] = useState<UnifierProject | null>(null);
  const [upmPaste, setUpmPaste] = useState("");
  const [upmRows, setUpmRows] = useState<Record<string, string>[]>([]);
  const [upmHeaders, setUpmHeaders] = useState<string[]>([]);
  const [upmValidationErrors, setUpmValidationErrors] = useState<UPMValidationError[]>([]);
  const [upmSource, setUpmSource] = useState<"paste" | "file" | null>(null);
  const [upmFileName, setUpmFileName] = useState<string | null>(null);
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createProgress, setCreateProgress] = useState<AppendRowsProgress | null>(null);
  const createCancelRequestedRef = useRef(false);
  const [pendingUnlinkedScopes, setPendingUnlinkedScopes] = useState<UnlinkedScopeType[]>([]);
  const [pendingProject, setPendingProject] = useState<(Project & { restored?: boolean }) | null>(null);

  // Ref so tour event handlers read the latest projects list without stale closures.
  const projectsRef = useRef<UnifierProject[]>([]);
  useEffect(() => { projectsRef.current = projects; }, [projects]);

  const upmParsed = useMemo(() => parseUPM(upmPaste), [upmPaste]);

  // Sync parsed paste data into editable state (skip when paste is empty, e.g. after file upload)
  useEffect(() => {
    if (upmParsed.error || !upmPaste.trim()) return;
    setUpmSource("paste");
    setUpmFileName(null);
    setUpmHeaders(upmParsed.headers);
    setUpmRows(upmParsed.rows);
    setUpmValidationErrors(upmParsed.validationErrors);
  }, [upmParsed.error, upmParsed.headers, upmParsed.rows, upmParsed.validationErrors, upmPaste]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setIsLoadingProjects(true);
        setLoadError(null);
        const res = await fetch("/api/unifier/projects");
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? t("failedToLoadUnifier"));
        }
        const rawLinked = res.headers?.get(CC_UNIFIER_LINKED_COUNT_HEADER);
        const linked = rawLinked != null ? Number.parseInt(rawLinked, 10) : 0;
        const data = await res.json() as UnifierProject[];
        if (!cancelled) {
          setProjects(data);
          setLinkedUnifierProjectCount(Number.isFinite(linked) && linked >= 0 ? linked : 0);
        }
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : t("failedToLoadUnifier"));
      } finally {
        if (!cancelled) setIsLoadingProjects(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [t]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        (p.projectName ?? "").toLowerCase().includes(q) ||
        (p.projectNumber ?? "").toLowerCase().includes(q) ||
        (p.location ?? "").toLowerCase().includes(q) ||
        (p.projectManagerName ?? "").toLowerCase().includes(q)
    );
  }, [projects, query]);

  // ─── Tour simulation event listeners ──────────────────────────────────────
  // These events are dispatched by TourPlayer (type:"dispatch") so the modal
  // can walk through the wizard steps automatically without a real API call.
  useEffect(() => {
    let createTimer: ReturnType<typeof setTimeout> | null = null;

    // Legacy step-by-step handlers (kept for backwards compat / manual testing)
    function handleSelectDemo() {
      const list = projectsRef.current;
      const toSelect: UnifierProject =
        list.length > 0
          ? list[Math.floor(Math.random() * list.length)]
          : (TOUR_DEMO_UNIFIER_PROJECT as UnifierProject);
      setSelected(toSelect);
      setStep("confirm");
    }

    function handleWizardAdvance() {
      setStep("upm");
    }

    function handleInjectAndCreate() {
      if (createTimer !== null) { clearTimeout(createTimer); createTimer = null; }
      setUpmSource("file");
      setUpmFileName("FieldTracker_Demo.xlsx");
      setUpmHeaders(TOUR_DEMO_UPM_HEADERS);
      setUpmRows(TOUR_DEMO_UPM_ROWS);
      setUpmValidationErrors([]);
      createTimer = setTimeout(() => {
        const toasted = t("projectCreatedWithUPM", {
          name: TOUR_DEMO_PROJECT.projectName,
          count: TOUR_DEMO_UPM_ROWS.length,
        });
        toast.success(toasted);
        onCreated(TOUR_DEMO_PROJECT as Project);
        onClose();
      }, 2500);
    }

    // Single-event full wizard: select → confirm → create (no UPM) in ~2 s.
    // Used by tour step 6 so the entire wizard plays out automatically while
    // the user watches, then the modal closes and the tour advances to step 7.
    function handleFullWizardNoUpm() {
      if (createTimer !== null) { clearTimeout(createTimer); createTimer = null; }
      const list = projectsRef.current;
      const toSelect: UnifierProject =
        list.length > 0
          ? list[Math.floor(Math.random() * list.length)]
          : (TOUR_DEMO_UNIFIER_PROJECT as UnifierProject);
      setSelected(toSelect);
      setStep("confirm");

      createTimer = setTimeout(() => {
        toast.success(
          t("projectCreated", { name: TOUR_DEMO_PROJECT.projectName })
        );
        onCreated(TOUR_DEMO_PROJECT as Project);
        onClose();
      }, 1800);
    }

    window.addEventListener("tour:select-demo-project", handleSelectDemo);
    window.addEventListener("tour:wizard-advance", handleWizardAdvance);
    window.addEventListener("tour:inject-and-create", handleInjectAndCreate);
    window.addEventListener("tour:run-full-wizard-no-upm", handleFullWizardNoUpm);

    return () => {
      window.removeEventListener("tour:select-demo-project", handleSelectDemo);
      window.removeEventListener("tour:wizard-advance", handleWizardAdvance);
      window.removeEventListener("tour:inject-and-create", handleInjectAndCreate);
      window.removeEventListener("tour:run-full-wizard-no-upm", handleFullWizardNoUpm);
      if (createTimer !== null) clearTimeout(createTimer);
    };
  }, [onCreated, onClose, t]);

  const handleSelect = useCallback((project: UnifierProject) => {
    setSelected(project);
    setStep("confirm");
  }, []);

  const handleBack = useCallback(() => {
    if (step === "confirm") {
      setStep("search");
      setSelected(null);
    } else if (step === "upm") {
      setStep("confirm");
    }
  }, [step]);

  const handleNext = useCallback(() => {
    if (step === "confirm") setStep("upm");
  }, [step]);

  const handleUPMFileUpload = useCallback(async (file: File) => {
    setIsParsingFile(true);
    try {
      const result = await parseUPMFromFile(file);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setUpmSource("file");
      setUpmFileName(file.name);
      setUpmHeaders(result.headers);
      setUpmRows(result.rows);
      setUpmValidationErrors(result.validationErrors);
      setUpmPaste(""); // Clear paste area when using file
    } finally {
      setIsParsingFile(false);
    }
  }, []);

  const handleUPMCellEdit = useCallback((rowIndex: number, col: string, value: string) => {
    setUpmRows((prev) => {
      const next = prev.map((row, i) => (i === rowIndex ? { ...row, [col]: value } : row));
      setUpmValidationErrors(validateUPMRows(upmHeaders, next));
      return next;
    });
  }, [upmHeaders]);

  const handleCreate = useCallback(async (options?: { skipUpm?: boolean }) => {
    if (!selected) return;
    const includeUpm = !options?.skipUpm && upmRows.length > 0;

    if (!includeUpm) {
      setIsCreating(true);
      try {
        const res = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ unifierPid: selected.pid }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string; detail?: string };
          const msg = body.detail ? `${body.error ?? "Failed"}: ${body.detail}` : (body.error ?? `Failed to create project (${res.status})`);
          throw new Error(msg);
        }

        const body = await res.json() as Project & { restored?: boolean; unlinkedScopeTypes?: UnlinkedScopeType[] };
        const name = body.projectName ?? "";
        if (body.restored) {
          toast.success(t("projectRestored", { name }));
        } else {
          toast.success(t("projectCreated", { name }));
        }
        if (body.unlinkedScopeTypes && body.unlinkedScopeTypes.length > 0) {
          setPendingProject(body);
          setPendingUnlinkedScopes(body.unlinkedScopeTypes);
        } else {
          onCreated(body);
          onClose();
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("failedToCreateProject"));
      } finally {
        setIsCreating(false);
      }
      return;
    }

    createCancelRequestedRef.current = false;
    setIsCreating(true);
    setCreateProgress({ phase: "creating", completed: 0, total: upmRows.length });
    try {
      const source = upmSource === "file" ? "upload" : "paste";
      const result = await createProjectWithUpmRows({
        unifierPid: selected.pid,
        rows: upmRows,
        source,
        onProgress: setCreateProgress,
        isCancelled: () => createCancelRequestedRef.current,
      });
      setCreateProgress({ phase: "refreshing", completed: upmRows.length, total: upmRows.length });

      const { project: body } = result;
      const name = body.projectName ?? "";
      if (body.restored) {
        toast.success(
          result.added === 1
            ? t("projectRestoredWithUPM", { name, count: 1 })
            : t("projectRestoredWithUPM", { name, count: result.added }),
        );
      } else {
        toast.success(
          result.added === 1
            ? t("projectCreatedWithUPM", { name, count: 1 })
            : t("projectCreatedWithUPM", { name, count: result.added }),
        );
      }
      if (result.unlinkedScopeTypes.length > 0) {
        setPendingProject(body);
        setPendingUnlinkedScopes(result.unlinkedScopeTypes);
      } else {
        onCreated(body);
        onClose();
      }
    } catch (err) {
      if (err instanceof CreateProjectCancelledError) {
        setCreateProgress({
          phase: "cancelling",
          completed: err.addedRowIds.length,
          total: upmRows.length,
        });
        try {
          await revertCreateProjectAttempt(err.project.id, err.addedRowIds);
          if (err.addedRowIds.length > 0) {
            toast.success(
              err.addedRowIds.length === 1
                ? t("createProjectCancelledOne")
                : t("createProjectCancelled", { count: err.addedRowIds.length }),
            );
          } else {
            toast.success(t("createProjectCancelledNone"));
          }
        } catch (revertErr) {
          toast.error(revertErr instanceof Error ? revertErr.message : t("createProjectCancelRevertFailed"));
        }
        return;
      }
      toast.error(err instanceof Error ? err.message : t("failedToCreateProject"));
    } finally {
      setIsCreating(false);
      setCreateProgress(null);
      createCancelRequestedRef.current = false;
    }
  }, [selected, upmRows, upmSource, onCreated, onClose, t]);

  const handleCancelCreate = useCallback(() => {
    if (!isCreating || createProgress?.phase !== "uploading") return;
    createCancelRequestedRef.current = true;
    setCreateProgress((prev) =>
      prev ? { ...prev, phase: "cancelling", completed: prev.completed } : prev,
    );
  }, [isCreating, createProgress?.phase]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isCreating) onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, isCreating]);

  const stepLabels = { search: t("createProjectStep1"), confirm: t("createProjectStep2"), upm: t("createProjectStep3") };
  const stepTitles = {
    search: t("selectUnifierProject"),
    confirm: t("confirmProject"),
    upm: t("uploadUPM"),
  };

  if (pendingUnlinkedScopes.length > 0 && pendingProject && canEditUpm) {
    return (
      <ScopeLinkingModal
        unlinkedScopeTypes={pendingUnlinkedScopes}
        onComplete={() => {
          onCreated(pendingProject);
          onClose();
        }}
      />
    );
  }

  return (
    <>
      {isParsingFile ? <LocationBuilderSpreadsheetParsingOverlay fileName={upmFileName} /> : null}
      <div
        style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", zIndex: 40 }}
        aria-hidden="true"
        onClick={() => {
          if (!isCreating) onClose();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("addProject")}
        data-tour="create-project-modal"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 50,
          width: "min(720px, calc(100vw - 32px))",
          maxHeight: "calc(100vh - 64px)",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "var(--neutral-0)",
          borderRadius: "var(--radius-md, 8px)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          overflow: "hidden",
        }}
      >
        {createProgress ? (
          <LocationBuilderAppendProgressOverlay
            variant="create"
            progress={createProgress}
            onCancel={createProgress.phase === "uploading" ? handleCancelCreate : undefined}
          />
        ) : null}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid var(--neutral-200)", flexShrink: 0 }}>
          <div>
            <p style={{ fontSize: 12, color: "var(--neutral-500)", margin: 0, marginBottom: 2 }}>{stepLabels[step]}</p>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--neutral-900)", margin: 0 }}>{stepTitles[step]}</h2>
          </div>
          <button onClick={onClose} disabled={isCreating} aria-label={tCommon("close")} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: "var(--radius-sm, 6px)", border: "none", background: "none", color: "var(--neutral-500)", cursor: isCreating ? "not-allowed" : "pointer", opacity: isCreating ? 0.5 : 1 }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {step === "search" && (
            <SearchStep
              query={query}
              onQueryChange={setQuery}
              projects={filtered}
              isLoading={isLoadingProjects}
              loadError={loadError}
              onSelect={handleSelect}
              totalCount={projects.length}
              linkedCount={linkedUnifierProjectCount}
            />
          )}
          {step === "confirm" && (
            <ConfirmStep
              project={selected!}
              onBack={handleBack}
              onNext={handleNext}
              onCreateWithoutLocations={() => void handleCreate({ skipUpm: true })}
              isCreating={isCreating}
            />
          )}
          {step === "upm" && (
            <UPMStep
              upmPaste={upmPaste}
              onUpmPasteChange={setUpmPaste}
              upmParsed={upmParsed}
              upmHeaders={upmHeaders}
              upmRows={upmRows}
              upmSource={upmSource}
              upmFileName={upmFileName}
              isParsingFile={isParsingFile}
              onCellEdit={handleUPMCellEdit}
              onFileUpload={handleUPMFileUpload}
              validationErrors={upmValidationErrors}
              isCreating={isCreating}
              onBack={handleBack}
              onCreate={() => void handleCreate()}
            />
          )}
        </div>
      </div>
    </>
  );
}

// ─── Step 1: Search ───────────────────────────────────────────────────────────

interface SearchStepProps {
  query: string;
  onQueryChange: (q: string) => void;
  projects: UnifierProject[];
  isLoading: boolean;
  loadError: string | null;
  onSelect: (p: UnifierProject) => void;
  totalCount: number;
  /** Field Tracker projects that already have a Unifier PID (not shown in this list). */
  linkedCount: number;
}

function SearchStep({ query, onQueryChange, projects, isLoading, loadError, onSelect, totalCount, linkedCount }: SearchStepProps) {
  const t = useTranslations("projects");
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <div style={{ padding: "16px 24px 12px", flexShrink: 0 }}>
        <div style={{ position: "relative" }}>
          <Search style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, color: "var(--neutral-400)", pointerEvents: "none" }} />
          <input
            autoFocus
            type="text"
            data-tour="create-project-search"
            placeholder={t("searchUnifierPlaceholder")}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            aria-label={t("searchUnifierAria")}
            style={{ width: "100%", height: 40, paddingLeft: 36, paddingRight: 12, border: "1px solid var(--neutral-300)", borderRadius: "var(--radius-sm, 6px)", backgroundColor: "var(--neutral-0)", color: "var(--neutral-900)", fontSize: 14, outline: "none", boxSizing: "border-box" }}
            onFocus={(e) => (e.currentTarget.style.boxShadow = "var(--focus-ring)")}
            onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
          />
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 16px" }}>
        {isLoading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "48px 0", color: "var(--neutral-500)", fontSize: 14 }}>
            <Loader2 style={{ width: 18, height: 18, animation: "spin 1s linear infinite" }} />
            {t("loadingUnifierProjects")}
          </div>
        ) : loadError ? (
          <div style={{ padding: "32px 0", textAlign: "center" }}>
            <p style={{ color: "var(--error-600)", fontSize: 14 }}>{loadError}</p>
          </div>
        ) : projects.length === 0 ? (
          <div style={{ padding: "32px 0", textAlign: "center", color: "var(--neutral-500)", fontSize: 14 }}>
            {totalCount === 0 ? t("noUnifierProjects") : t("noProjectsMatchSearch")}
          </div>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            {projects.map((p) => (
              <li key={p.pid}>
                <button
                  onClick={() => onSelect(p)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "12px 14px", border: "1px solid var(--neutral-200)", borderRadius: "var(--radius-sm, 6px)", backgroundColor: "var(--neutral-0)", cursor: "pointer", textAlign: "left", gap: 12 }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--primary-400)"; e.currentTarget.style.backgroundColor = "var(--primary-50, #f0f7ff)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--neutral-200)"; e.currentTarget.style.backgroundColor = "var(--neutral-0)"; }}
                  onFocus={(e) => (e.currentTarget.style.boxShadow = "var(--focus-ring)")}
                  onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                      {p.projectNumber && <span style={{ fontSize: 11, fontWeight: 600, color: "var(--primary-600)", fontFamily: "monospace", flexShrink: 0 }}>{p.projectNumber}</span>}
                      <span style={{ fontSize: 14, fontWeight: 500, color: "var(--neutral-900)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.projectName ?? "Unnamed project"}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--neutral-500)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {[p.location, p.projectManagerName ? `PM: ${p.projectManagerName}` : null].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <ChevronRight style={{ width: 16, height: 16, color: "var(--neutral-400)", flexShrink: 0 }} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {!isLoading && !loadError && (
        <div style={{ padding: "8px 24px 16px", borderTop: "1px solid var(--neutral-100)", flexShrink: 0 }}>
          <p style={{ margin: 0, fontSize: 12, color: "var(--neutral-500)" }}>
            {query ? t("projectsMatchCount", { count: projects.length, total: totalCount }) : totalCount === 1 ? t("projectsAvailableCount", { count: 1 }) : t("projectsAvailableCountPlural", { count: totalCount })}
          </p>
          {linkedCount > 0 ? (
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--neutral-500)" }}>
              {t("unifierProjectsAlreadyLinked", { count: linkedCount })}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ─── Step 2: Confirm (Next instead of Create) ───────────────────────────────────

interface ConfirmStepProps {
  project: UnifierProject;
  onBack: () => void;
  onNext: () => void;
  onCreateWithoutLocations: () => void;
  isCreating: boolean;
}

function ConfirmStep({ project, onBack, onNext, onCreateWithoutLocations, isCreating }: ConfirmStepProps) {
  const t = useTranslations("projects");
  const fields: { label: string; value: string | null; mono?: boolean }[] = [
    { label: t("projectName"), value: project.projectName },
    { label: t("unifierNumber"), value: project.projectNumber, mono: true },
    {
      label: t("siteLocation"),
      value: formatUnifierSiteLocation(project.location ?? project.address, project.state) || null,
    },
    { label: t("projectManager"), value: project.projectManagerName },
    { label: t("status"), value: unifierStatusDisplay(project) },
    { label: t("client"), value: project.clientName },
    { label: t("projectType"), value: project.projectType },
    { label: t("unifierPID"), value: project.pid, mono: true },
  ];

  return (
    <div data-tour="create-project-confirm" style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
        <div style={{ backgroundColor: "var(--neutral-50, #f9fafb)", border: "1px solid var(--neutral-200)", borderRadius: "var(--radius-sm, 6px)", padding: "16px", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <CheckCircle2 style={{ width: 18, height: 18, color: "var(--success-600, #16a34a)", flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--neutral-700)" }}>{t("reviewProjectData")}</span>
          </div>
          <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px" }}>
            {fields.map(({ label, value, mono }) =>
              value ? (
                <div key={label}>
                  <dt style={{ fontSize: 11, fontWeight: 600, color: "var(--neutral-500)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>{label}</dt>
                  <dd style={{ margin: 0, fontSize: 13, color: "var(--neutral-900)", fontFamily: mono ? "monospace" : "inherit" }}>{value}</dd>
                </div>
              ) : null
            )}
          </dl>
        </div>
        <p style={{ fontSize: 12, color: "var(--neutral-500)", margin: 0 }}>{t("nextUploadUPMOptional")}</p>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 24px", borderTop: "1px solid var(--neutral-200)", flexShrink: 0, gap: 12 }}>
        <button
          onClick={onBack}
          disabled={isCreating}
          style={{ display: "flex", alignItems: "center", gap: 6, height: 38, padding: "0 16px", border: "1px solid var(--neutral-300)", borderRadius: "var(--radius-sm, 6px)", backgroundColor: "var(--neutral-0)", color: "var(--neutral-700)", fontSize: 14, fontWeight: 500, cursor: isCreating ? "not-allowed" : "pointer", opacity: isCreating ? 0.5 : 1 }}
        >
          <ChevronLeft style={{ width: 16, height: 16 }} />
          {t("back")}
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            type="button"
            data-tour="create-project-skip-locations"
            onClick={onCreateWithoutLocations}
            disabled={isCreating}
            aria-label={t("createWithoutLocationsAria")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              height: 38,
              padding: "0 16px",
              border: "1px solid var(--neutral-300)",
              borderRadius: "var(--radius-sm, 6px)",
              backgroundColor: "var(--neutral-0)",
              color: "var(--neutral-700)",
              fontSize: 14,
              fontWeight: 500,
              cursor: isCreating ? "not-allowed" : "pointer",
              opacity: isCreating ? 0.5 : 1,
            }}
          >
            {isCreating ? (
              <>
                <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} />
                {t("creating")}
              </>
            ) : (
              t("createWithoutLocations")
            )}
          </button>
          <button
            onClick={onNext}
            disabled={isCreating}
            style={{ display: "flex", alignItems: "center", gap: 6, height: 38, padding: "0 20px", border: "none", borderRadius: "var(--radius-sm, 6px)", backgroundColor: "var(--primary-500)", color: "var(--neutral-0)", fontSize: 14, fontWeight: 500, cursor: isCreating ? "not-allowed" : "pointer", opacity: isCreating ? 0.5 : 1 }}
            onFocus={(e) => (e.currentTarget.style.boxShadow = "var(--focus-ring)")}
            onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
          >
            {t("next")}
            <ChevronRight style={{ width: 16, height: 16 }} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Step 3: UPM Upload ───────────────────────────────────────────────────────

interface UPMStepProps {
  upmPaste: string;
  onUpmPasteChange: (v: string) => void;
  upmParsed: { headers: string[]; rows: Record<string, string>[]; error: string | null };
  upmHeaders: string[];
  upmRows: Record<string, string>[];
  upmSource: "paste" | "file" | null;
  upmFileName: string | null;
  isParsingFile: boolean;
  onCellEdit: (rowIndex: number, col: string, value: string) => void;
  onFileUpload: (file: File) => Promise<void>;
  validationErrors: UPMValidationError[];
  isCreating: boolean;
  onBack: () => void;
  onCreate: () => void;
}

function UPMStep({
  upmPaste,
  onUpmPasteChange,
  upmParsed,
  upmHeaders,
  upmRows,
  upmSource,
  upmFileName,
  isParsingFile,
  onCellEdit,
  onFileUpload,
  validationErrors,
  isCreating,
  onBack,
  onCreate,
}: UPMStepProps) {
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasDataFromFile = upmSource === "file" && upmRows.length > 0;
  const showPasteError = upmParsed.error && upmPaste.trim().length > 0;
  const pasteIsEmpty = upmPaste.trim().length === 0;
  const hasUpmData = upmRows.length > 0;
  const canCreateWithoutLocations =
    pasteIsEmpty && !hasUpmData && validationErrors.length === 0 && !isParsingFile;
  const canCreateWithLocations =
    hasUpmData && (hasDataFromFile || !upmParsed.error) && validationErrors.length === 0 && !isParsingFile;
  const canCreate = canCreateWithoutLocations || canCreateWithLocations;

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void onFileUpload(file);
      e.target.value = "";
    },
    [onFileUpload]
  );

  const handleSpreadsheetDrop = useCallback(
    (files: File[]) => {
      const file = files[0];
      if (file) void onFileUpload(file);
    },
    [onFileUpload],
  );

  const handleSpreadsheetDropRejected = useCallback(() => {
    toast.error(t("dropSpreadsheetRejected"));
  }, [t]);

  const { dropHandlers } = useFileDrop({
    onFiles: handleSpreadsheetDrop,
    onRejected: handleSpreadsheetDropRejected,
    accept: ".xlsx,.xls",
    multiple: false,
    disabled: isParsingFile,
  });

  return (
    <div data-tour="create-project-upm" style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ position: "relative" }} {...dropHandlers}>
          <label htmlFor="upm-paste" style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--neutral-700)", marginBottom: 6 }}>
            {t("uploadOrPasteUPM")}
          </label>
          <p style={{ fontSize: 12, color: "var(--neutral-500)", margin: 0, marginBottom: 8 }}>
            {t("uploadUPMHint")}
          </p>
          <p style={{ fontSize: 12, color: "var(--neutral-500)", margin: 0, marginBottom: 8 }}>
            {t("locationsOptionalHint")}
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              style={{ display: "none" }}
              aria-label={t("uploadExcelFile")}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isParsingFile}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                height: 40,
                padding: "0 16px",
                border: "1px solid var(--neutral-300)",
                borderRadius: "var(--radius-sm, 6px)",
                backgroundColor: "var(--neutral-0)",
                color: "var(--neutral-700)",
                fontSize: 13,
                fontWeight: 500,
                cursor: isParsingFile ? "not-allowed" : "pointer",
                opacity: isParsingFile ? 0.7 : 1,
              }}
            >
              {isParsingFile ? (
                <>
                  <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />
                  {t("parsing")}
                </>
              ) : (
                <>
                  <Upload style={{ width: 16, height: 16 }} />
                  {t("uploadExcelFile")}
                </>
              )}
            </button>
            {upmFileName && hasDataFromFile && (
              <span style={{ fontSize: 12, color: "var(--success-600, #16a34a)", fontWeight: 500 }}>
                {t("loadedFile", { name: upmFileName, count: upmRows.length })}
              </span>
            )}
          </div>
          <textarea
            id="upm-paste"
            value={upmPaste}
            onChange={(e) => onUpmPasteChange(e.target.value)}
            placeholder={t("pasteUPMPlaceholder")}
            rows={4}
            style={{
              width: "100%",
              padding: 12,
              marginTop: 8,
              border: "1px solid var(--neutral-300)",
              borderRadius: "var(--radius-sm, 6px)",
              fontSize: 12,
              fontFamily: "ui-monospace, Menlo, monospace",
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />
          <FileDropOverlay
            disabled={isParsingFile}
            hint={t("dropSpreadsheetHint")}
          />
        </div>

        {showPasteError && (
          <div style={{ padding: 12, backgroundColor: "var(--error-50, #fef2f2)", border: "1px solid var(--error-200, #fecaca)", borderRadius: "var(--radius-sm, 6px)", color: "var(--error-700, #b91c1c)", fontSize: 13 }}>
            {upmParsed.error}
          </div>
        )}

        {validationErrors.length > 0 && (
          <div style={{ padding: 12, backgroundColor: "var(--warning-50, #fffbeb)", border: "1px solid var(--warning-200, #fde68a)", borderRadius: "var(--radius-sm, 6px)", color: "var(--warning-800, #92400e)", fontSize: 13 }}>
            <strong>{t("formatIssues")}</strong>
            <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
              {validationErrors.slice(0, 10).map((e, i) => (
                <li key={i}>
                  {formatUPMValidationError(e)}
                </li>
              ))}
              {validationErrors.length > 10 && <li>{t("andMoreRows", { count: validationErrors.length - 10 })}</li>}
            </ul>
            <p style={{ margin: "8px 0 0", fontSize: 12 }}>{t("fixInPreview")}</p>
          </div>
        )}

        {upmRows.length > 0 && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <FileSpreadsheet style={{ width: 18, height: 18, color: "var(--primary-600)" }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--neutral-800)" }}>
                {upmRows.length === 1 ? t("previewRows", { count: 1 }) : t("previewRowsPlural", { count: upmRows.length })}
              </span>
            </div>
            <UpmPreviewTable
              headers={upmHeaders}
              rows={upmRows}
              validationErrors={validationErrors}
              rowNumberHeader={t("upmPreviewRowNumberHeader")}
              onCellEdit={onCellEdit}
            />
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 24px", borderTop: "1px solid var(--neutral-200)", flexShrink: 0, gap: 12 }}>
        <button
          onClick={onBack}
          disabled={isCreating}
          style={{ display: "flex", alignItems: "center", gap: 6, height: 38, padding: "0 16px", border: "1px solid var(--neutral-300)", borderRadius: "var(--radius-sm, 6px)", backgroundColor: "var(--neutral-0)", color: "var(--neutral-700)", fontSize: 14, fontWeight: 500, cursor: isCreating ? "not-allowed" : "pointer", opacity: isCreating ? 0.5 : 1 }}
        >
          <ChevronLeft style={{ width: 16, height: 16 }} />
          {t("back")}
        </button>
        <button
          onClick={onCreate}
          disabled={isCreating || !canCreate}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            height: 38,
            padding: "0 20px",
            border: "none",
            borderRadius: "var(--radius-sm, 6px)",
            backgroundColor: isCreating || !canCreate ? "var(--primary-300)" : "var(--primary-500)",
            color: "var(--neutral-0)",
            fontSize: 14,
            fontWeight: 500,
            cursor: isCreating || !canCreate ? "not-allowed" : "pointer",
          }}
          onFocus={(e) => (e.currentTarget.style.boxShadow = "var(--focus-ring)")}
          onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
        >
          {isCreating ? (
            <>
              <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />
              {t("creating")}
            </>
          ) : upmRows.length > 0 ? (
            t("confirmCreateWithRows", { count: upmRows.length })
          ) : (
            t("confirmCreateProject")
          )}
        </button>
      </div>
    </div>
  );
}

void STATUS_LABELS;
