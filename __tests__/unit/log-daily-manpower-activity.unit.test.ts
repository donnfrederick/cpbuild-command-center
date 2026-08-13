import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn(),
  resolveActorName: vi.fn(async () => "Pat Example"),
}));

import { logActivity } from "@/lib/activity-logger";
import { logFieldDailyDailyManpowerActivity } from "@/lib/field-daily-report/log-daily-manpower-activity";

describe("logFieldDailyDailyManpowerActivity()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not log when manpower is unchanged", async () => {
    await logFieldDailyDailyManpowerActivity({
      projectId: "p1",
      setByUserId: "u1",
      reportDate: "2026-07-17",
      dailyManpower: 10,
      previousDailyManpower: 10,
    });
    expect(logActivity).not.toHaveBeenCalled();
  });

  it("logs set and clear events to the project activity feed", async () => {
    await logFieldDailyDailyManpowerActivity({
      projectId: "p1",
      setByUserId: "u1",
      reportDate: "2026-07-17",
      dailyManpower: 10,
      previousDailyManpower: null,
    });

    expect(logActivity).toHaveBeenCalledWith("p1", "u1", "Pat Example", {
      eventType: "FIELD_DAILY_DAILY_MANPOWER_SET",
      reportDate: "2026-07-17",
      dailyManpower: 10,
      previousDailyManpower: null,
    });

    await logFieldDailyDailyManpowerActivity({
      projectId: "p1",
      setByUserId: "u1",
      reportDate: "2026-07-17",
      dailyManpower: null,
      previousDailyManpower: 10,
    });

    expect(logActivity).toHaveBeenLastCalledWith("p1", "u1", "Pat Example", {
      eventType: "FIELD_DAILY_DAILY_MANPOWER_SET",
      reportDate: "2026-07-17",
      dailyManpower: null,
      previousDailyManpower: 10,
    });
  });
});
