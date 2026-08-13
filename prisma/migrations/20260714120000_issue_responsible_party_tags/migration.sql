-- Join table: one issue ↔ many responsible parties (UN-0053)

CREATE TABLE IF NOT EXISTS "issue_responsible_party_tags" (
    "id"      TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "party"   "responsible_party" NOT NULL,

    CONSTRAINT "issue_responsible_party_tags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "issue_responsible_party_tags_issueId_party_key"
    ON "issue_responsible_party_tags"("issueId", "party");

CREATE INDEX IF NOT EXISTS "issue_responsible_party_tags_issueId_idx"
    ON "issue_responsible_party_tags"("issueId");

CREATE INDEX IF NOT EXISTS "issue_responsible_party_tags_party_idx"
    ON "issue_responsible_party_tags"("party");

DO $$ BEGIN
    ALTER TABLE "issue_responsible_party_tags"
        ADD CONSTRAINT "issue_responsible_party_tags_issueId_fkey"
        FOREIGN KEY ("issueId") REFERENCES "project_issues"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Backfill one tag per existing issue from legacy single column
INSERT INTO "issue_responsible_party_tags" ("id", "issueId", "party")
SELECT
    gen_random_uuid()::text,
    pi."id",
    pi."responsibleParty"
FROM "project_issues" pi
WHERE NOT EXISTS (
    SELECT 1 FROM "issue_responsible_party_tags" t WHERE t."issueId" = pi."id"
);
