-- Migration: add briefing_syntheses, briefing_feedbacks, briefing_rules
-- Adds history analysis, card-level feedback, and AI prompt rule management
-- to the Morning Briefing feature.

CREATE TABLE "briefing_syntheses" (
    "id"          TEXT NOT NULL,
    "windowDays"  INTEGER,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedBy" TEXT NOT NULL,
    "report"      JSONB NOT NULL,
    CONSTRAINT "briefing_syntheses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "briefing_syntheses_windowDays_generatedAt_idx"
    ON "briefing_syntheses"("windowDays", "generatedAt");

-- --------------------------------------------------------------------------

CREATE TABLE "briefing_feedbacks" (
    "id"              TEXT NOT NULL,
    "briefingId"      TEXT NOT NULL,
    "section"         TEXT NOT NULL,
    "itemKey"         TEXT NOT NULL,
    "feedbackType"    TEXT NOT NULL,
    "challengeReason" TEXT,
    "userNote"        TEXT,
    "aiJustification" TEXT,
    "aiRevision"      JSONB,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId"          TEXT NOT NULL,
    CONSTRAINT "briefing_feedbacks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "briefing_feedbacks_briefingId_section_idx"
    ON "briefing_feedbacks"("briefingId", "section");

CREATE INDEX "briefing_feedbacks_userId_createdAt_idx"
    ON "briefing_feedbacks"("userId", "createdAt");

-- --------------------------------------------------------------------------

CREATE TABLE "briefing_rules" (
    "id"        TEXT NOT NULL,
    "text"      TEXT NOT NULL,
    "source"    TEXT NOT NULL DEFAULT 'MANUAL',
    "active"    BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "briefing_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "briefing_rules_active_createdAt_idx"
    ON "briefing_rules"("active", "createdAt");

-- Seed one default rule so the system starts with known good behaviour
INSERT INTO "briefing_rules" ("id", "text", "source", "active", "createdAt", "createdBy", "updatedAt")
VALUES (
    'rule_internal_tool_default',
    'Command Center is a private internal tool used exclusively by CP Build employees. Never estimate ROI in terms of user acquisition, activations, conversions, or consumer growth metrics. Ground all ROI estimates in hours of manual work eliminated, errors prevented, or specific internal workflow speed-ups.',
    'MANUAL',
    true,
    CURRENT_TIMESTAMP,
    'system',
    CURRENT_TIMESTAMP
);
