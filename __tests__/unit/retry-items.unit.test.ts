import { describe, it, expect } from "vitest";
import type { FormQuestion } from "@/components/forms/formTypes";
import type { AnswersMap } from "@/components/forms/FormFillClient";
import {
  expandDeficienciesForRetry,
  normalizeDeficienciesForRetry,
  normalizeOccurrenceCount,
  getRetryItems,
  countRetryItems,
  countRetryOccurrences,
} from "@/lib/inspections/retry-items";

const PASS_FAIL_DEF_Q: FormQuestion = {
  id: "q1",
  title: "Cabinet doors flush?",
  description: "",
  responseType: "PASS_FAIL_DEFICIENCIES",
  required: true,
  photoRequired: false,
  deficiencyPhotoRequired: false,
  options: [],
};

describe("normalizeDeficienciesForRetry()", () => {
  it("preserves occurrence count on a single grouped row", () => {
    const normalized = normalizeDeficienciesForRetry([
      { id: "d1", description: "Scratch", severity: "Major", count: 4 },
    ]);
    expect(normalized).toHaveLength(1);
    expect(normalized[0]?.count).toBe(4);
    expect(normalized[0]?.id).toBe("d1");
  });

  it("assigns unique ids when source ids are empty strings", () => {
    const normalized = normalizeDeficienciesForRetry([
      { id: "", description: "First", severity: "Major", count: 1 },
      { id: "", description: "Second", severity: "Minor", count: 3 },
    ]);
    expect(normalized).toHaveLength(2);
    expect(normalized[0]?.count).toBe(1);
    expect(normalized[1]?.count).toBe(3);
    const keys = normalized.map((def) => def.id);
    expect(new Set(keys).size).toBe(2);
  });

  it("coerces fractional and invalid counts to finite integers", () => {
    expect(normalizeOccurrenceCount(4.9)).toBe(4);
    expect(normalizeOccurrenceCount(Number.NaN)).toBe(1);
    expect(normalizeOccurrenceCount(undefined)).toBe(1);
    const normalized = normalizeDeficienciesForRetry([
      { id: "d1", description: "A", severity: "Major", count: 2.7 },
    ]);
    expect(normalized[0]?.count).toBe(2);
  });
});

/** @deprecated — alias kept for older imports; behavior matches normalizeDeficienciesForRetry. */
describe("expandDeficienciesForRetry()", () => {
  it("does not split count > 1 into separate rows", () => {
    const expanded = expandDeficienciesForRetry([
      { id: "d1", description: "Scratch", severity: "Major", count: 2 },
    ]);
    expect(expanded).toHaveLength(1);
    expect(expanded[0]?.count).toBe(2);
  });
});

describe("getRetryItems()", () => {
  it("returns one retry row per unique deficiency (grouped occurrences)", () => {
    const answers: AnswersMap = {
      q1: {
        choice: "fail",
        deficiencies: [
          { id: "d1", description: "A", severity: "Major", count: 4 },
          { id: "d2", description: "B", severity: "Minor", count: 1 },
        ],
      },
    };

    const items = getRetryItems(PASS_FAIL_DEF_Q, answers);
    expect(items).toHaveLength(2);
    expect(items[0]?.deficiency?.count).toBe(4);
    expect(new Set(items.map((item) => item.key)).size).toBe(2);
  });

  it("countRetryOccurrences sums occurrence counts across deficiencies", () => {
    const answers: AnswersMap = {
      q1: {
        choice: "fail",
        deficiencies: [
          { id: "d1", description: "A", severity: "Major", count: 4 },
          { id: "d2", description: "B", severity: "Minor", count: 10 },
        ],
      },
    };
    expect(countRetryItems([PASS_FAIL_DEF_Q], answers)).toBe(2);
    expect(countRetryOccurrences([PASS_FAIL_DEF_Q], answers)).toBe(14);
  });

  it("countRetryOccurrences ignores fractional and invalid stored counts", () => {
    const answers: AnswersMap = {
      q1: {
        choice: "fail",
        deficiencies: [
          { id: "d1", description: "A", severity: "Major", count: 2.9 },
          { id: "d2", description: "B", severity: "Minor", count: Number.NaN },
        ],
      },
    };
    expect(countRetryOccurrences([PASS_FAIL_DEF_Q], answers)).toBe(3);
  });

  it("reads deficiencies stored on a PASS_FAIL failFollowUp answer", () => {
    const parentQ: FormQuestion = {
      ...PASS_FAIL_DEF_Q,
      responseType: "PASS_FAIL",
      failFollowUp: {
        ...PASS_FAIL_DEF_Q,
        id: "q1__followup",
        title: "Document deficiencies",
      },
    };
    const answers: AnswersMap = {
      q1: { choice: "fail" },
      "q1__followup": {
        choice: "fail",
        deficiencies: [
          { id: "d1", description: "Gap", severity: "Major", count: 1 },
          { id: "d2", description: "Chip", severity: "Minor", count: 1 },
        ],
      },
    };

    expect(getRetryItems(parentQ, answers)).toHaveLength(2);
    expect(countRetryItems([parentQ], answers)).toBe(2);
  });
});
