import { describe, it, expect } from "vitest";
import { ActivityEventType } from "@prisma/client";
import { activityAlwaysExclude } from "@/lib/activity-hidden-events";
import {
  buildDefaultActivityEventVisibilityWhere,
  resolveActivityEventTypeWhere,
} from "@/lib/activity-log-list-query";

describe("buildDefaultActivityEventVisibilityWhere()", () => {
  it("excludes Location Builder UPM rows but keeps legacy subcontractor UPM rows", () => {
    const alwaysExclude = activityAlwaysExclude({ squadRole: true });
    const where = buildDefaultActivityEventVisibilityWhere(alwaysExclude);

    expect(where.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: {
            notIn: expect.arrayContaining([
              ActivityEventType.UPM_ROW_UPDATED,
              ActivityEventType.UNIT_ROW_CREATED,
            ]),
          },
        }),
        {
          eventType: ActivityEventType.UPM_ROW_UPDATED,
          metadata: {
            path: ["changedFields"],
            array_contains: "unifierSubId",
          },
        },
      ]),
    );
  });
});

describe("resolveActivityEventTypeWhere()", () => {
  it("uses legacy subcontractor visibility when no event type filter is set", () => {
    const alwaysExclude = activityAlwaysExclude({ squadRole: true });
    const { where, empty } = resolveActivityEventTypeWhere({ alwaysExclude });

    expect(empty).toBe(false);
    expect(where.OR).toBeDefined();
  });

  it("allows explicit SCOPE_SUBCONTRACTOR_UPDATED filter", () => {
    const alwaysExclude = activityAlwaysExclude({ squadRole: true });
    const { where, empty } = resolveActivityEventTypeWhere({
      alwaysExclude,
      eventTypeParam: "SCOPE_SUBCONTRACTOR_UPDATED",
    });

    expect(empty).toBe(false);
    expect(where).toEqual({
      eventType: { in: [ActivityEventType.SCOPE_SUBCONTRACTOR_UPDATED] },
    });
  });
});
