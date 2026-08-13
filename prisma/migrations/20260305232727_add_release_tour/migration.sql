-- CreateTable
CREATE TABLE "release_tours" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "release_tours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_tour_steps" (
    "id" TEXT NOT NULL,
    "tourId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "pageUrl" TEXT NOT NULL,
    "elementSelector" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "voiceText" TEXT NOT NULL,

    CONSTRAINT "release_tour_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "release_tours_releaseId_key" ON "release_tours"("releaseId");

-- CreateIndex
CREATE INDEX "release_tour_steps_tourId_idx" ON "release_tour_steps"("tourId");

-- AddForeignKey
ALTER TABLE "release_tours" ADD CONSTRAINT "release_tours_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_tour_steps" ADD CONSTRAINT "release_tour_steps_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "release_tours"("id") ON DELETE CASCADE ON UPDATE CASCADE;
