import { z } from "zod";
import {
  isCustomRangeInvalid,
  resolveComparePeriodRange,
  type ComparePeriodPreset,
  type ComparePeriodState,
} from "@/lib/reports/portfolio-progress-period";

export const ComparePeriodPresetSchema = z.enum(["1w", "2w", "30d", "all", "custom"]);

export const GlobalProgressQuerySchema = z
  .object({
    preset: ComparePeriodPresetSchema.default("1w"),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.preset === "custom") {
      if (!data.from || !data.to) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "from and to are required when preset is custom",
        });
      } else if (isCustomRangeInvalid({ preset: "custom", customFrom: data.from, customTo: data.to })) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid custom date range",
        });
      }
    }
  });

export interface ResolvedCompareWindow {
  preset: ComparePeriodPreset;
  from: string;
  to: string;
  fromDate: Date;
  toDate: Date;
}

export function parseGlobalProgressQuery(
  params: Record<string, string>,
): { ok: true; value: ResolvedCompareWindow } | { ok: false; error: string } {
  const parsed = GlobalProgressQuerySchema.safeParse(params);
  if (!parsed.success) {
    return { ok: false, error: "Invalid query params" };
  }

  const preset = parsed.data.preset;
  const period: ComparePeriodState =
    preset === "custom"
      ? {
          preset: "custom",
          customFrom: parsed.data.from!,
          customTo: parsed.data.to!,
        }
      : {
          preset,
          customFrom: parsed.data.from ?? "",
          customTo: parsed.data.to ?? "",
        };

  const { from, to } = resolveComparePeriodRange(period);
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T23:59:59.999Z`);

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return { ok: false, error: "Invalid query params" };
  }

  return {
    ok: true,
    value: { preset, from, to, fromDate, toDate },
  };
}
