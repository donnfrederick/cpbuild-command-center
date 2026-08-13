import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FileText } from "lucide-react";
import { ProjectHubCardHeader } from "@/components/projects/ProjectHubCardHeader";

describe("ProjectHubCardHeader", () => {
  it("renders icon, title, and optional actions with shared title styling", () => {
    render(
      <ProjectHubCardHeader
        icon={FileText}
        title="Unifier Documents"
        actions={<button type="button">Open</button>}
      />,
    );

    expect(screen.getByRole("heading", { level: 3, name: "Unifier Documents" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open" })).toBeInTheDocument();
  });
});
