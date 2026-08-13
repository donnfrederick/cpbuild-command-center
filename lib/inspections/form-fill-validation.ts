import type { DeficiencySeverity } from "@/components/forms/formTypes";

/** Deficiency descriptions are optional — never highlight as a submit blocker. */
export function shouldHighlightDeficiencyDescription(_params: {
  descriptionEnabled: boolean;
  description: string;
  severity?: DeficiencySeverity;
  count?: number;
  showValidation: boolean;
}): boolean {
  return false;
}
