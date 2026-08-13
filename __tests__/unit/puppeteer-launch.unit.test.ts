import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockExistsHoisted = vi.hoisted(() => ({
  fn: vi.fn(() => false),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: mockExistsHoisted.fn as typeof actual.existsSync,
  };
});

const mockPackagedExePath = vi.fn(async () => "/packed/chromium");

vi.mock("@sparticuz/chromium-min", () => ({
  default: {
    executablePath: (tar: string) => mockPackagedExePath(tar),
    args: ["--lambda-chromium"],
  },
}));

const mockPuppeteerLaunch = vi.hoisted(() =>
  vi.fn(async () => ({ close: vi.fn(async (): Promise<void> => {}) })),
);

vi.mock("puppeteer-core", () => ({
  default: {
    launch: (...args: unknown[]) => mockPuppeteerLaunch(...args),
  },
}));

import {
  getPdfPuppeteerLaunchOptions,
  launchPdfPuppeteerBrowser,
  resolveSystemChromeExecutable,
  PDF_PACKED_CHROMIUM_TAR,
} from "@/lib/pdf/puppeteer-launch";

describe("getPdfPuppeteerLaunchOptions()", () => {
  const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform")!;
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...envSnapshot };
    delete process.env.CHROME_EXECUTABLE_PATH;
    delete process.env.PUPPETEER_EXECUTABLE_PATH;
    mockExistsHoisted.fn.mockImplementation(() => false);
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", platformDescriptor);
    process.env = { ...envSnapshot };
  });

  it("honors CHROME_EXECUTABLE_PATH over packaged Chromium", async () => {
    process.env.CHROME_EXECUTABLE_PATH = "/opt/chrome/chrome";
    process.env.NODE_ENV = "production";
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });

    mockExistsHoisted.fn.mockImplementation((p) => String(p) === "/opt/chrome/chrome");

    const opts = await getPdfPuppeteerLaunchOptions();

    expect(opts.executablePath).toBe("/opt/chrome/chrome");
    expect(opts.args).toEqual(["--no-sandbox", "--disable-setuid-sandbox"]);
    expect(mockPackagedExePath).not.toHaveBeenCalled();
  });

  it("uses packaged Chromium only on linux + production", async () => {
    process.env.NODE_ENV = "production";
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });

    const opts = await getPdfPuppeteerLaunchOptions();

    expect(opts.executablePath).toBe("/packed/chromium");
    expect(opts.args).toContain("--lambda-chromium");
    expect(mockPackagedExePath).toHaveBeenCalledWith(PDF_PACKED_CHROMIUM_TAR);
  });

  it("on Windows production uses system Chrome when present", async () => {
    process.env.NODE_ENV = "production";
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });

    mockExistsHoisted.fn.mockImplementation((p) =>
      typeof p === "string" ? p.includes("Program Files\\Google\\Chrome") : false,
    );

    const opts = await getPdfPuppeteerLaunchOptions();

    expect(String(opts.executablePath).replace(/\\/g, "/")).toContain(
      "Google/Chrome/Application/chrome.exe",
    );
    expect(opts.args).toEqual(["--no-sandbox", "--disable-setuid-sandbox"]);
    expect(mockPackagedExePath).not.toHaveBeenCalled();
  });

  it("on Windows production rejects bare chromium override (no .exe) and resolves real Chrome", async () => {
    process.env.CHROME_EXECUTABLE_PATH =
      String.raw`C:\Users\AppData\Local\Temp\chromium`;
    process.env.NODE_ENV = "production";
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });

    mockExistsHoisted.fn.mockImplementation((p) =>
      typeof p === "string" &&
      (String.raw`C:\Users\AppData\Local\Temp\chromium` === p ||
        p.includes(String.raw`Program Files\Google\Chrome`)),
    );

    const opts = await getPdfPuppeteerLaunchOptions();

    expect(String(opts.executablePath).replace(/\\/g, "/")).toContain(
      "Google/Chrome/Application/chrome.exe",
    );
    expect(mockPackagedExePath).not.toHaveBeenCalled();
  });

  it("on linux development resolves system chromium when packaged path is skipped", async () => {
    process.env.NODE_ENV = "development";
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    mockExistsHoisted.fn.mockImplementation((p) => String(p) === "/usr/bin/google-chrome");

    const opts = await getPdfPuppeteerLaunchOptions();

    expect(opts.executablePath).toBe("/usr/bin/google-chrome");
    expect(mockPackagedExePath).not.toHaveBeenCalled();
  });
});

describe("resolveSystemChromeExecutable()", () => {
  const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform")!;

  beforeEach(() => {
    mockExistsHoisted.fn.mockImplementation(() => false);
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", platformDescriptor);
  });

  it("prefers Darwin Chrome path when it exists", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    mockExistsHoisted.fn.mockImplementation(
      (p) =>
        String(p) === "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    );

    expect(resolveSystemChromeExecutable()).toContain("Google Chrome");
  });

  it("throws when no browser is found on Windows", () => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });

    expect(() => resolveSystemChromeExecutable()).toThrow(/No Chrome or Edge found/);
  });
});

describe("launchPdfPuppeteerBrowser()", () => {
  const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform")!;
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...envSnapshot };
    delete process.env.CHROME_EXECUTABLE_PATH;
    delete process.env.PUPPETEER_EXECUTABLE_PATH;
    mockExistsHoisted.fn.mockImplementation(() => false);
    mockPuppeteerLaunch.mockImplementation(async () => ({
      close: vi.fn(async (): Promise<void> => {}),
    }));
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", platformDescriptor);
    process.env = { ...envSnapshot };
  });

  it("calls puppeteer.launch with explicit executablePath and headless on Windows", async () => {
    process.env.NODE_ENV = "production";
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });

    mockExistsHoisted.fn.mockImplementation((p) =>
      typeof p === "string" ? p.includes("Program Files\\Google\\Chrome") : false,
    );

    await launchPdfPuppeteerBrowser();

    expect(mockPuppeteerLaunch).toHaveBeenCalledTimes(1);
    const cfg = mockPuppeteerLaunch.mock.calls[0][0] as {
      executablePath: string;
      headless: boolean;
      args: string[];
    };
    expect(cfg.headless).toBe(true);
    expect(cfg.executablePath).toMatch(/chrome\.exe$/i);
    expect(Array.isArray(cfg.args)).toBe(true);
  });
});
