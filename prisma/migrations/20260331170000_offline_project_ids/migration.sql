-- Add offlineProjectIds array to OfflinePreference
ALTER TABLE "OfflinePreference" ADD COLUMN "offlineProjectIds" TEXT[] NOT NULL DEFAULT '{}';

-- Create OfflineProjectSync table
CREATE TABLE "offline_project_syncs" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "syncedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "offline_project_syncs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "offline_project_syncs_userId_projectId_key" UNIQUE ("userId", "projectId"),
  CONSTRAINT "offline_project_syncs_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
