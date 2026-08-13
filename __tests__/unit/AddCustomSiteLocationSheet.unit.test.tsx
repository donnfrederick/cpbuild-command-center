import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { AddCustomSiteLocationSheet } from "@/components/projects/AddCustomSiteLocationSheet";

const customSiteMessages = {
  addTitle: "Add custom site location",
  close: "Close",
  nameLabel: "Area name",
  namePlaceholder: "e.g. Parking lot",
  placementLabel: "Placement",
  placementOption_standalone: "Standalone (outside any building)",
  placementOption_building: "Under an existing building",
  placementOption_building_level: "Under a building and level",
  placementOption_building_scoped: "Custom Locations (this building)",
  placementOption_building_level_scoped: "Under a level in this building",
  buildingLabel: "Building",
  selectBuilding: "Select building…",
  levelLabel: "Level",
  selectLevel: "Select level…",
  saving: "Saving…",
  save: "Add location",
};

function renderSheet(
  props: Partial<Parameters<typeof AddCustomSiteLocationSheet>[0]> = {},
) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ units: { customSite: customSiteMessages } }}>
      <AddCustomSiteLocationSheet
        buildingOptions={["1", "2"]}
        levelOptions={["1|2", "1|3"]}
        onClose={() => {}}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe("AddCustomSiteLocationSheet", () => {
  it("shows all placement options when building is not locked", () => {
    renderSheet();
    expect(screen.getByLabelText("Standalone (outside any building)")).toBeInTheDocument();
    expect(screen.getByLabelText("Under an existing building")).toBeInTheDocument();
    expect(screen.getByLabelText("Under a building and level")).toBeInTheDocument();
  });

  it("locks building and hides standalone when opened from a building strip", () => {
    renderSheet({ lockedBuilding: "1" });
    expect(screen.queryByLabelText("Standalone (outside any building)")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Custom Locations (this building)")).toBeChecked();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Select building…" })).not.toBeInTheDocument();
  });

  it("submits with the locked building even if placement is building-wide", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderSheet({ lockedBuilding: "1", onSubmit });

    await user.type(screen.getByPlaceholderText("e.g. Parking lot"), "Parking lot");
    await user.click(screen.getByRole("button", { name: "Add location" }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Parking lot",
      placement: "building",
      building: "1",
      level: "",
    });
  });

  it("locks building and level when opened from a level grid add tile", () => {
    renderSheet({ lockedBuilding: "1", lockedLevel: "2" });
    expect(screen.queryByText("Placement")).not.toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("submits with locked building and level from level context", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderSheet({ lockedBuilding: "1", lockedLevel: "2", onSubmit });

    await user.type(screen.getByPlaceholderText("e.g. Parking lot"), "Roof deck");
    await user.click(screen.getByRole("button", { name: "Add location" }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Roof deck",
      placement: "building_level",
      building: "1",
      level: "2",
    });
  });
});
