export type SheetSyncFeedbackVariant = "syncing" | "success" | "error";

export interface SheetSyncFeedback {
  variant: SheetSyncFeedbackVariant;
  title: string;
  description?: string;
}

export function sheetSyncFeedbackColors(variant: SheetSyncFeedbackVariant): {
  background: string;
  color: string;
  border: string;
} {
  switch (variant) {
    case "success":
      return {
        background: "var(--success-50, var(--control-bg))",
        color: "var(--success-700, var(--color-text-primary))",
        border: "1px solid var(--success-200, var(--color-divider))",
      };
    case "error":
      return {
        background: "var(--error-50, var(--control-bg))",
        color: "var(--error-700, var(--color-text-primary))",
        border: "1px solid var(--error-200, var(--color-divider))",
      };
    default:
      return {
        background: "var(--control-bg)",
        color: "var(--color-text-secondary)",
        border: "1px solid var(--color-divider)",
      };
  }
}
