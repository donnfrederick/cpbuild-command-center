import { describe, expect, it } from "vitest";
import {
  PRE_DOWNLOAD_ALBUM_API_BATCH_SIZE,
  PRE_DOWNLOAD_CORE_API_BATCH_SIZE,
  PRE_DOWNLOAD_HTML_BATCH_SIZE,
  PRE_DOWNLOAD_HUB_IFRAME_PARALLEL,
} from "@/lib/offline/pre-download-batch";

describe("pre-download-batch constants", () => {
  it("uses conservative prod-safe concurrency (not dev-only tuning)", () => {
    expect(PRE_DOWNLOAD_CORE_API_BATCH_SIZE).toBeGreaterThanOrEqual(6);
    expect(PRE_DOWNLOAD_CORE_API_BATCH_SIZE).toBeLessThanOrEqual(12);
    expect(PRE_DOWNLOAD_ALBUM_API_BATCH_SIZE).toBeGreaterThan(PRE_DOWNLOAD_CORE_API_BATCH_SIZE);
    expect(PRE_DOWNLOAD_HTML_BATCH_SIZE).toBeGreaterThanOrEqual(4);
    expect(PRE_DOWNLOAD_HUB_IFRAME_PARALLEL).toBe(2);
  });
});
