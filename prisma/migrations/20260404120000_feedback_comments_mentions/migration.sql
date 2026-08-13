-- Feedback threaded comments, @mention visibility, and polymorphic media FK.

CREATE TABLE "feedback_comments" (
    "id" TEXT NOT NULL,
    "feedbackReportId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_comments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "feedback_mentions" (
    "id" TEXT NOT NULL,
    "feedbackReportId" TEXT NOT NULL,
    "mentionedUserId" TEXT NOT NULL,
    "sourceCommentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_mentions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "media_attachments" ADD COLUMN "feedbackCommentId" TEXT;

ALTER TABLE "feedback_comments"
ADD CONSTRAINT "feedback_comments_feedbackReportId_fkey"
FOREIGN KEY ("feedbackReportId") REFERENCES "feedback_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "feedback_comments"
ADD CONSTRAINT "feedback_comments_authorId_fkey"
FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "feedback_mentions"
ADD CONSTRAINT "feedback_mentions_feedbackReportId_fkey"
FOREIGN KEY ("feedbackReportId") REFERENCES "feedback_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "feedback_mentions"
ADD CONSTRAINT "feedback_mentions_mentionedUserId_fkey"
FOREIGN KEY ("mentionedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "feedback_mentions"
ADD CONSTRAINT "feedback_mentions_sourceCommentId_fkey"
FOREIGN KEY ("sourceCommentId") REFERENCES "feedback_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "media_attachments"
ADD CONSTRAINT "media_attachments_feedbackCommentId_fkey"
FOREIGN KEY ("feedbackCommentId") REFERENCES "feedback_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "feedback_mentions_feedbackReportId_mentionedUserId_key" ON "feedback_mentions"("feedbackReportId", "mentionedUserId");
CREATE INDEX "feedback_mentions_mentionedUserId_idx" ON "feedback_mentions"("mentionedUserId");
CREATE INDEX "feedback_comments_feedbackReportId_idx" ON "feedback_comments"("feedbackReportId");
CREATE INDEX "media_attachments_feedbackCommentId_idx" ON "media_attachments"("feedbackCommentId");
