import { describe, expect, it } from "vitest";
import {
  chunkObservationIds,
  OBSERVATIONS_PDF_EXPORT_BATCH_SIZE,
  uniqueObservationIdsInOrder,
} from "@/lib/pdf/observations-export-batch";

describe("uniqueObservationIdsInOrder()", () => {
  it("preserves order and drops duplicates and empty strings", () => {
    expect(uniqueObservationIdsInOrder(["b", "", "a", "b", "c", "a"])).toEqual(["b", "a", "c"]);
  });
});

describe("chunkObservationIds()", () => {
  it("returns one chunk when within batch size", () => {
    const ids = Array.from({ length: 10 }, (_, i) => `obs-${i}`);
    expect(chunkObservationIds(ids)).toEqual([ids]);
  });

  it("splits into fixed-size chunks", () => {
    const ids = Array.from({ length: OBSERVATIONS_PDF_EXPORT_BATCH_SIZE + 5 }, (_, i) => `obs-${i}`);
    const chunks = chunkObservationIds(ids);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(OBSERVATIONS_PDF_EXPORT_BATCH_SIZE);
    expect(chunks[1]).toHaveLength(5);
    expect(chunks.flat()).toEqual(ids);
  });
});
