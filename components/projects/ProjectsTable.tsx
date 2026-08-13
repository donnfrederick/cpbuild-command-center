"use client";

import { useState, useMemo, useCallback, useEffect, type MouseEvent, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Search, ChevronDown, ChevronUp, Filter, X, Trash2, TableProperties } from "lucide-react";
import { OfflineProjectButton } from "@/components/projects/OfflineProjectButton";
import { readSnapshotProjectsList } from "@/lib/offline/snapshot-project-reads";
import { FavoriteProjectButton } from "@/components/projects/FavoriteProjectButton";
import { ProjectCloneSubtitle } from "@/components/projects/ProjectCloneSubtitle";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CreateProjectModal } from "@/components/projects/CreateProjectModal";
import { ProjectSiteLocationLink } from "@/components/projects/ProjectSiteLocationLink";
import { useDebounce } from "@/hooks/use-debounce";
import { SEARCH_DEBOUNCE_MS, type Project, type ProjectSortField, type SortDirection } from "@/lib/projects";
import {
  readProjectsListFiltersSession,
  writeProjectsListFiltersSession,
} from "@/lib/projects-list-filters-session";
import {
  compareProjectsByField,
  sortProjectsWithFavorites,
  type FavoriteProjectMeta,
} from "@/lib/project-favorites-shared";
import { useOptionalRouteFetch } from "@/components/navigation/route-fetch-provider";
import { isAbortError } from "@/lib/route-fetch";
import { UNIFIER_AVAILABLE_HEADER } from "@/lib/unifier/availability-header";
import { SearchInput } from "@/components/shared/SearchInput";
import {
  FilterPanelFooterActions,
  FilterPanelSection,
  FilterPanelShell,
  FilterPill,
  FilterPillGroup,
} from "@/components/shared/filterPanel";
import { useOfflineSyncContext } from "@/hooks/offline-sync-context";
import { useOfflineStatus } from "@/hooks/use-offline-status";
import {
  handleOfflineProjectLinkClick,
  navigateToProjectDetail,
  shouldUseOfflineDocumentNav,
} from "@/lib/offline/offline-project-navigation";
import { useOptionalNavigationPending } from "@/components/navigation/navigation-pending-provider";
import { toast } from "sonner";

const KNOWN_STATUS_LABELS = new Set(["Active", "Completed", "Planning", "On Hold"]);

function getPersonInitials(name: string | null | undefined, fallback: string): string {
  const trimmed = name?.trim();
  if (!trimmed) return fallback;
  const parts = trimmed.split(/\s+/).slice(0, 2);
  const initials = parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
  return initials || fallback;
}

interface ProjectsTableProps {
  initialProjects: Project[];
  /** Can create new projects (shown the Add Project modal trigger) */
  canCreate: boolean;
  /** Can delete projects (shown the delete column and confirm dialog) */
  canDelete: boolean;
  /** Admin-only: delete rows marked as test projects (server enforces ADMIN). */
  canDeleteTestProjects?: boolean;
  /** Can see and launch the Location Builder (UPM) from the table row.
   * True only for roles with VIEW_UPM: ADMIN, DESIGNER, DEVELOPER,
   * CONTROLS_MANAGER, PROJECT_MANAGER. */
  canViewUPM?: boolean;
  /** Can edit UPM rows and resolve unlinked scope types after upload (EDIT_UPM). */
  canEditUpm?: boolean;
  /** Called from outside (page header) to open the create modal */
  onAddProjectRef?: (openFn: () => void) => void;
  /** Called when GET /api/projects reports whether Unifier data was unavailable (response header). */
  onUnifierUnavailableChange?: (unavailable: boolean) => void;
}

export function ProjectsTable({
  initialProjects,
  canCreate,
  canDelete,
  canDeleteTestProjects = false,
  canViewUPM = false,
  canEditUpm = false,
  onAddProjectRef,
  onUnifierUnavailableChange,
}: ProjectsTableProps) {
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");
  const tStatus = useTranslations("status");
  const locale = useLocale();
  const router = useRouter();
  const navigationPending = useOptionalNavigationPending();
  const { isOnline } = useOfflineStatus();
  const { offlineProjectIds, lastSyncedAt } = useOfflineSyncContext();
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [isLoading, setIsLoading] = useState(false);

  // Sync authoritative list from the server whenever the parent re-renders
  // with new initial data (e.g. role-preview changes the visible set).
  // This does not interfere with optimistic create/delete mutations because
  // initialProjects only changes when the server component re-renders.
  useEffect(() => {
    setProjects(initialProjects);
  }, [initialProjects]);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteModalProject, setDeleteModalProject] = useState<{ id: string; name: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);


  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, SEARCH_DEBOUNCE_MS);

  const [sortField, setSortField] = useState<ProjectSortField>("projectName");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [imFilter, setImFilter] = useState<string[]>([]);
  const [pmFilter, setPmFilter] = useState<string[]>([]);
  /** False until sessionStorage restore finishes — prevents wiping saved filters on mount. */
  const [filtersHydrated, setFiltersHydrated] = useState(false);
  const [favoriteById, setFavoriteById] = useState<Record<string, boolean>>({});
  const [favoriteOrder, setFavoriteOrder] = useState<Map<string, number>>(new Map());

  // Restore search + filter selections from sessionStorage after mount (client-only).
  useEffect(() => {
    const saved = readProjectsListFiltersSession();
    if (saved) {
      setSearchQuery(saved.searchQuery);
      setStatusFilter(saved.statusFilter);
      setImFilter(saved.imFilter);
      setPmFilter(saved.pmFilter);
    }
    setFiltersHydrated(true);
  }, []);

  // Persist filter state for the browser session (survives navigation away and back).
  useEffect(() => {
    if (!filtersHydrated) return;
    writeProjectsListFiltersSession({
      searchQuery,
      statusFilter,
      imFilter,
      pmFilter,
    });
  }, [filtersHydrated, searchQuery, statusFilter, imFilter, pmFilter]);

  useEffect(() => {
    const byId: Record<string, boolean> = {};
    const order = new Map<string, number>();
    let index = 0;
    for (const project of initialProjects) {
      byId[project.id] = project.isFavorite;
      if (project.isFavorite) {
        order.set(project.id, index);
        index += 1;
      }
    }
    setFavoriteById(byId);
    setFavoriteOrder(order);
  }, [initialProjects]);

  const favoriteMeta = useMemo<FavoriteProjectMeta>(() => {
    const favoriteIds = new Set<string>();
    const order = new Map<string, number>();
    for (const [projectId, isFavorite] of Object.entries(favoriteById)) {
      if (isFavorite) {
        favoriteIds.add(projectId);
        order.set(projectId, favoriteOrder.get(projectId) ?? 0);
      }
    }
    return { favoriteIds, favoriteOrder: order };
  }, [favoriteById, favoriteOrder]);

  const handleFavoriteChange = useCallback((projectId: string, favorite: boolean) => {
    setFavoriteById((current) => ({ ...current, [projectId]: favorite }));
    setFavoriteOrder((current) => {
      const next = new Map(current);
      if (favorite) {
        if (!next.has(projectId)) {
          const maxOrder = next.size === 0 ? -1 : Math.max(...next.values());
          next.set(projectId, maxOrder + 1);
        }
      } else {
        next.delete(projectId);
      }
      return next;
    });
    setProjects((current) =>
      current.map((project) =>
        project.id === projectId ? { ...project, isFavorite: favorite } : project
      )
    );
  }, []);
  useEffect(() => {
    onAddProjectRef?.(() => setShowCreateModal(true));
  }, [onAddProjectRef]);


  // Let TourPlayer's simulateTyping drive the search query directly.
  // React's debounced onChange doesn't reliably fire from programmatic DOM events,
  // so the tour dispatches "tour:search" as a belt-and-suspenders fallback.
  useEffect(() => {
    const handler = (e: Event) => {
      const query = (e as CustomEvent<{ query: string }>).detail.query;
      setSearchQuery(query);
    };
    window.addEventListener("tour:search", handler);
    return () => window.removeEventListener("tour:search", handler);
  }, []);

  const routeFetch = useOptionalRouteFetch();

  const reload = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await routeFetch("/api/projects");
      if (!res.ok) throw new Error(`Failed to load projects (${res.status})`);
      const data: Project[] = await res.json();
      setProjects(data);
      const byId: Record<string, boolean> = {};
      const order = new Map<string, number>();
      let index = 0;
      for (const project of data) {
        byId[project.id] = project.isFavorite;
        if (project.isFavorite) {
          order.set(project.id, index);
          index += 1;
        }
      }
      setFavoriteById(byId);
      setFavoriteOrder(order);
      const unifierHeader = res.headers.get(UNIFIER_AVAILABLE_HEADER);
      if (unifierHeader !== null) {
        onUnifierUnavailableChange?.(unifierHeader !== "true");
      }
    } catch (err) {
      if (isAbortError(err)) return;
      const cached = await readSnapshotProjectsList();
      if (cached) {
        setProjects(cached.data as Project[]);
        setError(null);
        setIsLoading(false);
        return;
      }
      setError(err instanceof Error ? err.message : t("failedToLoad"));
    } finally {
      setIsLoading(false);
    }
  }, [routeFetch, t, onUnifierUnavailableChange]);

  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      setDeleteModalProject(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failedToDelete"));
    } finally {
      setDeletingId(null);
    }
  }, [t]);

  const handleProjectCreated = useCallback((project: Project) => {
    setProjects((prev) => [...prev, project].sort((a, b) =>
      a.projectName.localeCompare(b.projectName)
    ));
  }, []);

  const isProjectOfflineReady = useCallback(
    (projectId: string) =>
      offlineProjectIds.has(projectId) || lastSyncedAt(projectId) != null,
    [offlineProjectIds, lastSyncedAt],
  );

  const openProject = useCallback(
    (projectId: string, projectName: string) => {
      if (!shouldUseOfflineDocumentNav(isOnline, isProjectOfflineReady(projectId))) {
        navigationPending?.startProjectNavigation(projectId, projectName);
      }
      void navigateToProjectDetail({
        locale,
        projectId,
        isOnline,
        isPreDownloaded: isProjectOfflineReady(projectId),
        router,
      }).then((result) => {
        if (result === "unavailable") {
          navigationPending?.clearProjectNavigation();
          toast.error(t("offlineProjectOpenFailed"));
        }
      });
    },
    [locale, isOnline, isProjectOfflineReady, navigationPending, router, t],
  );

  const onProjectLinkClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>, projectId: string, projectName: string) => {
      if (!shouldUseOfflineDocumentNav(isOnline, isProjectOfflineReady(projectId))) {
        navigationPending?.startProjectNavigation(projectId, projectName);
      }
      void handleOfflineProjectLinkClick(event, {
        locale,
        projectId,
        isOnline,
        isPreDownloaded: isProjectOfflineReady(projectId),
        router,
      }).then((result) => {
        if (result === "unavailable") {
          navigationPending?.clearProjectNavigation();
          toast.error(t("offlineProjectOpenFailed"));
        }
      });
    },
    [locale, isOnline, isProjectOfflineReady, navigationPending, router, t],
  );

  // Unique filter values — guard against null
  const uniqueIMs = useMemo(
    () =>
      Array.from(
        new Set(projects.map((p) => p.installManagerName).filter((n): n is string => Boolean(n)))
      ).sort(),
    [projects]
  );
  const uniquePMs = useMemo(
    () =>
      Array.from(
        new Set(projects.map((p) => p.projectManagerName).filter((n): n is string => Boolean(n)))
      ).sort(),
    [projects]
  );

  /** Distinct Unifier phase strings (`Project.status`) for filters */
  const uniqueStatuses = useMemo(() => {
    const set = new Set(projects.map((p) => p.status.trim()));
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [projects]);

  const statusFilterLabel = useCallback(
    (value: string) => {
      if (value === "") return "—";
      return KNOWN_STATUS_LABELS.has(value) ? tStatus(value as "Active" | "Completed" | "Planning" | "On Hold") : value;
    },
    [tStatus]
  );

  const filteredProjects = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    const seen = new Set<string>();
    const result = projects.filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      const matchesSearch =
        !q ||
        p.projectName.toLowerCase().includes(q) ||
        p.siteLocation.toLowerCase().includes(q) ||
        (p.unifierProjectNumber ?? "").toLowerCase().includes(q) ||
        (p.installManagerName ?? "Unassigned").toLowerCase().includes(q) ||
        p.projectManagerName.toLowerCase().includes(q) ||
        (p.status || "").toLowerCase().includes(q);
      const phaseKey = p.status.trim();
      const matchesStatus = statusFilter.length === 0 || statusFilter.includes(phaseKey);
      const matchesIM = imFilter.length === 0 || imFilter.includes(p.installManagerName ?? "");
      const matchesPM = pmFilter.length === 0 || pmFilter.includes(p.projectManagerName);
      return matchesSearch && matchesStatus && matchesIM && matchesPM;
    });

    result.sort((a, b) => {
      const av = (a[sortField] ?? "") as string;
      const bv = (b[sortField] ?? "") as string;
      if (av < bv) return sortDirection === "asc" ? -1 : 1;
      if (av > bv) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return sortProjectsWithFavorites(
      result,
      favoriteMeta,
      compareProjectsByField(sortField, sortDirection)
    );
  }, [projects, debouncedSearch, statusFilter, imFilter, pmFilter, sortField, sortDirection, favoriteMeta]);

  const handleSort = (field: ProjectSortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const activeFilterCount = statusFilter.length + imFilter.length + pmFilter.length;

  const clearFilters = () => {
    setStatusFilter([]);
    setImFilter([]);
    setPmFilter([]);
  };

  const toggleFilter = (
    current: string[],
    setter: (v: string[]) => void,
    value: string
  ) => {
    setter(
      current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value]
    );
  };

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center flex-1"
        style={{ color: "var(--neutral-500)", fontSize: 14 }}
      >
        {t("loadingProjects")}
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="flex flex-col items-center justify-center flex-1 gap-4"
        style={{ padding: "var(--space-12, 48px)" }}
      >
        <p style={{ color: "var(--error-600)", fontSize: 14, textAlign: "center" }}>
          {error}
        </p>
        <button
          onClick={reload}
          style={{
            padding: "8px 16px",
            backgroundColor: "var(--primary-500)",
            color: "var(--neutral-0)",
            borderRadius: "var(--radius-sm, 6px)",
            fontSize: 14,
            fontWeight: 500,
            border: "none",
            cursor: "pointer",
          }}
        >
          {tCommon("retry")}
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col h-full min-h-0 projects-table-root" style={{ gap: 16 }}>
        {/* ── Toolbar: Search + Filter + Add ── */}
        <div className="flex flex-row gap-3">
          {/* Search */}
          <div data-tour="projects-search" className="flex-1">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={t("searchPlaceholder")}
              ariaLabel="Search projects"
              variant="canvas"
            />
          </div>

          {/* Filter button */}
          <button
            onClick={() => setShowFilters(true)}
            aria-expanded={showFilters}
            aria-label={t("toggleFilters")}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              height: 40,
              padding: "0 16px",
              border: "none",
              borderRadius: "var(--radius-2xl)",
              backgroundColor: showFilters ? "var(--control-active-bg)" : "var(--control-canvas-bg)",
              color: showFilters ? "var(--control-active-fg)" : "var(--control-icon)",
              boxShadow: "var(--control-canvas-shadow)",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            <Filter style={{ width: 16, height: 16 }} />
            <span className="desktop-only">{t("filters")}</span>
            {activeFilterCount > 0 && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  backgroundColor: "var(--control-active-fg)",
                  color: "var(--color-text-inverse)",
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Add Project button lives in the page header on desktop,
              and is triggered via onAddProjectRef on mobile */}
        </div>

        {showFilters && (
          <ProjectsFilterPanel
            statusFilter={statusFilter}
            imFilter={imFilter}
            pmFilter={pmFilter}
            uniqueStatuses={uniqueStatuses}
            uniqueIMs={uniqueIMs}
            uniquePMs={uniquePMs}
            statusFilterLabel={statusFilterLabel}
            activeFilterCount={activeFilterCount}
            onStatusToggle={(v) => toggleFilter(statusFilter, setStatusFilter, v)}
            onImToggle={(v) => toggleFilter(imFilter, setImFilter, v)}
            onPmToggle={(v) => toggleFilter(pmFilter, setPmFilter, v)}
            onClear={clearFilters}
            onClose={() => setShowFilters(false)}
            t={t}
            tCommon={tCommon}
          />
        )}

        {/* ── Mobile: project cards — natural height; #main-content scrolls on mobile ── */}
        <div
          className="mobile-only projects-mobile-list"
          style={{ flexDirection: "column", gap: 12 }}
        >
          {filteredProjects.length === 0 ? (
            <p style={{ color: "var(--neutral-500)", fontSize: 14, textAlign: "center", padding: "32px 0" }}>
              {projects.length === 0 ? t("noProjectsYet") : t("noProjectsMatch")}
            </p>
          ) : (
            filteredProjects.map((project) => (
              <div
                key={project.id}
                role="link"
                tabIndex={0}
                aria-label={t("openProjectDetailAria", { projectName: project.projectName })}
                data-testid="project-mobile-card"
                onClick={() => openProject(project.id, project.projectName)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  const target = e.target as HTMLElement;
                  if (
                    target !== e.currentTarget &&
                    target.closest('a, button, input, select, textarea, [role="button"]')
                  ) {
                    return;
                  }
                  e.preventDefault();
                  openProject(project.id, project.projectName);
                }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  padding: "var(--card-padding)",
                  backgroundColor: "var(--neutral-0)",
                  border: "1px solid var(--neutral-200)",
                  borderRadius: "var(--radius-md)",
                  cursor: "pointer",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                }}
              >
                {/* Name + status row */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: "#10122B", lineHeight: 1.3, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", flex: 1, minWidth: 0 }}>
                    {project.projectName}
                    {project.isTestProject && (
                      <span
                        title={t("testProjectBadgeTitle")}
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                          padding: "1px 6px",
                          borderRadius: 4,
                          background: "var(--warning-100)",
                          color: "var(--warning-600)",
                          lineHeight: 1.6,
                          flexShrink: 0,
                        }}
                      >
                        {t("testProjectBadge")}
                      </span>
                    )}
                  </span>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 6, flexShrink: 0 }}>
                    <FavoriteProjectButton
                      projectId={project.id}
                      isFavorite={favoriteById[project.id] ?? project.isFavorite}
                      onFavoriteChange={handleFavoriteChange}
                    />
                    <StatusBadge label={project.status} lifecycleStatus={project.lifecycleStatus} />
                  </div>
                </div>
                {project.clonedFromProjectId && (
                  <ProjectCloneSubtitle clonedFromProjectName={project.clonedFromProjectName} />
                )}

                {/* Site location — map link; stop card click navigation */}
                <div
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <span style={{ fontSize: 12, color: "var(--neutral-500)" }}>📍</span>
                  <ProjectSiteLocationLink
                    siteLocation={project.siteLocation}
                    onClickCapture={(e) => e.stopPropagation()}
                    style={{ fontSize: 13 }}
                  />
                </div>

                {/* Scope chips */}
                {project.scopeTypes.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {project.scopeTypes.map((scope) => (
                      <span
                        key={scope}
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "3px 10px",
                          borderRadius: 99,
                          backgroundColor: "#F0F1F5",
                          color: "#4D5266",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {scope}
                      </span>
                    ))}
                  </div>
                )}

                {/* IM + PM + offline row */}
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 26, height: 26, borderRadius: "50%", backgroundColor: "#0057F5", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                      {getPersonInitials(project.installManagerName, "U")}
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: 9, color: "#9CA0B3", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>IM</p>
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#10122B" }}>{project.installManagerName?.trim() || "Unassigned"}</p>
                    </div>
                  </div>
                  {project.projectManagerName && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 26, height: 26, borderRadius: "50%", backgroundColor: "#10122B", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                        {getPersonInitials(project.projectManagerName, "P")}
                      </div>
                      <div>
                        <p style={{ margin: 0, fontSize: 9, color: "#9CA0B3", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>PM</p>
                        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#10122B" }}>{project.projectManagerName}</p>
                      </div>
                    </div>
                  )}
                  <div
                    style={{ marginLeft: "auto", flexShrink: 0, display: "flex", alignItems: "center" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <OfflineProjectButton projectId={project.id} projectName={project.projectName} compact />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* ── Desktop: table ── */}
        <div
          className="desktop-only"
          style={{ flex: 1, flexDirection: "column", minHeight: 0 }}
        >
        <div
          data-tour="projects-table"
          style={{
            flex: 1,
            width: "100%",
            minWidth: 0,
            borderRadius: 0,
            overflow: "auto",
            backgroundColor: "transparent",
            boxShadow: "none",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "separate",
              borderSpacing: 0,
            }}
          >
            <thead
              style={{
                backgroundColor: "var(--color-surface-dark)",
                position: "sticky",
                top: 0,
                zIndex: 20,
              }}
            >
              <tr>
                <SortableHeader
                  field="projectName"
                  label={t("projectName")}
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  sticky
                />
                <SortableHeader field="siteLocation" label={t("siteLocation")} sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                <SortableHeader field="status" label={t("status")} sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                <SortableHeader field="startDate" label={t("startDate")} sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                <SortableHeader field="unifierProjectNumber" label={t("unifierNumber")} sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                <SortableHeader field="installManagerName" label={t("installManager")} sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                <SortableHeader field="projectManagerName" label={t("projectManager")} sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                <th style={{ width: 96, padding: "10px 16px", fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.56)", textAlign: "center", whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: "0.08em", backgroundColor: "var(--color-surface-dark)" }}>Offline</th>
                {canViewUPM && (
                  <th style={{ width: 120, padding: "12px 16px", backgroundColor: "var(--color-surface-dark)" }} />
                )}
                {canDelete && (
                  <th style={{ width: 56, padding: "12px 16px" }} />
                )}
              </tr>
            </thead>
            <tbody>
              {filteredProjects.map((project, idx) => (
                <tr
                  key={project.id}
                  className="table-row"
                  onMouseEnter={(e) => e.currentTarget.classList.add("hover")}
                  onMouseLeave={(e) => e.currentTarget.classList.remove("hover")}
                >
                  {/* Sticky project name column — clickable */}
                  <td
                    className="sticky-cell"
                    style={{
                      padding: "12px 20px",
                      position: "sticky",
                      left: 0,
                      zIndex: 10,
                      minWidth: 250,
                      borderRight: "1px solid #EDEEF2",
                      borderBottom:
                        idx !== filteredProjects.length - 1
                          ? "1px solid #EDEEF2"
                          : "none",
                      backgroundColor: "#FFFFFF",
                      boxShadow: "2px 0 4px rgba(0,0,0,0.04)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, minWidth: 0 }}>
                      <FavoriteProjectButton
                        projectId={project.id}
                        isFavorite={favoriteById[project.id] ?? project.isFavorite}
                        onFavoriteChange={handleFavoriteChange}
                      />
                      <Link
                        href={`/projects/${project.id}`}
                        onClick={(e) => onProjectLinkClick(e, project.id, project.projectName)}
                        style={{
                          textDecoration: "none",
                          display: "inline-flex",
                          flexDirection: "column",
                          alignItems: "flex-start",
                          gap: 2,
                          minWidth: 0,
                          flex: 1,
                        }}
                        className="hover:underline"
                      >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        {project.projectName}
                        {project.isTestProject && (
                          <span
                            title={t("testProjectBadgeTitle")}
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              letterSpacing: "0.06em",
                              padding: "1px 6px",
                              borderRadius: 4,
                        background: "var(--warning-100)",
                          color: "var(--warning-600)",
                          border: "1px solid var(--warning-600)",
                              lineHeight: 1.6,
                              flexShrink: 0,
                            }}
                          >
                            {t("testProjectBadge")}
                          </span>
                        )}
                      </span>
                      {project.clonedFromProjectId && (
                        <ProjectCloneSubtitle clonedFromProjectName={project.clonedFromProjectName} />
                      )}
                    </Link>
                    </div>
                  </td>
                  <DataCell isLast={idx === filteredProjects.length - 1}>
                    <ProjectSiteLocationLink siteLocation={project.siteLocation} />
                  </DataCell>
                  <td
                    style={{
                      padding: "12px 20px",
                      whiteSpace: "nowrap",
                      backgroundColor: "#FFFFFF",
                      borderBottom:
                        idx !== filteredProjects.length - 1
                          ? "1px solid #EDEEF2"
                          : "none",
                    }}
                  >
                    <StatusBadge label={project.status} lifecycleStatus={project.lifecycleStatus} />
                  </td>
                  <DataCell
                    value={
                      project.startDate
                        ? new Date(project.startDate + "T00:00:00").toLocaleDateString(
                            "en-US",
                            { month: "short", day: "numeric", year: "numeric" }
                          )
                        : "—"
                    }
                    isLast={idx === filteredProjects.length - 1}
                  />
                  <DataCell
                    value={project.unifierProjectNumber ?? "—"}
                    mono={Boolean(project.unifierProjectNumber)}
                    isLast={idx === filteredProjects.length - 1}
                  />
                  <DataCell
                    value={project.installManagerName?.trim() || "Unassigned"}
                    isLast={idx === filteredProjects.length - 1}
                  />
                  <DataCell
                    value={project.projectManagerName}
                    isLast={idx === filteredProjects.length - 1}
                  />
                  {/* Offline column */}
                  <td style={{ padding: "8px 16px", backgroundColor: "#FFFFFF", borderBottom: idx !== filteredProjects.length - 1 ? "1px solid #EDEEF2" : "none", whiteSpace: "nowrap" }}>
                    <OfflineProjectButton projectId={project.id} projectName={project.projectName} />
                  </td>

                  {/* Location Builder column — only for roles with VIEW_UPM */}
                  {canViewUPM && (
                    <td
                      style={{
                        padding: "12px 16px",
                        backgroundColor: "#FFFFFF",
                        borderBottom:
                          idx !== filteredProjects.length - 1
                            ? "1px solid #EDEEF2"
                            : "none",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <Link
                        href={`/projects/${project.id}/upm`}
                        title={t("openUpmTitle")}
                        aria-label={t("openUpmAria", { name: project.projectName })}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "4px 8px",
                          fontSize: 12,
                          fontWeight: 500,
                          color: "var(--neutral-600)",
                          border: "1px solid var(--neutral-300)",
                          borderRadius: "var(--radius-sm, 6px)",
                          backgroundColor: "var(--neutral-0)",
                          textDecoration: "none",
                          cursor: "pointer",
                        }}
                      >
                        <TableProperties style={{ width: 13, height: 13 }} aria-hidden />
                        {t("openUpm")}
                      </Link>
                    </td>
                  )}

                  {canDelete && (
                    <td
                      style={{
                        padding: "12px 16px",
                        backgroundColor: "#FFFFFF",
                        borderBottom:
                          idx !== filteredProjects.length - 1
                            ? "1px solid #EDEEF2"
                            : "none",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {(!project.isTestProject || canDeleteTestProjects) && (
                        <button
                          onClick={() => setDeleteModalProject({ id: project.id, name: project.projectName })}
                          aria-label={t("deleteProjectAria", { projectName: project.projectName })}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 32,
                            height: 32,
                            border: "1px solid transparent",
                            borderRadius: "var(--radius-sm, 6px)",
                            backgroundColor: "transparent",
                            color: "var(--neutral-400)",
                            cursor: "pointer",
                            transition: "color 0.15s, background-color 0.15s, border-color 0.15s",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = "var(--error-600)";
                            e.currentTarget.style.backgroundColor = "var(--error-50, #fef2f2)";
                            e.currentTarget.style.borderColor = "var(--error-200, #fecaca)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = "var(--neutral-400)";
                            e.currentTarget.style.backgroundColor = "transparent";
                            e.currentTarget.style.borderColor = "transparent";
                          }}
                        >
                          <Trash2 style={{ width: 15, height: 15 }} />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {filteredProjects.length === 0 && (
            <div
              className="flex items-center justify-center"
              style={{
                padding: "48px 24px",
                color: "var(--neutral-500)",
                fontSize: 14,
              }}
            >
              {projects.length === 0 ? t("noProjectsYet") : t("noProjectsMatch")}
            </div>
          )}
        </div>
        </div>{/* end desktop wrapper */}

        {/* Row count — desktop only */}
        <p className="desktop-only" style={{ fontSize: 12, color: "var(--neutral-500)", margin: 0 }}>
          {filteredProjects.length === projects.length
            ? projects.length === 1
              ? t("projectCount", { count: 1 })
              : t("projectCountPlural", { count: projects.length })
            : t("projectCountOf", { filtered: filteredProjects.length, total: projects.length })}
        </p>
      </div>

      {/* Create project modal — only reachable if canCreate is true (button gated above) */}
      {showCreateModal && canCreate && (
        <CreateProjectModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleProjectCreated}
          canEditUpm={canEditUpm}
        />
      )}

      {/* Delete confirmation modal */}
      {deleteModalProject && (
        <DeleteConfirmModal
          projectName={deleteModalProject.name}
          isDeleting={deletingId === deleteModalProject.id}
          onConfirm={() => handleDelete(deleteModalProject.id)}
          onCancel={() => setDeleteModalProject(null)}
          t={t}
          tCommon={tCommon}
        />
      )}
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DataCell({
  value,
  children,
  mono = false,
  isLast,
}: {
  value?: string;
  children?: ReactNode;
  mono?: boolean;
  isLast: boolean;
}) {
  return (
    <td
      style={{
        padding: "12px 20px",
        fontSize: 14,
        color: "#737891",
        whiteSpace: "nowrap",
        fontFamily: mono ? "monospace" : "inherit",
        backgroundColor: "#FFFFFF",
        borderBottom: isLast ? "none" : "1px solid #EDEEF2",
      }}
    >
      {children ?? value}
    </td>
  );
}

interface SortableHeaderProps {
  field: ProjectSortField;
  label: string;
  sortField: ProjectSortField;
  sortDirection: SortDirection;
  onSort: (field: ProjectSortField) => void;
  sticky?: boolean;
}

function SortableHeader({
  field,
  label,
  sortField,
  sortDirection,
  onSort,
  sticky,
}: SortableHeaderProps) {
  const isActive = sortField === field;

  return (
    <th
      style={{
        backgroundColor: "var(--color-surface-dark)",
        ...(sticky && {
          position: "sticky",
          left: 0,
          zIndex: 30,
          minWidth: 250,
          borderRight: "1px solid rgba(255,255,255,0.08)",
        }),
      }}
    >
      <button
        onClick={() => onSort(field)}
        className="w-full flex items-center gap-2"
        style={{
          padding: "10px 20px",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: isActive ? "var(--color-accent)" : "rgba(255,255,255,0.56)",
          textAlign: "left",
          background: "none",
          border: "none",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
        onMouseEnter={(e) => {
          if (!isActive) e.currentTarget.style.color = "rgba(255,255,255,0.82)";
        }}
        onMouseLeave={(e) => {
          if (!isActive) e.currentTarget.style.color = "rgba(255,255,255,0.56)";
        }}
      >
        {label}
        {isActive &&
          (sortDirection === "asc" ? (
            <ChevronUp style={{ width: 13, height: 13, flexShrink: 0 }} />
          ) : (
            <ChevronDown style={{ width: 13, height: 13, flexShrink: 0 }} />
          ))}
      </button>
    </th>
  );
}

function ProjectsFilterPanel({
  statusFilter,
  imFilter,
  pmFilter,
  uniqueStatuses,
  uniqueIMs,
  uniquePMs,
  statusFilterLabel,
  activeFilterCount,
  onStatusToggle,
  onImToggle,
  onPmToggle,
  onClear,
  onClose,
  t,
  tCommon,
}: {
  statusFilter: string[];
  imFilter: string[];
  pmFilter: string[];
  uniqueStatuses: string[];
  uniqueIMs: string[];
  uniquePMs: string[];
  statusFilterLabel: (value: string) => string;
  activeFilterCount: number;
  onStatusToggle: (value: string) => void;
  onImToggle: (value: string) => void;
  onPmToggle: (value: string) => void;
  onClear: () => void;
  onClose: () => void;
  t: ReturnType<typeof useTranslations<"projects">>;
  tCommon: ReturnType<typeof useTranslations<"common">>;
}) {
  return (
    <FilterPanelShell
      title={t("filterProjects")}
      closeAriaLabel={tCommon("close")}
      onClose={onClose}
      footer={(close) => (
        <FilterPanelFooterActions
          clearLabel={t("clearAll")}
          applyLabel={tCommon("apply")}
          onClear={onClear}
          onApply={close}
          clearDisabled={activeFilterCount === 0}
        />
      )}
    >
      {uniqueStatuses.length > 0 && (
        <FilterPanelSection label={t("status")}>
          <FilterPillGroup>
            {uniqueStatuses.map((value) => (
              <FilterPill
                key={value || "__empty__"}
                label={statusFilterLabel(value)}
                active={statusFilter.includes(value)}
                onClick={() => onStatusToggle(value)}
              />
            ))}
          </FilterPillGroup>
        </FilterPanelSection>
      )}
      {uniqueIMs.length > 0 && (
        <FilterPanelSection label={t("installManager")}>
          <FilterPillGroup>
            {uniqueIMs.map((name) => (
              <FilterPill
                key={name}
                label={name}
                active={imFilter.includes(name)}
                onClick={() => onImToggle(name)}
              />
            ))}
          </FilterPillGroup>
        </FilterPanelSection>
      )}
      {uniquePMs.length > 0 && (
        <FilterPanelSection label={t("projectManager")}>
          <FilterPillGroup>
            {uniquePMs.map((name) => (
              <FilterPill
                key={name}
                label={name}
                active={pmFilter.includes(name)}
                onClick={() => onPmToggle(name)}
              />
            ))}
          </FilterPillGroup>
        </FilterPanelSection>
      )}
    </FilterPanelShell>
  );
}

// ─── DeleteConfirmModal ────────────────────────────────────────────────────────

function DeleteConfirmModal({
  projectName,
  isDeleting,
  onConfirm,
  onCancel,
  t,
  tCommon,
}: {
  projectName: string;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  t: ReturnType<typeof useTranslations<"projects">>;
  tCommon: ReturnType<typeof useTranslations<"common">>;
}) {
  const [inputValue, setInputValue] = useState("");
  const canSubmit = inputValue.toLowerCase() === "delete" && !isDeleting;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        backgroundColor: "var(--overlay-bg, rgba(0,0,0,0.5))",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        style={{
          backgroundColor: "var(--neutral-0)",
          borderRadius: "var(--radius-lg, 12px)",
          boxShadow: "var(--shadow-2)",
          padding: "28px 24px 24px",
          width: "100%",
          maxWidth: 460,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* Title */}
        <h2
          id="delete-modal-title"
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 700,
            color: "var(--error-700, #b91c1c)",
          }}
        >
          {t("deleteModalTitle")}
        </h2>

        {/* Project name callout */}
        <p style={{ margin: 0, fontSize: 14, color: "var(--neutral-700)", lineHeight: 1.5 }}>
          {t("deleteModalProjectLabel")}{" "}
          <strong style={{ color: "var(--neutral-900)", fontWeight: 700 }}>{projectName}</strong>.{" "}
          {t("deleteModalWarning")}
        </p>

        {/* Instruction */}
        <p style={{ margin: 0, fontSize: 14, color: "var(--neutral-600)", lineHeight: 1.5 }}>
          {t("deleteModalInstruction")}
        </p>

        {/* Text input */}
        <input
          type="text"
          aria-label={t("deleteModalInputLabel")}
          placeholder={t("deleteModalInputPlaceholder")}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          autoComplete="off"
          style={{
            width: "100%",
            padding: "10px 12px",
            fontSize: 14,
            border: `1px solid ${inputValue && !canSubmit && !isDeleting ? "var(--error-400, #f87171)" : "var(--neutral-300)"}`,
            borderRadius: "var(--radius-sm, 6px)",
            outline: "none",
            color: "var(--neutral-900)",
            backgroundColor: "var(--neutral-0)",
            boxSizing: "border-box",
          }}
        />

        {/* Buttons */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
          <button
            onClick={onCancel}
            disabled={isDeleting}
            aria-label={t("cancelDeleteAria")}
            style={{
              padding: "9px 18px",
              fontSize: 14,
              fontWeight: 500,
              color: "var(--neutral-700)",
              backgroundColor: "var(--neutral-100)",
              border: "1px solid var(--neutral-300)",
              borderRadius: "var(--radius-sm, 6px)",
              cursor: isDeleting ? "not-allowed" : "pointer",
            }}
          >
            {tCommon("cancel")}
          </button>
          <button
            onClick={onConfirm}
            disabled={!canSubmit}
            aria-label={t("confirmDeleteAria")}
            style={{
              padding: "9px 18px",
              fontSize: 14,
              fontWeight: 600,
              color: "var(--neutral-0)",
              backgroundColor: canSubmit ? "var(--error-600)" : "var(--error-300)",
              border: "none",
              borderRadius: "var(--radius-sm, 6px)",
              cursor: canSubmit ? "pointer" : "not-allowed",
              opacity: canSubmit ? 1 : 0.65,
            }}
          >
            {isDeleting ? t("deleting") : t("deleteModalSubmit")}
          </button>
        </div>
      </div>
    </div>
  );
}
