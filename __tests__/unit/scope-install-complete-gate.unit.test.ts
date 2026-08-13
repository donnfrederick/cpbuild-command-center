import { describe, it, expect } from "vitest";
import {
  isInstallCompleteCombinedOptionKey,
  isInstallCompleteVerifiedCombinedOptionKey,
} from "@/lib/scope-combined-options";
import {
  isTransitionToInstallCompleteScope,
  isTransitionToInstallCompleteVerifiedScope,
  scopeRowHasOpenBlockingIssueForInstallComplete,
  statusPickRequiresSubcontractorAssignment,
} from "@/lib/scope-install-complete-gate";

describe("isInstallCompleteCombinedOptionKey()", () => {
  it("includes verified and unverified install complete keys", () => {
    expect(isInstallCompleteCombinedOptionKey("install_complete")).toBe(true);
    expect(isInstallCompleteCombinedOptionKey("install_complete_sub")).toBe(true);
    expect(isInstallCompleteCombinedOptionKey("install_progress")).toBe(false);
  });
});

describe("isInstallCompleteVerifiedCombinedOptionKey()", () => {
  it("includes only verified install complete key", () => {
    expect(isInstallCompleteVerifiedCombinedOptionKey("install_complete")).toBe(true);
    expect(isInstallCompleteVerifiedCombinedOptionKey("install_complete_sub")).toBe(false);
  });
});

describe("isTransitionToInstallCompleteVerifiedScope()", () => {
  it("returns true when moving to INSTALL+COMPLETE from in progress", () => {
    expect(
      isTransitionToInstallCompleteVerifiedScope(
        "INSTALL",
        "IN_PROGRESS",
        "INSTALL",
        "COMPLETE",
      ),
    ).toBe(true);
  });

  it("returns false for unverified install complete", () => {
    expect(
      isTransitionToInstallCompleteVerifiedScope(
        "INSTALL",
        "IN_PROGRESS",
        "INSTALL",
        "PENDING_VERIFICATION",
      ),
    ).toBe(false);
  });
});

describe("statusPickRequiresSubcontractorAssignment()", () => {
  it("requires subcontractor in the photo prompt for verified complete without an assigned sub", () => {
    expect(
      statusPickRequiresSubcontractorAssignment(
        null,
        "INSTALL",
        "IN_PROGRESS",
        { scopeStage: "INSTALL", scopeStatus: "COMPLETE" },
      ),
    ).toBe(true);
  });

  it("does not require subcontractor when scope already has one", () => {
    expect(
      statusPickRequiresSubcontractorAssignment(
        "sub-1",
        "INSTALL",
        "IN_PROGRESS",
        { scopeStage: "INSTALL", scopeStatus: "COMPLETE" },
      ),
    ).toBe(false);
  });

  it("does not require subcontractor for unverified install complete", () => {
    expect(
      statusPickRequiresSubcontractorAssignment(
        null,
        "INSTALL",
        "IN_PROGRESS",
        { scopeStage: "INSTALL", scopeStatus: "PENDING_VERIFICATION" },
      ),
    ).toBe(false);
  });
});

describe("isTransitionToInstallCompleteScope()", () => {
  it("returns true when moving to PENDING_VERIFICATION from in progress", () => {
    expect(
      isTransitionToInstallCompleteScope(
        "INSTALL",
        "IN_PROGRESS",
        "INSTALL",
        "PENDING_VERIFICATION",
      ),
    ).toBe(true);
  });

  it("returns false when already install complete", () => {
    expect(
      isTransitionToInstallCompleteScope(
        "INSTALL",
        "PENDING_VERIFICATION",
        "INSTALL",
        "COMPLETE",
      ),
    ).toBe(false);
  });
});

describe("scopeRowHasOpenBlockingIssueForInstallComplete()", () => {
  it("returns true when an open blocking issue tags the row", () => {
    const blocked = scopeRowHasOpenBlockingIssueForInstallComplete(
      [
        {
          status: "OPEN",
          isBlockingWork: true,
          scopeTags: [{ row: { id: "row-1" } }],
        },
      ],
      "row-1",
    );
    expect(blocked).toBe(true);
  });

  it("returns false for resolved blocking issues", () => {
    const blocked = scopeRowHasOpenBlockingIssueForInstallComplete(
      [
        {
          status: "RESOLVED",
          isBlockingWork: true,
          scopeTags: [{ row: { id: "row-1" } }],
        },
      ],
      "row-1",
    );
    expect(blocked).toBe(false);
  });
});
