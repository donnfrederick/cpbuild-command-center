-- Add soft-delete support to issue and observation comments.
-- Admin DELETE sets deletedAt; GET filters it out at the query layer.

ALTER TABLE "issue_comments" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "observation_comments" ADD COLUMN "deletedAt" TIMESTAMP(3);
