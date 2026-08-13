import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock @google/generative-ai ─────────────────────────────────────────────
// We define the mock before any imports so the factory is in place when
// lib/ai/gemini.ts is loaded. Each test resets the singleton via
// _resetClientForTesting() exported specifically for this purpose.

const mockGenerateContent = vi.fn();
const mockGetGenerativeModel = vi.fn(() => ({ generateContent: mockGenerateContent }));

// GoogleGenerativeAI is used with `new`. The mock factory returns an object
// with the expected shape every time it is constructed.
vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: function MockGAI() {
    return { getGenerativeModel: mockGetGenerativeModel };
  },
  SchemaType: {
    OBJECT: "OBJECT",
    ARRAY: "ARRAY",
    STRING: "STRING",
    NUMBER: "NUMBER",
  },
}));

// Static import — module is evaluated once, mock is already in place.
import {
  isAIEnabled,
  analyzeProjectUnits,
  generateBriefing,
  freeformPrompt,
  analyzeUnifierTable,
  generateFeedbackAssistCalibrate,
  _resetClientForTesting,
} from "@/lib/ai/gemini";
import type { AIUnitCard, AIProjectSummary, InsightReport, UnifierTableAnalysis } from "@/lib/ai/types";
import type { UnifierTableInput } from "@/lib/ai/gemini";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockProject: AIProjectSummary = {
  projectName: "Test Tower",
  siteLocation: "123 Main St",
  status: "Active",
  installManagerName: "Jane Smith",
  projectManagerName: "Bob Jones",
};

const mockUnits: AIUnitCard[] = [
  {
    building: "A",
    level: "1",
    unit: "101",
    unitType: "Studio",
    scopes: [
      {
        description: "Flooring",
        scopeType: "Flooring",
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
        percentComplete: 100,
        installer: "Team A",
        shipPhase: "P1",
        buildPhase: "B1",
      },
    ],
  },
  {
    building: "A",
    level: "1",
    unit: "102",
    unitType: "1BR",
    scopes: [
      {
        description: "Electrical",
        scopeType: "Electrical",
        scopeStage: "ASSEMBLY",
        scopeStatus: "BLOCKED",
        percentComplete: 30,
        installer: "Team B",
        shipPhase: "P1",
        buildPhase: "B2",
      },
    ],
  },
];

const mockInsightReport: InsightReport = {
  summary: "Project is progressing with one blocked unit.",
  completionPct: 50,
  risks: [{ severity: "high", description: "Unit 102 blocked in Assembly" }],
  bottlenecks: [{ stage: "ASSEMBLY", unitCount: 1, reason: "Electrical issue" }],
  highlights: ["Unit 101 fully complete"],
};

// ── Shared setup / teardown ───────────────────────────────────────────────────

beforeEach(() => {
  process.env.GEMINI_API_KEY = "test-key-123";
  _resetClientForTesting();
  mockGenerateContent.mockReset();
  mockGetGenerativeModel.mockReset();
  mockGetGenerativeModel.mockReturnValue({ generateContent: mockGenerateContent });
});

afterEach(() => {
  delete process.env.GEMINI_API_KEY;
});

// ── isAIEnabled ───────────────────────────────────────────────────────────────

describe("isAIEnabled()", () => {
  it("returns true when GEMINI_API_KEY is set", () => {
    expect(isAIEnabled()).toBe(true);
  });

  it("returns false when GEMINI_API_KEY is empty string", () => {
    process.env.GEMINI_API_KEY = "";
    expect(isAIEnabled()).toBe(false);
  });

  it("returns false when GEMINI_API_KEY is absent", () => {
    delete process.env.GEMINI_API_KEY;
    expect(isAIEnabled()).toBe(false);
  });
});

// ── getClient guard (key missing) ─────────────────────────────────────────────

describe("getClient() — throws when GEMINI_API_KEY is absent", () => {
  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  it("analyzeProjectUnits rejects when key is absent", async () => {
    await expect(analyzeProjectUnits(mockUnits, mockProject)).rejects.toThrow(
      "GEMINI_API_KEY is not set"
    );
  });

  it("generateBriefing rejects when key is absent", async () => {
    await expect(generateBriefing(mockUnits, mockProject)).rejects.toThrow(
      "GEMINI_API_KEY is not set"
    );
  });

  it("freeformPrompt rejects when key is absent", async () => {
    await expect(freeformPrompt("test")).rejects.toThrow(
      "GEMINI_API_KEY is not set"
    );
  });
});

// ── analyzeProjectUnits ───────────────────────────────────────────────────────

describe("analyzeProjectUnits()", () => {
  beforeEach(() => {
    mockGenerateContent.mockResolvedValue({
      response: { text: () => JSON.stringify(mockInsightReport) },
    });
  });

  it("calls Gemini with gemini-2.5-flash model", async () => {
    await analyzeProjectUnits(mockUnits, mockProject);
    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gemini-2.5-flash" })
    );
  });

  it("returns a parsed InsightReport with correct shape", async () => {
    const report = await analyzeProjectUnits(mockUnits, mockProject);
    expect(report.summary).toBe(mockInsightReport.summary);
    expect(report.completionPct).toBe(50);
    expect(report.risks).toHaveLength(1);
    expect(report.risks[0].severity).toBe("high");
    expect(report.bottlenecks).toHaveLength(1);
    expect(report.bottlenecks[0].stage).toBe("ASSEMBLY");
    expect(report.highlights).toHaveLength(1);
  });

  it("includes project name and site in the prompt", async () => {
    await analyzeProjectUnits(mockUnits, mockProject);
    const promptArg = mockGenerateContent.mock.calls[0][0] as string;
    expect(promptArg).toContain("Test Tower");
    expect(promptArg).toContain("123 Main St");
  });

  it("includes total unit count in the prompt", async () => {
    await analyzeProjectUnits(mockUnits, mockProject);
    const promptArg = mockGenerateContent.mock.calls[0][0] as string;
    expect(promptArg).toContain("Total units: 2");
  });

  it("counts blocked scopes correctly in the prompt", async () => {
    await analyzeProjectUnits(mockUnits, mockProject);
    const promptArg = mockGenerateContent.mock.calls[0][0] as string;
    expect(promptArg).toContain("Blocked scopes: 1");
  });

  it("throws if Gemini returns invalid JSON", async () => {
    mockGenerateContent.mockResolvedValue({
      response: { text: () => "not valid json {{{" },
    });
    await expect(analyzeProjectUnits(mockUnits, mockProject)).rejects.toThrow();
  });
});

// ── generateBriefing ──────────────────────────────────────────────────────────

describe("generateBriefing()", () => {
  beforeEach(() => {
    mockGenerateContent.mockResolvedValue({
      response: { text: () => "## Progress Summary\n\nGood progress overall." },
    });
  });

  it("returns a markdown string", async () => {
    const result = await generateBriefing(mockUnits, mockProject);
    expect(typeof result).toBe("string");
    expect(result).toContain("Progress Summary");
  });

  it("includes project name in the prompt", async () => {
    await generateBriefing(mockUnits, mockProject);
    const promptArg = mockGenerateContent.mock.calls[0][0] as string;
    expect(promptArg).toContain("Test Tower");
    expect(promptArg).toContain("123 Main St");
  });

  it("reports blocked unit count in the prompt", async () => {
    await generateBriefing(mockUnits, mockProject);
    const promptArg = mockGenerateContent.mock.calls[0][0] as string;
    // Unit 102 has a BLOCKED scope
    expect(promptArg).toContain("Has blocked scopes: 1");
  });

  it("reports fully complete units in the prompt", async () => {
    await generateBriefing(mockUnits, mockProject);
    const promptArg = mockGenerateContent.mock.calls[0][0] as string;
    // Unit 101 is the only fully complete unit
    expect(promptArg).toContain("Fully complete: 1");
  });
});

// ── freeformPrompt ────────────────────────────────────────────────────────────

describe("freeformPrompt()", () => {
  beforeEach(() => {
    mockGenerateContent.mockResolvedValue({
      response: { text: () => "Here is my analysis of your errors." },
    });
  });

  it("returns the raw text response from Gemini", async () => {
    const result = await freeformPrompt("Analyze these errors: ...");
    expect(result).toBe("Here is my analysis of your errors.");
  });

  it("passes the exact prompt string to Gemini", async () => {
    const myPrompt = "Diagnose this crash: ReferenceError at line 42";
    await freeformPrompt(myPrompt);
    expect(mockGenerateContent).toHaveBeenCalledWith(myPrompt);
  });

  it("uses gemini-2.5-flash model", async () => {
    await freeformPrompt("test prompt");
    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gemini-2.5-flash" })
    );
  });
});

// ── analyzeUnifierTable ───────────────────────────────────────────────────────

describe("analyzeUnifierTable()", () => {
  const mockTableDef: UnifierTableInput = {
    tableName: "UNIFIER_UXPSR",
    displayName: "Project Status Reports",
    description: "G/Y/R health indicators: schedule, cost, quality, risk, safety",
    columns: [
      { code: "STATUS_SCHEDULE", label: "Schedule Status" },
      { code: "STATUS_COST", label: "Cost Status" },
      { code: "PROJECT_ID", label: "Project ID" },
    ],
  };

  const mockSampleRows = [
    { STATUS_SCHEDULE: "G", STATUS_COST: "Y", PROJECT_ID: "PRJ-001" },
    { STATUS_SCHEDULE: "R", STATUS_COST: "G", PROJECT_ID: "PRJ-002" },
    { STATUS_SCHEDULE: null, STATUS_COST: null, PROJECT_ID: "PRJ-003" },
  ];

  const mockAnalysis: UnifierTableAnalysis = {
    summary: "Project Status Reports track G/Y/R health indicators per project.",
    integrationStatus: "not-yet-integrated",
    relatedDashboardFeatures: [
      { feature: "Status Reports page", explanation: "Directly maps to the G/Y/R status indicators." },
    ],
    suggestedIntegrations: [
      { column: "STATUS_SCHEDULE", dashboardPlacement: "Project Detail header", effort: "low" },
    ],
    newFeatureIdeas: [
      { title: "Portfolio Health Dashboard", description: "Cross-project G/Y/R heat map.", tablesNeeded: ["UNIFIER_UXPSR"] },
    ],
    dataQualityNotes: ["Some rows have null STATUS_SCHEDULE — handle gracefully."],
  };

  beforeEach(() => {
    mockGenerateContent.mockResolvedValue({
      response: { text: () => JSON.stringify(mockAnalysis) },
    });
  });

  it("calls Gemini with gemini-2.5-flash model", async () => {
    await analyzeUnifierTable(mockTableDef, mockSampleRows);
    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gemini-2.5-flash" })
    );
  });

  it("returns a parsed UnifierTableAnalysis with the correct shape", async () => {
    const result = await analyzeUnifierTable(mockTableDef, mockSampleRows);
    expect(result.summary).toBe(mockAnalysis.summary);
    expect(result.integrationStatus).toBe("not-yet-integrated");
    expect(result.relatedDashboardFeatures).toHaveLength(1);
    expect(result.suggestedIntegrations).toHaveLength(1);
    expect(result.newFeatureIdeas).toHaveLength(1);
    expect(result.dataQualityNotes).toHaveLength(1);
  });

  it("includes the table name in the prompt", async () => {
    await analyzeUnifierTable(mockTableDef, mockSampleRows);
    const promptArg = mockGenerateContent.mock.calls[0][0] as string;
    expect(promptArg).toContain("UNIFIER_UXPSR");
    expect(promptArg).toContain("Project Status Reports");
  });

  it("works with empty sample rows (schema-only analysis)", async () => {
    const result = await analyzeUnifierTable(mockTableDef, []);
    expect(result.summary).toBe(mockAnalysis.summary);
    const promptArg = mockGenerateContent.mock.calls[0][0] as string;
    expect(promptArg).toContain("no sample rows available");
  });

  it("redacts EMAIL field values from sample rows", async () => {
    const rowsWithPII = [
      { EMAIL: "user@example.com", STATUS_SCHEDULE: "G", PROJECT_ID: "PRJ-001" },
    ];
    await analyzeUnifierTable(mockTableDef, rowsWithPII);
    const promptArg = mockGenerateContent.mock.calls[0][0] as string;
    expect(promptArg).not.toContain("user@example.com");
    expect(promptArg).toContain("[REDACTED]");
  });

  it("limits sample rows to 10 even when more are passed", async () => {
    const manyRows = Array.from({ length: 20 }, (_, i) => ({ PROJECT_ID: `PRJ-${i}` }));
    await analyzeUnifierTable(mockTableDef, manyRows);
    const promptArg = mockGenerateContent.mock.calls[0][0] as string;
    // The JSON dump of 10 rows should not contain PRJ-10 through PRJ-19
    expect(promptArg).not.toContain("PRJ-10");
  });

  it("throws when GEMINI_API_KEY is absent", async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(analyzeUnifierTable(mockTableDef, [])).rejects.toThrow(
      "GEMINI_API_KEY is not set"
    );
  });

  it("throws if Gemini returns invalid JSON", async () => {
    mockGenerateContent.mockResolvedValue({
      response: { text: () => "not json {{" },
    });
    await expect(analyzeUnifierTable(mockTableDef, mockSampleRows)).rejects.toThrow();
  });
});

// ── generateFeedbackAssistCalibrate ─────────────────────────────────────────

describe("generateFeedbackAssistCalibrate()", () => {
  const baseReport = {
    kind: "BUG" as const,
    suggestedTitle: "Save crashes",
    suggestedDescription: "It breaks",
    summary: "Crash",
  };

  beforeEach(() => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () =>
          JSON.stringify({
            ...baseReport,
            suggestedDescription: "Revised text",
          }),
      },
    });
  });

  it("returns a validated AssistFinalReport", async () => {
    const result = await generateFeedbackAssistCalibrate({
      feedbackType: "BUG",
      initialTitle: "",
      initialDescription: "Crash on save",
      pageUrl: "/en/projects",
      transcript: [],
      currentReport: baseReport,
      calibrationInstructions: "Mention Safari",
      videoRef: null,
      imageRef: null,
    });
    expect(result.suggestedDescription).toBe("Revised text");
    expect(result.kind).toBe("BUG");
  });

  it("includes fileData parts when video and image refs are present", async () => {
    await generateFeedbackAssistCalibrate({
      feedbackType: "BUG",
      initialTitle: "",
      initialDescription: "x",
      pageUrl: null,
      transcript: [],
      currentReport: baseReport,
      calibrationInstructions: "Shorten title",
      videoRef: {
        fileUri: "https://x/vid",
        mimeType: "video/webm",
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
      imageRef: {
        fileUri: "https://x/img",
        mimeType: "image/png",
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
    });
    const firstArg = mockGenerateContent.mock.calls[0][0] as {
      contents: Array<{ parts: unknown[] }>;
    };
    const parts = firstArg.contents[0].parts;
    expect(parts).toHaveLength(3);
    expect(parts[0]).toMatchObject({
      fileData: { fileUri: "https://x/vid", mimeType: "video/webm" },
    });
    expect(parts[1]).toMatchObject({
      fileData: { fileUri: "https://x/img", mimeType: "image/png" },
    });
    expect(parts[2]).toMatchObject({ text: expect.stringContaining("calibration") });
  });
});
