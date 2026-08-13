import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { AIAnomalyBadge, type AnomalyRow } from "@/components/ai/AIAnomalyBadge";

const messages = {
  ai: {
    anomalyBadge: "{count} anomaly",
    anomalyBadgePlural: "{count} anomalies",
    anomaliesTitle: "Anomalies detected",
    anomalyDuplicateScope: "Duplicate scope rows",
    anomalyProgressNoStage: "Progress without stage",
    anomalyInProgressNoDate: "In-progress without date",
    dismiss: "Dismiss",
  },
};

function renderBadge(rows: AnomalyRow[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AIAnomalyBadge rows={rows} />
    </NextIntlClientProvider>
  );
}

const cleanRow: AnomalyRow = {
  id: "1", building: "A", level: "1", unit: "101",
  description: "Flooring", scopeStage: "INSTALL", scopeStatus: "NOT_STARTED",
  percentComplete: 0, finishDate: "2026-06-01",
};

const duplicateRow: AnomalyRow = {
  id: "2", building: "A", level: "1", unit: "101",
  description: "Flooring", scopeStage: "INSTALL", scopeStatus: "NOT_STARTED",
  percentComplete: 0, finishDate: "2026-06-01",
};

const progressNoStageRow: AnomalyRow = {
  id: "3", building: "B", level: "2", unit: "202",
  description: "Painting", scopeStage: null, scopeStatus: null,
  percentComplete: 50, finishDate: null,
};

const inProgressNoDateRow: AnomalyRow = {
  id: "4", building: "C", level: "3", unit: "303",
  description: "Trim", scopeStage: "INSTALL", scopeStatus: "IN_PROGRESS",
  percentComplete: 20, finishDate: null,
};

describe("AIAnomalyBadge", () => {
  it("renders nothing when there are no anomalies", () => {
    const { container } = renderBadge([cleanRow]);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders badge when duplicate scope rows exist", () => {
    renderBadge([cleanRow, duplicateRow]);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("renders badge when progress-without-stage rows exist", () => {
    renderBadge([progressNoStageRow]);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("renders badge when in-progress-without-date rows exist", () => {
    renderBadge([inProgressNoDateRow]);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("opens the anomaly panel when badge is clicked", () => {
    renderBadge([cleanRow, duplicateRow]);
    const badge = screen.getByRole("button");
    fireEvent.click(badge);
    expect(screen.getByText("Anomalies detected")).toBeInTheDocument();
    expect(screen.getByText("Duplicate scope rows (1)")).toBeInTheDocument();
  });

  it("closes the panel when the X button is clicked", () => {
    renderBadge([cleanRow, duplicateRow]);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Anomalies detected")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Close"));
    expect(screen.queryByText("Anomalies detected")).not.toBeInTheDocument();
  });

  it("dismisses entirely when Dismiss is clicked", () => {
    renderBadge([cleanRow, duplicateRow]);
    fireEvent.click(screen.getByRole("button")); // open
    fireEvent.click(screen.getByText("Dismiss"));
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("detects all three anomaly types at once", () => {
    renderBadge([cleanRow, duplicateRow, progressNoStageRow, inProgressNoDateRow]);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Duplicate scope rows (1)")).toBeInTheDocument();
    expect(screen.getByText("Progress without stage (1)")).toBeInTheDocument();
    expect(screen.getByText("In-progress without date (1)")).toBeInTheDocument();
  });

  it("truncates row list to 5 and shows +N more when overflow", () => {
    const manyRows: AnomalyRow[] = Array.from({ length: 7 }, (_, i) => ({
      id: String(i + 10),
      building: "X", level: String(i), unit: String(i),
      description: "Item", scopeStage: "INSTALL", scopeStatus: "IN_PROGRESS",
      percentComplete: 10, finishDate: null,
    }));
    renderBadge(manyRows);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("+2 more")).toBeInTheDocument();
  });
});
