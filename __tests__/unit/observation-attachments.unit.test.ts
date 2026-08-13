import { describe, it, expect } from "vitest";
import {
  collectPriorVersions,
  filterObservationAttachmentHeads,
  isObservationAttachmentHead,
} from "@/lib/observation-attachments";

describe("filterObservationAttachmentHeads", () => {
  it("returns only heads of version chains", () => {
    const a = { id: "a", supersedesId: null as string | null };
    const b = { id: "b", supersedesId: "a" as string | null };
    const c = { id: "c", supersedesId: null as string | null };
    const heads = filterObservationAttachmentHeads([a, b, c]);
    expect(heads.map((x) => x.id).sort()).toEqual(["b", "c"]);
  });
});

describe("isObservationAttachmentHead", () => {
  it("returns false when another attachment supersedes this id", () => {
    const all = [
      { id: "old", supersedesId: null as string | null },
      { id: "new", supersedesId: "old" as string | null },
    ];
    expect(isObservationAttachmentHead("old", all)).toBe(false);
    expect(isObservationAttachmentHead("new", all)).toBe(true);
  });
});

describe("collectPriorVersions", () => {
  it("returns older versions oldest first", () => {
    const a = { id: "a", supersedesId: null as string | null };
    const b = { id: "b", supersedesId: "a" as string | null };
    const head = { id: "h", supersedesId: "b" as string | null };
    const byId = new Map([
      ["a", a],
      ["b", b],
      ["h", head],
    ]);
    expect(collectPriorVersions(head, byId).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("returns empty array for a head with no prior versions", () => {
    const head = { id: "h", supersedesId: null as string | null };
    const byId = new Map([["h", head]]);
    expect(collectPriorVersions(head, byId)).toEqual([]);
  });

  it("stops gracefully when a chain link is missing from the map", () => {
    // "b" supersedes "a" but "a" is not in the map (broken chain)
    const head = { id: "b", supersedesId: "a" as string | null };
    const byId = new Map([["b", head]]);
    expect(collectPriorVersions(head, byId)).toEqual([]);
  });
});

describe("filterObservationAttachmentHeads — edge cases", () => {
  it("returns empty array for empty input", () => {
    expect(filterObservationAttachmentHeads([])).toEqual([]);
  });

  it("returns the single attachment when there is no chain", () => {
    const a = { id: "only", supersedesId: null as string | null };
    expect(filterObservationAttachmentHeads([a])).toEqual([a]);
  });
});

describe("isObservationAttachmentHead — edge cases", () => {
  it("returns true for a standalone attachment with no chain", () => {
    const all = [{ id: "solo", supersedesId: null as string | null }];
    expect(isObservationAttachmentHead("solo", all)).toBe(true);
  });
});
