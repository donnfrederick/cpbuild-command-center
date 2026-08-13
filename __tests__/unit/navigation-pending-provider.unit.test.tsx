import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  NavigationPendingProvider,
  useNavigationPending,
} from "@/components/navigation/navigation-pending-provider";
import { AppShellMain } from "@/components/navigation/app-shell-main";

let mockPathname = "/projects";

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => mockPathname,
}));

function PendingProbe() {
  const { isPending, startNavigation, clearProjectNavigation } = useNavigationPending();
  return (
    <div>
      <span data-testid="pending">{isPending ? "yes" : "no"}</span>
      <button type="button" onClick={startNavigation}>
        start
      </button>
      <button type="button" onClick={clearProjectNavigation}>
        clear project
      </button>
    </div>
  );
}

describe("NavigationPendingProvider", () => {
  beforeEach(() => {
    mockPathname = "/projects";
  });

  it("sets pending on startNavigation and clears when pathname changes", () => {
    const { rerender } = render(
      <NavigationPendingProvider>
        <PendingProbe />
      </NavigationPendingProvider>,
    );

    expect(screen.getByTestId("pending").textContent).toBe("no");

    act(() => {
      screen.getByRole("button", { name: "start" }).click();
    });
    expect(screen.getByTestId("pending").textContent).toBe("yes");

    mockPathname = "/feedback";
    rerender(
      <NavigationPendingProvider>
        <PendingProbe />
      </NavigationPendingProvider>,
    );

    expect(screen.getByTestId("pending").textContent).toBe("no");
  });

  it("does not re-activate pending when returning to the origin route via Back", () => {
    const { rerender } = render(
      <NavigationPendingProvider>
        <PendingProbe />
      </NavigationPendingProvider>,
    );

    act(() => {
      screen.getByRole("button", { name: "start" }).click();
    });
    expect(screen.getByTestId("pending").textContent).toBe("yes");

    mockPathname = "/feedback";
    rerender(
      <NavigationPendingProvider>
        <PendingProbe />
      </NavigationPendingProvider>,
    );
    expect(screen.getByTestId("pending").textContent).toBe("no");

    mockPathname = "/projects";
    rerender(
      <NavigationPendingProvider>
        <PendingProbe />
      </NavigationPendingProvider>,
    );
    expect(screen.getByTestId("pending").textContent).toBe("no");
  });

  it("clears project navigation overlay via clearProjectNavigation", async () => {
    const user = userEvent.setup();

    function ProjectProbe() {
      const { pendingProject, startProjectNavigation } = useNavigationPending();
      return (
        <div>
          <span data-testid="project-pending">{pendingProject ? pendingProject.projectName : "none"}</span>
          <button type="button" onClick={() => startProjectNavigation("p1", "Alpha Tower")}>
            open project
          </button>
        </div>
      );
    }

    render(
      <NavigationPendingProvider>
        <ProjectProbe />
        <PendingProbe />
      </NavigationPendingProvider>,
    );

    expect(screen.getByTestId("project-pending").textContent).toBe("none");

    await user.click(screen.getByRole("button", { name: "open project" }));
    expect(screen.getByTestId("project-pending").textContent).toBe("Alpha Tower");

    await user.click(screen.getByRole("button", { name: "clear project" }));
    expect(screen.getByTestId("project-pending").textContent).toBe("none");
  });

  it("AppShellMain shows skeleton while pending", () => {
    render(
      <NavigationPendingProvider>
        <PendingProbe />
        <AppShellMain>
          <div>page content</div>
        </AppShellMain>
      </NavigationPendingProvider>,
    );

    expect(screen.getByText("page content")).toBeInTheDocument();

    act(() => {
      screen.getByRole("button", { name: "start" }).click();
    });

    expect(screen.queryByText("page content")).not.toBeInTheDocument();
    expect(document.querySelector("[aria-busy='true']")).toBeTruthy();
  });
});
