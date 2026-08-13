-- CreateTable
CREATE TABLE "app_announcements" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleEs" TEXT NOT NULL,
    "bodyEn" TEXT NOT NULL,
    "bodyEs" TEXT NOT NULL,
    "heroImageUrlEn" TEXT,
    "heroImageUrlEs" TEXT,
    "ctaLabelEn" TEXT,
    "ctaLabelEs" TEXT,
    "ctaAction" TEXT NOT NULL DEFAULT 'DISMISS_ONLY',
    "ctaHref" TEXT,
    "audience" TEXT NOT NULL DEFAULT 'ALL',
    "campaignVersion" INTEGER NOT NULL DEFAULT 1,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_announcement_dismissals" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "campaignVersion" INTEGER NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_announcement_dismissals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_announcements_slug_key" ON "app_announcements"("slug");

-- CreateIndex
CREATE INDEX "app_announcements_active_startsAt_endsAt_idx" ON "app_announcements"("active", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "app_announcement_dismissals_userId_announcementId_idx" ON "app_announcement_dismissals"("userId", "announcementId");

-- CreateIndex
CREATE UNIQUE INDEX "app_announcement_dismissals_announcementId_userId_campaignVersion_key" ON "app_announcement_dismissals"("announcementId", "userId", "campaignVersion");

-- AddForeignKey
ALTER TABLE "app_announcement_dismissals" ADD CONSTRAINT "app_announcement_dismissals_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "app_announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_announcement_dismissals" ADD CONSTRAINT "app_announcement_dismissals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
