import { describe, expect, it } from "vitest";
import { AUTO_MEDIA_KEY, AUTO_NOTES_KEY } from "@/components/forms/formTypes";
import {
  extractInspectionAutoAppendix,
  mergeInspectionAutoAppendix,
} from "@/lib/inspections/inspection-auto-appendix";
import { formatInspectionPdfCoverMeta } from "@/lib/pdf/inspection-submission-pdf";
import { buildInspectionRecordBodyInner } from "@/lib/pdf/inspection-submission-pdf";
import type { FormTemplate } from "@/components/forms/formTypes";

describe("extractInspectionAutoAppendix", () => {
  it("pulls only auto notes and media keys from payload", () => {
    const appendix = extractInspectionAutoAppendix({
      "q-1": { choice: "yes" },
      [AUTO_NOTES_KEY]: { text: "Site note" },
      [AUTO_MEDIA_KEY]: { capturedFiles: [{ serverUrl: "https://x/a.jpg" }] },
    });
    expect(Object.keys(appendix)).toEqual([AUTO_NOTES_KEY, AUTO_MEDIA_KEY]);
    expect(appendix[AUTO_NOTES_KEY]).toEqual({ text: "Site note" });
  });
});

describe("mergeInspectionAutoAppendix", () => {
  it("merges appendix into relational payload", () => {
    const merged = mergeInspectionAutoAppendix(
      { "q-1": { choice: "no" } },
      { [AUTO_MEDIA_KEY]: { capturedFiles: [] } },
    );
    expect(merged["q-1"]).toEqual({ choice: "no" });
    expect(merged[AUTO_MEDIA_KEY]).toEqual({ capturedFiles: [] });
  });
});

describe("formatInspectionPdfCoverMeta", () => {
  const submittedAt = new Date("2026-06-18T14:51:00.000Z");

  it("hides Other category for documentation daily updates", () => {
    const template = {
      id: "f1",
      name: "Daily Update",
      category: "OTHER",
      formPurpose: "DOCUMENTATION",
      sections: [],
    } as FormTemplate;

    const meta = formatInspectionPdfCoverMeta(template, submittedAt);
    expect(meta.showCategory).toBe(false);
    expect(meta.categoryLabel).toBeNull();
    expect(meta.dateTimeLine).toMatch(/Jun 18, 2026/);
  });

  it("shows category for formal clear inspections", () => {
    const template = {
      id: "f2",
      name: "Clear",
      category: "CLEAR_INSPECTION",
      sections: [],
    } as FormTemplate;

    const meta = formatInspectionPdfCoverMeta(template, submittedAt);
    expect(meta.showCategory).toBe(true);
    expect(meta.categoryLabel).toBe("Clear Inspection");
  });
});

describe("buildInspectionRecordBodyInner", () => {
  it("embeds question photos when capturedFiles use serverUrl without mimeType", () => {
    const template: FormTemplate = {
      id: "form-1",
      name: "Daily Update",
      description: "",
      status: "published",
      level: "project",
      scopeTypeCodes: [],
      category: "OTHER",
      formPurpose: "documentation",
      sections: [
        {
          id: "s1",
          title: "Section 1",
          description: "",
          questions: [
            {
              id: "q-photo",
              title: "Photo?",
              responseType: "YES_NO",
              required: true,
              photoRequired: true,
              deficiencyPhotoRequired: false,
              options: [],
            },
          ],
        },
      ],
    };

    const storageUrl =
      "http://localhost:3002/api/upload/field-media/file?key=field-media%2Finspections%2Fphoto.jpg";
    const cache = new Map<string, string | null>([
      ["field-media/inspections/photo.jpg", "data:image/jpeg;base64,ZmFrZQ=="],
    ]);

    const html = buildInspectionRecordBodyInner(
      template,
      {
        "q-photo": {
          choice: "no",
          capturedFiles: [{ serverUrl: storageUrl }],
        },
      },
      cache,
    );

    expect(html).toContain('class="photo-grid"');
    expect(html).toContain("<img src=\"data:image/jpeg;base64,ZmFrZQ==\"");
  });

  it("renders YES_NO follow-up answers and photos under the If no branch", () => {
    const template: FormTemplate = {
      id: "form-1",
      name: "Daily Update",
      description: "",
      status: "published",
      level: "project",
      scopeTypeCodes: [],
      category: "OTHER",
      formPurpose: "documentation",
      sections: [
        {
          id: "s1",
          title: "Section 1",
          description: "",
          questions: [
            {
              id: "q-yesno",
              title: "On track?",
              responseType: "YES_NO",
              required: true,
              photoRequired: false,
              deficiencyPhotoRequired: false,
              options: [],
              choiceFollowUps: {
                no: {
                  id: "q-yesno__followup__no",
                  title: "How does that make you feel?",
                  responseType: "SHORT_ANSWER",
                  required: true,
                  photoRequired: true,
                  deficiencyPhotoRequired: false,
                  options: [],
                },
              },
            },
          ],
        },
      ],
    };

    const storageUrl =
      "http://localhost:3002/api/upload/field-media/file?key=field-media%2Finspections%2Ffeel.jpg";
    const cache = new Map<string, string | null>([
      ["field-media/inspections/feel.jpg", "data:image/jpeg;base64,ZmFrZQ=="],
    ]);

    const html = buildInspectionRecordBodyInner(
      template,
      {
        "q-yesno": { choice: "no" },
        "q-yesno__followup__no": {
          text: "another test",
          capturedFiles: [{ serverUrl: storageUrl }],
        },
      },
      cache,
    );

    expect(html).toContain("If no");
    expect(html).toContain("How does that make you feel?");
    expect(html).toContain("another test");
    expect(html).toContain("<img src=\"data:image/jpeg;base64,ZmFrZQ==\"");
  });

  it("renders optional per-question comments when present in payload", () => {
    const template: FormTemplate = {
      id: "form-1",
      name: "Cabinet verification",
      description: "",
      status: "published",
      level: "scope",
      scopeTypeCodes: ["CAB"],
      category: "CLEAR_INSPECTION",
      sections: [
        {
          id: "s1",
          title: "Items",
          description: "",
          questions: [
            {
              id: "q1",
              title: "Doors aligned?",
              responseType: "PASS_FAIL",
              required: true,
              photoRequired: false,
              deficiencyPhotoRequired: false,
              commentsEnabled: true,
              options: [],
            },
          ],
        },
      ],
    };

    const html = buildInspectionRecordBodyInner(
      template,
      {
        q1: {
          choice: "fail",
          comment: "Left hinge gap too wide",
        },
      },
      new Map(),
    );

    expect(html).toContain("Comment:");
    expect(html).toContain("Left hinge gap too wide");
  });

  it("omits pass items when shareOnlyFailedItems is enabled", () => {
    const template: FormTemplate = {
      id: "form-1",
      name: "Field verification",
      description: "",
      status: "published",
      level: "scope",
      scopeTypeCodes: ["CAB"],
      category: "FIELD_VERIFICATION",
      sections: [
        {
          id: "s1",
          title: "Items",
          description: "",
          questions: [
            {
              id: "q-pass",
              title: "Doors aligned?",
              responseType: "PASS_FAIL",
              required: true,
              photoRequired: false,
              deficiencyPhotoRequired: false,
              options: [],
            },
            {
              id: "q-fail",
              title: "Hardware installed?",
              responseType: "PASS_FAIL",
              required: true,
              photoRequired: false,
              deficiencyPhotoRequired: false,
              options: [],
            },
          ],
        },
      ],
    };

    const html = buildInspectionRecordBodyInner(
      template,
      {
        "q-pass": { choice: "pass" },
        "q-fail": { choice: "fail", comment: "Missing pull" },
      },
      new Map(),
      { shareOnlyFailedItems: true },
    );

    expect(html).not.toContain("Doors aligned?");
    expect(html).toContain("Hardware installed?");
    expect(html).toContain("Missing pull");
  });

  it("shows empty message when shareOnlyFailedItems filters everything out", () => {
    const template: FormTemplate = {
      id: "form-1",
      name: "Clear",
      description: "",
      status: "published",
      level: "scope",
      scopeTypeCodes: ["CAB"],
      category: "CLEAR_INSPECTION",
      sections: [
        {
          id: "s1",
          title: "Items",
          description: "",
          questions: [
            {
              id: "q1",
              title: "OK?",
              responseType: "PASS_FAIL",
              required: true,
              photoRequired: false,
              deficiencyPhotoRequired: false,
              options: [],
            },
          ],
        },
      ],
    };

    const html = buildInspectionRecordBodyInner(
      template,
      { q1: { choice: "pass" } },
      new Map(),
      { shareOnlyFailedItems: true },
    );

    expect(html).toContain("No failed items in this record.");
  });

  it("renders N/A for PASS_FAIL_DEFICIENCIES instead of Fail", () => {
    const template: FormTemplate = {
      id: "form-fv",
      name: "Field verification",
      description: "",
      status: "published",
      level: "scope",
      scopeTypeCodes: ["CAB"],
      category: "FIELD_VERIFICATION",
      sections: [
        {
          id: "s3",
          title: "Electrical/Gas",
          description: "",
          questions: [
            {
              id: "q-gas",
              title: "Gas lines (if applicable) fall within Appliance Locations",
              responseType: "PASS_FAIL_DEFICIENCIES",
              required: true,
              photoRequired: false,
              deficiencyPhotoRequired: false,
              options: [],
            },
          ],
        },
      ],
    };

    const html = buildInspectionRecordBodyInner(
      template,
      { "q-gas": { choice: "na" } },
      new Map(),
    );

    expect(html).toContain("N/A");
    expect(html).not.toMatch(/>\s*Fail\s*</);
  });
});
