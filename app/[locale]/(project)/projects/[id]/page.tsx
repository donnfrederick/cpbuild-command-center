import { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getEffectiveSession } from "@/lib/masquerade";
import { getTranslations } from "next-intl/server";
import type { Project } from "@/lib/projects";
import { enrichProjectById, getProjectDisplayNameForMetadata } from "@/lib/project-unifier-merge";
import { TOUR_DEMO_PROJECT_ID, TOUR_DEMO_PROJECT, TOUR_DEMO_UNITS } from "@/lib/tour-demo-data";
import { computeOverviewStats, type RowForStats } from "@/lib/overview-stats";
import { buildLevelScopeReport, type LevelScopeReportRow } from "@/lib/level-scope-report";
import { ProjectPageScrollArea } from "@/components/projects/ProjectPageScrollArea";
import { ProjectHubSection } from "@/components/projects/ProjectHubSection";
import { ProjectOverviewStats } from "@/components/projects/ProjectOverviewStats";
import { ProjectHubAdminActions } from "@/components/projects/ProjectHubAdminActions";
import { ProjectCloneSubtitle } from "@/components/projects/ProjectCloneSubtitle";
import { ProjectOfflineCacheSection } from "@/components/projects/ProjectOfflineCacheSection";
import { ProjectDocuments } from "@/components/projects/ProjectDocuments";
import { ProjectHubFieldNotesCard } from "@/components/projects/ProjectHubFieldNotesCard";
import { ProjectHubDailyReportCard } from "@/components/projects/ProjectHubDailyReportCard";
import { ProjectHubProjectNotesCard } from "@/components/projects/ProjectHubProjectNotesCard";
import { ProjectHubInspectionsCard } from "@/components/projects/ProjectHubInspectionsCard";
import { LevelScopeReportTrigger } from "@/components/projects/LevelScopeReportModal";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { canGenerateProjectFieldDailyReport, canUseFieldDailyReport } from "@/lib/field-daily-report/auth";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (id === TOUR_DEMO_PROJECT_ID) {
    return { title: `${TOUR_DEMO_PROJECT.projectName} — CP Build` };
  }
  const name = await getProjectDisplayNameForMetadata(id);
  return {
    title: name ? `${name} — CP Build` : "Project — CP Build",
  };
}

export default async function ProjectHubPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const effective = await getEffectiveSession();
  if (!effective?.user) return null;

  const { id, locale } = await params;
  const t = await getTranslations("projects");

  let project: Pick<
    Project,
    | "id"
    | "projectName"
    | "siteLocation"
    | "unifierPid"
    | "unifierProjectNumber"
    | "status"
    | "lifecycleStatus"
    | "startDate"
    | "projectManagerName"
    | "installManagerName"
    | "installManagerId"
    | "clonedFromProjectId"
    | "clonedFromProjectName"
    | "isTestProject"
  >;
  let rowCount: number;
  let statsRows: RowForStats[];
  let reportRows: LevelScopeReportRow[];
  let buildingCount: number;
  let subcontractorNames: string[];

  if (id === TOUR_DEMO_PROJECT_ID) {
    project = TOUR_DEMO_PROJECT;
    rowCount = TOUR_DEMO_UNITS.length;
    buildingCount = 0;
    subcontractorNames = [];
    statsRows = TOUR_DEMO_UNITS.map((u) => ({
      qty: typeof u.qty === "number" ? u.qty : null,
      scopeStage: u.scopeStage ?? null,
      scopeStatus: u.scopeStatus ?? null,
      scopeType: u.scopeType ?? null,
      clearInspections: [],
      subScopeInstances: [],
    }));
    reportRows = [];
  } else {
    const api = await enrichProjectById(id);
    if (!api) notFound();

    const [dbRows, buildingRows, subRows] = await Promise.all([
      db.projectRow.findMany({
        where: { projectId: id },
        select: {
          id: true,
          qty: true,
          building: true,
          level: true,
          unit: true,
          scopeStage: true,
          scopeStatus: true,
          inspectionStatus: true,
          scopeType: {
            select: {
              name: true,
              canonicalScopeType: { select: { displayName: true } },
            },
          },
          clearInspections: {
            where: { deletedAt: null },
            select: { status: true },
          },
          subScopeInstances: {
            select: {
              qty: true,
              scopeStage: true,
              scopeStatus: true,
              inspectionStatus: true,
            },
          },
        },
      }),
      // Distinct non-empty buildings in the project
      db.projectRow.findMany({
        where: { projectId: id, building: { not: "" } },
        select: { building: true },
        distinct: ["building"],
      }),
      // Distinct install teams (subcontractors) assigned to any row
      db.projectRow.findMany({
        where: { projectId: id, installerId: { not: null } },
        select: { installer: { select: { name: true } } },
        distinct: ["installerId"],
      }),
    ]);

    rowCount = dbRows.length;
    buildingCount = buildingRows.length;
    subcontractorNames = subRows
      .map((r) => r.installer?.name)
      .filter((n): n is string => Boolean(n))
      .sort();

    // Convert Prisma Decimal → plain number before passing to the pure helper.
    statsRows = dbRows.map((r) => ({
      qty: r.qty !== null ? Number(r.qty) : null,
      scopeStage: r.scopeStage,
      scopeStatus: r.scopeStatus,
      scopeType: r.scopeType,
      clearInspections: r.clearInspections,
      subScopeInstances: r.subScopeInstances.map((inst) => ({
        qty: inst.qty !== null ? Number(inst.qty) : null,
        scopeStage: inst.scopeStage,
        scopeStatus: inst.scopeStatus,
      })),
    }));
    reportRows = dbRows.map((r) => ({
      id: r.id,
      building: r.building,
      level: r.level,
      unit: r.unit ?? undefined,
      qty: r.qty !== null ? Number(r.qty) : null,
      scopeStage: r.scopeStage,
      scopeStatus: r.scopeStatus,
      inspectionStatus: r.inspectionStatus,
      scopeType: r.scopeType,
      subScopeInstances: r.subScopeInstances.map((inst) => ({
        qty: inst.qty !== null ? Number(inst.qty) : null,
        scopeStage: inst.scopeStage,
        scopeStatus: inst.scopeStatus,
        inspectionStatus: inst.inspectionStatus,
      })),
    }));

    project = api;
  }

  const overviewStats = computeOverviewStats(statsRows);

  const canManageProjects = hasPermission(effective.user.role, PERMISSIONS.MANAGE_PROJECTS);
  const showTestProjectAdminActions =
    id !== TOUR_DEMO_PROJECT_ID &&
    (project.isTestProject || Boolean(project.clonedFromProjectId));
  const levelScopeReport = canManageProjects && id !== TOUR_DEMO_PROJECT_ID
    ? buildLevelScopeReport(reportRows)
    : null;

  return (
    <ProjectPageScrollArea>
    <div
      style={{
        padding: "var(--space-3) var(--space-4)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        maxWidth: 960,
      }}
    >
      <style>{`
        .project-summary-card {
          width: 100%;
          box-sizing: border-box;
        }

        .project-summary-content {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }

        .project-summary-title-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: var(--space-2);
        }

        .project-summary-assignments {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 1px minmax(0, 1fr);
          align-items: center;
          gap: var(--space-1);
          background-color: var(--project-summary-assignment-bg);
          border-radius: var(--radius-lg);
          padding: var(--space-2);
        }

        .project-summary-stats {
          display: flex;
          align-items: baseline;
          flex-wrap: nowrap;
          gap: var(--space-2);
        }

        .project-summary-meta {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 2px 6px;
          color: var(--color-text-disabled);
          font-size: var(--text-micro);
          font-weight: 700;
          letter-spacing: var(--tracking-ui);
        }

        @media (min-width: 900px) {
          .project-summary-content {
            display: grid;
            grid-template-columns: minmax(300px, 1.45fr) minmax(260px, 1fr) auto minmax(120px, auto);
            align-items: center;
            gap: var(--space-3);
          }

          .project-summary-title-row {
            grid-column: 1;
            grid-row: 1;
            min-width: 0;
          }

          .project-summary-assignments {
            grid-column: 2;
            grid-row: 1;
          }

          .project-summary-stats {
            grid-column: 3;
            grid-row: 1;
          }

          .project-summary-meta {
            grid-column: 4;
            grid-row: 1;
            align-content: center;
          }

          .project-summary-subs {
            grid-column: 1 / -1;
          }
        }
      `}</style>
      {/* Combined project info card */}
      <div
        className="project-summary-card"
        style={{
          backgroundColor: "var(--color-surface)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-card)",
          padding: "var(--space-3)",
        }}
      >
        <div data-tour="project-header" className="project-summary-content">
          <div className="project-summary-title-row">
            <div style={{ minWidth: 0 }}>
              <h1
                style={{
                  fontSize: "var(--text-subheading)",
                  fontWeight: 800,
                  letterSpacing: "var(--tracking-tight)",
                  lineHeight: 1.05,
                  color: "var(--color-text-primary)",
                  margin: 0,
                  whiteSpace: "normal",
                  overflowWrap: "break-word",
                }}
                suppressHydrationWarning
              >
                {project.projectName}
              </h1>
              {showTestProjectAdminActions && (
                <ProjectHubAdminActions
                  projectId={project.id}
                  projectName={project.projectName}
                  clonedFromProjectId={project.clonedFromProjectId}
                  clonedFromProjectName={project.clonedFromProjectName}
                  isTestProject={project.isTestProject}
                />
              )}
            </div>
            {!showTestProjectAdminActions && project.clonedFromProjectId && (
              <ProjectCloneSubtitle clonedFromProjectName={project.clonedFromProjectName} />
            )}
            {project.siteLocation && (
              <p
                style={{
                  fontSize: "var(--text-caption)",
                  color: "var(--neutral-500)",
                  marginTop: "var(--space-1)",
                  marginBottom: 0,
                }}
              >
                {project.siteLocation}
              </p>
            )}
          </div>

          <div
            className="project-summary-assignments"
          >
            <ManagerAssignment
              label="PROJECT MGR"
              name={project.projectManagerName?.trim() || "Unassigned"}
              variant={project.projectManagerName?.trim() ? "secondary" : "muted"}
            />
            <div style={{ width: 1, height: 26, backgroundColor: "var(--project-summary-assignment-divider)" }} />
            <ManagerAssignment
              label="INSTALL MGR"
              name={project.installManagerName?.trim() || "Unassigned"}
              variant={project.installManagerName?.trim() ? "dark" : "muted"}
            />
          </div>

          <div className="project-summary-stats">
            <LargeStat label={t("hubUnitCount").toLowerCase()} value={rowCount.toLocaleString(locale)} />
            <span style={{ width: 1, height: 18, backgroundColor: "var(--color-divider)", display: "inline-block", flexShrink: 0 }} />
            <LargeStat
              label={buildingCount === 1 ? "building" : "buildings"}
              value={buildingCount.toLocaleString(locale)}
            />
          </div>

          {(project.unifierProjectNumber || project.startDate) && (
            <div
              className="project-summary-meta"
            >
              {project.unifierProjectNumber && <span>#{project.unifierProjectNumber}</span>}
              {project.unifierProjectNumber && project.startDate && <span style={{ color: "var(--color-divider)" }}>·</span>}
              {project.startDate && (
                <span>
                  Started{" "}
                  {new Date(project.startDate).toLocaleDateString(locale, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              )}
            </div>
          )}

          {subcontractorNames.length > 0 && (
            <div className="project-summary-subs" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {subcontractorNames.map((name) => (
                <span
                  key={name}
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--color-text-secondary)",
                    backgroundColor: "var(--color-surface-sunken)",
                    borderRadius: "var(--radius-pill)",
                    padding: "3px 10px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        {overviewStats.totalScopes > 0 && (
          <ProjectHubSection title={t("hubSectionProgressTitle")}>
            <ProjectOverviewStats
              stats={overviewStats}
              projectId={id}
              reportTrigger={
                levelScopeReport ? (
                  <LevelScopeReportTrigger
                    report={levelScopeReport}
                    projectName={project.projectName}
                    projectId={id}
                  />
                ) : undefined
              }
            />
          </ProjectHubSection>
        )}

        <ProjectHubSection title={t("hubSectionFieldworkTitle")}>
          <ProjectHubDailyReportCard
            projectId={id}
            projectName={project.projectName}
            currentUserId={effective.user.id}
            currentUserRole={effective.user.role}
            canViewFieldDailyReport={canUseFieldDailyReport(effective.user.role)}
            canGenerateReport={canGenerateProjectFieldDailyReport(
              effective.user.role,
              effective.user.id,
              project.installManagerId,
            )}
          />

          <ProjectHubProjectNotesCard
            projectId={id}
            currentUserId={effective.user.id}
          />

          <ProjectHubFieldNotesCard
            projectId={id}
            projectName={project.projectName}
            currentUserId={effective.user.id}
            currentUserRole={effective.user.role}
          />

          <ProjectHubInspectionsCard
            projectId={id}
            projectName={project.projectName}
            submittedBy={effective.user.name ?? undefined}
          />

          <ProjectDocuments
            unifierPid={project.unifierPid ?? null}
            unifierProjectNumber={project.unifierProjectNumber ?? null}
            unifierBaseUrl={process.env.UNIFIER_BASE_URL ?? null}
          />
        </ProjectHubSection>
      </div>

      {/* Offline cache status */}
      <ProjectOfflineCacheSection projectId={id} />
    </div>
    </ProjectPageScrollArea>
  );
}

function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed === "Unassigned") return "—";
  const parts = trimmed.split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function ManagerAssignment({
  label,
  name,
  variant,
}: {
  label: string;
  name: string;
  variant: "secondary" | "dark" | "muted";
}) {
  const avatarStyle =
    variant === "secondary"
      ? { backgroundColor: "var(--color-secondary)", color: "var(--color-text-inverse)" }
      : variant === "dark"
        ? { backgroundColor: "var(--color-surface-dark)", color: "var(--color-text-inverse)" }
        : { backgroundColor: "var(--project-summary-avatar-muted-bg)", color: "var(--project-summary-avatar-muted-fg)" };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", minWidth: 0 }}>
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: "50%",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 9,
          fontWeight: 800,
          ...avatarStyle,
        }}
      >
        {getInitials(name)}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: "var(--tracking-section)",
            color: "var(--color-text-disabled)",
            lineHeight: 0.95,
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </div>
        <div
          style={{
            marginTop: 2,
            fontSize: "var(--text-caption)",
            fontWeight: 800,
            lineHeight: 1,
            color: variant === "muted" ? "var(--color-text-disabled)" : "var(--color-text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {name}
        </div>
      </div>
    </div>
  );
}

function LargeStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-1)", minWidth: 0 }}>
      <span
        style={{
          fontSize: "var(--text-heading)",
          fontWeight: 800,
          letterSpacing: "var(--tracking-tight)",
          lineHeight: 1,
          color: "var(--color-text-primary)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
      <span style={{ fontSize: "var(--text-micro)", fontWeight: 800, color: "var(--color-text-disabled)", whiteSpace: "nowrap" }}>{label}</span>
    </div>
  );
}
