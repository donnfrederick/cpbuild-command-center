import { describe, it, expect, vi } from "vitest";
import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DeficiencyCapture,
  newDeficiency,
} from "@/components/forms/FormFillClient";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (values && "n" in values) return `${key}:${values.n}`;
    if (values && "count" in values) return `${key}:${values.count}`;
    return key;
  },
}));

vi.mock("@/components/media/CameraCapture", () => ({
  CameraCapture: () => null,
}));

function renderCapture(
  props: Partial<ComponentProps<typeof DeficiencyCapture>> = {},
) {
  const deficiencies = props.deficiencies ?? [newDeficiency()];
  const onChange = props.onChange ?? vi.fn();
  render(
    <DeficiencyCapture
      deficiencies={deficiencies}
      onChange={onChange}
      showValidation={false}
      descriptionEnabled={false}
      photoRequired={false}
      {...props}
    />,
  );
  return { onChange };
}

describe("DeficiencyCapture allowAdditionalEntries", () => {
  it("omits add-another when allowAdditionalEntries is omitted (default off)", () => {
    renderCapture();
    expect(
      screen.queryByRole("button", { name: /addAnotherDeficiency/i }),
    ).not.toBeInTheDocument();
  });

  it("shows add-another when allowAdditionalEntries is true", () => {
    renderCapture({ allowAdditionalEntries: true });
    expect(
      screen.getByRole("button", { name: /addAnotherDeficiency/i }),
    ).toBeInTheDocument();
  });

  it("appends a deficiency row when add-another is clicked after severity is set", async () => {
    const user = userEvent.setup();
    const first = { ...newDeficiency(), severity: "Minor" as const };
    const onChange = vi.fn();
    renderCapture({
      allowAdditionalEntries: true,
      deficiencies: [first],
      onChange,
    });

    await user.click(
      screen.getByRole("button", { name: /addAnotherDeficiency/i }),
    );

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as typeof first[];
    expect(next).toHaveLength(2);
    expect(next[0].id).toBe(first.id);
    expect(next[1].id).not.toBe(first.id);
  });

  it("hides remove buttons when allowAdditionalEntries is false even with multiple rows", () => {
    const rows = [
      { ...newDeficiency(), severity: "Minor" as const },
      { ...newDeficiency(), severity: "Major" as const },
    ];
    renderCapture({
      allowAdditionalEntries: false,
      deficiencies: rows,
    });

    expect(
      screen.queryByRole("button", { name: /removeDeficiency/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("deficiencyLabel:1")).toBeInTheDocument();
    expect(screen.getByText("deficiencyLabel:2")).toBeInTheDocument();
  });

  it("shows remove buttons when allowAdditionalEntries is true and multiple rows exist", () => {
    const rows = [
      { ...newDeficiency(), severity: "Minor" as const },
      { ...newDeficiency(), severity: "Major" as const },
    ];
    renderCapture({
      allowAdditionalEntries: true,
      deficiencies: rows,
    });

    expect(screen.getAllByRole("button", { name: /removeDeficiency/i })).toHaveLength(
      2,
    );
  });
});
