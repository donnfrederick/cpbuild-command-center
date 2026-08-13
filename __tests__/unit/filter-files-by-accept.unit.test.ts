import { describe, it, expect } from "vitest";
import { fileMatchesAccept, filterFilesByAccept } from "@/lib/filter-files-by-accept";

describe("fileMatchesAccept()", () => {
  it("accepts wildcard mime groups", () => {
    const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    expect(fileMatchesAccept(file, "image/*")).toBe(true);
  });

  it("accepts explicit mime types", () => {
    const file = new File(["x"], "shot.png", { type: "image/png" });
    expect(fileMatchesAccept(file, "image/png,image/jpeg")).toBe(true);
  });

  it("accepts extensions", () => {
    const file = new File(["x"], "units.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    expect(fileMatchesAccept(file, ".xlsx,.xls,.csv")).toBe(true);
  });

  it("accepts HEIC by extension when mime is empty", () => {
    const file = new File(["x"], "photo.heic", { type: "" });
    expect(fileMatchesAccept(file, "image/*,image/heic,image/heif")).toBe(true);
  });

  it("rejects unsupported types", () => {
    const file = new File(["x"], "notes.txt", { type: "text/plain" });
    expect(fileMatchesAccept(file, "image/*,video/*")).toBe(false);
  });
});

describe("filterFilesByAccept()", () => {
  it("splits accepted and rejected files", () => {
    const image = new File(["x"], "a.jpg", { type: "image/jpeg" });
    const text = new File(["x"], "b.txt", { type: "text/plain" });
    const result = filterFilesByAccept([image, text], "image/*");
    expect(result.accepted).toEqual([image]);
    expect(result.rejected).toEqual([text]);
  });
});
