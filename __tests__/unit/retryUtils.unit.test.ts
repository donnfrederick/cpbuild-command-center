/**
 * Unit tests for lib/inspections/retryUtils.ts
 *
 * buildRetryTemplate is a pure function — no DB, no network, no side-effects.
 * Every case can be asserted with simple in-memory fixtures.
 */
import { describe, it, expect } from "vitest";
import { buildRetryTemplate, type AnswersMap } from "@/lib/inspections/retryUtils";
import type { FormTemplate, FormQuestion } from "@/components/forms/formTypes";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeQuestion(id: string): FormQuestion {
  return {
    id,
    title: `Question ${id}`,
    description: "",
    responseType: "PASS_FAIL",
    required: true,
    photoRequired: false,
    deficiencyPhotoRequired: false,
    options: [],
  };
}

function makeTemplate(
  ...sectionDefs: { id: string; questions: string[] }[]
): FormTemplate {
  return {
    id: "form-1",
    name: "Clear Inspection — CAB",
    level: "scope",
    category: "CLEAR_INSPECTION",
    scopeTypeCodes: ["CAB"],
    sections: sectionDefs.map(({ id, questions }) => ({
      id,
      title: id,
      questions: questions.map(makeQuestion),
    })),
  };
}

function buildRetryTemplateOnly(
  template: FormTemplate,
  previousAnswers: AnswersMap,
): FormTemplate {
  return buildRetryTemplate(template, previousAnswers).template;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("buildRetryTemplate()", () => {
  // ── No failures ─────────────────────────────────────────────────────────────

  describe("when no questions failed", () => {
    it("returns the exact same template reference (no copy)", () => {
      const tmpl = makeTemplate({ id: "s1", questions: ["q1", "q2"] });
      const answers: AnswersMap = {
        q1: { choice: "pass" },
        q2: { choice: "yes" },
      };
      expect(buildRetryTemplateOnly(tmpl, answers)).toBe(tmpl);
    });

    it("treats missing answer entries as non-failures", () => {
      const tmpl = makeTemplate({ id: "s1", questions: ["q1"] });
      expect(buildRetryTemplateOnly(tmpl, {})).toBe(tmpl);
    });

    it("treats 'pass', 'na', 'yes' choices as non-failures", () => {
      const tmpl = makeTemplate({ id: "s1", questions: ["q1", "q2", "q3"] });
      const answers: AnswersMap = {
        q1: { choice: "pass" },
        q2: { choice: "na" },
        q3: { choice: "yes" },
      };
      expect(buildRetryTemplateOnly(tmpl, answers)).toBe(tmpl);
    });

    it("treats an empty deficiencies array as a non-failure", () => {
      const tmpl = makeTemplate({ id: "s1", questions: ["q1"] });
      expect(buildRetryTemplateOnly(tmpl, { q1: { deficiencies: [] } })).toBe(tmpl);
    });
  });

  // ── All questions failed ─────────────────────────────────────────────────────

  describe("when all questions failed", () => {
    it("produces exactly one section — the deficiency section", () => {
      const tmpl = makeTemplate({ id: "s1", questions: ["q1", "q2"] });
      const answers: AnswersMap = {
        q1: { choice: "fail" },
        q2: { choice: "no" },
      };
      const result = buildRetryTemplateOnly(tmpl, answers);
      expect(result.sections).toHaveLength(1);
    });

    it("places all failed questions into the 'retry-deficiencies' section", () => {
      const tmpl = makeTemplate({ id: "s1", questions: ["q1", "q2"] });
      const answers: AnswersMap = {
        q1: { choice: "fail" },
        q2: { choice: "no" },
      };
      const result = buildRetryTemplateOnly(tmpl, answers);
      expect(result.sections[0].id).toBe("retry-deficiencies");
      expect(result.sections[0].title).toBe("Deficiencies to Address");
      expect(result.sections[0].questions.map((q) => q.id)).toEqual(["q1", "q2"]);
    });

    it("drops the original section that becomes empty", () => {
      const tmpl = makeTemplate({ id: "s1", questions: ["q1"] });
      const result = buildRetryTemplateOnly(tmpl, { q1: { choice: "fail" } });
      expect(result.sections.every((s) => s.id !== "s1")).toBe(true);
    });
  });

  // ── Partial failures ─────────────────────────────────────────────────────────

  describe("when some questions failed (partial)", () => {
    it("places deficiency section first", () => {
      const tmpl = makeTemplate({ id: "s1", questions: ["q1", "q2", "q3"] });
      const answers: AnswersMap = { q2: { choice: "fail" } };
      const result = buildRetryTemplateOnly(tmpl, answers);
      expect(result.sections[0].id).toBe("retry-deficiencies");
    });

    it("keeps non-failed questions in their original section", () => {
      const tmpl = makeTemplate({ id: "s1", questions: ["q1", "q2", "q3"] });
      const answers: AnswersMap = { q2: { choice: "fail" } };
      const result = buildRetryTemplateOnly(tmpl, answers);
      const remaining = result.sections.find((s) => s.id === "s1")!;
      expect(remaining.questions.map((q) => q.id)).toEqual(["q1", "q3"]);
    });

    it("preserves traversal order of failed questions across multiple sections", () => {
      const tmpl = makeTemplate(
        { id: "s1", questions: ["q1", "q2"] },
        { id: "s2", questions: ["q3", "q4"] },
      );
      const answers: AnswersMap = {
        q2: { choice: "fail" },
        q3: { choice: "no" },
      };
      const result = buildRetryTemplateOnly(tmpl, answers);
      expect(result.sections[0].questions.map((q) => q.id)).toEqual(["q2", "q3"]);
    });

    it("returns original section titles for failed questions", () => {
      const tmpl = makeTemplate(
        { id: "General", questions: ["q1", "q2"] },
        { id: "Final", questions: ["q3"] },
      );
      const result = buildRetryTemplate(tmpl, {
        q2: { choice: "fail" },
        q3: { choice: "no" },
      });

      expect(result.questionSectionMap).toEqual({
        q2: "General",
        q3: "Final",
      });
    });

    it("retains both original sections when neither becomes empty", () => {
      const tmpl = makeTemplate(
        { id: "s1", questions: ["q1", "q2"] },
        { id: "s2", questions: ["q3", "q4"] },
      );
      const answers: AnswersMap = { q1: { choice: "fail" } };
      const result = buildRetryTemplateOnly(tmpl, answers);
      // deficiency + s1 (q2 stays) + s2 (q3, q4 stay)
      expect(result.sections).toHaveLength(3);
    });
  });

  // ── Choice case sensitivity ──────────────────────────────────────────────────

  describe("choice case sensitivity", () => {
    it("treats lowercase 'fail' as a failure", () => {
      const tmpl = makeTemplate({ id: "s1", questions: ["q1"] });
      const result = buildRetryTemplateOnly(tmpl, { q1: { choice: "fail" } });
      expect(result.sections[0].id).toBe("retry-deficiencies");
    });

    it("treats lowercase 'no' as a failure", () => {
      const tmpl = makeTemplate({ id: "s1", questions: ["q1"] });
      const result = buildRetryTemplateOnly(tmpl, { q1: { choice: "no" } });
      expect(result.sections[0].id).toBe("retry-deficiencies");
    });

    it("does NOT treat uppercase 'Fail' as a failure (FormFillClient stores lowercase)", () => {
      // If this breaks, it means something changed the storage convention —
      // the test is intentionally strict to guard against that regression.
      const tmpl = makeTemplate({ id: "s1", questions: ["q1"] });
      const result = buildRetryTemplateOnly(tmpl, { q1: { choice: "Fail" } });
      expect(result).toBe(tmpl);
    });

    it("does NOT treat uppercase 'No' as a failure", () => {
      const tmpl = makeTemplate({ id: "s1", questions: ["q1"] });
      const result = buildRetryTemplateOnly(tmpl, { q1: { choice: "No" } });
      expect(result).toBe(tmpl);
    });
  });

  // ── Deficiency-array failures ────────────────────────────────────────────────

  describe("deficiency-array failure detection", () => {
    it("treats a non-empty deficiencies array as a failure regardless of choice value", () => {
      const tmpl = makeTemplate({ id: "s1", questions: ["q1"] });
      const result = buildRetryTemplateOnly(tmpl, {
        q1: {
          deficiencies: [{ description: "Crack in corner", severity: "MINOR" }],
        },
      });
      expect(result.sections[0].id).toBe("retry-deficiencies");
    });

    it("does not treat an empty deficiencies array as a failure", () => {
      const tmpl = makeTemplate({ id: "s1", questions: ["q1"] });
      const result = buildRetryTemplateOnly(tmpl, { q1: { deficiencies: [] } });
      expect(result).toBe(tmpl);
    });
  });

  // ── Section pruning ──────────────────────────────────────────────────────────

  describe("section pruning", () => {
    it("drops sections that become empty after extracting failed questions", () => {
      const tmpl = makeTemplate(
        { id: "s1", questions: ["q1"] },       // q1 fails → s1 emptied → dropped
        { id: "s2", questions: ["q2", "q3"] }, // q2/q3 pass → s2 stays
      );
      const result = buildRetryTemplateOnly(tmpl, { q1: { choice: "fail" } });
      expect(result.sections).toHaveLength(2); // deficiency + s2
      expect(result.sections[1].id).toBe("s2");
    });

    it("preserves the original template-level metadata on the returned object", () => {
      const tmpl = makeTemplate({ id: "s1", questions: ["q1"] });
      const result = buildRetryTemplateOnly(tmpl, { q1: { choice: "fail" } });
      expect(result.id).toBe(tmpl.id);
      expect(result.name).toBe(tmpl.name);
      expect(result.level).toBe(tmpl.level);
      expect(result.category).toBe(tmpl.category);
    });

    it("does not mutate the original template's sections", () => {
      const tmpl = makeTemplate({ id: "s1", questions: ["q1", "q2"] });
      const originalSectionCount = tmpl.sections.length;
      const originalQuestionCount = tmpl.sections[0].questions.length;
      buildRetryTemplate(tmpl, { q1: { choice: "fail" } });
      expect(tmpl.sections).toHaveLength(originalSectionCount);
      expect(tmpl.sections[0].questions).toHaveLength(originalQuestionCount);
    });
  });
});
