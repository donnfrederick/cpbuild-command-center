import { describe, expect, it } from "vitest";
import {
  extractInspectionAnswers,
  normalizeFormSections,
} from "@/lib/inspections/reporting-normalization";

const SECTIONS = [
  {
    id: "section-1",
    title: "Quality",
    description: "Quality checks",
    questions: [
      {
        id: "q-pass",
        title: "Overall quality",
        description: "Pass/fail check",
        responseType: "PASS_FAIL",
        required: true,
        photoRequired: false,
        deficiencyPhotoRequired: false,
        options: [],
        failFollowUp: {
          id: "q-followup",
          title: "Failure notes",
          description: "",
          responseType: "PARAGRAPH",
          required: true,
          photoRequired: false,
          deficiencyPhotoRequired: false,
          options: [],
        },
      },
      {
        id: "q-def",
        title: "Document deficiencies",
        description: "",
        responseType: "PASS_FAIL_DEFICIENCIES",
        required: true,
        photoRequired: false,
        deficiencyPhotoRequired: true,
        options: [],
      },
      {
        id: "q-check",
        title: "Completed items",
        description: "",
        responseType: "CHECKBOXES",
        required: false,
        photoRequired: false,
        deficiencyPhotoRequired: false,
        options: ["A", "B"],
      },
      {
        id: "q-number",
        title: "Moisture reading",
        description: "",
        responseType: "NUMBER",
        required: false,
        photoRequired: false,
        deficiencyPhotoRequired: false,
        options: [],
      },
      {
        id: "q-rating",
        title: "Quality rating",
        description: "",
        responseType: "RATING",
        required: false,
        photoRequired: false,
        deficiencyPhotoRequired: false,
        options: [],
      },
    ],
  },
];

describe("normalizeFormSections", () => {
  it("flattens normal questions and fail follow-ups into reportable question rows", () => {
    const sections = normalizeFormSections(SECTIONS);
    expect(sections).toHaveLength(1);
    expect(sections[0].questions.map((question) => question.sourceQuestionId)).toEqual([
      "q-pass",
      "q-pass__followup",
      "q-def",
      "q-check",
      "q-number",
      "q-rating",
    ]);
    expect(sections[0].questions[1]).toMatchObject({
      isFailFollowUp: true,
      sourceParentQuestionId: "q-pass",
      parentQuestionTitle: "Overall quality",
      responseType: "PARAGRAPH",
    });
  });

  it("flattens YES_NO choice follow-ups with triggered payload keys", () => {
    const sections = normalizeFormSections([
      {
        id: "section-1",
        title: "Daily",
        questions: [
          {
            id: "q-yesno",
            title: "On track?",
            responseType: "YES_NO",
            required: true,
            photoRequired: false,
            deficiencyPhotoRequired: false,
            options: [],
            showNotApplicable: true,
            choiceFollowUps: {
              yes: {
                id: "q-yesno__followup__yes",
                title: "What went well?",
                responseType: "SHORT_ANSWER",
                required: true,
                photoRequired: false,
                deficiencyPhotoRequired: false,
                options: [],
              },
              no: {
                id: "q-yesno__followup__no",
                title: "Blocker?",
                responseType: "SHORT_ANSWER",
                required: true,
                photoRequired: false,
                deficiencyPhotoRequired: false,
                options: [],
              },
            },
          },
        ],
      },
    ]);

    expect(sections[0]?.questions.map((q) => q.sourceQuestionId)).toEqual([
      "q-yesno",
      "q-yesno__followup__yes",
      "q-yesno__followup__no",
    ]);
  });
});

describe("extractInspectionAnswers", () => {
  it("extracts typed answer values and rollup flags for BI reporting", () => {
    const answers = extractInspectionAnswers({
      inspectionSubmissionId: "sub-1",
      formVersionId: "version-1",
      templateSnapshot: { sections: SECTIONS },
      payload: {
        "q-pass": { choice: "fail" },
        "q-pass__followup": { text: "Needs correction before closeout." },
        "q-def": {
          choice: "fail",
          deficiencies: [
            { id: "def-1", description: "Scratch", count: 2, severity: "Major" },
            { id: "def-2", description: "Gap", severity: "Minor" },
          ],
        },
        "q-check": { choices: ["A", "B"] },
        "q-number": { number: "12.5" },
        "q-rating": { rating: 4 },
      },
    });

    expect(answers).toHaveLength(6);
    expect(answers.find((answer) => answer.questionId === "q-pass")).toMatchObject({
      questionTitle: "Overall quality",
      sectionId: "section-1",
      responseType: "PASS_FAIL",
      choiceValue: "fail",
      isFailed: true,
    });
    expect(answers.find((answer) => answer.questionId === "q-pass__followup")).toMatchObject({
      isFailFollowUp: true,
      sourceParentQuestionId: "q-pass",
      textValue: "Needs correction before closeout.",
    });
    expect(answers.find((answer) => answer.questionId === "q-def")).toMatchObject({
      hasDeficiencies: true,
      deficiencyCount: 3,
    });
    expect(answers.find((answer) => answer.questionId === "q-check")?.choicesValue).toEqual(["A", "B"]);
    expect(answers.find((answer) => answer.questionId === "q-number")?.numberValue).toBe("12.5");
    expect(answers.find((answer) => answer.questionId === "q-rating")?.ratingValue).toBe(4);
  });
});

describe("replaceInspectionAnswers()", () => {
  it("throws MissingFormVersionQuestionError when formVersionId is set but question is unmapped", async () => {
    const { replaceInspectionAnswers, MissingFormVersionQuestionError } = await import(
      "@/lib/inspections/reporting-normalization"
    );

    const client = {
      inspectionFormVersionQuestion: {
        findMany: async () => [{ id: "fvq-other", sourceQuestionId: "other-q" }],
      },
      inspectionAnswer: {
        deleteMany: async () => ({ count: 0 }),
        create: async () => ({ id: "a1", questionId: "q1" }),
      },
      inspectionAnswerMedia: {
        deleteMany: async () => ({ count: 0 }),
        create: async () => ({ id: "m1" }),
      },
    };

    await expect(
      replaceInspectionAnswers(
        {
          inspectionSubmissionId: "sub-1",
          formVersionId: "ver-1",
          templateSnapshot: { sections: SECTIONS },
          payload: { "q-pass": { choice: "pass" } },
        },
        client as never
      )
    ).rejects.toBeInstanceOf(MissingFormVersionQuestionError);
  });

  it("persists answer media when capturedFiles use serverUrl after upload", async () => {
    const { replaceInspectionAnswers } = await import("@/lib/inspections/reporting-normalization");

    const createdMedia: Array<{ storageUrl: string }> = [];
    const client = {
      inspectionFormVersionQuestion: {
        findMany: async () => [{ id: "fvq-photo", sourceQuestionId: "q-photo" }],
      },
      inspectionAnswer: {
        deleteMany: async () => ({ count: 0 }),
        create: async () => ({ id: "ans-photo", questionId: "q-photo" }),
      },
      inspectionAnswerMedia: {
        deleteMany: async () => ({ count: 0 }),
        create: async (args: { data: { storageUrl: string } }) => {
          createdMedia.push({ storageUrl: args.data.storageUrl });
          return { id: "m1" };
        },
      },
    };

    await replaceInspectionAnswers(
      {
        inspectionSubmissionId: "sub-1",
        formVersionId: "ver-1",
        templateSnapshot: {
          sections: [
            {
              id: "s1",
              title: "Photos",
              questions: [
                {
                  id: "q-photo",
                  title: "Photo?",
                  responseType: "YES_NO",
                  required: false,
                  photoRequired: true,
                  deficiencyPhotoRequired: false,
                  options: [],
                },
              ],
            },
          ],
        },
        payload: {
          "q-photo": {
            choice: "yes",
            capturedFiles: [
              {
                serverUrl: "https://app.example/api/upload/field-media/file?key=abc",
                mimeType: "image/jpeg",
              },
            ],
          },
        },
      },
      client as never,
    );

    expect(createdMedia).toHaveLength(1);
    expect(createdMedia[0]?.storageUrl).toContain("abc");
  });
});
