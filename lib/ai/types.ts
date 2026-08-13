// ── Shared AI types ───────────────────────────────────────────────────────────
// These are returned by the /api/ai/analyze route and consumed by AI components.
// Gemini is asked to return structured JSON matching these shapes.

export type ScopeStage = "STAGING" | "ASSEMBLY" | "INSTALL";
export type ScopeStatus = "NOT_STARTED" | "IN_PROGRESS" | "BLOCKED" | "PENDING_VERIFICATION" | "COMPLETE";
export type RiskSeverity = "high" | "medium" | "low";

export interface Risk {
  severity: RiskSeverity;
  description: string;
}

export interface Bottleneck {
  stage: ScopeStage;
  unitCount: number;
  reason: string;
}

export interface InsightReport {
  summary: string;
  completionPct: number;
  risks: Risk[];
  bottlenecks: Bottleneck[];
  highlights: string[];
}

// ── Unit shape sent to Gemini ─────────────────────────────────────────────────
// Stripped-down view of a unit card — no IDs, no internal keys.

export interface AIUnitScopeRow {
  description: string;
  scopeType: string | null;
  scopeStage: ScopeStage | null;
  scopeStatus: ScopeStatus | null;
  percentComplete: number | null;
  installer: string | null;
  shipPhase: string;
  buildPhase: string;
}

export interface AIUnitCard {
  building: string;
  level: string;
  unit: string;
  unitType: string;
  scopes: AIUnitScopeRow[];
}

export interface AIProjectSummary {
  projectName: string;
  siteLocation: string;
  status: string;
  installManagerName: string | null;
  projectManagerName: string | null;
}

// ── Portfolio analysis ────────────────────────────────────────────────────────

export interface PortfolioRisk {
  projectName: string;
  severity: RiskSeverity;
  reason: string;
}

export interface PortfolioReport {
  summary: string;
  atRiskCount: number;
  topRisks: PortfolioRisk[];
  healthyCount: number;
}

// ── Daily Briefing — Phil's personal morning sprint ───────────────────────────

export interface MergedPR {
  number: number;
  title: string;
  url: string;
  mergedAt: string;
  author: string;
  body: string;
}

export interface RecentCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

export interface DBActivityStats {
  projectsCreated: number;
  projectsUpdated: number;
  rowsUpdated: number;
  totalActiveProjects: number;
  blockedRowCount: number;
}

/** Context assembled by the API route before calling Gemini. */
export interface DailyBriefingContext {
  dateFor: string;            // ISO date string for the day being summarized (yesterday)
  mergedPRs: MergedPR[];
  recentCommits: RecentCommit[];
  dbStats: DBActivityStats;
  openPRs: OpenPR[];          // currently open PRs for in-flight section
}

export interface ShippedItem {
  title: string;
  description: string;
  url?: string;
}

export interface WorkSummary {
  narrative: string;           // 2-3 sentence human summary
  shipped: ShippedItem[];      // PRs and notable commits
  dbHighlights: string;        // one sentence on DB-level activity
}

export interface OptimizationItem {
  title: string;
  description: string;
  estimatedROI: string;        // e.g. "Saves ~2h/week per PM"
  priority: "high" | "medium" | "low";
  category: string;            // e.g. "DX", "Performance", "Process", "Security"
}

export interface ChallengeItem {
  description: string;
  resolution: "resolved" | "open" | "monitoring";
  impact: string;
  suggestedAction?: string;
}

export interface ROILineItem {
  area: string;
  value: string;
  reasoning: string;
}

export interface ROIAnalysis {
  summary: string;
  items: ROILineItem[];
  totalEstimatedValue: string; // e.g. "$2,400/month in saved hours"
}

export interface TechPulseItem {
  title: string;
  source: string;
  url?: string;                // direct article URL when Google Search returns one
  relevance: string;           // 1-sentence connection to CP Build / construction tech
  opportunityAngle?: string;   // optional cross-domain insight
}

export interface TechPulse {
  summary: string;
  items: TechPulseItem[];
}

export interface SprintItem {
  priority: number;            // 1 = highest
  task: string;
  why: string;
  estimatedImpact: string;
  timeEstimate: string;        // e.g. "2h", "30min"
}

// ── Open PRs / In-Flight Work ─────────────────────────────────────────────────

export interface OpenPR {
  number: number;
  title: string;
  url: string;
  draft: boolean;
  author: string;
  createdAt: string;
  labels: string[];
}

export interface InFlightWork {
  openPRs: OpenPR[];
  summary: string;             // Gemini: one-sentence "what's still in the air"
}

// ── Sprint Retrospective ──────────────────────────────────────────────────────

export interface SprintRetro {
  wentWell: string[];          // 2-4 bullets on what went well
  toImprove: string[];         // 2-4 bullets on what to improve
  agentRecommendation: string; // how you and the AI can work better tomorrow
  velocityNote: string;        // "light / normal / heavy day" + comparison note
}

export interface DailyBriefingReport {
  generatedAt: string;         // ISO datetime
  dateFor: string;             // ISO date — which day this covers
  yesterdaysWork: WorkSummary;
  inFlight: InFlightWork;      // open PRs + Gemini in-flight summary
  optimizationsRecognized: OptimizationItem[];
  issuesAndChallenges: ChallengeItem[];
  roiAnalysis: ROIAnalysis;
  techPulse: TechPulse;
  todaysSprint: {
    theme: string;             // one-sentence theme for the day
    items: SprintItem[];
  };
  sprintRetro: SprintRetro;    // frank retrospective on yesterday's sprint
  morningInsight: string;      // one powerful cross-domain "aha" observation
}

// ── Release tour generation ───────────────────────────────────────────────────

export interface ReleaseTourChange {
  id: string;
  description: string;
  route?: string;
  category?: string;
}

/** Input to generateReleaseTour — subset of the Release model. */
export interface ReleaseTourInput {
  title: string;
  branch: string | null;
  environment: string;
  changes: ReleaseTourChange[];
}

/** Single step returned by generateReleaseTour — matches TourStep in TourPlayer. */
export interface GeneratedTourStep {
  order: number;
  pageUrl: string;
  elementSelector: string;
  title: string;
  description: string;
  voiceText: string;
}

/**
 * A single QA verification step generated by Gemini for the DevTools Release Checklist.
 * Audience: Phil (or any admin) verifying the release before promoting to next environment.
 */
export interface GeneratedVerificationStep {
  /** Stable slug — used as localStorage key for checked/dismissed state. */
  id: string;
  /** References changes[].id from the Release — links this step back to its change. */
  changeId: string;
  /** Short, human-readable headline. e.g. "Projects page loads without error" */
  title: string;
  /** Step-by-step instructions for verifying the change. e.g. "Navigate to /en/projects. Confirm the table renders and no error banner appears." */
  instructions: string;
  /** App route where the change lives. e.g. "/en/projects" */
  route: string;
  /** Change category for colour coding. */
  category: string;
}

/**
 * A Gemini-generated pre-PR verification step used by PRWorkflowPanel.
 * Guides admin through page-level smoke checks before opening a pull request.
 */
export interface VerificationStep {
  title: string;
  pageUrl: string;
  instruction: string;
  elementHint?: string;
}

/**
 * A single automation action within a Gemini-generated simulation step.
 * Covers all action shapes produced by generateTourFromDescription.
 */
export interface SimulationAction {
  type: string;
  /** navigate action */
  url?: string;
  /** click / hover / scroll target */
  selector?: string;
  /** click / hover display label */
  label?: string;
  /** type action text */
  text?: string;
  /** wait action duration in milliseconds */
  ms?: number;
  /** scroll behavior */
  behavior?: "smooth" | "instant";
}

/**
 * A Gemini-generated simulation tour step used by TourGeneratorPanel.
 * Includes optional automation actions alongside the standard tour step fields.
 */
export interface GeneratedSimulationStep {
  order: number;
  pageUrl: string;
  elementSelector: string;
  title: string;
  description: string;
  voiceText: string;
  actions?: SimulationAction[];
}

/** Input to generateReleaseVerification. */
export interface ReleaseVerificationInput {
  title: string;
  branch: string | null;
  environment: string;
  changes: ReleaseTourChange[];
  /** Optional free-text feedback to refine previously generated steps. */
  feedback?: string;
}

// ── Unifier table integration analysis ───────────────────────────────────────

export interface UnifierIntegrationSuggestion {
  column: string;
  dashboardPlacement: string;
  effort: "low" | "medium" | "high";
}

export interface UnifierNewFeatureIdea {
  title: string;
  description: string;
  tablesNeeded: string[];
}

export interface UnifierRelatedFeature {
  feature: string;
  explanation: string;
}

export interface UnifierTableAnalysis {
  summary: string;
  integrationStatus: "already-integrated" | "partially-integrated" | "not-yet-integrated";
  relatedDashboardFeatures: UnifierRelatedFeature[];
  suggestedIntegrations: UnifierIntegrationSuggestion[];
  newFeatureIdeas: UnifierNewFeatureIdea[];
  dataQualityNotes: string[];
}

// ── Briefing Synthesis — long-term trend report ───────────────────────────────

export interface SynthesisIssue {
  description: string;
  occurrences: number;
  lastSeen: string;
  suggestedAction: string;
}

export interface SynthesisOptimizationCategory {
  category: string;
  count: number;
  totalROISummary: string;
  topExample: string;
}

export interface SynthesisRecommendation {
  title: string;
  rationale: string;
  priority: "high" | "medium" | "low";
}

export interface BriefingSynthesisReport {
  windowLabel: string;           // e.g. "Last 30 days" or "All time (14 briefings)"
  briefingCount: number;
  dateRangeStart: string;
  dateRangeEnd: string;
  roiTrend: string;              // narrative paragraph on ROI trajectory
  recurringIssues: SynthesisIssue[];
  topOptimizationCategories: SynthesisOptimizationCategory[];
  persistentChallenges: string[];
  velocityObservations: string;  // narrative on sprint velocity patterns
  recommendations: SynthesisRecommendation[];
  summary: string;               // 2-3 sentence executive summary
}

// ── Briefing Card Feedback types ──────────────────────────────────────────────

export type FeedbackSection =
  | "ROI_ITEM"
  | "OPTIMIZATION"
  | "ISSUE"
  | "SPRINT_ITEM"
  | "SHIPPED_ITEM"
  | "INSIGHT";

export type FeedbackType = "JUSTIFY" | "CHALLENGE" | "APPROVE";

export type ChallengeReason =
  | "WRONG_CONTEXT"
  | "INFLATED_NUMBER"
  | "NOT_APPLICABLE"
  | "OTHER";

// ── API request / response shapes ────────────────────────────────────────────

export type AnalyzeType = "units" | "briefing" | "portfolio" | "devtools";

export interface AnalyzeRequest {
  type: AnalyzeType;
  projectId?: string;
  prompt?: string;
}

export interface AnalyzeResponse {
  insights?: InsightReport;
  briefing?: string;
  portfolio?: PortfolioReport;
  response?: string;
}

// ── Feedback AI assist ────────────────────────────────────────────────────────
// Shared runtime shapes live in `lib/feedback-assist-schema.ts` (Zod-backed).
// Re-export the model identifier here so route handlers and tests can pin
// a single source of truth for auditing which model wrote a report.

/** Current Gemini model used for the AI-assisted feedback flow. */
export const FEEDBACK_ASSIST_MODEL = "gemini-2.5-flash" as const;
export type FeedbackAssistModel = typeof FEEDBACK_ASSIST_MODEL;

// ── Video-seeded feedback assist limits ──────────────────────────────────────
// Centralized so the browser-side recorder UI, the server upload route, and
// tests all enforce the same caps. These bound Gemini cost + latency rather
// than any technical Files API limit (which is 2GB).

/** Maximum recording length accepted for AI analysis (seconds). */
export const FEEDBACK_ASSIST_VIDEO_MAX_SEC = 300;

/** Maximum recording size accepted for AI analysis (bytes). */
export const FEEDBACK_ASSIST_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

/** Allowed MIME types for uploaded recordings. */
export const FEEDBACK_ASSIST_VIDEO_MIME_ALLOWLIST = [
  "video/webm",
  "video/mp4",
] as const;
export type FeedbackAssistVideoMime = (typeof FEEDBACK_ASSIST_VIDEO_MIME_ALLOWLIST)[number];

// ── Image / screenshot feedback assist (Gemini Files API) ─────────────────────
/** Maximum screenshot size accepted for vision-grounded feedback (bytes). */
export const FEEDBACK_ASSIST_IMAGE_MAX_BYTES = 12 * 1024 * 1024;

/** Allowed image MIME types for uploaded screenshots. */
export const FEEDBACK_ASSIST_IMAGE_MIME_ALLOWLIST = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;
export type FeedbackAssistImageMime = (typeof FEEDBACK_ASSIST_IMAGE_MIME_ALLOWLIST)[number];
