import { describe, expect, it } from "vitest";
import { toDailyManpowerMetaDto } from "@/lib/field-daily-report/daily-manpower-meta";

describe("toDailyManpowerMetaDto()", () => {
  const author = {
    id: "user-1",
    name: "Pat Example",
    email: "pat@example.com",
    role: { code: "ADMIN" },
  };

  it("returns null when daily manpower is unset", () => {
    expect(
      toDailyManpowerMetaDto(
        { dailyManpower: null, dailyManpowerSetAt: new Date(), dailyManpowerSetBy: author },
        null,
      ),
    ).toBeNull();
  });

  it("returns null when audit fields are missing (legacy rows)", () => {
    expect(
      toDailyManpowerMetaDto(
        { dailyManpower: 8, dailyManpowerSetAt: null, dailyManpowerSetBy: null },
        null,
      ),
    ).toBeNull();
  });

  it("maps author and timestamp when manpower is set", () => {
    const setAt = new Date("2026-07-14T15:00:00.000Z");
    expect(
      toDailyManpowerMetaDto(
        { dailyManpower: 8, dailyManpowerSetAt: setAt, dailyManpowerSetBy: author },
        "user-1",
      ),
    ).toEqual({
      setAt: setAt.toISOString(),
      setBy: {
        id: "user-1",
        name: "Pat Example",
        roleCode: "ADMIN",
        isInstallManager: true,
      },
    });
  });
});
