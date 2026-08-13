/*
  Warnings:

  - Made the column `shipPhase` on table `project_rows` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('FEEDBACK_IN_PROGRESS', 'FEEDBACK_RESOLVED');

-- AlterTable
ALTER TABLE "DesignTokenSnapshot" ALTER COLUMN "savedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "OfflinePreference" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "layout_issues" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "project_rows" ALTER COLUMN "shipPhase" SET NOT NULL,
ALTER COLUMN "shipPhase" SET DEFAULT '',
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_tours" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "steps" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_tours_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_userId_idx" ON "notifications"("userId");

-- CreateIndex
CREATE INDEX "notifications_userId_read_idx" ON "notifications"("userId", "read");

-- CreateIndex
CREATE INDEX "notifications_feedbackId_idx" ON "notifications"("feedbackId");

-- CreateIndex
CREATE UNIQUE INDEX "feedback_tours_feedbackId_key" ON "feedback_tours"("feedbackId");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "feedback_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_tours" ADD CONSTRAINT "feedback_tours_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "feedback_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
