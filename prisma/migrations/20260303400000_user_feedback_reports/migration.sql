-- Migration: user_feedback_reports
-- Creates the feedback_reports table for user-submitted bugs and feature requests.

CREATE TYPE "FeedbackType" AS ENUM ('BUG', 'FEATURE_REQUEST');
CREATE TYPE "FeedbackStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');

CREATE TABLE "feedback_reports" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "type"        "FeedbackType" NOT NULL,
    "title"       TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "screenshot"  TEXT,
    "pageUrl"     TEXT,
    "status"      "FeedbackStatus" NOT NULL DEFAULT 'OPEN',
    "adminNote"   TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_reports_pkey" PRIMARY KEY ("id")
);

-- Foreign key: userId → User.id (cascade delete)
ALTER TABLE "feedback_reports"
    ADD CONSTRAINT "feedback_reports_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes for common query patterns
CREATE INDEX "feedback_reports_userId_idx"    ON "feedback_reports"("userId");
CREATE INDEX "feedback_reports_status_idx"    ON "feedback_reports"("status");
CREATE INDEX "feedback_reports_createdAt_idx" ON "feedback_reports"("createdAt");
