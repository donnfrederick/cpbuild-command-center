import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ObsForPdf } from "@/lib/pdf/observations-pdf";

const COMMENT_STORAGE_KEY = "field-media/obs-comments/comment-photo.png";
const COMMENT_IMAGE_URL = `http://localhost:3002/api/upload/field-media/file?key=${encodeURIComponent(COMMENT_STORAGE_KEY)}`;

const setContentMock = vi.fn().mockResolvedValue(undefined);

vi.mock("puppeteer-core", () => ({
  default: {
    launch: vi.fn().mockResolvedValue({
      newPage: vi.fn().mockResolvedValue({
        setContent: setContentMock,
        setDefaultTimeout: vi.fn(),
        pdf: vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46])),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

vi.mock("@sparticuz/chromium-min", () => ({
  default: {
    args: [],
    executablePath: vi.fn().mockResolvedValue("/fake/chromium"),
  },
}));

/** 1×1 PNG */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function minimalObservation(overrides: Partial<ObsForPdf> = {}): ObsForPdf {
  return {
    id: "obs-1",
    observationType: "QUALITY",
    title: "Grout gap",
    description: "Visible gap along the backsplash",
    createdAt: new Date("2026-05-01T12:00:00Z"),
    unitRef: "North|1|N0001",
    author: { name: "Alice", email: "alice@example.com" },
    attachments: [],
    scopeTags: [],
    comments: [
      {
        id: "comment-1",
        body: "Close-up attached",
        createdAt: new Date("2026-05-02T10:00:00Z"),
        author: { name: "Bob", email: "bob@example.com" },
        attachments: [
          {
            id: "att-comment-1",
            mimeType: "image/png",
            storageUrl: COMMENT_IMAGE_URL,
            storageKey: COMMENT_STORAGE_KEY,
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("buildObsPdf", () => {
  beforeEach(() => {
    setContentMock.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return {
          ok: true,
          headers: { get: () => "image/png" },
          arrayBuffer: async () => TINY_PNG.buffer.slice(TINY_PNG.byteOffset, TINY_PNG.byteOffset + TINY_PNG.byteLength),
        } as Response;
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("fetches and embeds comment attachment images in export HTML", async () => {
    const { writeFileSync, mkdtempSync, rmSync, mkdirSync } = await import("fs");
    const { join } = await import("path");
    const { tmpdir } = await import("os");
    const tmpRoot = mkdtempSync(join(tmpdir(), "obs-pdf-"));
    vi.stubEnv("LOCAL_FIELD_MEDIA_ROOT", tmpRoot);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    mkdirSync(join(tmpRoot, "field-media/obs-comments"), { recursive: true });
    writeFileSync(join(tmpRoot, COMMENT_STORAGE_KEY), TINY_PNG);

    const { buildObsPdf } = await import("@/lib/pdf/observations-pdf");

    const pdf = await buildObsPdf({
      observations: [minimalObservation()],
      projectName: "Test Project",
      filterSummary: "",
      exportedAt: new Date("2026-05-13T12:00:00Z"),
    });

    rmSync(tmpRoot, { recursive: true, force: true });

    expect(pdf.length).toBeGreaterThan(0);
    expect(global.fetch).not.toHaveBeenCalled();

    const html = String(setContentMock.mock.calls[0]?.[0] ?? "");
    expect(html).toContain('class="photo-grid" style="margin-top:6px;"');
    expect(html).toContain('src="data:image/png;base64,');
    expect(html).not.toContain("📷 1 photo");
    expect(html).not.toContain("Image unavailable");
  });

  it("still embeds observation-level attachment images from local storageKey", async () => {
    const { writeFileSync, mkdtempSync, rmSync, mkdirSync } = await import("fs");
    const { join } = await import("path");
    const { tmpdir } = await import("os");
    const obsKey = "field-media/observations/main-photo.png";
    const tmpRoot = mkdtempSync(join(tmpdir(), "obs-pdf-main-"));
    vi.stubEnv("LOCAL_FIELD_MEDIA_ROOT", tmpRoot);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    mkdirSync(join(tmpRoot, "field-media/observations"), { recursive: true });
    writeFileSync(join(tmpRoot, obsKey), TINY_PNG);

    const { buildObsPdf } = await import("@/lib/pdf/observations-pdf");
    const obsUrl = `http://localhost:3002/api/upload/field-media/file?key=${encodeURIComponent(obsKey)}`;

    await buildObsPdf({
      observations: [
        minimalObservation({
          comments: [],
          attachments: [
            {
              id: "att-main",
              mimeType: "image/png",
              storageUrl: obsUrl,
              storageKey: obsKey,
            },
          ],
        }),
      ],
      projectName: "Test Project",
      filterSummary: "",
      exportedAt: new Date(),
    });

    rmSync(tmpRoot, { recursive: true, force: true });

    expect(global.fetch).not.toHaveBeenCalled();
    const html = String(setContentMock.mock.calls[0]?.[0] ?? "");
    expect(html).toContain("photo-grid");
    expect(html).toContain('src="data:image/png;base64,');
    expect(html).not.toContain("Image unavailable");
  });

  it("omits the cover block when includeCover is false", async () => {
    const { buildObsPdf } = await import("@/lib/pdf/observations-pdf");

    await buildObsPdf({
      observations: [minimalObservation({ comments: [], attachments: [] })],
      projectName: "Test Project",
      filterSummary: "",
      exportedAt: new Date(),
      includeCover: false,
    });

    const html = String(setContentMock.mock.calls[0]?.[0] ?? "");
    expect(html).not.toContain('class="cover"');
    expect(html).toContain('class="obs-page"');
  });

  it("renders Procore-style metadata fields and project header", async () => {
    const { buildObsPdf } = await import("@/lib/pdf/observations-pdf");

    await buildObsPdf({
      observations: [
        minimalObservation({
          comments: [],
          attachments: [],
          scopeTags: [
            {
              row: {
                building: "North",
                level: "1",
                unit: "N0001",
                scopeType: { name: "Cabinet Installation" },
              },
            },
          ],
        }),
      ],
      projectName: "Academy Terrace",
      projectAddress: "4104 West College View Dr, Herriman, Utah 84096",
      filterSummary: "",
      exportedAt: new Date("2026-05-11T22:07:00Z"),
    });

    const html = String(setContentMock.mock.calls[0]?.[0] ?? "");
    expect(html).toContain("CP BUILD");
    expect(html).toContain("Academy Terrace");
    expect(html).toContain("4104 West College View Dr");
    expect(html).toContain("Created By");
    expect(html).toContain("Alice");
    expect(html).toContain("Date Created");
    expect(html).toContain("Trade");
    expect(html).toContain("Cabinet Installation");
    expect(html).toContain("Quality Observation #1:");
    expect(html).toContain("Grout gap");
  });

  it("preserves observation array order when preserveObservationOrder is true", async () => {
    const { buildObsPdf } = await import("@/lib/pdf/observations-pdf");

    await buildObsPdf({
      observations: [
        minimalObservation({
          id: "obs-unit",
          title: "Unit scope first",
          unitRef: "North|1|N0001",
          comments: [],
          attachments: [],
        }),
        minimalObservation({
          id: "obs-building",
          title: "Building scope second",
          unitRef: "North|",
          comments: [],
          attachments: [],
        }),
      ],
      projectName: "Test Project",
      filterSummary: "",
      exportedAt: new Date(),
      preserveObservationOrder: true,
    });

    const html = String(setContentMock.mock.calls[0]?.[0] ?? "");
    expect(html.indexOf("Unit scope first")).toBeLessThan(html.indexOf("Building scope second"));
    expect(html).not.toContain('class="group-heading"');
    expect(html).toContain("Quality Observation #1:");
    expect(html).toContain("Quality Observation #2:");
  });

  it("embeds attachment filenames with malformed URI encoding without throwing", async () => {
    const { buildObsPdf } = await import("@/lib/pdf/observations-pdf");
    const badName = "photo%ZZ.jpg";

    await buildObsPdf({
      observations: [
        minimalObservation({
          comments: [],
          attachments: [
            {
              id: "att-bad",
              mimeType: "image/png",
              storageUrl: `https://example.com/uploads/${badName}`,
              storageKey: `field-media/observations/${badName}`,
            },
          ],
        }),
      ],
      projectName: "Test Project",
      filterSummary: "",
      exportedAt: new Date(),
    });

    const html = String(setContentMock.mock.calls[0]?.[0] ?? "");
    expect(html).toContain(badName);
  });
});
