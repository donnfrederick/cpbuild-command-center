import { describe, it, expect } from "vitest";
import {
  activeFollowUpEntries,
  followUpPayloadKey,
  normalizeFormQuestion,
  parseFollowUpTriggerFromSourceId,
  shouldShowFollowUpForChoice,
} from "@/lib/forms/choice-follow-ups";
import type { FormQuestion } from "@/components/forms/formTypes";

describe("choice-follow-ups", () => {
  it("migrates failFollowUp to choiceFollowUps.fail on normalize", () => {
    const followUp: FormQuestion = {
      id: "q1__followup",
      title: "Why?",
      description: "",
      responseType: "SHORT_ANSWER",
      required: true,
      photoRequired: false,
      deficiencyPhotoRequired: false,
      options: [],
    };
    const normalized = normalizeFormQuestion({
      id: "q1",
      title: "OK?",
      description: "",
      responseType: "PASS_FAIL",
      required: true,
      photoRequired: false,
      deficiencyPhotoRequired: false,
      options: [],
      failFollowUp: followUp,
    });
    expect(normalized.choiceFollowUps?.fail?.title).toBe("Why?");
    expect(normalized.failFollowUp?.title).toBe("Why?");
  });

  it("uses legacy payload key for fail trigger", () => {
    expect(followUpPayloadKey("q1", "fail")).toBe("q1__followup");
    expect(followUpPayloadKey("q1", "yes")).toBe("q1__followup__yes");
  });

  it("parses trigger from mirrored source ids", () => {
    expect(parseFollowUpTriggerFromSourceId("q1__followup", "q1")).toBe("fail");
    expect(parseFollowUpTriggerFromSourceId("q1__followup__no", "q1")).toBe("no");
  });

  it("shows YES_NO follow-ups for matching choices only", () => {
    const question = normalizeFormQuestion({
      id: "q1",
      title: "Ready?",
      description: "",
      responseType: "YES_NO",
      required: true,
      photoRequired: false,
      deficiencyPhotoRequired: false,
      options: [],
      showNotApplicable: true,
      choiceFollowUps: {
        yes: {
          id: "q1__followup__yes",
          title: "Details",
          description: "",
          responseType: "SHORT_ANSWER",
          required: true,
          photoRequired: false,
          deficiencyPhotoRequired: false,
          options: [],
        },
      },
    });

    expect(activeFollowUpEntries(question, "yes")).toHaveLength(1);
    expect(activeFollowUpEntries(question, "no")).toHaveLength(0);
    expect(shouldShowFollowUpForChoice("YES_NO", "na", "na")).toBe(true);
  });
});
