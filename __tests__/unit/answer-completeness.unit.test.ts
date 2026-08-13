import { describe, it, expect } from "vitest";
import { findIncompleteDeficiencies } from "@/lib/inspections/answer-completeness";
import type { FormSection } from "@/components/forms/formTypes";

const SECTIONS: FormSection[] = [
  {
    id: "s1",
    title: "Section",
    questions: [
      {
        id: "q1",
        title: "Cabinet check",
        description: "",
        responseType: "PASS_FAIL_DEFICIENCIES",
        required: true,
        photoRequired: false,
        deficiencyPhotoRequired: false,
        deficiencyDescriptionEnabled: true,
        options: [],
      },
    ],
  },
];

describe("findIncompleteDeficiencies", () => {
  it("does not require a description when fail has severity only", () => {
    const incomplete = findIncompleteDeficiencies(SECTIONS, {
      q1: {
        choice: "fail",
        deficiencies: [
          {
            id: "d1",
            description: "",
            severity: "Major",
            count: 1,
          },
        ],
      },
    });
    expect(incomplete).toEqual([]);
  });

  it("still requires severity on fail", () => {
    const incomplete = findIncompleteDeficiencies(SECTIONS, {
      q1: {
        choice: "fail",
        deficiencies: [
          {
            id: "d1",
            description: "Gap at hinge",
            severity: undefined,
            count: 1,
          },
        ],
      },
    });
    expect(incomplete).toHaveLength(1);
    expect(incomplete[0]?.missingSeverity).toBe(true);
    expect(incomplete[0]?.missingDescription).toBe(false);
  });
});
