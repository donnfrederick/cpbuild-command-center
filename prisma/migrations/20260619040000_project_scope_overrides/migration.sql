-- CreateTable
CREATE TABLE "project_scope_overrides" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "scope_type_id" TEXT NOT NULL,
    "canonical_scope_type_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_scope_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_scope_overrides_project_id_idx" ON "project_scope_overrides"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_scope_overrides_project_id_scope_type_id_key" ON "project_scope_overrides"("project_id", "scope_type_id");

-- AddForeignKey
ALTER TABLE "project_scope_overrides" ADD CONSTRAINT "project_scope_overrides_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_scope_overrides" ADD CONSTRAINT "project_scope_overrides_scope_type_id_fkey" FOREIGN KEY ("scope_type_id") REFERENCES "scope_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_scope_overrides" ADD CONSTRAINT "project_scope_overrides_canonical_scope_type_id_fkey" FOREIGN KEY ("canonical_scope_type_id") REFERENCES "canonical_scope_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
