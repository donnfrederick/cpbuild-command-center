import { describe, expect, it } from "vitest";
import { unitKeysForBulkInstallerUpdate } from "@/lib/bulk-installer-complete";

describe("unitKeysForBulkInstallerUpdate", () => {
  it("returns unique unit keys only for updated row ids", () => {
    const keys = unitKeysForBulkInstallerUpdate(
      [
        { id: "r1", unitKey: "A|1|101" },
        { id: "r2", unitKey: "A|1|101" },
        { id: "r3", unitKey: "A|1|102" },
        { id: "r4", unitKey: "B|2|201" },
      ],
      ["r1", "r2", "r4"],
    );

    expect(keys).toEqual(["A|1|101", "B|2|201"]);
  });

  it("returns empty when nothing was updated", () => {
    expect(
      unitKeysForBulkInstallerUpdate([{ id: "r1", unitKey: "A|1|101" }], []),
    ).toEqual([]);
  });
});
