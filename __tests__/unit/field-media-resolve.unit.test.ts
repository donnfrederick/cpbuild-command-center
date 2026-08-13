import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PDF_IMAGE_FETCH_MAX_BYTES } from "@/lib/pdf/fetch-image-for-pdf";
import {
  fetchFieldMediaImageAsBase64,
  storageKeyFromFieldMediaUrl,
} from "@/lib/field-media-resolve";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe("storageKeyFromFieldMediaUrl", () => {
  it("parses local file proxy URLs", () => {
    const key = "field-media/issues/abc.jpg";
    const url = `http://localhost:3002/api/upload/field-media/file?key=${encodeURIComponent(key)}`;
    expect(storageKeyFromFieldMediaUrl(url)).toBe(key);
  });
});

describe("fetchFieldMediaImageAsBase64", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "fm-resolve-"));
    vi.stubEnv("LOCAL_FIELD_MEDIA_ROOT", tmpRoot);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reads local files by storageKey without HTTP fetch to the auth-gated file route", async () => {
    const storageKey = "field-media/issues/export-test.png";
    const abs = join(tmpRoot, storageKey);
    mkdirSync(join(tmpRoot, "field-media/issues"), { recursive: true });
    writeFileSync(abs, TINY_PNG);

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const dataUrl = await fetchFieldMediaImageAsBase64({
      storageUrl: `http://localhost:3002/api/upload/field-media/file?key=${encodeURIComponent(storageKey)}`,
      storageKey,
      mimeType: "image/png",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(existsSync(abs)).toBe(true);
  });

  it("falls back to allowed HTTPS Supabase URLs when no storage key resolves", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        headers: { get: (name: string) => (name === "content-type" ? "image/png" : null) },
        arrayBuffer: async () =>
          TINY_PNG.buffer.slice(TINY_PNG.byteOffset, TINY_PNG.byteOffset + TINY_PNG.byteLength),
      })) as typeof fetch,
    );

    const external = "https://sooaoevojqxgcqplflhj.supabase.co/storage/v1/object/public/field-media/x.png";
    const dataUrl = await fetchFieldMediaImageAsBase64({
      storageUrl: external,
      mimeType: "image/png",
    });

    expect(global.fetch).toHaveBeenCalledWith(external, expect.any(Object));
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("rejects HTTP fallback to disallowed hosts (SSRF guard)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const dataUrl = await fetchFieldMediaImageAsBase64({
      storageUrl: "http://169.254.169.254/latest/meta-data/",
      mimeType: "image/png",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(dataUrl).toBeNull();
  });

  it("returns null when local file exceeds PDF embed size cap", async () => {
    const storageKey = "field-media/issues/too-large.jpg";
    const abs = join(tmpRoot, storageKey);
    mkdirSync(join(tmpRoot, "field-media/issues"), { recursive: true });
    writeFileSync(abs, Buffer.alloc(PDF_IMAGE_FETCH_MAX_BYTES + 1));

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const dataUrl = await fetchFieldMediaImageAsBase64({
      storageUrl: `http://localhost:3002/api/upload/field-media/file?key=${encodeURIComponent(storageKey)}`,
      storageKey,
      mimeType: "image/jpeg",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(dataUrl).toBeNull();
  });
});
