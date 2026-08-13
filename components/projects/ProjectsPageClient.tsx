"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { ProjectsTable } from "@/components/projects/ProjectsTable";
import type { Project } from "@/lib/projects";

interface Props {
  initialProjects: Project[];
  /** True when Unifier PDS was unreachable — list shows DB-only placeholders. */
  unifierUnavailable?: boolean;
  canCreate: boolean;
  canDelete: boolean;
  canDeleteTestProjects?: boolean;
  canViewUPM: boolean;
  canEditUpm?: boolean;
  title: string;
  subtitle: string;
  addLabel: string;
}

export function ProjectsPageClient({
  initialProjects,
  unifierUnavailable: initialUnifierUnavailable = false,
  canCreate,
  canDelete,
  canDeleteTestProjects = false,
  canViewUPM,
  canEditUpm = false,
  title,
  subtitle,
  addLabel,
}: Props) {
  const t = useTranslations("projects");
  const openModalRef = useRef<(() => void) | null>(null);
  const [unifierUnavailable, setUnifierUnavailable] = useState(initialUnifierUnavailable);

  useEffect(() => {
    setUnifierUnavailable(initialUnifierUnavailable);
  }, [initialUnifierUnavailable]);

  const handleAddProjectRef = useCallback((fn: () => void) => {
    openModalRef.current = fn;
  }, []);

  return (
    <div
      className="projects-page-root"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        gap: 20,
        padding: "var(--page-padding-x)",
      }}
    >
      {unifierUnavailable && (
        <div
          role="alert"
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: "10px 12px",
            borderRadius: "var(--radius-sm)",
            backgroundColor: "var(--warning-100)",
            border: "1px solid var(--warning-600)",
            color: "var(--warning-600)",
            fontSize: 13,
            lineHeight: 1.45,
          }}
        >
          <AlertTriangle
            size={18}
            aria-hidden
            style={{ flexShrink: 0, marginTop: 1, color: "var(--warning-600)" }}
          />
          <span>{t("unifierUnavailableBanner")}</span>
        </div>
      )}

      {/* Page header — title + Add Project button */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              color: "var(--color-text-primary)",
              margin: 0,
            }}
          >
            {title}
          </h1>
          <p
            style={{
              fontSize: 13,
              color: "var(--color-text-tertiary)",
              marginTop: 4,
              marginBottom: 0,
            }}
          >
            {subtitle}
          </p>
        </div>

        {canCreate && (
          <button
            data-tour="add-project-button"
            onClick={() => openModalRef.current?.()}
            aria-label={addLabel}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              height: 40,
              padding: "0 16px",
              border: "none",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--color-accent)",
              color: "var(--color-text-inverse)",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "var(--tracking-ui)",
              cursor: "pointer",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            + New Project
          </button>
        )}
      </div>

      <div className="projects-page-table-wrap" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <ProjectsTable
          initialProjects={initialProjects}
          canCreate={canCreate}
          canDelete={canDelete}
          canDeleteTestProjects={canDeleteTestProjects}
          canViewUPM={canViewUPM}
          canEditUpm={canEditUpm}
          onAddProjectRef={handleAddProjectRef}
          onUnifierUnavailableChange={setUnifierUnavailable}
        />
      </div>
    </div>
  );
}
