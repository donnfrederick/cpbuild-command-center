import { describe, it, expect } from "vitest";
import {
  inspectionOutcomePdfBadgeStyle,
  scopeStatusPdfBadgeStyle,
} from "@/lib/field-daily-report/pdf-export-colors";
import {
  buildIssuePdfDetailLines,
  buildObservationPdfDetailLines,
} from "@/lib/field-daily-report/pdf-export-list-details";

describe("pdf-export-colors", () => {
  it("resolves install-complete-verified badge colors with readable contrast", () => {
    const style = scopeStatusPdfBadgeStyle("INSTALL", "COMPLETE");
    expect(style).toEqual({
      backgroundColor: "#15803D",
      color: "#FFFFFF",
    });
  });

  it("resolves in-staging badge colors from scope-tile tokens", () => {
    expect(scopeStatusPdfBadgeStyle("STAGING", "IN_PROGRESS")).toEqual({
      backgroundColor: "#EBF2FF",
      color: "#0044CC",
    });
  });

  it("resolves inspection fail badge colors", () => {
    expect(inspectionOutcomePdfBadgeStyle("FAIL")).toEqual({
      backgroundColor: "#FEE2E2",
      color: "#991B1B",
    });
  });

  it("resolves inspection pass badge colors", () => {
    expect(inspectionOutcomePdfBadgeStyle("PASS")).toEqual({
      backgroundColor: "#EDFAF3",
      color: "#14532D",
    });
  });
});

describe("pdf-export-list-details", () => {
  it("builds issue detail lines from hydrated record", () => {
    const lines = buildIssuePdfDetailLines({
      id: "i1",
      issueType: "MISSING_MATERIALS",
      responsibleParty: "GC",
      isBlockingWork: false,
      status: "OPEN",
      shortDescription: "Missing sink",
      notes: "Need replacement by Friday.",
      createdAt: "",
      createdBy: { id: "u1", name: "Alex", email: "alex@example.com" },
      attachments: [],
      scopeTags: [],
      subScopeTags: [],
      _count: { comments: 0 },
    });
    expect(lines).toContain("Type: Missing Materials");
    expect(lines).toContain("Responsible: GC");
    expect(lines).toContain("Need replacement by Friday.");
  });

  it("builds observation detail lines with description and author", () => {
    const lines = buildObservationPdfDetailLines({
      id: "o1",
      observationType: "QUALITY",
      title: "Tile grout",
      description: "Grout color mismatch on north wall.",
      createdAt: "",
      author: { id: "u1", name: "Sam", email: "sam@example.com" },
      scopeTags: [],
      attachments: [],
      _count: { comments: 0 },
    });
    expect(lines).toContain("Type: Quality");
    expect(lines).toContain("Grout color mismatch on north wall.");
    expect(lines).toContain("By Sam");
  });
});
