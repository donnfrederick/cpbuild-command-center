-- Per-user project favorites for pinning on the Projects list
CREATE TABLE "user_project_favorites" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_project_favorites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_project_favorites_userId_projectId_key" ON "user_project_favorites"("userId", "projectId");
CREATE INDEX "user_project_favorites_userId_idx" ON "user_project_favorites"("userId");

ALTER TABLE "user_project_favorites" ADD CONSTRAINT "user_project_favorites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_project_favorites" ADD CONSTRAINT "user_project_favorites_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
