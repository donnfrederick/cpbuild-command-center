import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ProjectMobileBottomNav } from "@/components/projects/ProjectMobileBottomNav";

const PROJECT_ID = "proj-abc-123";
let mockPathname = `/projects/${PROJECT_ID}`;

vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
}));

vi.mock("@/components/navigation/nav-link", () => ({
  NavLink: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
  usePathname: () => mockPathname,
}));

const messages = {
  projects: {
    projectNavAria: "Project navigation",
    tabOverview: "Overview",
    tabUnits: "Locations",
    tabInspectionsShort: "Inspections",
    tabFieldReportsShort: "Issues/Obsv.",
    tabMediaShort: "Media",
  },
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

describe("ProjectMobileBottomNav", () => {
  it("renders a nav with id 'project-mobile-bottom-nav'", () => {
    const { container } = render(<ProjectMobileBottomNav projectId={PROJECT_ID} />, { wrapper: Wrapper });
    expect(container.querySelector("#project-mobile-bottom-nav")).toBeTruthy();
  });

  it("renders five bottom-nav destinations", () => {
    render(<ProjectMobileBottomNav projectId={PROJECT_ID} />, { wrapper: Wrapper });
    expect(screen.getByText("Overview")).toBeDefined();
    expect(screen.getByText("Locations")).toBeDefined();
    expect(screen.getByText("Inspections")).toBeDefined();
    expect(screen.getByText("Issues/Obsv.")).toBeDefined();
    expect(screen.getByText("Media")).toBeDefined();
  });

  it("renders nav items in product order: Overview, Media, Locations, Issues/Obsv., Inspections", () => {
    const { container } = render(<ProjectMobileBottomNav projectId={PROJECT_ID} />, { wrapper: Wrapper });
    const labels = Array.from(container.querySelectorAll("a span")).map((el) => el.textContent);
    expect(labels).toEqual(["Overview", "Media", "Locations", "Issues/Obsv.", "Inspections"]);
  });

  it("links to correct project-scoped hrefs", () => {
    const { container } = render(<ProjectMobileBottomNav projectId={PROJECT_ID} />, { wrapper: Wrapper });
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toContain(`/projects/${PROJECT_ID}`);
    expect(hrefs).toContain(`/projects/${PROJECT_ID}/units`);
    expect(hrefs).toContain(`/projects/${PROJECT_ID}/log/inspections`);
    expect(hrefs).toContain(`/projects/${PROJECT_ID}/field-reports`);
    expect(hrefs).toContain(`/projects/${PROJECT_ID}/media`);
  });

  it("does not link to the legacy /log hub", () => {
    const { container } = render(<ProjectMobileBottomNav projectId={PROJECT_ID} />, { wrapper: Wrapper });
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs.some((h) => h?.endsWith("/log"))).toBe(false);
  });

  it("marks Field Reports as active on /field-reports paths", () => {
    mockPathname = `/projects/${PROJECT_ID}/field-reports/observations`;
    const { container } = render(<ProjectMobileBottomNav projectId={PROJECT_ID} />, { wrapper: Wrapper });
    const activeLink = container.querySelector("a[aria-current='page']");
    expect(activeLink).toBeTruthy();
    expect(activeLink!.getAttribute("href")).toBe(`/projects/${PROJECT_ID}/field-reports`);
  });

  it("marks Inspections as active on /log/inspections", () => {
    mockPathname = `/projects/${PROJECT_ID}/log/inspections`;
    const { container } = render(<ProjectMobileBottomNav projectId={PROJECT_ID} />, { wrapper: Wrapper });
    const activeLink = container.querySelector("a[aria-current='page']");
    expect(activeLink).toBeTruthy();
    expect(activeLink!.getAttribute("href")).toBe(`/projects/${PROJECT_ID}/log/inspections`);
  });

  it("renders exactly five nav links", () => {
    const { container } = render(<ProjectMobileBottomNav projectId={PROJECT_ID} />, { wrapper: Wrapper });
    expect(container.querySelectorAll("a")).toHaveLength(5);
  });
});
