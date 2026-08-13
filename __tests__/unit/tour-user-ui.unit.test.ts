import { describe, expect, it } from "vitest";
import { TOUR_USER_UI_ENABLED } from "@/lib/tour-user-ui";

describe("TOUR_USER_UI_ENABLED", () => {
  it("is disabled until production tours are maintained again", () => {
    expect(TOUR_USER_UI_ENABLED).toBe(false);
  });
});
