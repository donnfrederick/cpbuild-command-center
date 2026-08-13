-- AlterTable
ALTER TABLE "project_issues" ADD COLUMN "missing_material_description" TEXT,
ADD COLUMN "missing_material_quantity" DECIMAL(18,4),
ADD COLUMN "missing_material_uom_code" TEXT;
