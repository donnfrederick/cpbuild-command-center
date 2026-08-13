-- AlterTable
ALTER TABLE "masquerade_logs" ALTER COLUMN "startedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "endedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "release_tour_steps" ADD COLUMN     "actions" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "release_tours" ADD COLUMN     "targetRoles" TEXT[] DEFAULT ARRAY[]::TEXT[];
