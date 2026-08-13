-- CreateTable: masquerade_logs
-- Audit trail for SUPER_ADMIN masquerade (impersonation) sessions.
-- Idempotent: safe to apply more than once.

CREATE TABLE IF NOT EXISTS "masquerade_logs" (
    "id"           TEXT         NOT NULL,
    "actorId"      TEXT         NOT NULL,
    "targetUserId" TEXT         NOT NULL,
    "startedAt"    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "endedAt"      TIMESTAMPTZ,

    CONSTRAINT "masquerade_logs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey: actorId → User
DO $$ BEGIN
    ALTER TABLE "masquerade_logs"
        ADD CONSTRAINT "masquerade_logs_actorId_fkey"
        FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey: targetUserId → User
DO $$ BEGIN
    ALTER TABLE "masquerade_logs"
        ADD CONSTRAINT "masquerade_logs_targetUserId_fkey"
        FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "masquerade_logs_actorId_idx"      ON "masquerade_logs"("actorId");
CREATE INDEX IF NOT EXISTS "masquerade_logs_targetUserId_idx" ON "masquerade_logs"("targetUserId");
CREATE INDEX IF NOT EXISTS "masquerade_logs_startedAt_idx"    ON "masquerade_logs"("startedAt");
