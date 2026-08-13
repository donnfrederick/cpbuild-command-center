import { describe, expect, it } from "vitest";
import { FORM_DESCRIPTION_MAX_LENGTH } from "@/lib/forms/form-api-limits";
import { z } from "zod";

const PatchDescriptionSchema = z.string().max(FORM_DESCRIPTION_MAX_LENGTH).nullable().optional();

describe("form-api-limits", () => {
  it("allows 2 Area Clear boilerplate descriptions longer than the old 500-char cap", () => {
    const longDescription = "Two area clear report boilerplate. ".repeat(40);
    expect(longDescription.length).toBeGreaterThan(500);
    expect(PatchDescriptionSchema.safeParse(longDescription).success).toBe(true);
  });

  it("rejects descriptions above the current max", () => {
    const tooLong = "x".repeat(FORM_DESCRIPTION_MAX_LENGTH + 1);
    expect(PatchDescriptionSchema.safeParse(tooLong).success).toBe(false);
  });
});
