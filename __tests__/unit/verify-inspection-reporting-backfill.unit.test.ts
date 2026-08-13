import { describe, it, expect, vi } from "vitest";
import { findOrphanedFormAnswers } from "@/scripts/verify-inspection-reporting-backfill";

describe("findOrphanedFormAnswers()", () => {
  it("returns rows from the orphan query", async () => {
    const prisma = {
      $queryRawUnsafe: vi.fn(async () => [
        { submissionId: "sub-1", formVersionId: "fv-1", orphanAnswerCount: 2 },
      ]),
    };

    const result = await findOrphanedFormAnswers(prisma);

    expect(result).toHaveLength(1);
    expect(result[0]?.submissionId).toBe("sub-1");
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining("formVersionQuestionId"));
  });

  it("returns empty array when backfill gate passes", async () => {
    const prisma = {
      $queryRawUnsafe: vi.fn(async () => []),
    };

    const result = await findOrphanedFormAnswers(prisma);

    expect(result).toEqual([]);
  });
});
