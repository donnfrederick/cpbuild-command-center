import { describe, it, expect } from "vitest";
import { ActivityEventType } from "@prisma/client";

/** Admin / test-sandbox events that must render in activity UIs without crashing. */
const ADMIN_ACTIVITY_EVENT_TYPES: ActivityEventType[] = [
  "PROJECT_CLONED_AS_TEST",
  "PROJECT_TEST_DATA_SEEDED",
  "PROJECT_TEST_DATA_BATCH_REMOVED",
];

describe("admin activity event types", () => {
  it("includes all test-sandbox activity enum values used by seeding and clone flows", () => {
    for (const type of ADMIN_ACTIVITY_EVENT_TYPES) {
      expect(Object.values(ActivityEventType)).toContain(type);
    }
  });
});
