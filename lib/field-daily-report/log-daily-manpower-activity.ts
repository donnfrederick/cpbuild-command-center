import { logActivity, resolveActorName } from "@/lib/activity-logger";

export async function logFieldDailyDailyManpowerActivity(options: {
  projectId: string;
  setByUserId: string;
  reportDate: string;
  dailyManpower: number | null;
  previousDailyManpower: number | null;
}): Promise<void> {
  if (options.dailyManpower === options.previousDailyManpower) return;

  const userName = await resolveActorName(options.setByUserId);
  void logActivity(options.projectId, options.setByUserId, userName, {
    eventType: "FIELD_DAILY_DAILY_MANPOWER_SET",
    reportDate: options.reportDate,
    dailyManpower: options.dailyManpower,
    previousDailyManpower: options.previousDailyManpower,
  });
}
