import { describe, it, expect } from "vitest";
import {
  serializeIssueResponsibleParties,
  serializeIssuesResponsibleParties,
} from "@/lib/issues/serialize-issue-parties";

describe("serializeIssueResponsibleParties()", () => {
  it("uses tag parties when present", () => {
    const out = serializeIssueResponsibleParties({
      responsiblePartyCode: "CP_BUILD",
      responsiblePartyTags: [{ partyCode: "ELECTRICIAN" }, { partyCode: "PLUMBER" }],
    });
    expect(out.responsibleParties).toEqual(["ELECTRICIAN", "PLUMBER"]);
    expect(out.responsiblePartyCode).toBe("CP_BUILD");
  });

  it("falls back to legacy single column when tags are empty", () => {
    const out = serializeIssueResponsibleParties({
      responsiblePartyCode: "CP_BUILD",
      responsiblePartyTags: [],
    });
    expect(out.responsibleParties).toEqual(["CP_BUILD"]);
  });

  it("falls back when tags are omitted", () => {
    const out = serializeIssueResponsibleParties({
      responsiblePartyCode: "HVAC",
    });
    expect(out.responsibleParties).toEqual(["HVAC"]);
  });
});

describe("serializeIssuesResponsibleParties()", () => {
  it("serializes each issue in a list", () => {
    const out = serializeIssuesResponsibleParties([
      {
        id: "a",
        responsiblePartyCode: "CP_BUILD",
        responsiblePartyTags: [{ partyCode: "PLUMBER" }],
      },
      {
        id: "b",
        responsiblePartyCode: "ELECTRICIAN",
      },
    ]);
    expect(out[0].responsibleParties).toEqual(["PLUMBER"]);
    expect(out[1].responsibleParties).toEqual(["ELECTRICIAN"]);
  });
});
