import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("field-media-local", () => {
  let tmpRoot: string;

  beforeEach(() => {
    vi.unstubAllEnvs();
    tmpRoot = mkdtempSync(join(tmpdir(), "fm-unit-"));
    vi.stubEnv("LOCAL_FIELD_MEDIA_ROOT", tmpRoot);
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("isValidFieldMediaStorageKey accepts allowlisted folders", async () => {
    const { isValidFieldMediaStorageKey } = await import("@/lib/field-media-local");
    expect(isValidFieldMediaStorageKey("field-media/issues/a.jpg")).toBe(true);
    expect(isValidFieldMediaStorageKey("field-media/feedback-comments/u.jpg")).toBe(true);
    expect(isValidFieldMediaStorageKey("field-media/wrong/a.jpg")).toBe(false);
    expect(isValidFieldMediaStorageKey("field-media/issues/../x.jpg")).toBe(false);
    expect(isValidFieldMediaStorageKey("other/issues/a.jpg")).toBe(false);
  });

  it("writeLocalFieldMediaFile and readLocalFieldMediaFile round-trip", async () => {
    const { writeLocalFieldMediaFile, readLocalFieldMediaFile } = await import("@/lib/field-media-local");
    const key = "field-media/issues/abc.jpg";
    await writeLocalFieldMediaFile(key, Buffer.from("hello"));
    const back = await readLocalFieldMediaFile(key);
    expect(back?.toString()).toBe("hello");
    expect(existsSync(join(tmpRoot, key))).toBe(true);
  });

  it("unlinkLocalFieldMediaKeys removes file", async () => {
    const { writeLocalFieldMediaFile, readLocalFieldMediaFile, unlinkLocalFieldMediaKeys } =
      await import("@/lib/field-media-local");
    const key = "field-media/observations/x.png";
    await writeLocalFieldMediaFile(key, Buffer.from("x"));
    await unlinkLocalFieldMediaKeys([key]);
    expect(await readLocalFieldMediaFile(key)).toBeNull();
  });

  it("readLocalFieldMediaFile returns null for missing file", async () => {
    const { readLocalFieldMediaFile } = await import("@/lib/field-media-local");
    expect(await readLocalFieldMediaFile("field-media/issues/nope.jpg")).toBeNull();
  });

  it("readLocalFieldMediaFile returns null for invalid key", async () => {
    const { readLocalFieldMediaFile } = await import("@/lib/field-media-local");
    expect(await readLocalFieldMediaFile("field-media/bad-folder/x.jpg")).toBeNull();
  });

  it("contentTypeForFieldMediaKey maps extensions", async () => {
    const { contentTypeForFieldMediaKey } = await import("@/lib/field-media-local");
    expect(contentTypeForFieldMediaKey("field-media/issues/a.jpg")).toBe("image/jpeg");
    expect(contentTypeForFieldMediaKey("field-media/issues/a.webm")).toBe("video/webm");
  });
});
