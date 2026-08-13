-- AlterTable
ALTER TABLE "feedback_reports" ADD COLUMN "radDashTicketId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "feedback_reports_radDashTicketId_key" ON "feedback_reports"("radDashTicketId");
