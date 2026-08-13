import {
  resolveComparePeriodRange,
  type ComparePeriodState,
} from "@/lib/reports/portfolio-progress-period";

export function periodToCreatedAtBounds(period: ComparePeriodState): { gte?: Date; lte?: Date } {
  if (period.preset === "all") {
    return {};
  }
  const { from, to } = resolveComparePeriodRange(period);
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T23:59:59.999Z`);

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return {};
  }

  return { gte: fromDate, lte: toDate };
}
