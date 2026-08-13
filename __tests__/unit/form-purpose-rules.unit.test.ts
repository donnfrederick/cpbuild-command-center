import { describe, expect, it } from "vitest";
import type { FormTemplate } from "@/components/forms/formTypes";
import {
  enrichSubmissionTemplateSnapshot,
  formContainsPassFailQuestions,
  isDocumentationForm,
  isDocumentationSubmission,
  responseTypesForPurpose,
  validateDocumentationFormForPublish,
} from "@/lib/forms/form-purpose-rules";

function minimalTemplate(
  overrides: Partial<FormTemplate> = {},
): FormTemplate {
  return {
    name: "Test",
    category: "OTHER",
    level: "project",
    scopeTypeCodes: [],
    formPurpose: "inspection",
    sections: [{ id: "s1", title: "", description: "", questions: [] }],
    ...overrides,
  };
}

describe("form-purpose-rules", () => {
  it("isDocumentationForm returns true for documentation purpose", () => {
    expect(isDocumentationForm(minimalTemplate({ formPurpose: "documentation" }))).toBe(true);
    expect(isDocumentationForm(minimalTemplate({ formPurpose: "inspection" }))).toBe(false);
    expect(isDocumentationForm(minimalTemplate({ formPurpose: undefined }))).toBe(false);
  });

  it("isDocumentationSubmission reads purpose from template snapshot", () => {
    expect(
      isDocumentationSubmission({
        templateSnapshot: minimalTemplate({ formPurpose: "documentation" }),
      } as never),
    ).toBe(true);
  });

  it("isDocumentationSubmission falls back to linked form purpose for legacy snapshots", () => {
    expect(
      isDocumentationSubmission({
        templateSnapshot: minimalTemplate({ formPurpose: "inspection" }),
        formPurpose: "documentation",
      } as never),
    ).toBe(true);
  });

  it("enrichSubmissionTemplateSnapshot merges linked documentation purpose", () => {
    const enriched = enrichSubmissionTemplateSnapshot(
      minimalTemplate({ formPurpose: undefined }),
      "documentation",
    );
    expect(enriched?.formPurpose).toBe("documentation");
  });

  it("responseTypesForPurpose excludes pass/fail types for documentation", () => {
    const types = responseTypesForPurpose("documentation");
    expect(types).not.toContain("PASS_FAIL");
    expect(types).not.toContain("PASS_FAIL_DEFICIENCIES");
    expect(types).toContain("YES_NO");
  });

  it("formContainsPassFailQuestions detects nested pass/fail types", () => {
    const template = minimalTemplate({
      formPurpose: "documentation",
      sections: [
        {
          id: "s1",
          title: "",
          description: "",
          questions: [
            {
              id: "q1",
              title: "Q",
              responseType: "PASS_FAIL",
              required: false,
            },
          ],
        },
      ],
    });
    expect(formContainsPassFailQuestions(template)).toBe(true);
  });

  it("validateDocumentationFormForPublish returns error key when pass/fail present", () => {
    const template = minimalTemplate({
      formPurpose: "documentation",
      sections: [
        {
          id: "s1",
          title: "",
          description: "",
          questions: [
            {
              id: "q1",
              title: "Q",
              responseType: "PASS_FAIL_DEFICIENCIES",
              required: false,
            },
          ],
        },
      ],
    });
    expect(validateDocumentationFormForPublish(template)).toBe(
      "documentationFormHasPassFailQuestions",
    );
  });

  it("validateDocumentationFormForPublish passes for YES_NO-only documentation forms", () => {
    const template = minimalTemplate({
      formPurpose: "documentation",
      sections: [
        {
          id: "s1",
          title: "",
          description: "",
          questions: [
            {
              id: "q1",
              title: "Weather ok?",
              responseType: "YES_NO",
              required: false,
            },
          ],
        },
      ],
    });
    expect(validateDocumentationFormForPublish(template)).toBeNull();
  });
});
