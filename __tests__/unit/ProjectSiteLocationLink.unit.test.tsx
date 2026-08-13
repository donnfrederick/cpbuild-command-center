import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { ProjectSiteLocationLink } from "@/components/projects/ProjectSiteLocationLink";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { address?: string }) =>
    key === "openAddressInMapsAria" && values?.address
      ? `Open ${values.address} in Google Maps`
      : key,
}));

describe("ProjectSiteLocationLink", () => {
  it("renders an external map link for a non-empty address", () => {
    render(<ProjectSiteLocationLink siteLocation="123 Main St" />);
    const link = screen.getByRole("link", { name: "Open 123 Main St in Google Maps" });
    expect(link).toHaveAttribute("href", expect.stringContaining("google.com/maps"));
    expect(link).toHaveAttribute("href", expect.stringContaining(encodeURIComponent("123 Main St")));
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders plain text when address is empty", () => {
    render(<ProjectSiteLocationLink siteLocation="" />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("does not bubble clicks when wrapped in a stopPropagation row (mobile card pattern)", () => {
    const onParent = vi.fn();
    render(
      <div onClick={onParent}>
        <div onClick={(e) => e.stopPropagation()}>
          <ProjectSiteLocationLink siteLocation="Downtown" />
        </div>
      </div>
    );
    fireEvent.click(screen.getByRole("link"));
    expect(onParent).not.toHaveBeenCalled();
  });
});
