-- Migration: add_project_sub_scopes
--
-- Adds two tables for the sub-scope feature:
--   project_sub_scopes       — definition per (project, unitType, scopeType)
--   project_sub_scope_instances — per-row tracking (one per sub-scope per ProjectRow)
--
-- When instances exist for a row, direct scopeStage/scopeStatus updates on that
-- ProjectRow are rejected (409) by the API — updates go through instances instead.

-- CreateTable: project_sub_scopes
CREATE TABLE "project_sub_scopes" (
    "id"           TEXT        NOT NULL,
    "projectId"    TEXT        NOT NULL,
    "scopeTypeId"  TEXT        NOT NULL,
    "unitType"     TEXT        NOT NULL,
    "name"         TEXT        NOT NULL,
    "displayOrder" INTEGER     NOT NULL DEFAULT 0,
    "createdById"  TEXT        NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_sub_scopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable: project_sub_scope_instances
CREATE TABLE "project_sub_scope_instances" (
    "id"               TEXT        NOT NULL,
    "subScopeId"       TEXT        NOT NULL,
    "rowId"            TEXT        NOT NULL,
    "scopeStage"       "ScopeStage",
    "scopeStatus"      "ScopeStatus",
    "inspectionStatus" "InspectionStatus",
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_sub_scope_instances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: project_sub_scopes
CREATE INDEX "project_sub_scopes_projectId_idx"
    ON "project_sub_scopes"("projectId");

CREATE INDEX "project_sub_scopes_projectId_scopeTypeId_unitType_idx"
    ON "project_sub_scopes"("projectId", "scopeTypeId", "unitType");

CREATE UNIQUE INDEX "project_sub_scopes_projectId_scopeTypeId_unitType_name_key"
    ON "project_sub_scopes"("projectId", "scopeTypeId", "unitType", "name");

-- CreateIndex: project_sub_scope_instances
CREATE INDEX "project_sub_scope_instances_rowId_idx"
    ON "project_sub_scope_instances"("rowId");

CREATE INDEX "project_sub_scope_instances_subScopeId_idx"
    ON "project_sub_scope_instances"("subScopeId");

CREATE UNIQUE INDEX "project_sub_scope_instances_subScopeId_rowId_key"
    ON "project_sub_scope_instances"("subScopeId", "rowId");

-- AddForeignKey: project_sub_scopes → Project (CASCADE — delete project → delete definitions)
ALTER TABLE "project_sub_scopes"
    ADD CONSTRAINT "project_sub_scopes_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: project_sub_scopes → scope_types (RESTRICT — can't delete a ScopeType that has sub-scopes)
ALTER TABLE "project_sub_scopes"
    ADD CONSTRAINT "project_sub_scopes_scopeTypeId_fkey"
    FOREIGN KEY ("scopeTypeId") REFERENCES "scope_types"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: project_sub_scopes → User (RESTRICT — preserves audit trail)
ALTER TABLE "project_sub_scopes"
    ADD CONSTRAINT "project_sub_scopes_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: project_sub_scope_instances → project_sub_scopes (CASCADE — delete definition → delete instances)
ALTER TABLE "project_sub_scope_instances"
    ADD CONSTRAINT "project_sub_scope_instances_subScopeId_fkey"
    FOREIGN KEY ("subScopeId") REFERENCES "project_sub_scopes"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: project_sub_scope_instances → project_rows (CASCADE — delete row → delete its instances)
ALTER TABLE "project_sub_scope_instances"
    ADD CONSTRAINT "project_sub_scope_instances_rowId_fkey"
    FOREIGN KEY ("rowId") REFERENCES "project_rows"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
