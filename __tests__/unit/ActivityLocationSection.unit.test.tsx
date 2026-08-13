import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ActivityLocationSection } from "@/components/shared/ActivityLocationSection";
import en from "@/messages/en.json";

function renderSection(activityLocation?: Parameters<typeof ActivityLocationSection>[0]["activityLocation"]) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ActivityLocationSection activityLocation={activityLocation} />
    </NextIntlClientProvider>,
  );
}

describe("ActivityLocationSection", () => {
  it("shows pre-dates GPS tracking for legacy outcome", () => {
    renderSection({ outcome: "legacy" });
    expect(screen.getByText("Pre-dates GPS tracking")).toBeInTheDocument();
  });

  it("shows distance when on_map with meters", () => {
    renderSection({
      outcome: "on_map",
      latitude: 40.1234,
      longitude: -105.5678,
      distanceFromProjectMeters: 100,
    });
    expect(screen.getByText(/328 ft from project/)).toBeInTheDocument();
  });
});
