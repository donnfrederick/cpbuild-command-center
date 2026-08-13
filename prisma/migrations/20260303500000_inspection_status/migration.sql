-- Migration: add InspectionStatus enum and inspectionStatus column to project_rows
-- This tracks QC inspection clearance per scope row (READY / PASSED / FAILED).

CREATE TYPE "InspectionStatus" AS ENUM ('READY', 'PASSED', 'FAILED');

ALTER TABLE "project_rows" ADD COLUMN "inspectionStatus" "InspectionStatus";
