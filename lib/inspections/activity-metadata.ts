interface InspectionDeficiencyMetrics {
  failedQuestionCount: number;
  totalDeficiencyCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function wholeNumberOrDefault(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.trunc(value));
}

export function getInspectionDeficiencyMetrics(payload: unknown): InspectionDeficiencyMetrics {
  if (!isRecord(payload)) {
    return { failedQuestionCount: 0, totalDeficiencyCount: 0 };
  }

  let failedQuestionCount = 0;
  let totalDeficiencyCount = 0;

  for (const answer of Object.values(payload)) {
    if (!isRecord(answer)) continue;

    const choice = typeof answer.choice === "string" ? answer.choice.toLowerCase() : "";
    const isFailed = choice === "fail" || choice === "no";
    if (!isFailed) continue;

    failedQuestionCount += 1;
    if (!Array.isArray(answer.deficiencies)) continue;

    for (const deficiency of answer.deficiencies) {
      if (!isRecord(deficiency)) continue;
      totalDeficiencyCount += wholeNumberOrDefault(deficiency.count, 1);
    }
  }

  return { failedQuestionCount, totalDeficiencyCount };
}
