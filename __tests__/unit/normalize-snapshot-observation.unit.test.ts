import { describe, it, expect } from "vitest";
import { normalizeSnapshotObservation } from "@/lib/offline/normalize-snapshot-observation";

describe("normalizeSnapshotObservation", () => {
  it("maps legacy authorName rows to ObsSummary author", () => {
    const obs = normalizeSnapshotObservation({
      id: "o1",
      title: "T",
      description: "D",
      observationType: "QUALITY",
      createdAt: "2026-01-01T00:00:00.000Z",
      authorName: "Pat",
      authorId: "user-9",
    });
    expect(obs.author.id).toBe("user-9");
    expect(obs.author.name).toBe("Pat");
  });

  it("prefers nested author object when present", () => {
    const obs = normalizeSnapshotObservation({
      id: "o2",
      title: "",
      description: "",
      observationType: "OTHER",
      createdAt: "2026-01-01T00:00:00.000Z",
      author: { id: "a1", name: "Alex", email: "a@test.com" },
    });
    expect(obs.author.email).toBe("a@test.com");
  });
});
