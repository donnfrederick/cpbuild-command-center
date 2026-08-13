import { describe, expect, it } from "vitest";
import {
  serializeIssueForApiClient,
  serializeIssueRow,
  serializeIssuesForApiClient,
} from "@/lib/issues/issue-api";

describe("serializeIssueRow", () => {
  it("maps issueTypeCode and responsiblePartyCode to client aliases", () => {
    const row = {
      id: "issue-1",
      issueTypeCode: "DAMAGED_MATERIALS",
      responsiblePartyCode: "CP_BUILD",
    };
    const serialized = serializeIssueRow(row);
    expect(serialized.issueType).toBe("DAMAGED_MATERIALS");
    expect(serialized.responsibleParty).toBe("CP_BUILD");
    expect(serialized.issueTypeCode).toBe("DAMAGED_MATERIALS");
  });
});

describe("serializeIssuesForApiClient", () => {
  it("adds issueType, responsibleParty, and responsibleParties on list rows", () => {
    const [serialized] = serializeIssuesForApiClient([
      {
        id: "issue-1",
        issueTypeCode: "OTHER",
        responsiblePartyCode: "PLUMBER",
        responsiblePartyTags: [{ partyCode: "PLUMBER" }, { partyCode: "CP_BUILD" }],
      },
    ]);
    expect(serialized.issueType).toBe("OTHER");
    expect(serialized.responsibleParty).toBe("PLUMBER");
    expect(serialized.responsibleParties).toEqual(["PLUMBER", "CP_BUILD"]);
  });
});

describe("serializeIssueForApiClient", () => {
  it("serializes a single issue for detail/create responses", () => {
    const serialized = serializeIssueForApiClient({
      id: "issue-2",
      issueTypeCode: "MISSING_MATERIALS",
      responsiblePartyCode: "CP_BUILD",
      responsiblePartyTags: [],
    });
    expect(serialized.issueType).toBe("MISSING_MATERIALS");
    expect(serialized.responsibleParty).toBe("CP_BUILD");
    expect(serialized.responsibleParties).toEqual(["CP_BUILD"]);
  });
});
