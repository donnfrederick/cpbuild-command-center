/**
 * Unit tests for components/projects/inspections/inspectionSummary.ts
 *
 * Pure helpers only — no mounts, no network, no DB.
 */
import { describe, it, expect } from "vitest";
import {
  countDeficiencies,
  deriveOutcome,
  ordinal,
  describeOutcome,
  describeOutcomeLong,
  outcomeColor,
  formatRelativeTime,
  latestClearInspectionSubmission,
  scopeInspectionStatusFromSubmission,
  submissionAuthoritativeForScopeInspectionStatus,
} from "@/components/projects/inspections/inspectionSummary";
import type { FormTemplate } from "@/components/forms/formTypes";
import type { InspectionSubmission } from "@/lib/inspections/submissionsApi";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_TEMPLATE: FormTemplate = {
  id: "f1",
  name: "Test Form",
  description: "",
  status: "published",
  level: "scope",
  category: "CLEAR_INSPECTION",
  scopeTypeCodes: ["CAB"],
  sections: [
    {
      id: "s1",
      title: "Section 1",
      questions: [
        {
          id: "q1",
          title: "Cabinet doors flush?",
          description: "",
          responseType: "PASS_FAIL",
          required: true,
          photoRequired: false,
          deficiencyPhotoRequired: false,
          options: [],
        },
        {
          id: "q2",
          title: "Notes",
          description: "",
          responseType: "TEXT",
          required: false,
          photoRequired: false,
          deficiencyPhotoRequired: false,
          options: [],
        },
      ],
    },
  ],
};

const BASE_SUBMISSION: InspectionSubmission = {
  id: "sub-1",
  formId: "f1",
  formVersionId: null,
  projectId: "p1",
  unitId: "u1",
  scopeRowId: "sr1",
  scopeTypeCode: "CAB",
  submittedAt: new Date().toISOString(),
  submittedBy: "Test User",
  outcome: "PASS",
  deficiencyCount: 0,
  payload: {},
  source: "FORM",
};

// ── ordinal() ─────────────────────────────────────────────────────────────────

describe("ordinal()", () => {
  it("returns st for 1, 21, 31", () => {
    expect(ordinal(1)).toBe("1st");
    expect(ordinal(21)).toBe("21st");
    expect(ordinal(31)).toBe("31st");
  });

  it("returns nd for 2, 22", () => {
    expect(ordinal(2)).toBe("2nd");
    expect(ordinal(22)).toBe("22nd");
  });

  it("returns rd for 3, 23", () => {
    expect(ordinal(3)).toBe("3rd");
    expect(ordinal(23)).toBe("23rd");
  });

  it("returns th for 4–20, 11, 12, 13 (th-exception rule)", () => {
    expect(ordinal(11)).toBe("11th");
    expect(ordinal(12)).toBe("12th");
    expect(ordinal(13)).toBe("13th");
    expect(ordinal(4)).toBe("4th");
    expect(ordinal(20)).toBe("20th");
  });
});

// ── deriveOutcome() ───────────────────────────────────────────────────────────

describe("deriveOutcome()", () => {
  it("returns PASS when all pass/fail questions are answered pass", () => {
    const answers = { q1: { choice: "pass" } };
    expect(deriveOutcome(BASE_TEMPLATE, answers)).toBe("PASS");
  });

  it("returns FAIL when any pass/fail question is answered fail", () => {
    const answers = { q1: { choice: "fail" } };
    expect(deriveOutcome(BASE_TEMPLATE, answers)).toBe("FAIL");
  });

  it("returns COMPLETE when there are no pass/fail questions", () => {
    const textOnlyTemplate: FormTemplate = {
      ...BASE_TEMPLATE,
      sections: [
        {
          id: "s1",
          title: "Section 1",
          questions: [
            {
              id: "q2",
              title: "Notes",
              description: "",
              responseType: "TEXT",
              required: false,
              photoRequired: false,
              deficiencyPhotoRequired: false,
              options: [],
            },
          ],
        },
      ],
    };
    expect(deriveOutcome(textOnlyTemplate, {})).toBe("COMPLETE");
  });

  it("treats YES_NO 'no' as a fail", () => {
    const yesNoTemplate: FormTemplate = {
      ...BASE_TEMPLATE,
      sections: [
        {
          id: "s1",
          title: "S1",
          questions: [
            {
              id: "yn",
              title: "Compliant?",
              description: "",
              responseType: "YES_NO",
              required: true,
              photoRequired: false,
              deficiencyPhotoRequired: false,
              options: [],
            },
          ],
        },
      ],
    };
    expect(deriveOutcome(yesNoTemplate, { yn: { choice: "no" } })).toBe("FAIL");
    expect(deriveOutcome(yesNoTemplate, { yn: { choice: "yes" } })).toBe("PASS");
  });

  it("returns COMPLETE for documentation forms even when YES_NO is no", () => {
    const docTemplate: FormTemplate = {
      ...BASE_TEMPLATE,
      formPurpose: "documentation",
      sections: [
        {
          id: "s1",
          title: "S1",
          questions: [
            {
              id: "yn",
              title: "Weather ok?",
              description: "",
              responseType: "YES_NO",
              required: true,
              photoRequired: false,
              deficiencyPhotoRequired: false,
              options: [],
            },
          ],
        },
      ],
    };
    expect(deriveOutcome(docTemplate, { yn: { choice: "no" } })).toBe("COMPLETE");
    expect(deriveOutcome(docTemplate, { yn: { choice: "yes" } })).toBe("COMPLETE");
  });
});

// ── countDeficiencies() ───────────────────────────────────────────────────────

describe("countDeficiencies()", () => {
  it("returns zero when no PASS_FAIL_DEFICIENCIES questions exist", () => {
    const result = countDeficiencies(BASE_TEMPLATE, {});
    expect(result.total).toBe(0);
  });

  it("counts deficiencies across severity buckets", () => {
    const defTemplate: FormTemplate = {
      ...BASE_TEMPLATE,
      sections: [
        {
          id: "s1",
          title: "S1",
          questions: [
            {
              id: "dq",
              title: "Deficiency Q",
              description: "",
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
    const answers = {
      dq: {
        choice: "fail",
        deficiencies: [
          { id: "d1", severity: "Minor" as const, description: "Scratch" },
          { id: "d2", severity: "Major" as const, description: "Gap" },
        ],
      },
    };
    const result = countDeficiencies(defTemplate, answers);
    expect(result.total).toBe(2);
    expect(result.bySeverity.Minor).toBe(1);
    expect(result.bySeverity.Major).toBe(1);
    expect(result.bySeverity.Critical).toBe(0);
  });

  it("counts deficiency occurrences when a count is provided", () => {
    const defTemplate: FormTemplate = {
      ...BASE_TEMPLATE,
      sections: [
        {
          id: "s1",
          title: "S1",
          questions: [
            {
              id: "dq",
              title: "Deficiency Q",
              description: "",
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
    const result = countDeficiencies(defTemplate, {
      dq: {
        choice: "fail",
        deficiencies: [
          { id: "d1", severity: "Minor" as const, description: "Scratch", count: 3 },
          { id: "d2", severity: "Critical" as const, description: "Missing", count: 2 },
        ],
      },
    });

    expect(result.total).toBe(5);
    expect(result.bySeverity.Minor).toBe(3);
    expect(result.bySeverity.Critical).toBe(2);
  });

  it("ignores deficiencies on a passing answer", () => {
    // Even if deficiencies are present, a pass choice should not count them
    const defTemplate: FormTemplate = {
      ...BASE_TEMPLATE,
      sections: [
        {
          id: "s1",
          title: "S1",
          questions: [
            {
              id: "dq",
              title: "Q",
              description: "",
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
    const answers = {
      dq: {
        choice: "pass",
        deficiencies: [{ id: "d1", severity: "Minor" as const, description: "X" }],
      },
    };
    expect(countDeficiencies(defTemplate, answers).total).toBe(0);
  });

  it("returns zero for documentation forms regardless of answers", () => {
    const docTemplate: FormTemplate = {
      ...BASE_TEMPLATE,
      formPurpose: "documentation",
      sections: [
        {
          id: "s1",
          title: "S1",
          questions: [
            {
              id: "dq",
              title: "Q",
              description: "",
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
    expect(
      countDeficiencies(docTemplate, {
        dq: {
          choice: "fail",
          deficiencies: [{ id: "d1", severity: "Minor" as const, description: "X" }],
        },
      }).total,
    ).toBe(0);
  });
});

// ── describeOutcome() ─────────────────────────────────────────────────────────

describe("describeOutcome()", () => {
  it("returns 'Pass' for PASS outcome without attempt number", () => {
    expect(describeOutcome({ ...BASE_SUBMISSION, outcome: "PASS" })).toBe("Pass");
  });

  it("returns 'Pass' for COMPLETE outcome", () => {
    expect(describeOutcome({ ...BASE_SUBMISSION, outcome: "COMPLETE" })).toBe("Pass");
  });

  it("returns 'Fail' for FAIL outcome", () => {
    expect(describeOutcome({ ...BASE_SUBMISSION, outcome: "FAIL" })).toBe("Fail");
  });

  it("appends ordinal when attemptNumber is supplied", () => {
    expect(describeOutcome({ ...BASE_SUBMISSION, outcome: "PASS" }, 1)).toBe("Pass · 1st");
    expect(describeOutcome({ ...BASE_SUBMISSION, outcome: "FAIL" }, 2)).toBe("Fail · 2nd");
  });
});

// ── describeOutcomeLong() ─────────────────────────────────────────────────────

describe("describeOutcomeLong()", () => {
  it("returns 'Passed' for PASS without attempt number", () => {
    expect(describeOutcomeLong({ ...BASE_SUBMISSION, outcome: "PASS" })).toBe("Passed");
  });

  it("returns 'Failed' for FAIL without attempt number", () => {
    expect(describeOutcomeLong({ ...BASE_SUBMISSION, outcome: "FAIL" })).toBe("Failed");
  });

  it("prefixes ordinal when attemptNumber is supplied", () => {
    expect(describeOutcomeLong({ ...BASE_SUBMISSION, outcome: "PASS" }, 1)).toBe("1st — Passed");
    expect(describeOutcomeLong({ ...BASE_SUBMISSION, outcome: "FAIL" }, 3)).toBe("3rd — Failed");
  });
});

// ── outcomeColor() ────────────────────────────────────────────────────────────

describe("outcomeColor()", () => {
  it("returns success color for PASS", () => {
    expect(outcomeColor("PASS")).toContain("success");
  });

  it("returns success color for COMPLETE (same as pass)", () => {
    expect(outcomeColor("COMPLETE")).toContain("success");
  });

  it("returns error color for FAIL", () => {
    expect(outcomeColor("FAIL")).toContain("error");
  });
});

// ── formatRelativeTime() ──────────────────────────────────────────────────────

describe("formatRelativeTime()", () => {
  it("returns 'just now' for timestamps less than 30s ago", () => {
    // formatRelativeTime uses Math.round(diffMs / 60000); anything that rounds to 0 → "just now"
    const recent = new Date(Date.now() - 10_000).toISOString();
    expect(formatRelativeTime(recent)).toBe("just now");
  });

  it("returns minutes-ago for timestamps 1–59 min ago", () => {
    const ago = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(formatRelativeTime(ago)).toBe("5m ago");
  });

  it("returns hours-ago for timestamps 1–23 h ago", () => {
    const ago = new Date(Date.now() - 3 * 3_600_000).toISOString();
    expect(formatRelativeTime(ago)).toBe("3h ago");
  });

  it("returns 'yesterday' for timestamps ~24 h ago", () => {
    const ago = new Date(Date.now() - 25 * 3_600_000).toISOString();
    expect(formatRelativeTime(ago)).toBe("yesterday");
  });

  it("returns days-ago for timestamps 2–6 days ago", () => {
    const ago = new Date(Date.now() - 3 * 86_400_000).toISOString();
    expect(formatRelativeTime(ago)).toBe("3d ago");
  });

  it("returns empty string for invalid ISO strings", () => {
    expect(formatRelativeTime("not-a-date")).toBe("");
  });
});

describe("submissionAuthoritativeForScopeInspectionStatus()", () => {
  const baseSub: InspectionSubmission = {
    id: "sub-1",
    formId: "form-1",
    formNameSnapshot: "Pre-install CAB",
    categorySnapshot: "PRE_INSTALL",
    level: "scope",
    projectId: "proj-1",
    unitId: "unit-1",
    scopeRowId: "row-1",
    submittedAt: "2026-05-01T12:00:00Z",
    submittedBy: "Alice",
    outcome: "PASS",
    deficiencyCount: 0,
    payload: {},
    source: "FORM",
  };

  it("returns true for CLEAR_INSPECTION form submissions", () => {
    expect(
      submissionAuthoritativeForScopeInspectionStatus({
        ...baseSub,
        categorySnapshot: "CLEAR_INSPECTION",
      }),
    ).toBe(true);
  });

  it("returns true for Procore backfill submissions", () => {
    expect(
      submissionAuthoritativeForScopeInspectionStatus({
        ...baseSub,
        source: "BACKFILL",
        categorySnapshot: "CLEAR_INSPECTION",
      }),
    ).toBe(true);
  });

  it("returns false for pre-install and calibration submissions", () => {
    expect(submissionAuthoritativeForScopeInspectionStatus(baseSub)).toBe(false);
    expect(
      submissionAuthoritativeForScopeInspectionStatus({
        ...baseSub,
        categorySnapshot: "CALIBRATION_INSPECTION",
      }),
    ).toBe(false);
  });
});

describe("latestClearInspectionSubmission()", () => {
  const baseSub: InspectionSubmission = {
    id: "sub-1",
    formId: "form-1",
    formNameSnapshot: "Pre-install CAB",
    categorySnapshot: "PRE_INSTALL",
    level: "scope",
    projectId: "proj-1",
    unitId: "unit-1",
    scopeRowId: "row-1",
    submittedAt: "2026-05-01T12:00:00Z",
    submittedBy: "Alice",
    outcome: "PASS",
    deficiencyCount: 0,
    payload: {},
    source: "FORM",
  };

  it("skips newer non-clear submissions and picks the latest clear inspection", () => {
    const clearPass: InspectionSubmission = {
      ...baseSub,
      id: "clear-1",
      categorySnapshot: "CLEAR_INSPECTION",
      submittedAt: "2026-05-01T10:00:00Z",
    };
    const preInstallPass: InspectionSubmission = {
      ...baseSub,
      id: "pre-1",
      submittedAt: "2026-05-02T12:00:00Z",
    };

    expect(latestClearInspectionSubmission([preInstallPass, clearPass])).toEqual(clearPass);
  });

  it("returns null when only non-clear submissions exist", () => {
    expect(latestClearInspectionSubmission([baseSub])).toBeNull();
  });
});

describe("scopeInspectionStatusFromSubmission()", () => {
  const baseSub: InspectionSubmission = {
    id: "sub-1",
    formId: "form-1",
    formNameSnapshot: "Clear Inspection",
    categorySnapshot: "CLEAR_INSPECTION",
    level: "scope",
    projectId: "proj-1",
    unitId: "unit-1",
    scopeRowId: "row-1",
    submittedAt: "2026-05-01T12:00:00Z",
    submittedBy: "Alice",
    outcome: "PASS",
    deficiencyCount: 0,
    payload: {},
    source: "FORM",
  };

  it("maps FAIL to FAILED and PASS/COMPLETE to PASSED", () => {
    expect(scopeInspectionStatusFromSubmission({ ...baseSub, outcome: "FAIL" })).toBe("FAILED");
    expect(scopeInspectionStatusFromSubmission({ ...baseSub, outcome: "PASS" })).toBe("PASSED");
    expect(scopeInspectionStatusFromSubmission({ ...baseSub, outcome: "COMPLETE" })).toBe("PASSED");
  });
});
