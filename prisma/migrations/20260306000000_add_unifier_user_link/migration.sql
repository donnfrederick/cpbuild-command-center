-- AddUnifierUserLink
-- Adds optional Unifier PDS user identity fields to the User model.
-- unifierUserId is unique when set (one CC user per Unifier account).

ALTER TABLE "User" ADD COLUMN "unifierUserId"   TEXT;
ALTER TABLE "User" ADD COLUMN "unifierUsername" TEXT;

CREATE UNIQUE INDEX "User_unifierUserId_key" ON "User"("unifierUserId");
