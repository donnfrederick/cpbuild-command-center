import { describe, it, expect } from "vitest";
import type { FormTemplate } from "@/components/forms/formTypes";
import { applyClearInspectionNumberDefaults } from "@/lib/forms/clear-inspection-number-defaults";
import { isQuestionAnswered } from "@/lib/inspections/answer-completeness";

function numberQuestion(
  id: string,
  required: boolean,
  extra?: Partial<FormTemplate["sections"][0]["questions"][0]>,
) {
  return {
    id,
    title: `Quantity ${id}`,
    description: "",
    responseType: "NUMBER" as const,
    required,
    photoRequired: false,
    deficiencyPhotoRequired: false,
    options: [],
    ...extra,
  };
}

const clearTemplate = (questions: FormTemplate["sections"][0]["questions"]): FormTemplate => ({
  id: "form-1",
  name: "Clear",
  description: "",
  status: "published",
  level: "scope",
  scopeTypeCodes: ["CAB"],
  category: "CLEAR_INSPECTION",
  sections: [{ id: "s1", title: "Section", questions }],
});

describe("applyClearInspectionNumberDefaults", () => {
  it("seeds required NUMBER with 0 on CLEAR_INSPECTION", () => {
    const template = clearTemplate([numberQuestion("q1", true)]);
    const result = applyClearInspectionNumberDefaults(template, {});
    expect(result.q1).toEqual({ number: "0" });
    expect(
      isQuestionAnswered(template.sections[0].questions[0], result.q1),
    ).toBe(true);
  });

  it("leaves optional NUMBER unchanged", () => {
    const template = clearTemplate([numberQuestion("q1", false)]);
    const result = applyClearInspectionNumberDefaults(template, {});
    expect(result.q1).toBeUndefined();
  });

  it("does not change non-CLEAR_INSPECTION categories", () => {
    const template: FormTemplate = {
      ...clearTemplate([numberQuestion("q1", true)]),
      category: "TWO_AREA_CLEAR",
    };
    const result = applyClearInspectionNumberDefaults(template, {});
    expect(result.q1).toBeUndefined();
  });

  it("does not overwrite an existing number value", () => {
    const template = clearTemplate([numberQuestion("q1", true)]);
    const result = applyClearInspectionNumberDefaults(template, {
      q1: { number: "3" },
    });
    expect(result.q1?.number).toBe("3");
  });

  it("seeds required NUMBER follow-up when parent choice reveals it", () => {
    const template = clearTemplate([
      {
        id: "parent",
        title: "Any excess?",
        description: "",
        responseType: "YES_NO",
        required: true,
        photoRequired: false,
        deficiencyPhotoRequired: false,
        options: [],
        choiceFollowUps: {
          yes: numberQuestion("follow-up-id", true),
        },
      },
    ]);
    const parent = template.sections[0].questions[0];
    const payloadKey = `${parent.id}__followup__yes`;

    const withoutChoice = applyClearInspectionNumberDefaults(template, {});
    expect(withoutChoice[payloadKey]).toBeUndefined();

    const withChoice = applyClearInspectionNumberDefaults(template, {
      parent: { choice: "yes" },
    });
    expect(withChoice[payloadKey]).toEqual({ number: "0" });
  });
});
