-- CreateTable: releases — tracks deployments for the Release Checklist DevTools tab
CREATE TABLE "releases" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "prNumber" INTEGER,
    "branch" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'all',
    "mergedAt" TIMESTAMP(3) NOT NULL,
    "changes" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable: release_verifications — records an admin verifying a release in an environment
CREATE TABLE "release_verifications" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "release_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable: environment_visits — tracks when an admin last visited each environment
CREATE TABLE "environment_visits" (
    "userId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "lastVisitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "environment_visits_pkey" PRIMARY KEY ("userId","environment")
);

-- CreateIndex
CREATE INDEX "releases_mergedAt_idx" ON "releases"("mergedAt");

-- CreateIndex
CREATE INDEX "releases_environment_idx" ON "releases"("environment");

-- CreateIndex
CREATE UNIQUE INDEX "release_verifications_releaseId_userId_environment_key" ON "release_verifications"("releaseId", "userId", "environment");

-- CreateIndex
CREATE INDEX "release_verifications_userId_environment_idx" ON "release_verifications"("userId", "environment");

-- AddForeignKey
ALTER TABLE "release_verifications" ADD CONSTRAINT "release_verifications_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_verifications" ADD CONSTRAINT "release_verifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "environment_visits" ADD CONSTRAINT "environment_visits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
