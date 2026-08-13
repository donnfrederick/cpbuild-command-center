import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IssueForPdf } from "@/lib/pdf/issues-pdf";

const COMMENT_STORAGE_KEY = "field-media/issue-comments/comment-photo.png";
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

function minimalIssue(overrides: Partial<IssueForPdf> = {}): IssueForPdf {
  return {
    id: "issue-1",
    issueType: "OTHER",
    shortDescription: "Cracked tile",
    notes: null,
    isBlockingWork: false,
    status: "OPEN",
    responsibleParty: "SUBCONTRACTOR",
    createdAt: new Date("2026-05-01T12:00:00Z"),
    resolvedAt: null,
    resolutionNote: null,
    unitRef: "North|1|N0001",
    createdBy: { name: "Alice", email: "alice@example.com" },
    resolvedBy: null,
    attachments: [],
    scopeTags: [],
    subScopeTags: [],
    comments: [
      {
        id: "comment-1",
        body: "Photo from the field",
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

describe("buildIssuesPdf", () => {
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
    const { writeFileSync, mkdtempSync, rmSync } = await import("fs");
    const { join } = await import("path");
    const { tmpdir } = await import("os");
    const tmpRoot = mkdtempSync(join(tmpdir(), "issues-pdf-"));
    vi.stubEnv("LOCAL_FIELD_MEDIA_ROOT", tmpRoot);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const abs = join(tmpRoot, COMMENT_STORAGE_KEY);
    const { mkdirSync } = await import("fs");
    mkdirSync(join(tmpRoot, "field-media/issue-comments"), { recursive: true });
    writeFileSync(abs, TINY_PNG);

    const { buildIssuesPdf } = await import("@/lib/pdf/issues-pdf");

    const pdf = await buildIssuesPdf({
      issues: [minimalIssue()],
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

  it("still embeds issue-level attachment images from local storageKey", async () => {
    const { writeFileSync, mkdtempSync, rmSync, mkdirSync } = await import("fs");
    const { join } = await import("path");
    const { tmpdir } = await import("os");
    const issueKey = "field-media/issues/main-photo.png";
    const tmpRoot = mkdtempSync(join(tmpdir(), "issues-pdf-main-"));
    vi.stubEnv("LOCAL_FIELD_MEDIA_ROOT", tmpRoot);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    mkdirSync(join(tmpRoot, "field-media/issues"), { recursive: true });
    writeFileSync(join(tmpRoot, issueKey), TINY_PNG);

    const { buildIssuesPdf } = await import("@/lib/pdf/issues-pdf");
    const issueUrl = `http://localhost:3002/api/upload/field-media/file?key=${encodeURIComponent(issueKey)}`;

    await buildIssuesPdf({
      issues: [
        minimalIssue({
          comments: [],
          attachments: [
            {
              id: "att-main",
              mimeType: "image/png",
              storageUrl: issueUrl,
              storageKey: issueKey,
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

  it("renders multiple responsible parties comma-separated in export HTML", async () => {
    const { buildIssuesPdf } = await import("@/lib/pdf/issues-pdf");

    await buildIssuesPdf({
      issues: [
        minimalIssue({
          responsibleParty: "ELECTRICIAN",
          responsibleParties: ["ELECTRICIAN", "PLUMBER"],
          comments: [],
        }),
      ],
      projectName: "Test Project",
      filterSummary: "",
      exportedAt: new Date("2026-05-13T12:00:00Z"),
    });

    const html = String(setContentMock.mock.calls[0]?.[0] ?? "");
    expect(html).toContain("Responsible:");
    expect(html).toContain("ELECTRICIAN, PLUMBER");
  });
});
