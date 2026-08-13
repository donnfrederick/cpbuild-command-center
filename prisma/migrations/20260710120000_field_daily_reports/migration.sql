-- CreateEnum
CREATE TYPE "field_daily_report_trigger" AS ENUM ('MANUAL', 'SCHEDULED');

-- CreateTable
CREATE TABLE "field_daily_reports" (
    "id" TEXT NOT NULL,
    "installManagerUserId" TEXT NOT NULL,
    "reportDate" DATE NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedByUserId" TEXT,
    "trigger" "field_daily_report_trigger" NOT NULL DEFAULT 'MANUAL',
    "activityThrough" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_daily_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_daily_report_projects" (
    "id" TEXT NOT NULL,
    "fieldDailyReportId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "field_daily_report_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_daily_report_comments" (
    "id" TEXT NOT NULL,
    "fieldDailyReportProjectId" TEXT NOT NULL,
    "sectionKey" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "authorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_daily_report_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "field_daily_reports_installManagerUserId_reportDate_idx" ON "field_daily_reports"("installManagerUserId", "reportDate" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "field_daily_reports_installManagerUserId_reportDate_key" ON "field_daily_reports"("installManagerUserId", "reportDate");

-- CreateIndex
CREATE INDEX "field_daily_report_projects_projectId_idx" ON "field_daily_report_projects"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "field_daily_report_projects_fieldDailyReportId_projectId_key" ON "field_daily_report_projects"("fieldDailyReportId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "field_daily_report_comments_fieldDailyReportProjectId_sectionKey_itemKey_key" ON "field_daily_report_comments"("fieldDailyReportProjectId", "sectionKey", "itemKey");

-- AddForeignKey
ALTER TABLE "field_daily_reports" ADD CONSTRAINT "field_daily_reports_installManagerUserId_fkey" FOREIGN KEY ("installManagerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_daily_report_projects" ADD CONSTRAINT "field_daily_report_projects_fieldDailyReportId_fkey" FOREIGN KEY ("fieldDailyReportId") REFERENCES "field_daily_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_daily_report_projects" ADD CONSTRAINT "field_daily_report_projects_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_daily_report_comments" ADD CONSTRAINT "field_daily_report_comments_fieldDailyReportProjectId_fkey" FOREIGN KEY ("fieldDailyReportProjectId") REFERENCES "field_daily_report_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
