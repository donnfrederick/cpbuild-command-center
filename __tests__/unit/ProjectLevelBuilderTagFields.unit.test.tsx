import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ProjectLevelBuilderTagFields } from "@/components/projects/ProjectLevelBuilderTagFields";

vi.mock("@/hooks/use-location-builder-tag-options", () => ({
  useLocationBuilderTagOptions: vi.fn(),
}));

import { useLocationBuilderTagOptions } from "@/hooks/use-location-builder-tag-options";

const messages = {
  units: {
    projectLevelBuildPhaseTagLabel: "Build phase",
    projectLevelAreaTagLabel: "Area",
    projectLevelTagOptional: "optional",
    projectLevelNoProjectDefinedAreas: "No project defined areas.",
    projectLevelAreaReferenceInputLabel: "Add a manual area reference note",
    projectLevelAreaReferenceDisclaimer:
      "This reference label is for this note only — it won't add an area to the project.",
    projectLevelAreaReferencePlaceholder: "e.g. North parking, GC staging",
  },
};

function renderFields(
  props: Partial<React.ComponentProps<typeof ProjectLevelBuilderTagFields>> = {},
) {
  const onChangeBuildPhaseTag = vi.fn();
  const onChangeAreaTag = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ProjectLevelBuilderTagFields
        projectId="proj-1"
        buildPhaseTag=""
        areaTag=""
        onChangeBuildPhaseTag={onChangeBuildPhaseTag}
        onChangeAreaTag={onChangeAreaTag}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return { onChangeBuildPhaseTag, onChangeAreaTag };
}

describe("ProjectLevelBuilderTagFields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useLocationBuilderTagOptions).mockReturnValue({
      options: { buildPhases: ["1"], areas: [] },
      loading: false,
      error: null,
    });
  });

  it("shows an area reference input with helper text when no areas are defined", () => {
    renderFields();

    expect(screen.getByText("Area")).toBeInTheDocument();
    expect(screen.getByText("No project defined areas.")).toBeInTheDocument();
    expect(screen.getByText("Add a manual area reference note")).toBeInTheDocument();
    expect(
      screen.getByText(/for this note only — it won't add an area to the project/i),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g. North parking, GC staging")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1" })).toBeInTheDocument();
  });

  it("allows typing a manual area reference when no areas are defined", () => {
    const { onChangeAreaTag } = renderFields();

    fireEvent.change(screen.getByPlaceholderText("e.g. North parking, GC staging"), {
      target: { value: "GC staging" },
    });

    expect(onChangeAreaTag).toHaveBeenCalledWith("GC staging");
  });

  it("shows only the area reference field when neither dimension has pills", () => {
    vi.mocked(useLocationBuilderTagOptions).mockReturnValue({
      options: { buildPhases: [], areas: [] },
      loading: false,
      error: null,
    });

    renderFields();

    expect(screen.getByText("Area")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g. North parking, GC staging")).toBeInTheDocument();
    expect(screen.queryByText("Build phase")).not.toBeInTheDocument();
  });

  it("shows tappable area pills when areas are defined", () => {
    vi.mocked(useLocationBuilderTagOptions).mockReturnValue({
      options: { buildPhases: ["1"], areas: ["Lobby", "North wing"] },
      loading: false,
      error: null,
    });

    const { onChangeAreaTag } = renderFields();

    expect(screen.getByRole("button", { name: "Lobby" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "North wing" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("e.g. North parking, GC staging")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Lobby" }));
    expect(onChangeAreaTag).toHaveBeenCalledWith("Lobby");
  });

  it("selects a predefined build phase from a chip", () => {
    const { onChangeBuildPhaseTag } = renderFields();

    fireEvent.click(screen.getByRole("button", { name: "1" }));
    expect(onChangeBuildPhaseTag).toHaveBeenCalledWith("1");
  });
});
