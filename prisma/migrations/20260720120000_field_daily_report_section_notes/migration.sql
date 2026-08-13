-- Replace single overlay comment per section with threaded section notes + replies.

CREATE TABLE "field_daily_report_section_notes" (
    "id" TEXT NOT NULL,
    "fieldDailyReportProjectId" TEXT NOT NULL,
    "sectionKey" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "authorUserId" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_daily_report_section_notes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "field_daily_report_section_note_replies" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "authorUserId" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_daily_report_section_note_replies_pkey" PRIMARY KEY ("id")
);

INSERT INTO "field_daily_report_section_notes" (
    "id",
    "fieldDailyReportProjectId",
    "sectionKey",
    "itemKey",
    "body",
    "authorUserId",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "fieldDailyReportProjectId",
    "sectionKey",
    "itemKey",
    "body",
    "authorUserId",
    "createdAt",
    "updatedAt"
FROM "field_daily_report_comments"
WHERE TRIM("body") <> '';

CREATE INDEX "field_daily_report_section_notes_fieldDailyReportProjectId_sectionKey_itemKey_createdAt_idx"
ON "field_daily_report_section_notes"("fieldDailyReportProjectId", "sectionKey", "itemKey", "createdAt" DESC);

CREATE INDEX "field_daily_report_section_note_replies_noteId_createdAt_idx"
ON "field_daily_report_section_note_replies"("noteId", "createdAt" DESC);

ALTER TABLE "field_daily_report_section_notes"
ADD CONSTRAINT "field_daily_report_section_notes_fieldDailyReportProjectId_fkey"
FOREIGN KEY ("fieldDailyReportProjectId") REFERENCES "field_daily_report_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "field_daily_report_section_notes"
ADD CONSTRAINT "field_daily_report_section_notes_authorUserId_fkey"
FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "field_daily_report_section_note_replies"
ADD CONSTRAINT "field_daily_report_section_note_replies_noteId_fkey"
FOREIGN KEY ("noteId") REFERENCES "field_daily_report_section_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "field_daily_report_section_note_replies"
ADD CONSTRAINT "field_daily_report_section_note_replies_authorUserId_fkey"
FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP TABLE "field_daily_report_comments";
