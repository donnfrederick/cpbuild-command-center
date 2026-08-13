import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UpmPreviewTable } from "@/components/projects/UpmPreviewTable";

describe("UpmPreviewTable", () => {
  it("renders all rows with matching row numbers and one textbox per data cell", () => {
    const headers = ["Building", "QTY"];
    const n = 30;
    const rows = Array.from({ length: n }, (_, i) => ({
      Building: `B${i}`,
      QTY: String(i + 1),
    }));
    const onCellEdit = vi.fn();

    render(
      <UpmPreviewTable
        headers={headers}
        rows={rows}
        validationErrors={[]}
        rowNumberHeader="Row"
        onCellEdit={onCellEdit}
      />
    );

    for (let i = 1; i <= n; i++) {
      expect(screen.getByTestId(`upm-preview-row-${i}`)).toHaveTextContent(String(i));
    }

    const inputs = screen.getAllByRole("textbox");
    expect(inputs).toHaveLength(n * headers.length);
  });

  it("renders read-only cells without textboxes when readOnly is true", () => {
    render(
      <UpmPreviewTable
        headers={["Building"]}
        rows={[{ Building: "A" }]}
        validationErrors={[]}
        rowNumberHeader="Row"
        readOnly
      />,
    );

    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.getByText("A")).toBeDefined();
  });

  it("calls onCellEdit with the full row index for rows beyond the old 25-row preview cap", async () => {
    const user = userEvent.setup();
    const headers = ["A"];
    const rows = Array.from({ length: 28 }, (_, i) => ({ A: String(i) }));
    const onCellEdit = vi.fn();

    render(
      <UpmPreviewTable
        headers={headers}
        rows={rows}
        validationErrors={[]}
        rowNumberHeader="#"
        onCellEdit={onCellEdit}
      />
    );

    const row27 = screen.getByTestId("upm-preview-row-27");
    const input = within(row27.closest("tr")!).getByRole("textbox");
    await user.clear(input);
    await user.type(input, "x");

    expect(onCellEdit).toHaveBeenCalled();
    const idxCalls = onCellEdit.mock.calls.filter((c) => c[0] === 26);
    expect(idxCalls.length).toBeGreaterThan(0);
  });

  it("keeps header cells sticky at top for vertical scroll within the preview", () => {
    render(
      <UpmPreviewTable
        headers={["Building", "Level"]}
        rows={[{ Building: "A", Level: "1" }]}
        validationErrors={[]}
        rowNumberHeader="Row"
        onCellEdit={vi.fn()}
      />
    );

    const columnHeaders = screen.getAllByRole("columnheader");
    expect(columnHeaders.length).toBe(3);
    for (const th of columnHeaders) {
      expect(th).toHaveStyle({ position: "sticky", top: "0px" });
    }
  });

  it("highlights cells that match validation errors", () => {
    const headers = ["QTY"];
    const rows = [{ QTY: "bad" }, { QTY: "1" }];
    const validationErrors = [{ row: 1, col: "QTY", message: "QTY must be numeric (row 1)" }];

    render(
      <UpmPreviewTable
        headers={headers}
        rows={rows}
        validationErrors={validationErrors}
        rowNumberHeader="Row"
        onCellEdit={vi.fn()}
      />
    );

    const inputs = screen.getAllByRole("textbox");
    expect(inputs[0]).toHaveAttribute("aria-label", "QTY row 1");
    expect(inputs[0].getAttribute("style") ?? "").toMatch(/error-400|var\(--error-400\)/);
  });
});
