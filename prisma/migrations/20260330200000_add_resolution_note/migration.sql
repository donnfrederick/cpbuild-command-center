-- Add dedicated resolution note field to project_issues
-- Previously resolution notes were stored as regular IssueComments, which
-- caused them to blend in with user comments. This dedicated column makes
-- the resolution note a first-class field so it can be displayed distinctly.

ALTER TABLE "project_issues" ADD COLUMN "resolutionNote" TEXT;
