import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { CustomSiteLocationTile } from "@/components/projects/CustomSiteLocationTile";
import {
  CUSTOM_SITE_TILE_HEIGHT,
  CUSTOM_SITE_TILE_TITLE_BLOCK_HEIGHT,
} from "@/components/projects/customSiteLocationTileStyle";
import type { CustomSiteLocation } from "@/lib/custom-site-locations";

const BASE: CustomSiteLocation = {
  id: "loc-1",
  projectId: "proj-1",
  name: "Short",
  building: "1",
  level: "2",
  placement: "building_level",
  sortOrder: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  createdBy: { id: "user-1", name: "Hannah" },
  unitRef: "@custom|loc-1|Short",
  observationCount: 0,
  issueCount: 0,
};

const MESSAGES = {
  units: {
    customSite: {
      counts:
        "{observations, plural, =0 {} other {{observations} obs · }}{issues, plural, =0 {No field notes yet} one {# issue} other {# issues}}",
      editAria: "Edit {name}",
      deleteAria: "Delete {name}",
    },
  },
};

function renderTile(
  location: CustomSiteLocation,
  handlers: { onOpen?: () => void; onEdit?: () => void; onDelete?: () => void } = {},
) {
  return render(
    <NextIntlClientProvider locale="en" messages={MESSAGES}>
      <CustomSiteLocationTile
        location={location}
        variant="level"
        onOpen={handlers.onOpen ?? vi.fn()}
        onEdit={handlers.onEdit ?? vi.fn()}
        onDelete={handlers.onDelete ?? vi.fn()}
      />
    </NextIntlClientProvider>,
  );
}

describe("CustomSiteLocationTile", () => {
  it("uses a fixed tile height and two-line title clamp for level variant", () => {
    const { container } = renderTile({
      ...BASE,
      name: "A very long custom location name that should clamp after two lines of text",
    });

    const shell = container.firstElementChild as HTMLElement;
    expect(shell.style.height).toBe(`${CUSTOM_SITE_TILE_HEIGHT}px`);

    const title = screen.getByText(/A very long custom location name/);
    expect(title.style.minHeight).toBe(`${CUSTOM_SITE_TILE_TITLE_BLOCK_HEIGHT}px`);
    expect(title.style.webkitLineClamp).toBe("2");
    expect(title.style.overflow).toBe("hidden");
  });

  it("shows both edit and delete buttons", () => {
    renderTile(BASE);
    expect(screen.getByRole("button", { name: /Edit Short/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Delete Short/i })).toBeInTheDocument();
  });

  it("calls onEdit when pencil button is clicked", async () => {
    const onEdit = vi.fn();
    renderTile(BASE, { onEdit });
    await userEvent.click(screen.getByRole("button", { name: /Edit Short/i }));
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it("calls onDelete when trash button is clicked", async () => {
    const onDelete = vi.fn();
    renderTile(BASE, { onDelete });
    await userEvent.click(screen.getByRole("button", { name: /Delete Short/i }));
    expect(onDelete).toHaveBeenCalledOnce();
  });
});
