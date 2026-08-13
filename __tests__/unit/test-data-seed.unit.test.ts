import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRng, pickOne, randomDateInRange, shuffleInPlace } from "@/lib/test-data-seed/random";
import { unitRefFromRow } from "@/lib/test-data-seed/templates";
import { TEST_MEDIA_POOL } from "@/lib/test-data-seed/media-pool";
import { TEST_INSTALL_TEAM_CODE, TEST_SEED_SUB_UNIFIER_ID } from "@/lib/test-data-seed/constants";
import {
  scopeCodeFromScopeType,
  formMatchesScopeCode,
} from "@/lib/test-data-seed/resolve-published-clear-forms";
import {
  assertSubmissionAnswersComplete,
  findUnansweredRequiredQuestions,
  isQuestionAnswered,
} from "@/lib/inspections/answer-completeness";
import type { FormTemplate } from "@/components/forms/formTypes";
vi.mock("@/lib/db", () => ({
  db: {
    installTeam: { upsert: vi.fn() },
  },
}));

describe("test-data-seed/random", () => {
  it("createRng is deterministic when seed is provided", () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it("randomDateInRange stays within window", () => {
    const rng = createRng(7);
    const days = 90;
    const now = Date.now();
    for (let i = 0; i < 20; i++) {
      const d = randomDateInRange(days, rng);
      expect(d.getTime()).toBeLessThanOrEqual(now);
      expect(d.getTime()).toBeGreaterThanOrEqual(now - days * 86400000);
    }
  });

  it("shuffleInPlace permutes without losing elements", () => {
    const rng = createRng(99);
    const arr = [1, 2, 3, 4, 5];
    shuffleInPlace(arr, rng);
    expect(arr.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("pickOne returns an item from the list", () => {
    const rng = createRng(1);
    expect(["a", "b", "c"]).toContain(pickOne(["a", "b", "c"], rng));
  });
});

describe("test-data-seed/templates", () => {
  it("unitRefFromRow builds pipe-delimited ref", () => {
    expect(unitRefFromRow({ building: "A", level: "2", unit: "201" })).toBe("A|2|201");
  });
});

describe("test-data-seed/promote-rows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolveTestSubcontractor upserts TEST_SUB when missing", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.installTeam.upsert).mockResolvedValue({ id: "team-1" } as never);

    const { resolveTestSubcontractor } = await import("@/lib/test-data-seed/promote-rows");
    const ref = await resolveTestSubcontractor();

    expect(db.installTeam.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { code: TEST_INSTALL_TEAM_CODE } })
    );
    expect(ref).toEqual({ installTeamId: "team-1", unifierSubId: TEST_SEED_SUB_UNIFIER_ID });
  });
});

describe("test-data-seed/media-pool", () => {
  it("includes entries for visual-evidence issue types", () => {
    const visualTypes = new Set(["TRADE_DAMAGE_REPAIR", "DAMAGED_MATERIALS"]);
    expect(visualTypes.size).toBe(2);
    expect(TEST_MEDIA_POOL.length).toBeGreaterThanOrEqual(3);
    for (const entry of TEST_MEDIA_POOL) {
      expect(entry.storageKey.startsWith("field-media/issues/")).toBe(true);
      expect(entry.mimeType.startsWith("image/")).toBe(true);
    }
  });
});

describe("test-data-seed/resolve-published-clear-forms", () => {
  it("scopeCodeFromScopeType prefers canonical code", () => {
    expect(
      scopeCodeFromScopeType({ code: "LEGACY", canonicalScopeType: { code: "CAB" } })
    ).toBe("CAB");
    expect(scopeCodeFromScopeType({ code: "DRYW", canonicalScopeType: null })).toBe("DRYW");

    const form = {
      formId: "f1",
      formVersionId: "v1",
      versionNumber: 1,
      template: {
        id: "f1",
        name: "Cab Clear",
        description: "",
        status: "published" as const,
        level: "scope" as const,
        category: "CLEAR_INSPECTION" as const,
        scopeTypeCodes: ["CAB"],
        sections: [{ id: "s1", title: "S", questions: [] }],
      },
    };

    expect(formMatchesScopeCode(form, "CAB")).toBe(true);
    expect(formMatchesScopeCode(form, "DRYW")).toBe(false);
  });
});

describe("answer-completeness", () => {
  it("isQuestionAnswered treats NUMBER with string value as answered", () => {
    expect(
      isQuestionAnswered(
        {
          id: "n1",
          title: "Minutes",
          description: "",
          responseType: "NUMBER",
          required: true,
          photoRequired: false,
          deficiencyPhotoRequired: false,
          options: [],
        },
        { number: "15" }
      )
    ).toBe(true);
    expect(
      isQuestionAnswered(
        {
          id: "n1",
          title: "Minutes",
          description: "",
          responseType: "NUMBER",
          required: true,
          photoRequired: false,
          deficiencyPhotoRequired: false,
          options: [],
        },
        { number: "0" }
      )
    ).toBe(true);
  });
});

describe("test-data-seed/build-seed-inspection-payload", () => {
  const cabinetLikeTemplate: FormTemplate = {
    id: "f1",
    name: "Cab Clear",
    description: "",
    status: "published",
    level: "scope",
    category: "CLEAR_INSPECTION",
    scopeTypeCodes: ["CAB"],
    sections: [
      {
        id: "s1",
        title: "Section",
        questions: [
          {
            id: "q1",
            title: "Pass fail",
            description: "",
            responseType: "PASS_FAIL_DEFICIENCIES",
            required: true,
            photoRequired: false,
            deficiencyPhotoRequired: false,
            options: [],
          },
          {
            id: "q2",
            title: "Minutes to Clean:",
            description: "",
            responseType: "NUMBER",
            required: true,
            photoRequired: false,
            deficiencyPhotoRequired: false,
            options: [],
          },
          {
            id: "q3",
            title: "Any excess cabinet material observed? Please quantify:",
            description: "",
            responseType: "NUMBER",
            required: false,
            photoRequired: false,
            deficiencyPhotoRequired: false,
            options: [],
          },
        ],
      },
    ],
  };

  it("builds pass and fail payloads from form questions", async () => {
    const { buildSeedInspectionPayload } = await import(
      "@/lib/test-data-seed/build-seed-inspection-payload"
    );

    const passResult = buildSeedInspectionPayload(cabinetLikeTemplate, "PASS", "seed");
    expect(passResult.payload.q1).toEqual({ choice: "pass" });
    expect(passResult.payload.q2).toEqual({ number: "15" });
    expect(passResult.payload.q3).toEqual({ number: "0" });
    expect(passResult.deficiencyCount).toBe(0);
    expect(() => assertSubmissionAnswersComplete(cabinetLikeTemplate, passResult.payload)).not.toThrow();

    const failResult = buildSeedInspectionPayload(cabinetLikeTemplate, "FAIL", "seed");
    expect(failResult.payload.q1?.choice).toBe("fail");
    expect(failResult.payload.q1?.deficiencies?.[0]?.description).toContain("[TEST-SEED]");
    expect(failResult.payload.q1?.deficiencies?.[0]?.severity).toBe("Minor");
    expect(failResult.payload.q1?.deficiencies?.[0]?.capturedFiles?.length).toBe(1);
    expect(failResult.payload.q2?.number).toBe("45");
    expect(failResult.payload.q2?.capturedFiles?.length).toBe(1);
    expect(failResult.deficiencyCount).toBeGreaterThan(0);
    expect(() => assertSubmissionAnswersComplete(cabinetLikeTemplate, failResult.payload)).not.toThrow();
  });

  it("flags missing required NUMBER answers", () => {
    const unanswered = findUnansweredRequiredQuestions(cabinetLikeTemplate.sections, {
      q1: { choice: "pass" },
    });
    expect(unanswered.map((q) => q.questionId)).toEqual(["q2"]);
  });

  it("includes deficiency photos on every failed deficiency", async () => {
    const { buildSeedInspectionPayload } = await import(
      "@/lib/test-data-seed/build-seed-inspection-payload"
    );
    const template: FormTemplate = {
      ...cabinetLikeTemplate,
      sections: [
        {
          id: "s1",
          title: "Section",
          questions: [
            {
              id: "q-photo",
              title: "Photo required deficiency",
              description: "",
              responseType: "PASS_FAIL_DEFICIENCIES",
              required: true,
              photoRequired: false,
              deficiencyPhotoRequired: true,
              options: [],
            },
          ],
        },
      ],
    };
    const failResult = buildSeedInspectionPayload(template, "FAIL", "seed");
    expect(failResult.payload["q-photo"]?.deficiencies?.[0]?.capturedFiles?.length).toBe(1);
  });
});

describe("test-data-seed/plan-clear-attempts", () => {
  it("produces pass-first, fail-then-pass, and stuck-failed patterns", async () => {
    const { planClearInspectionOutcomes, finalInspectionStatusFromOutcomes } = await import(
      "@/lib/test-data-seed/plan-clear-attempts"
    );

    const passFirstRng = (() => {
      let call = 0;
      return () => {
        call++;
        return call === 1 ? 0.1 : 0.99;
      };
    })();
    expect(planClearInspectionOutcomes(1, passFirstRng)).toEqual(["PASS"]);

    expect(
      planClearInspectionOutcomes(1, (() => {
        let call = 0;
        return () => (call++ === 0 ? 0.1 : 0.1);
      })())
    ).toEqual(["FAIL", "PASS"]);

    const stuckFail = planClearInspectionOutcomes(0, (() => {
      let call = 0;
      return () => {
        call++;
        return call === 1 ? 0.9 : 0.5;
      };
    })());
    expect(stuckFail.every((o) => o === "FAIL")).toBe(true);
    expect(stuckFail.length).toBeGreaterThanOrEqual(1);
    expect(finalInspectionStatusFromOutcomes(stuckFail)).toBe("FAILED");
  });

  it("planClearInspectionOutcomesForBatch guarantees mixed patterns for small batches", async () => {
    const { planClearInspectionOutcomesForBatch } = await import(
      "@/lib/test-data-seed/plan-clear-attempts"
    );

    const plans = planClearInspectionOutcomesForBatch(5, 0.7, () => 0.5);
    expect(plans).toHaveLength(5);

    const hasPassFirst = plans.some((p) => p.length === 1 && p[0] === "PASS");
    const hasFailThenPass = plans.some((p) => p.length === 2 && p[0] === "FAIL" && p[1] === "PASS");
    const hasStuckFail = plans.some((p) => p.every((o) => o === "FAIL"));

    expect(hasPassFirst).toBe(true);
    expect(hasFailThenPass).toBe(true);
    expect(hasStuckFail).toBe(true);
  });

  it("planCalibrationOutcomesForBatch includes pass and fail when count >= 2", async () => {
    const { planCalibrationOutcomesForBatch } = await import(
      "@/lib/test-data-seed/plan-clear-attempts"
    );

    const outcomes = planCalibrationOutcomesForBatch(3, 0.9, () => 0.99);
    expect(outcomes).toHaveLength(3);
    expect(outcomes).toContain("PASS");
    expect(outcomes).toContain("FAIL");
  });
});
