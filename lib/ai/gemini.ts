import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { db } from "@/lib/db";
import type {
  AIUnitCard,
  AIProjectSummary,
  InsightReport,
  PortfolioReport,
  DailyBriefingContext,
  DailyBriefingReport,
  BriefingSynthesisReport,
  FeedbackSection,
  ReleaseTourInput,
  GeneratedTourStep,
  ReleaseVerificationInput,
  GeneratedVerificationStep,
  GeneratedSimulationStep,
  UnifierTableAnalysis,
} from "./types";
import { FEEDBACK_ASSIST_MODEL } from "./types";
import type {
  AssistFinalReport,
  AssistImageRef,
  AssistTranscriptEntry,
  AssistTurnResponse,
  AssistVideoRef,
} from "@/lib/feedback-assist-schema";
import {
  ASSIST_MAX_TURNS,
  assistFinalReportSchema,
  assistTurnResponseSchema,
} from "@/lib/feedback-assist-schema";

// ── Singleton client ──────────────────────────────────────────────────────────

let _client: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  if (!_client) {
    _client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return _client;
}

export function isAIEnabled(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/** Reset the singleton — for use in tests only. */
export function _resetClientForTesting(): void {
  _client = null;
}

// ── JSON schema helpers ───────────────────────────────────────────────────────

const insightReportSchema = {
  type: SchemaType.OBJECT,
  properties: {
    summary: { type: SchemaType.STRING },
    completionPct: { type: SchemaType.NUMBER },
    risks: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          severity: { type: SchemaType.STRING, enum: ["high", "medium", "low"] },
          description: { type: SchemaType.STRING },
        },
        required: ["severity", "description"],
      },
    },
    bottlenecks: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          stage: { type: SchemaType.STRING, enum: ["STAGING", "ASSEMBLY", "INSTALL"] },
          unitCount: { type: SchemaType.NUMBER },
          reason: { type: SchemaType.STRING },
        },
        required: ["stage", "unitCount", "reason"],
      },
    },
    highlights: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
  },
  required: ["summary", "completionPct", "risks", "bottlenecks", "highlights"],
};

const portfolioReportSchema = {
  type: SchemaType.OBJECT,
  properties: {
    summary: { type: SchemaType.STRING },
    atRiskCount: { type: SchemaType.NUMBER },
    topRisks: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          projectName: { type: SchemaType.STRING },
          severity: { type: SchemaType.STRING, enum: ["high", "medium", "low"] },
          reason: { type: SchemaType.STRING },
        },
        required: ["projectName", "severity", "reason"],
      },
    },
    healthyCount: { type: SchemaType.NUMBER },
  },
  required: ["summary", "atRiskCount", "topRisks", "healthyCount"],
};

// ── analyzeProjectUnits ───────────────────────────────────────────────────────

export async function analyzeProjectUnits(
  units: AIUnitCard[],
  project: AIProjectSummary
): Promise<InsightReport> {
  const client = getClient();
  const model = client.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      // @ts-expect-error — responseSchema is supported at runtime but not yet in the TS types
      responseSchema: insightReportSchema,
    },
  });

  const totalScopes = units.reduce((n, u) => n + u.scopes.length, 0);
  const completedScopes = units.reduce(
    (n, u) => n + u.scopes.filter((s) => s.scopeStatus === "COMPLETE").length,
    0
  );
  const blockedScopes = units.reduce(
    (n, u) => n + u.scopes.filter((s) => s.scopeStatus === "BLOCKED").length,
    0
  );
  const inProgressScopes = units.reduce(
    (n, u) => n + u.scopes.filter((s) => s.scopeStatus === "IN_PROGRESS").length,
    0
  );

  const prompt = `
You are a construction project analyst for CP Build, an interior subcontractor.
Analyze the following unit-level scope data for the project "${project.projectName}" 
at ${project.siteLocation} (status: ${project.status}).

Project context:
- Install Manager: ${project.installManagerName ?? "unassigned"}
- Project Manager: ${project.projectManagerName ?? "unassigned"}
- Total units: ${units.length}
- Total scope rows: ${totalScopes}
- Completed scopes: ${completedScopes}
- Blocked scopes: ${blockedScopes}
- In-progress scopes: ${inProgressScopes}

Unit data (grouped by building/level/unit):
${JSON.stringify(units, null, 2)}

Instructions:
1. Write a 2–3 sentence executive summary of the project's current health.
2. Compute overall completionPct as a 0–100 integer.
3. Identify up to 5 risks. Severity: "high" if blocking multiple units or > 20% of scopes; "medium" for isolated issues; "low" for minor observations.
4. List bottlenecks per stage where units are stuck. Only include stages with blocked or stalled units.
5. List up to 3 highlights (positive observations).
Be specific to the actual data. Do not invent data not present.
`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  return JSON.parse(text) as InsightReport;
}

// ── generateBriefing ──────────────────────────────────────────────────────────

export async function generateBriefing(
  units: AIUnitCard[],
  project: AIProjectSummary
): Promise<string> {
  const client = getClient();
  const model = client.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "text/plain",
    },
  });

  const blockedUnits = units.filter((u) =>
    u.scopes.some((s) => s.scopeStatus === "BLOCKED")
  );
  const completeUnits = units.filter((u) =>
    u.scopes.every((s) => s.scopeStatus === "COMPLETE")
  );
  const inProgressUnits = units.filter((u) =>
    u.scopes.some((s) => s.scopeStatus === "IN_PROGRESS") &&
    !u.scopes.some((s) => s.scopeStatus === "BLOCKED")
  );

  const prompt = `
You are preparing a construction site briefing for an Install Manager at CP Build.
Project: "${project.projectName}" | Site: ${project.siteLocation} | Status: ${project.status}

Key metrics:
- Total units: ${units.length}
- Fully complete: ${completeUnits.length}
- In progress (no blocks): ${inProgressUnits.length}
- Has blocked scopes: ${blockedUnits.length}

Full unit data:
${JSON.stringify(units, null, 2)}

Write a professional site briefing in markdown with these sections:
## Progress Summary
(2–3 sentences on overall status)

## Units Requiring Attention
(Table: Unit | Building/Level | Blocked Scopes | Notes. Only units with BLOCKED or zero progress.)

## Completed Units
(Brief list or count.)

## Recommended Next Steps
(Numbered list, 3–5 action items based on the data.)

Be concise and action-oriented. Use real data from the unit list only.
`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}

// ── analyzePortfolio ──────────────────────────────────────────────────────────

// ── freeformPrompt ────────────────────────────────────────────────────────────

export async function freeformPrompt(prompt: string): Promise<string> {
  const client = getClient();
  const model = client.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "text/plain" },
  });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

// ── generateDailyBriefingReport ───────────────────────────────────────────────

/** JSON schema for the full DailyBriefingReport used in Stage 2. */
const dailyBriefingSchema = {
  type: SchemaType.OBJECT,
  properties: {
    generatedAt: { type: SchemaType.STRING },
    dateFor: { type: SchemaType.STRING },
    yesterdaysWork: {
      type: SchemaType.OBJECT,
      properties: {
        narrative: { type: SchemaType.STRING },
        shipped: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              title: { type: SchemaType.STRING },
              description: { type: SchemaType.STRING },
              url: { type: SchemaType.STRING },
            },
            required: ["title", "description"],
          },
        },
        dbHighlights: { type: SchemaType.STRING },
      },
      required: ["narrative", "shipped", "dbHighlights"],
    },
    optimizationsRecognized: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          title: { type: SchemaType.STRING },
          description: { type: SchemaType.STRING },
          estimatedROI: { type: SchemaType.STRING },
          priority: { type: SchemaType.STRING, enum: ["high", "medium", "low"] },
          category: { type: SchemaType.STRING },
        },
        required: ["title", "description", "estimatedROI", "priority", "category"],
      },
    },
    issuesAndChallenges: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          description: { type: SchemaType.STRING },
          resolution: { type: SchemaType.STRING, enum: ["resolved", "open", "monitoring"] },
          impact: { type: SchemaType.STRING },
          suggestedAction: { type: SchemaType.STRING },
        },
        required: ["description", "resolution", "impact"],
      },
    },
    roiAnalysis: {
      type: SchemaType.OBJECT,
      properties: {
        summary: { type: SchemaType.STRING },
        items: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              area: { type: SchemaType.STRING },
              value: { type: SchemaType.STRING },
              reasoning: { type: SchemaType.STRING },
            },
            required: ["area", "value", "reasoning"],
          },
        },
        totalEstimatedValue: { type: SchemaType.STRING },
      },
      required: ["summary", "items", "totalEstimatedValue"],
    },
    inFlight: {
      type: SchemaType.OBJECT,
      properties: {
        openPRs: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              number: { type: SchemaType.NUMBER },
              title: { type: SchemaType.STRING },
              url: { type: SchemaType.STRING },
              draft: { type: SchemaType.BOOLEAN },
              author: { type: SchemaType.STRING },
              createdAt: { type: SchemaType.STRING },
              labels: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
            },
            required: ["number", "title", "url", "draft", "author", "createdAt", "labels"],
          },
        },
        summary: { type: SchemaType.STRING },
      },
      required: ["openPRs", "summary"],
    },
    techPulse: {
      type: SchemaType.OBJECT,
      properties: {
        summary: { type: SchemaType.STRING },
        items: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              title: { type: SchemaType.STRING },
              source: { type: SchemaType.STRING },
              url: { type: SchemaType.STRING },
              relevance: { type: SchemaType.STRING },
              opportunityAngle: { type: SchemaType.STRING },
            },
            required: ["title", "source", "relevance"],
          },
        },
      },
      required: ["summary", "items"],
    },
    todaysSprint: {
      type: SchemaType.OBJECT,
      properties: {
        theme: { type: SchemaType.STRING },
        items: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              priority: { type: SchemaType.NUMBER },
              task: { type: SchemaType.STRING },
              why: { type: SchemaType.STRING },
              estimatedImpact: { type: SchemaType.STRING },
              timeEstimate: { type: SchemaType.STRING },
            },
            required: ["priority", "task", "why", "estimatedImpact", "timeEstimate"],
          },
        },
      },
      required: ["theme", "items"],
    },
    sprintRetro: {
      type: SchemaType.OBJECT,
      properties: {
        wentWell: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        toImprove: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        agentRecommendation: { type: SchemaType.STRING },
        velocityNote: { type: SchemaType.STRING },
      },
      required: ["wentWell", "toImprove", "agentRecommendation", "velocityNote"],
    },
    morningInsight: { type: SchemaType.STRING },
  },
  required: [
    "generatedAt",
    "dateFor",
    "yesterdaysWork",
    "inFlight",
    "optimizationsRecognized",
    "issuesAndChallenges",
    "roiAnalysis",
    "techPulse",
    "todaysSprint",
    "sprintRetro",
    "morningInsight",
  ],
};

/**
 * Generates Phil's daily morning briefing in two stages:
 *
 * Stage 1 — gemini-2.0-flash with Google Search grounding → live tech pulse markdown.
 * Stage 2 — gemini-2.5-flash with responseSchema → full DailyBriefingReport JSON.
 */
export async function generateDailyBriefingReport(
  ctx: DailyBriefingContext
): Promise<DailyBriefingReport> {
  const client = getClient();

  // ── Stage 1: Tech Pulse via Google Search grounding ──────────────────────
  const searchModel = client.getGenerativeModel({
    model: "gemini-2.0-flash",
    // @ts-expect-error — googleSearch tool is supported at runtime but not yet in the TS types
    tools: [{ googleSearch: {} }],
    generationConfig: { responseMimeType: "text/plain" },
  });

  const searchPrompt = `You are a technology and industry analyst. Search the web for real news and developments from the last 48-72 hours across these four domains:

1. CONSTRUCTION TECHNOLOGY — modular/prefab construction, BIM, construction site tech, drones/robotics on job sites, construction safety tech, material innovation
2. CONSTRUCTION PROJECT MANAGEMENT SOFTWARE — Oracle Primavera Unifier, Procore, Autodesk Construction Cloud, PlanGrid, Buildertrend, scheduling and cost management tools
3. ARTIFICIAL INTELLIGENCE & DEVELOPER TOOLS — new AI models and APIs (OpenAI, Anthropic, Google Gemini), coding assistants, AI agents, workflow automation tools
4. CONSTRUCTION BUSINESS & INDUSTRY NEWS — subcontractor trends, labor market, supply chain, building codes, funding rounds for construction tech startups

For each item, provide:
- Exact title of the article or announcement
- Source publication or company name
- Direct URL to the article (required when available from search results)
- One sentence on why it matters specifically to a technology-forward construction subcontractor building internal project management software

Return 6–10 items spanning all four domains. Prioritize items with actual URLs. Include cross-domain insights where an AI or software advancement maps directly to a construction workflow opportunity.`;

  let techPulseText = "";
  try {
    const searchResult = await searchModel.generateContent(searchPrompt);
    techPulseText = searchResult.response.text();
  } catch (err) {
    console.warn("[gemini] Tech pulse search failed, proceeding without grounded results:", err);
    techPulseText = "No grounded search results available for today.";
  }

  // ── Fetch active rules + recent challenge feedback for injection ──────────
  const [activeRules, recentChallenges] = await Promise.all([
    db.briefingRule.findMany({
      where: { active: true },
      orderBy: { createdAt: "asc" },
      select: { text: true },
    }),
    db.briefingFeedback.findMany({
      where: {
        feedbackType: "CHALLENGE",
        createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { section: true, challengeReason: true, userNote: true, createdAt: true },
    }),
  ]);

  const rulesBlock =
    activeRules.length > 0
      ? `## Context Rules (follow these strictly)\n${activeRules.map((r, i) => `${i + 1}. ${r.text}`).join("\n")}`
      : "";

  const correctionsBlock =
    recentChallenges.length > 0
      ? `## Recent Corrections from Phil (last 14 days — apply this learning)\n${recentChallenges
          .map(
            (c) =>
              `- Section: ${c.section} | Reason: ${c.challengeReason ?? "N/A"} | Note: ${c.userNote ?? "(no note)"}`
          )
          .join("\n")}`
      : "";

  // ── Stage 2: Full structured briefing ────────────────────────────────────
  const briefingModel = client.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      // @ts-expect-error — responseSchema is supported at runtime but not yet in TS types
      responseSchema: dailyBriefingSchema,
    },
  });

  const prList = ctx.mergedPRs.length
    ? ctx.mergedPRs
        .map((pr) => `PR #${pr.number}: "${pr.title}" by ${pr.author} — ${pr.url}\n${pr.body}`)
        .join("\n\n")
    : "No PRs were merged yesterday.";

  const commitList = ctx.recentCommits.length
    ? ctx.recentCommits
        .slice(0, 20)
        .map((c) => `[${c.sha}] ${c.author}: ${c.message.split("\n")[0]}`)
        .join("\n")
    : "No commits found for yesterday.";

  const openPRList = ctx.openPRs.length
    ? ctx.openPRs
        .map(
          (pr) =>
            `PR #${pr.number}${pr.draft ? " [DRAFT]" : ""}: "${pr.title}" by ${pr.author} — opened ${pr.createdAt.slice(0, 10)}${pr.labels.length ? ` [${pr.labels.join(", ")}]` : ""} ${pr.url}`
        )
        .join("\n")
    : "No open PRs.";

  const briefingPrompt = `You are Phil's personal AI Chief of Staff at CP Build — a construction subcontractor building an enterprise project management platform (Field Tracker). You are a world-class expert spanning: AI/ML engineering, construction operations, construction accounting, software development best practices, business process optimization, and ROI analysis.

## CRITICAL CONTEXT — READ BEFORE GENERATING ANY ESTIMATES

Field Tracker is a **private internal tool used exclusively by CP Build employees** (Install Managers, Project Managers, QC reviewers, and Admins). It has:
- NO public users, NO sign-ups, NO user acquisition funnel
- NO SaaS revenue model, NO subscriptions, NO consumer metrics
- NO "user activations", NO "onboarding", NO "conversion rates"
- NO connection to external customers — it is a back-office operations tool

**ROI estimates MUST be grounded solely in:**
- Hours of manual work eliminated per week (name the specific task and the person doing it)
- Risk reduction from errors caught or prevented (name the specific error type)
- Speed improvements in specific internal workflows (e.g. "IM can update 40 rows in 2 min vs 20 min manually")
- Cost avoidance from prevented rework or production outages (be specific)

**If a change (e.g. fixing a 500 error on an admin route) has no meaningful time/cost ROI for internal users, say so plainly.** Write "No direct time/cost impact — infrastructure reliability fix" rather than inventing revenue estimates. Never assign dollar values based on user acquisition, activation rates, or growth projections.

**DEPLOY COUNTING RULE — CRITICAL:**
A deployment is only counted as "successful" when it reaches production AND requires no post-deploy fix, hotfix, rollback, or emergency patch within the same deploy cycle. A deploy that reaches prod but immediately requires a follow-up fix counts as a failed or partial deploy, not a success. When reporting deployment velocity or reliability metrics, use this strict definition. Do not count merged PRs as deploys — only actual Railway production deploys that cleared the verify job AND did not require a same-day corrective deployment.

Today's date: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
Briefing covers: ${ctx.dateFor} (yesterday)

${rulesBlock}

${correctionsBlock}

## Yesterday's GitHub Activity

### Merged PRs
${prList}

### Recent Commits
${commitList}

## Currently Open PRs (in flight)
${openPRList}

## Database Activity (yesterday)
- Projects created: ${ctx.dbStats.projectsCreated}
- Projects updated: ${ctx.dbStats.projectsUpdated}
- Project rows updated: ${ctx.dbStats.rowsUpdated}
- Total active projects in system: ${ctx.dbStats.totalActiveProjects}
- Currently blocked rows across all projects: ${ctx.dbStats.blockedRowCount}

## Live Tech Pulse (from grounded search)
${techPulseText}

---

Generate Phil's daily digest JSON. Be specific, action-oriented, and insightful. Your analysis should:

1. **yesterdaysWork**: Summarize what was shipped. The "shipped" array should include each merged PR and any significant commit clusters. Be concise but specific — reference the actual PR titles and what they accomplish.

2. **inFlight**: Pass through the open PRs list exactly as given above into openPRs (preserve number, title, url, draft, author, createdAt, labels). Write a 1-sentence summary field capturing the theme of what's still pending — e.g. "Two PRs are in review: a dependency bump and the daily digest feature."

3. **optimizationsRecognized**: Based on the PRs and commits, identify 2–4 genuine optimization opportunities spotted in the work done. Focus on process improvements, technical debt addressed, or efficiency gains. Include realistic ROI estimates in human terms (time saved per week for a named role, errors prevented, specific workflow speed-up) — never user acquisition or growth metrics.

4. **issuesAndChallenges**: Identify any friction points visible in the work (PRs that were reverted, commits fixing bugs just introduced, blocked project rows). Be honest — if there were no challenges, say so with 1 item marked "resolved".

5. **roiAnalysis**: Assign business value to what was shipped. Think in terms of: hours of manual work eliminated per week (name the task and the role), risk mitigation from prevented errors, or velocity improvements in specific workflows. Only use dollar amounts if you can derive them from a named internal salary or contractor rate — never from user acquisition or growth projections. If a change has no direct ROI for an internal tool, set its value to "N/A — infrastructure fix" rather than inventing a number.

6. **techPulse**: Transform the grounded tech pulse text above into structured items. For each, find the specific connection to what CP Build is building. Include the direct article URL in the "url" field when the search provided one. The "opportunityAngle" field should highlight non-obvious cross-domain insights.

7. **todaysSprint**: Suggest 3–5 prioritized action items for today. These should build on yesterday's momentum, address open challenges, or capitalize on tech pulse items. Each item needs a clear "why" tied to business impact.

8. **sprintRetro**: Write a frank, honest retrospective on yesterday's sprint as a co-developer who was there. "wentWell" should be 2–4 bullets celebrating real wins. "toImprove" should be 2–4 bullets calling out genuine friction, slowdowns, or missed opportunities — not generic advice. "agentRecommendation" should be one specific, actionable suggestion for how Phil and the AI agent can collaborate more effectively tomorrow. "velocityNote" should characterize the day's output (e.g. "Light day — 2 PRs merged, below the recent 5/day average") and give context for why.

9. **morningInsight**: One powerful, unexpected cross-domain observation — a connection between something from the tech pulse and the construction management problem space that Phil might not have considered. Make it specific and actionable, not generic.

Set generatedAt to the current ISO datetime and dateFor to "${ctx.dateFor}".`;

  const result = await briefingModel.generateContent(briefingPrompt);
  const text = result.response.text();
  return JSON.parse(text) as DailyBriefingReport;
}

// ── generateReleaseTour ───────────────────────────────────────────────────────

/**
 * Known app routes with their selector hints.
 * Gemini uses these as context when generating element selectors.
 */
const ROUTE_HINTS: Record<string, { selector: string; label: string }> = {
  "/": { selector: 'main[aria-label="Dashboard"]', label: "Dashboard" },
  "/projects": { selector: '[data-testid="projects-table"], main', label: "Projects list" },
  "/users": { selector: 'main[aria-label="Users"], main', label: "Users / Team" },
  "/feedback": { selector: 'main[aria-label="Feedback"], main', label: "Feedback Inbox" },
  "/settings": { selector: 'main[aria-label="Settings"], main', label: "Account Settings" },
  "/devtools": { selector: '[data-testid="devtools-panel"], main', label: "DevTools" },
};

const releaseTourSchema = {
  type: SchemaType.ARRAY,
  items: {
    type: SchemaType.OBJECT,
    properties: {
      order: { type: SchemaType.NUMBER },
      pageUrl: { type: SchemaType.STRING },
      elementSelector: { type: SchemaType.STRING },
      title: { type: SchemaType.STRING },
      description: { type: SchemaType.STRING },
      voiceText: { type: SchemaType.STRING },
    },
    required: ["order", "pageUrl", "elementSelector", "title", "description", "voiceText"],
  },
};

/**
 * Uses Gemini to generate a guided tour for a release.
 *
 * Each step maps to one meaningful change in the release, with:
 * - pageUrl:          the app route where the change lives
 * - elementSelector:  a best-effort CSS selector (admins can refine in DevTools)
 * - title:            short, user-facing headline for the step
 * - description:      1–2 sentence explanation of what changed and why it matters
 * - voiceText:        natural-language script for the TTS narrator
 *
 * Falls back gracefully: if no routes are present a single overview step is returned.
 * Throws if GEMINI_API_KEY is not configured (caller should guard with isAIEnabled()).
 */
export async function generateReleaseTour(
  release: ReleaseTourInput
): Promise<GeneratedTourStep[]> {
  const client = getClient();

  const routeHintBlock = Object.entries(ROUTE_HINTS)
    .map(([route, { selector, label }]) => `  ${route}  →  selector: "${selector}"  (${label})`)
    .join("\n");

  const changesBlock = release.changes.length
    ? release.changes
        .map((c, i) => {
          const routeHint = c.route ? `  [route: ${c.route}]` : "";
          const catHint = c.category ? `  [category: ${c.category}]` : "";
          return `${i + 1}. ${c.description}${routeHint}${catHint}`;
        })
        .join("\n")
    : "No specific changes listed — describe the release in general.";

  const prompt = `You are generating a guided product tour for CP Build Field Tracker — an internal construction project management platform.

A new version was just deployed. Create a step-by-step walkthrough that shows users what changed.

## Release info
- Title: "${release.title}"
- Branch: ${release.branch ?? "unknown"}
- Environment: ${release.environment}

## Changes in this release
${changesBlock}

## Known app routes and their primary CSS selectors
${routeHintBlock}

## Instructions
1. Create one tour step per meaningful user-facing change. Skip purely internal/infrastructure changes (tests, CI, migrations, TypeScript fixes) — only include things a user would notice in the UI.
2. If there are no user-facing changes, return a single overview step pointing to "/" with selector "" that summarizes the release.
3. For each step:
   - Set "order" starting from 0.
   - Set "pageUrl" to the locale-prefixed route, e.g. "/en/projects" (always prefix with "/en").
   - Set "elementSelector" to the most specific CSS selector that would highlight the relevant UI element. Use the route hints above as a starting point. Leave as "" if no element makes sense.
   - Write "title" as a short, friendly headline (max 60 chars) — describe what changed, not just which file.
   - Write "description" as 1–2 plain-English sentences explaining the change and why it benefits the user.
   - Write "voiceText" as a natural spoken-word version of the description (no markdown, max 180 chars).
4. Maximum 8 steps. Prioritize the most impactful changes first.
5. Return ONLY the JSON array — no markdown fences, no extra text.`;

  const model = client.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      // @ts-expect-error — responseSchema supported at runtime, not yet in TS types
      responseSchema: releaseTourSchema,
    },
  });

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const steps = JSON.parse(text) as GeneratedTourStep[];

  // Ensure order values are sequential regardless of what Gemini returned
  return steps.map((s, i) => ({ ...s, order: i }));
}

// ── generateReleaseVerification ──────────────────────────────────────────────

const releaseVerificationSchema = {
  type: SchemaType.ARRAY,
  items: {
    type: SchemaType.OBJECT,
    properties: {
      id: { type: SchemaType.STRING },
      changeId: { type: SchemaType.STRING },
      title: { type: SchemaType.STRING },
      instructions: { type: SchemaType.STRING },
      route: { type: SchemaType.STRING },
      category: { type: SchemaType.STRING },
    },
    required: ["id", "changeId", "title", "instructions", "route", "category"],
  },
};

/**
 * Uses Gemini to generate a QA verification checklist for a release.
 *
 * Audience: an admin (Phil) working through the checklist before promoting to
 * the next environment. Each step is a specific, actionable verification task:
 * "go to this page, click/look for this thing, confirm it works".
 *
 * Only generates steps for user-facing changes — skips migrations, CI config,
 * test-only changes, and TypeScript fixes that have no visible UI effect.
 */
export async function generateReleaseVerification(
  input: ReleaseVerificationInput
): Promise<GeneratedVerificationStep[]> {
  const client = getClient();

  const changesBlock = input.changes.length
    ? input.changes
        .map((c, i) => {
          const routeHint = c.route ? `  [route: ${c.route}]` : "";
          const catHint = c.category ? `  [category: ${c.category}]` : "";
          return `${i + 1}. [id: ${c.id}] ${c.description}${routeHint}${catHint}`;
        })
        .join("\n")
    : "No specific changes listed.";

  const feedbackBlock = input.feedback
    ? `\n\n## Feedback on previous steps (incorporate this)\n${input.feedback}`
    : "";

  const prompt = `You are a QA checklist generator for CP Build Field Tracker — an internal construction project management platform.

An admin needs to verify that the following release works correctly before promoting it to the next environment. Generate a concise, actionable checklist of steps for them to follow.

## Release info
- Title: "${input.title}"
- Branch: ${input.branch ?? "unknown"}
- Environment: ${input.environment}

## Changes in this release
${changesBlock}${feedbackBlock}

## Instructions
1. Generate ONE verification step per meaningful user-facing change. SKIP: migrations, CI config, test-only changes, TypeScript fixes, dependency bumps — only include things visible in the UI.
2. For each step:
   - "id": a short kebab-case slug like "verify-projects-table" (stable, unique within this list)
   - "changeId": the change id from the list above (copy it exactly; use "" if not mappable)
   - "title": short headline, max 60 chars, e.g. "Projects table loads without error"
   - "instructions": 1–3 sentences describing exactly what to navigate to, what to click/look for, and what success looks like. Be specific: include the URL path and the UI element name.
   - "route": the app path where the verification happens, e.g. "/en/projects" (locale-prefixed with "/en")
   - "category": copy the category from the matching change, or use "fix" / "feature" / "improvement"
3. If a change has no visible UI effect (pure infra/test), skip it entirely.
4. If ALL changes are infra-only, return a single step: navigate to "/" and confirm the app loads.
5. Maximum 6 steps. Most critical first.
6. Return ONLY the JSON array.`;

  const model = client.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      // @ts-expect-error — responseSchema supported at runtime, not yet in TS types
      responseSchema: releaseVerificationSchema,
    },
  });

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  return JSON.parse(text) as GeneratedVerificationStep[];
}

// ── analyzeUnifierTable ───────────────────────────────────────────────────────

/**
 * Context about the CP Build Field Tracker dashboard — sent to Gemini so it
 * can reason about which Unifier tables are already wired in and what new
 * integrations would be valuable.
 */
const DASHBOARD_CONTEXT = `
## CP Build Field Tracker — Current State

### What is already integrated from Unifier
- UNIFIER_US_XPRJ (Project Shells) → powers the Projects list, Create Project modal, and project metadata (name, number, PM, status, client)
- UNIFIER_SYS_USER_INFO (Users) → powers the Users admin page (link/unlink Unifier accounts by email)
- UNIFIER_DM_FILE_VIEW (Document Manager) → powers the Project Detail > Documents tab (file list with external deep-link)
- UNIFIER_SYS_TASK (Workflow Tasks) → partially wired at API level for "My Tasks" (pending tasks assigned to current user)
- UNIFIER_UXPT (Project Team Assignments) → service layer exists but not yet surfaced in any UI

### Existing dashboard pages and features
- Projects list — sortable table of all projects with PM, IM, status, unit counts
- Project Detail — shows project metadata, documents, and unit tracker
- Units tracker — building/level/unit grid with scope rows (stage, status, % complete, installer)
- Status Reports page — currently manual; not yet connected to Unifier data
- Users admin — invite users, assign roles (Admin/Member), link Unifier accounts
- Daily Briefing (AI) — Gemini-generated morning digest of PR activity, sprint priorities
- DevTools panel — schema browser, data visualizer, Unifier Explorer

### Prisma database schema (key tables)
- Project: id, projectName, unifierPid, unifierProjectNumber, siteLocation, status, projectManagerName, installManagerName, estimatorName
- Unit: id, projectId, building, level, unit, unitType
- ScopeRow: id, unitId, scopeTypeId, stage, status, percentComplete, installTeamId
- Phase: id, projectId, name, startDate, endDate
- User: id, email, name, roleId, unifierUserId, unifierUsername

### Technology stack
- Next.js 16 App Router, Prisma 7, PostgreSQL (Supabase), next-intl (EN+ES)
- Gemini 2.5-flash for AI features
`.trim();

/** Unifier table catalogue sent as context (table names + descriptions only, no code). */
const UNIFIER_CATALOGUE = [
  { name: "UNIFIER_US_XPRJ",        display: "Project Shells",                  desc: "All Unifier project records — the source of truth for project identity" },
  { name: "UNIFIER_UXPT",           display: "Project Team Assignments",        desc: "All role assignments per project: PM, Sales, Estimator, IM, Coordinator, etc." },
  { name: "UNIFIER_SYS_USER_INFO",  display: "Users",                           desc: "Unifier system users including name, email, and login ID" },
  { name: "UNIFIER_SYS_PROJECT_INFO", display: "Project Info (System)",         desc: "Low-level Unifier system project record" },
  { name: "UNIFIER_UXUEDR",         display: "Daily Activity Reports",          desc: "Field daily reports — activities, crew, weather, issues" },
  { name: "UNIFIER_UXTACIN",        display: "Turn-Around Inspections",         desc: "Inspection records per unit/building — pass/fail/NA counts by trade" },
  { name: "UNIFIER_UXCLEARI",       display: "Clearance Inspections",           desc: "Final clearance sign-off per unit" },
  { name: "UNIFIER_UXPSR",          display: "Project Status Reports",          desc: "G/Y/R health indicators: schedule, cost, quality, risk, safety; financial summary" },
  { name: "UNIFIER_UXUECON",        display: "Contracts",                       desc: "Contract header: amounts, margins, work type, client" },
  { name: "UNIFIER_UXUECON_LINEITEM", display: "Contract Line Items",           desc: "SOV breakdown per contract: scope type, cost, margin" },
  { name: "UNIFIER_UXPCO",          display: "Potential Change Orders (PCOs)", desc: "PCO records: amount, decision, change reason, margin strategy" },
  { name: "UNIFIER_UXSUB",          display: "Subcontractors",                 desc: "Subcontractor master list: contact, license, insurance, prequalification" },
  { name: "UNIFIER_UXPOS",          display: "Subcontractor Purchase Orders",  desc: "PO header: amounts, payment terms, balance to finish" },
  { name: "UNIFIER_UXPOS_LINEITEM", display: "PO Line Items",                  desc: "Line items per PO: trade, scope, amount" },
  { name: "UNIFIER_UXSUM",          display: "Subcontractor Pay Applications", desc: "Payment applications: % complete, retainage, period start/end" },
  { name: "UNIFIER_UXSUM_LINEITEM", display: "Pay Application Line Items",     desc: "Pay app SOV: scope item, billed this period, stored materials" },
  { name: "UNIFIER_P6_ACTIVITY",    display: "P6 Schedule Activities",         desc: "Oracle P6 schedule: activity name, WBS, planned/actual start & finish" },
  { name: "UNIFIER_UXLOC",          display: "Locations",                      desc: "Project locations: unit/building/level/area/phase" },
  { name: "UNIFIER_UXMA",           display: "Material Approvals",             desc: "Material approval records: product, color, ETA, lead time" },
  { name: "UNIFIER_UXMA_LINEITEM",  display: "Material Order Line Items",      desc: "Line items per material approval" },
  { name: "UNIFIER_SYS_PROCESS",    display: "Workflow Processes",             desc: "Unifier workflow process instances: status, initiator, source record" },
  { name: "UNIFIER_SYS_TASK",       display: "Workflow Tasks",                 desc: "Pending workflow tasks: process, assignee, due date, action required" },
  { name: "UNIFIER_US_XORG",        display: "Organizations",                  desc: "Unifier org structure" },
  { name: "SYS_LOGIN_USAGE",        display: "Login Usage",                    desc: "Audit log of user logins: user ID, login time, project context" },
  { name: "UNIFIER_BUDGET",         display: "Budgets",                        desc: "Project budget totals" },
  { name: "UNIFIER_BUDGETITEM",     display: "Budget Items",                   desc: "Budget WBS codes and cost categories" },
  { name: "UNIFIER_BUDGETROW",      display: "Budget Rows",                    desc: "Budget detail rows: GP %, GM %, quantity, unit cost" },
  { name: "UNIFIER_UXBSDR",        display: "Build Shop Drawing Requests",    desc: "Shop drawing submittals for build scope" },
  { name: "UNIFIER_UXFLSDR",       display: "Flooring SD Requests",           desc: "Shop drawing submittals for flooring scope" },
  { name: "UNIFIER_UXFSDREV",      display: "Floor SD Reviews",               desc: "Review records for flooring shop drawings" },
  { name: "UNIFIER_UXBREVP",       display: "Build Shop Reviews",             desc: "Review packages for build shop drawings" },
  { name: "UNIFIER_UXBREVP_LINEITEM", display: "Build Shop Review Line Items", desc: "Line items per review package" },
  { name: "UNIFIER_UXWORKO",       display: "Flooring Purchase Orders",       desc: "Flooring-specific PO records" },
  { name: "UNIFIER_UXUEPO",        display: "Purchase Orders",                desc: "General project purchase orders" },
  { name: "UNIFIER_UXFLDVER",      display: "Field Verification",             desc: "Field verification sign-off records" },
  { name: "UNIFIER_UXBLDSP",       display: "Build Shipping",                 desc: "Material shipping records for build scope" },
  { name: "UNIFIER__CW_SLOW_LIST", display: "Scope List",                     desc: "Master scope list / work breakdown structure" },
];

const unifierTableAnalysisSchema = {
  type: SchemaType.OBJECT,
  properties: {
    summary: { type: SchemaType.STRING },
    integrationStatus: { type: SchemaType.STRING, enum: ["already-integrated", "partially-integrated", "not-yet-integrated"] },
    relatedDashboardFeatures: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          feature:     { type: SchemaType.STRING },
          explanation: { type: SchemaType.STRING },
        },
        required: ["feature", "explanation"],
      },
    },
    suggestedIntegrations: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          column:             { type: SchemaType.STRING },
          dashboardPlacement: { type: SchemaType.STRING },
          effort:             { type: SchemaType.STRING, enum: ["low", "medium", "high"] },
        },
        required: ["column", "dashboardPlacement", "effort"],
      },
    },
    newFeatureIdeas: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          title:        { type: SchemaType.STRING },
          description:  { type: SchemaType.STRING },
          tablesNeeded: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        },
        required: ["title", "description", "tablesNeeded"],
      },
    },
    dataQualityNotes: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
  },
  required: ["summary", "integrationStatus", "relatedDashboardFeatures", "suggestedIntegrations", "newFeatureIdeas", "dataQualityNotes"],
};

export interface UnifierTableInput {
  tableName: string;
  displayName: string;
  description: string;
  columns: Array<{ code: string; label: string }>;
}

export async function analyzeUnifierTable(
  tableDef: UnifierTableInput,
  sampleRows: Record<string, unknown>[],
): Promise<UnifierTableAnalysis> {
  const client = getClient();
  const model = client.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      // @ts-expect-error — responseSchema supported at runtime, not yet in TS types
      responseSchema: unifierTableAnalysisSchema,
    },
  });

  // Redact obvious PII/auth fields from sample rows before sending
  const REDACT_KEYS = new Set(["PASSWORD", "TOKEN", "SECRET", "HASH", "EMAIL", "PHONE"]);
  const safeSamples = sampleRows.slice(0, 10).map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([k, v]) =>
        REDACT_KEYS.has(k.toUpperCase()) ? [k, "[REDACTED]"] : [k, v]
      )
    )
  );

  const columnList = tableDef.columns
    .map((c) => `  - ${c.code}: ${c.label}`)
    .join("\n");

  const catalogue = UNIFIER_CATALOGUE
    .map((t) => `  - ${t.name} (${t.display}): ${t.desc}`)
    .join("\n");

  const sampleJson = safeSamples.length > 0
    ? JSON.stringify(safeSamples, null, 2)
    : "(no sample rows available — analysis based on schema only)";

  const prompt = `
You are a senior software architect helping CP Build connect their Oracle Unifier PDS data to their Field Tracker dashboard app.

## Dashboard context
${DASHBOARD_CONTEXT}

## Full Unifier table catalogue
${catalogue}

## Table being analyzed
Table name: ${tableDef.tableName}
Display name: ${tableDef.displayName}
Description: ${tableDef.description}

Columns:
${columnList}

## Sample data (up to 10 rows)
${sampleJson}

## Your task
Analyze this Unifier table and produce a structured JSON response with:

1. **summary** — 2-3 sentences describing what this table contains and its business value.

2. **integrationStatus** — one of:
   - "already-integrated" if this table is already wired into the dashboard
   - "partially-integrated" if some columns are used but there is more value to unlock
   - "not-yet-integrated" if no data from this table is in the dashboard yet

3. **relatedDashboardFeatures** — which existing dashboard pages or features this data relates to. Be specific (e.g. "Project Detail page", "Units tracker", "Status Reports page"). Up to 5 items.

4. **suggestedIntegrations** — specific columns from this table that should be surfaced in the dashboard. For each: the column name, where in the dashboard it should appear, and effort estimate (low = read-only display, medium = new component needed, high = requires new backend service or schema change). Focus on the highest-value, most actionable columns. Up to 8 items.

5. **newFeatureIdeas** — new dashboard features that this table (alone or combined with others) could power. Be specific and creative. Include which Unifier table names would be needed. Up to 4 ideas.

6. **dataQualityNotes** — observations from the sample data about data quality, null rates, unexpected values, or patterns worth knowing before integrating. Up to 4 notes.

Focus on practical, high-ROI integrations that align with a construction subcontractor's workflow.
`.trim();

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  return JSON.parse(text) as UnifierTableAnalysis;
}

// ── generateTourFromDescription ───────────────────────────────────────────────

interface TourGenerationInput {
  tourName: string;
  tourGoal: string;
  targetRole: string;
  targetSection?: string;
}

export async function generateTourFromDescription(
  input: TourGenerationInput
): Promise<GeneratedSimulationStep[]> {
  const client = getClient();
  const model = client.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" },
  });

  const prompt = `
You are a tour designer for CP Build Field Tracker, a construction project management app.
Generate a guided tour based on the following description.

Tour name: ${input.tourName}
Goal: ${input.tourGoal}
Target role: ${input.targetRole}
${input.targetSection ? `Target section: ${input.targetSection}` : ""}

Return a JSON array of tour steps. Each step must have:
- order (number, starting at 1)
- pageUrl (string, e.g. "/en/projects")
- elementSelector (CSS selector string)
- title (short step title)
- description (one sentence describing what this step shows)
- voiceText (narration text, 1-2 sentences, conversational tone)
- actions (optional array of automation actions)

Return only the JSON array, no markdown.
`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  return JSON.parse(text) as GeneratedSimulationStep[];
}

// ── analyzePortfolio ──────────────────────────────────────────────────────────

interface PortfolioProject {
  projectName: string;
  siteLocation: string;
  status: string;
  unitCount: number;
  blockedCount: number;
  completedCount: number;
  totalScopes: number;
}

export async function analyzePortfolio(
  projects: PortfolioProject[]
): Promise<PortfolioReport> {
  const client = getClient();
  const model = client.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      // @ts-expect-error — responseSchema is supported at runtime but not yet in TS types
      responseSchema: portfolioReportSchema,
    },
  });

  const prompt = `
You are a portfolio analyst for CP Build, a construction subcontractor.
Analyze the following active project portfolio and identify health and risk.

Projects:
${JSON.stringify(projects, null, 2)}

Instructions:
1. Write a 2-sentence portfolio summary.
2. Count how many projects are at risk (have blocked units or are On Hold).
3. List up to 3 top risks across the portfolio, naming the project.
4. Count how many projects appear healthy (Active, no blocks).
`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  return JSON.parse(text) as PortfolioReport;
}

// ── generateBriefingSynthesis ─────────────────────────────────────────────────

const briefingSynthesisSchema = {
  type: SchemaType.OBJECT,
  properties: {
    windowLabel: { type: SchemaType.STRING },
    briefingCount: { type: SchemaType.NUMBER },
    dateRangeStart: { type: SchemaType.STRING },
    dateRangeEnd: { type: SchemaType.STRING },
    roiTrend: { type: SchemaType.STRING },
    recurringIssues: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          description: { type: SchemaType.STRING },
          occurrences: { type: SchemaType.NUMBER },
          lastSeen: { type: SchemaType.STRING },
          suggestedAction: { type: SchemaType.STRING },
        },
        required: ["description", "occurrences", "lastSeen", "suggestedAction"],
      },
    },
    topOptimizationCategories: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          category: { type: SchemaType.STRING },
          count: { type: SchemaType.NUMBER },
          totalROISummary: { type: SchemaType.STRING },
          topExample: { type: SchemaType.STRING },
        },
        required: ["category", "count", "totalROISummary", "topExample"],
      },
    },
    persistentChallenges: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    velocityObservations: { type: SchemaType.STRING },
    recommendations: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          title: { type: SchemaType.STRING },
          rationale: { type: SchemaType.STRING },
          priority: { type: SchemaType.STRING, enum: ["high", "medium", "low"] },
        },
        required: ["title", "rationale", "priority"],
      },
    },
    summary: { type: SchemaType.STRING },
  },
  required: [
    "windowLabel",
    "briefingCount",
    "dateRangeStart",
    "dateRangeEnd",
    "roiTrend",
    "recurringIssues",
    "topOptimizationCategories",
    "persistentChallenges",
    "velocityObservations",
    "recommendations",
    "summary",
  ],
};

interface SynthesisInput {
  briefings: Array<{ dateFor: string; report: DailyBriefingReport }>;
  windowLabel: string;
  recentFeedback?: Array<{
    section: string;
    challengeReason?: string;
    userNote?: string;
    date: string;
  }>;
}

/**
 * Synthesizes a window of daily briefings into a long-term trend report.
 * Identifies recurring issues, ROI trajectory, optimization categories, and actionable recommendations.
 */
export async function generateBriefingSynthesis(
  input: SynthesisInput
): Promise<BriefingSynthesisReport> {
  const client = getClient();
  const model = client.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      // @ts-expect-error — responseSchema supported at runtime, not yet in TS types
      responseSchema: briefingSynthesisSchema,
    },
  });

  const briefingsSummary = input.briefings.map((b) => ({
    date: b.dateFor,
    optimizations: b.report.optimizationsRecognized ?? [],
    issues: b.report.issuesAndChallenges ?? [],
    roiItems: b.report.roiAnalysis?.items ?? [],
    totalROI: b.report.roiAnalysis?.totalEstimatedValue ?? "",
    shippedCount: b.report.yesterdaysWork?.shipped?.length ?? 0,
    sprintTheme: b.report.todaysSprint?.theme ?? "",
  }));

  const feedbackBlock =
    input.recentFeedback && input.recentFeedback.length > 0
      ? `## Recent Corrections from Phil\n${input.recentFeedback
          .map((f) => `- [${f.date}] Section: ${f.section} | Reason: ${f.challengeReason ?? "N/A"} | Note: ${f.userNote ?? "(no note)"}`)
          .join("\n")}`
      : "";

  const prompt = `You are Phil's AI Chief of Staff generating a long-term trend analysis for CP Build Field Tracker — an internal construction project management tool (NOT a SaaS product).

You are analyzing ${input.briefings.length} daily briefings spanning ${input.briefings[input.briefings.length - 1]?.dateFor ?? ""} to ${input.briefings[0]?.dateFor ?? ""}.

Window: ${input.windowLabel}

## Briefings Data (chronological)
${JSON.stringify(briefingsSummary, null, 2)}

${feedbackBlock}

## Your Task
Produce a long-term synthesis with these sections:

1. **summary** — 2-3 sentence executive summary of what the ${input.windowLabel} period looked like.

2. **roiTrend** — narrative paragraph: is the ROI from optimizations trending up, down, or flat? Are the estimates becoming more or less realistic? What categories dominate?

3. **recurringIssues** — issues or challenges that appear across multiple briefings. Count occurrences, note when last seen, suggest what to do about each. Only flag genuine patterns (3+ occurrences across briefings), not one-offs.

4. **topOptimizationCategories** — group all optimization items by category. Rank by frequency. For each: how many times did it appear, what's the cumulative ROI picture, what's the best single example?

5. **persistentChallenges** — short list of systemic problems that keep surfacing but haven't been resolved. These are action items for Phil.

6. **velocityObservations** — narrative on sprint velocity: is shipping rate increasing? Are there patterns in light vs heavy days? What correlates with productive days?

7. **recommendations** — 3-5 specific, actionable recommendations based on the data. Each should be something Phil can act on in the next 30 days. Priority: high/medium/low.

All ROI estimates must be grounded in time saved or errors prevented — this is an internal tool with no consumer growth metrics.

**DEPLOY COUNTING RULE:** When analyzing deployment reliability or velocity, only count a deploy as successful if it reached production AND required no same-day hotfix, rollback, or corrective deployment. Track and surface the clean deploy rate (successful deploys / total deploy attempts) as a key reliability metric across the window.`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  return JSON.parse(text) as BriefingSynthesisReport;
}

// ── justifyBriefingCard ───────────────────────────────────────────────────────

interface JustifyInput {
  section: FeedbackSection;
  itemData: Record<string, unknown>;
  briefingContext: { dateFor: string; narrative?: string };
}

/**
 * Asks Gemini to explain step-by-step exactly how it calculated/derived a specific card's estimate.
 * Returns plain text — shown inline below the card.
 */
export async function justifyBriefingCard(input: JustifyInput): Promise<string> {
  const client = getClient();
  const model = client.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "text/plain" },
  });

  const prompt = `You generated the following briefing card for CP Build Field Tracker (an internal construction management tool) for the date ${input.briefingContext.dateFor}.

Section: ${input.section}
Card data:
${JSON.stringify(input.itemData, null, 2)}

${input.briefingContext.narrative ? `Briefing narrative context: ${input.briefingContext.narrative}` : ""}

Phil wants to understand how you arrived at this estimate/analysis. Explain step-by-step:
1. What specific data from the briefing context did you use?
2. What reasoning chain did you apply?
3. What assumptions did you make?
4. Are there any caveats about the accuracy or confidence of this estimate?

Be honest and specific. If you made an assumption that isn't grounded in data, say so clearly.`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}

// ── reviseBriefingCard ────────────────────────────────────────────────────────

interface ReviseInput {
  section: FeedbackSection;
  itemData: Record<string, unknown>;
  challengeReason: string;
  userNote?: string;
  briefingContext: { dateFor: string; narrative?: string };
}

/**
 * Asks Gemini to revise a specific card in response to Phil's challenge.
 * Returns the same card shape with revised values, or an explanation of why no estimate applies.
 * The revision is ephemeral — it does NOT overwrite the stored briefing.
 */
export async function reviseBriefingCard(
  input: ReviseInput
): Promise<Record<string, unknown>> {
  const client = getClient();
  const model = client.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" },
  });

  const challengeLabels: Record<string, string> = {
    WRONG_CONTEXT: "Wrong context — this analysis doesn't apply to an internal tool",
    INFLATED_NUMBER: "The estimate is inflated or not grounded in real data",
    NOT_APPLICABLE: "This metric doesn't apply to this situation",
    OTHER: "Other — see note",
  };

  const prompt = `You generated the following briefing card for CP Build Field Tracker (an internal construction management tool) for the date ${input.briefingContext.dateFor}.

Section: ${input.section}
Original card data:
${JSON.stringify(input.itemData, null, 2)}

${input.briefingContext.narrative ? `Briefing narrative context: ${input.briefingContext.narrative}` : ""}

Phil challenged this card.
Challenge reason: ${challengeLabels[input.challengeReason] ?? input.challengeReason}
${input.userNote ? `Phil's note: "${input.userNote}"` : ""}

Please revise this card to address Phil's challenge. Return a JSON object with the SAME fields as the original card, but with corrected values. If the estimate truly doesn't apply (e.g. no ROI for an internal-tool infrastructure fix), set the value/ROI field to "N/A — [brief reason]" rather than inventing a number. Be honest and grounded.`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { ...input.itemData, _revised: true, _revisionNote: text };
  }
}

// ── generateFeedbackAssistTurn ───────────────────────────────────────────────
// Drives the optional "AI-assisted feedback" flow. Given the user's initial
// input plus any prior turns, the model either (a) asks one more clarifying
// question or (b) emits a structured final report the UI can pre-fill the form
// with. The server never persists anything here — persistence happens when
// the user submits the final report via POST /api/feedback.

const feedbackAssistResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    kind: { type: SchemaType.STRING, enum: ["question", "final_report"] },
    question: {
      type: SchemaType.OBJECT,
      properties: {
        id: { type: SchemaType.STRING },
        text: { type: SchemaType.STRING },
        helpText: { type: SchemaType.STRING },
        allowCustom: { type: SchemaType.BOOLEAN },
        options: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              id: { type: SchemaType.STRING },
              label: { type: SchemaType.STRING },
            },
            required: ["id", "label"],
          },
        },
      },
      required: ["id", "text", "options", "allowCustom"],
    },
    report: {
      type: SchemaType.OBJECT,
      properties: {
        kind: { type: SchemaType.STRING, enum: ["BUG", "FEATURE_REQUEST"] },
        suggestedTitle: { type: SchemaType.STRING },
        suggestedDescription: { type: SchemaType.STRING },
        summary: { type: SchemaType.STRING },
        bugDetails: {
          type: SchemaType.OBJECT,
          properties: {
            stepsToReproduce: {
              type: SchemaType.ARRAY,
              items: { type: SchemaType.STRING },
            },
            expectedBehavior: { type: SchemaType.STRING },
            actualBehavior: { type: SchemaType.STRING },
          },
        },
        featureDetails: {
          type: SchemaType.OBJECT,
          properties: {
            problemSolved: { type: SchemaType.STRING },
            suggestedAcceptance: {
              type: SchemaType.ARRAY,
              items: { type: SchemaType.STRING },
            },
          },
        },
        proactivePrompts: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
        },
        imagePrompt: { type: SchemaType.STRING, nullable: true },
      },
      required: ["kind", "suggestedTitle", "suggestedDescription"],
    },
  },
  required: ["kind"],
};

function normalizeFeedbackAssistReport(
  report: AssistFinalReport,
  expectedKind: "BUG" | "FEATURE_REQUEST",
): AssistFinalReport {
  if (expectedKind === "BUG") {
    const rest = { ...report };
    delete rest.featureDetails;
    return {
      ...rest,
      kind: "BUG",
      bugDetails: report.bugDetails ?? {
        stepsToReproduce: [],
        expectedBehavior: "",
        actualBehavior: "",
      },
    };
  }

  const rest = { ...report };
  delete rest.bugDetails;
  return {
    ...rest,
    kind: "FEATURE_REQUEST",
    featureDetails: report.featureDetails ?? {
      problemSolved: "",
      suggestedAcceptance: [],
    },
  };
}

function normalizeFeedbackAssistResponse(
  response: AssistTurnResponse,
  expectedKind: "BUG" | "FEATURE_REQUEST",
): AssistTurnResponse {
  if (response.kind !== "final_report") {
    return response;
  }

  return {
    ...response,
    report: normalizeFeedbackAssistReport(response.report, expectedKind),
  };
}

export interface FeedbackAssistTurnInput {
  feedbackType: "BUG" | "FEATURE_REQUEST";
  initialTitle: string;
  initialDescription: string;
  pageUrl: string | null;
  transcript: AssistTranscriptEntry[];
  /** True when the client wants the AI to finalize regardless of remaining turns. */
  forceFinalize: boolean;
  /**
   * When present, the original screen recording is re-attached to this turn so
   * Gemini stays grounded in what it saw. The URI is tolerated as a stale
   * 404: if Gemini rejects it, we fall back to a text-only turn rather than
   * failing the request.
   */
  videoRef?: AssistVideoRef | null;
}

function formatTranscriptForPrompt(transcript: AssistTranscriptEntry[]): string {
  if (transcript.length === 0) return "(no prior turns)";
  return transcript
    .map((entry) => {
      if (entry.role === "assistant") {
        const optionLabels = entry.question.options.map((o) => `  - [${o.id}] ${o.label}`).join("\n");
        return `Assistant asked (id=${entry.question.id}):\n  "${entry.question.text}"\nOptions:\n${optionLabels || "  (none)"}`;
      }
      const selected = entry.selectedOptionIds.length > 0
        ? `Selected options: ${entry.selectedOptionIds.join(", ")}`
        : "Selected options: (none)";
      const customText = entry.text.trim().length > 0
        ? `Free-text answer: "${entry.text.trim()}"`
        : "Free-text answer: (none)";
      return `User replied (to question=${entry.questionId}):\n  ${selected}\n  ${customText}`;
    })
    .join("\n\n");
}

/**
 * One turn of the feedback-assist conversation. Decides whether to ask another
 * clarifying question or to produce the final structured report.
 *
 * Never calls the DB. Pure wrapper around Gemini with a strict JSON contract.
 */
export async function generateFeedbackAssistTurn(
  input: FeedbackAssistTurnInput
): Promise<AssistTurnResponse> {
  const client = getClient();
  const model = client.getGenerativeModel({
    model: FEEDBACK_ASSIST_MODEL,
    generationConfig: {
      responseMimeType: "application/json",
      // @ts-expect-error — responseSchema supported at runtime, not yet in TS types
      responseSchema: feedbackAssistResponseSchema,
    },
  });

  const assistantTurns = input.transcript.filter((t) => t.role === "assistant").length;
  const remainingTurns = Math.max(0, ASSIST_MAX_TURNS - assistantTurns);
  const mustFinalize = input.forceFinalize || remainingTurns === 0;
  const pageLine = input.pageUrl ? `Page where feedback was submitted: ${input.pageUrl}` : "Page context: (not provided)";

  const prompt = `You are an assistant that helps users of CP Build Field Tracker write clearer, more actionable feedback reports.

## Context about the app
Field Tracker is an internal construction project management platform used by subcontractor teams. Users submit feedback from inside the app to report bugs or request features.

## Your job
The user is submitting feedback of type: ${input.feedbackType}.
${pageLine}

Initial title from the user: "${input.initialTitle || "(blank)"}"
Initial description from the user:
"""
${input.initialDescription}
"""

## Conversation so far
${formatTranscriptForPrompt(input.transcript)}

## Decide between one of two actions

${mustFinalize
  ? "You MUST finalize now — either the user asked to finish, or we have reached the turn budget."
  : `You may either:
A. Ask ONE more clarifying question (preferred if the information gathered so far is still thin).
B. Emit the final report now if you already have enough detail to write a high-quality bug report or feature request.`}

## If you ask a question (kind = "question")
- Return { kind: "question", question: { id, text, helpText?, options, allowCustom } }.
- "id" must be a short stable slug (kebab-case).
- "text" is the question itself — plain, polite, <= 200 characters.
- "helpText" (optional) is a <= 200-char hint shown in lighter text.
- "options" is 2-5 short predefined answer chips (each label <= 60 chars). Omit options only if a free-text answer clearly makes more sense; otherwise ALWAYS include options the user can click.
- "allowCustom": true if a free-text answer in addition to (or instead of) chips is useful; false if the chips are comprehensive.
- For BUG: prefer asking about: what happened vs what was expected, steps to reproduce, whether an error message appeared, which device/browser, whether it's reproducible.
- For FEATURE_REQUEST: prefer asking about: the underlying problem, the current workaround, who benefits, how often it's needed, what "done" looks like.

## If you finalize (kind = "final_report")
- Return { kind: "final_report", report: { ... } }.
- "kind" inside the report must equal "${input.feedbackType}".
- "suggestedTitle" <= 120 characters — imperative voice, specific.
- "suggestedDescription" <= 2000 characters — a well-structured report combining the user's original input with everything learned in the conversation. Use short paragraphs or bullets where appropriate. Do NOT invent facts the user did not supply.
- "summary" is a 1-2 sentence overview (<= 300 characters).
- For BUG submissions, fill "bugDetails" with stepsToReproduce (array, each step <= 200 chars), expectedBehavior, actualBehavior. Use empty strings / empty arrays when truly unknown — never fabricate.
- For FEATURE_REQUEST submissions, fill "featureDetails" with problemSolved and suggestedAcceptance (up to 5 short acceptance criteria).
- "proactivePrompts": up to 5 short strings (each <= 120 chars) suggesting specific details the user could still add before submitting (e.g. "Add browser and device", "Clarify steps to reproduce"). Use [] when the report is already comprehensive.
- "imagePrompt": a single sentence (<= 200 chars) asking the user to attach a screenshot when a visual would help triage; omit the field entirely when not needed.

## Hard rules
- Respond with JSON only — no surrounding prose.
- Never echo the user's raw words if they contain obvious secrets (passwords, tokens). Replace with "[redacted]".
- If the user clearly has nothing useful to add after ${ASSIST_MAX_TURNS} assistant turns, finalize with whatever information is available.
- Be respectful and brief. Do not lecture or editorialize.

Remaining turns budget: ${remainingTurns}.
${input.videoRef ? "\nA screen recording the user made earlier is attached to this turn — reference it whenever it helps ground the answer." : ""}
`;

  // If a videoRef was supplied, forward it as a fileData part alongside the
  // prompt. Gemini treats the video (with its audio track) as additional
  // grounding across the whole turn. Stale/expired file URIs are caught below
  // and the caller retries without the video.
  const parts: Array<{ text: string } | { fileData: { fileUri: string; mimeType: string } }> =
    input.videoRef
      ? [
          {
            fileData: {
              fileUri: input.videoRef.fileUri,
              mimeType: input.videoRef.mimeType,
            },
          },
          { text: prompt },
        ]
      : [{ text: prompt }];

  let result;
  // When the Files API URI expires mid-conversation we drop the video and
  // retry text-only. Track that fallback here so we can clear `videoRef` in
  // the response below — otherwise the client keeps forwarding the stale ref
  // on every subsequent turn and we'd retry-fall-back forever.
  let videoDroppedForStaleFile = false;
  try {
    result = await model.generateContent({
      contents: [{ role: "user", parts }],
    });
  } catch (err) {
    // If the attached file 404'd (expired Files API URI), retry once without
    // the video so the conversation can continue on text alone.
    const msg = err instanceof Error ? err.message : "";
    const looksLikeStaleFile = input.videoRef && /file|not found|permission|404/i.test(msg);
    if (looksLikeStaleFile) {
      result = await model.generateContent(prompt);
      videoDroppedForStaleFile = true;
    } else {
      throw err;
    }
  }

  const text = result.response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned non-JSON response");
  }

  const validated = assistTurnResponseSchema.safeParse({
    ...(typeof parsed === "object" && parsed !== null ? parsed : {}),
    // The model doesn't know the current turn numbers; inject them server-side.
    turnNumber: assistantTurns + 1,
    remainingTurns: Math.max(0, remainingTurns - 1),
    // If the video was dropped due to a stale Files URI, signal that to the
    // client by clearing videoRef so it stops forwarding the expired ref.
    videoRef: videoDroppedForStaleFile ? null : (input.videoRef ?? null),
  });
  if (!validated.success) {
    throw new Error(`Gemini response failed schema validation: ${validated.error.message}`);
  }
  return normalizeFeedbackAssistResponse(validated.data, input.feedbackType);
}

// ── Video-seeded feedback assist ─────────────────────────────────────────────
// First turn when the user records their screen. Gemini watches the video
// (with audio, if narration was captured) and either asks one clarifying
// question or produces the final report directly.

export interface FeedbackAssistVideoTurnInput {
  feedbackType: "BUG" | "FEATURE_REQUEST";
  initialTitle: string;
  /** Free-text notes the user typed alongside the recording, if any. */
  initialUserText: string;
  pageUrl: string | null;
  videoRef: AssistVideoRef;
}

/**
 * Kick off a feedback-assist session by having Gemini watch a screen
 * recording. Returns the same shape as a normal turn (question or final
 * report), with the `videoRef` echoed so the client can keep forwarding it
 * on subsequent text turns.
 */
export async function generateFeedbackAssistVideoTurn(
  input: FeedbackAssistVideoTurnInput,
): Promise<AssistTurnResponse> {
  const client = getClient();
  // Note: we deliberately do NOT set `responseSchema` here. Gemini's structured
  // output + multimodal (fileData) inputs can return "Request contains an
  // invalid argument" even when the schema and file are both valid in
  // isolation. We still ask for JSON via `responseMimeType` and enforce shape
  // with Zod on the server side, which is identical to what the text turn does
  // after the first response.
  const model = client.getGenerativeModel({
    model: FEEDBACK_ASSIST_MODEL,
    generationConfig: {
      responseMimeType: "application/json",
      // Intentionally omit responseSchema here: calibration can re-attach
      // Gemini Files `fileData` parts, and schema+fileData is rejected by the
      // Gemini API for the same reason documented in the video turn path.
    },
  });

  const pageLine = input.pageUrl
    ? `Page where feedback was submitted: ${input.pageUrl}`
    : "Page context: (not provided)";
  const notesLine = input.initialUserText.trim().length > 0
    ? `Notes the user typed alongside the recording:\n"""\n${input.initialUserText.trim()}\n"""`
    : "The user did not type any extra notes.";

  const prompt = `You are an assistant that helps users of CP Build Field Tracker write clearer, more actionable feedback reports.

## Context about the app
Field Tracker is an internal construction project management platform used by subcontractor teams. Users submit feedback from inside the app to report bugs or request features.

## Your job
The user recorded their screen — and possibly narrated out loud — to show you a ${input.feedbackType === "BUG" ? "bug they encountered" : "feature they want"}. Watch the video and listen to the audio carefully, then decide whether you have enough information to write the final report or need to ask ONE clarifying question first.

${pageLine}
Initial title from the user: "${input.initialTitle || "(blank)"}"
${notesLine}

## Decide between one of two actions

A. Ask ONE clarifying question if a key detail is missing from the video (e.g. you can see something broke but not what the user expected to happen, or the feature intent is ambiguous).
B. Emit the final report now if the recording + audio already give you enough detail to produce a high-quality bug report or feature request.

Prefer option B when the recording is self-explanatory. Only ask a question when it would materially improve the report.

## If you ask a question (kind = "question")
- Return { kind: "question", question: { id, text, helpText?, options, allowCustom } }.
- "id" must be a short stable slug (kebab-case).
- "text" is the question itself — plain, polite, <= 200 characters.
- "helpText" (optional) is a <= 200-char hint shown in lighter text.
- "options" is 2-5 short predefined answer chips (each label <= 60 chars). Include options whenever possible.
- "allowCustom": true if a free-text answer also makes sense.

## If you finalize (kind = "final_report")
- Return { kind: "final_report", report: { ... } }.
- "kind" inside the report must equal "${input.feedbackType}".
- "suggestedTitle" <= 120 characters — imperative voice, specific.
- "suggestedDescription" <= 2000 characters — a well-structured report grounded in what you saw and heard in the recording. Reference concrete actions from the video (e.g. "User clicked Save, then the page went blank"). Do NOT invent facts that were not in the recording.
- "summary" is a 1-2 sentence overview (<= 300 characters).
- For BUG: fill "bugDetails" with stepsToReproduce (short ordered steps from the video), expectedBehavior, actualBehavior.
- For FEATURE_REQUEST: fill "featureDetails" with problemSolved and suggestedAcceptance.
- "proactivePrompts": up to 5 short strings suggesting details still worth adding; use [] when comprehensive.
- "imagePrompt": ask for a screenshot when a visual would help; omit the field entirely when not needed.

## Hard rules
- Respond with JSON only — no surrounding prose.
- Redact anything that looks like a password, API token, or email address in the video — use "[redacted]" rather than the literal value.
- Be respectful and brief. Do not lecture or editorialize.`;

  // Diagnostic — verbose while we stabilize the video-seeded flow.
  console.log("[gemini] video turn generateContent input:", {
    model: FEEDBACK_ASSIST_MODEL,
    fileUri: input.videoRef.fileUri,
    mimeType: input.videoRef.mimeType,
    expiresAt: input.videoRef.expiresAt,
    promptLength: prompt.length,
  });

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          {
            fileData: {
              fileUri: input.videoRef.fileUri,
              mimeType: input.videoRef.mimeType,
            },
          },
          { text: prompt },
        ],
      },
    ],
  });

  const text = result.response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned non-JSON response");
  }

  const validated = assistTurnResponseSchema.safeParse({
    ...(typeof parsed === "object" && parsed !== null ? parsed : {}),
    // Video counts as the first assistant turn, so turnNumber is 1 and the
    // user has used one of the ASSIST_MAX_TURNS budget. If Gemini finalized
    // immediately, remainingTurns is irrelevant on the final_report branch.
    turnNumber: 1,
    remainingTurns: Math.max(0, ASSIST_MAX_TURNS - 1),
    videoRef: input.videoRef,
  });
  if (!validated.success) {
    throw new Error(`Gemini response failed schema validation: ${validated.error.message}`);
  }
  return normalizeFeedbackAssistResponse(validated.data, input.feedbackType);
}

// ── generateFeedbackAssistCalibrate ───────────────────────────────────────────
// Revises an AI draft based on natural-language instructions; optional multimodal
// grounding via prior video/screenshot Files API refs.

export interface FeedbackAssistCalibrateInput {
  feedbackType: "BUG" | "FEATURE_REQUEST";
  initialTitle: string;
  initialDescription: string;
  pageUrl: string | null;
  transcript: AssistTranscriptEntry[];
  currentReport: AssistFinalReport;
  calibrationInstructions: string;
  videoRef: AssistVideoRef | null;
  imageRef: AssistImageRef | null;
}

/**
 * Applies natural-language calibration instructions to an existing AI draft.
 * Optionally re-attaches prior video/screenshot files for multimodal grounding.
 */
export async function generateFeedbackAssistCalibrate(
  input: FeedbackAssistCalibrateInput,
): Promise<AssistFinalReport> {
  const client = getClient();
  const model = client.getGenerativeModel({
    model: FEEDBACK_ASSIST_MODEL,
    generationConfig: {
      responseMimeType: "application/json",
    },
  });

  const pageLine = input.pageUrl
    ? `Page where feedback was submitted: ${input.pageUrl}`
    : "Page context: (not provided)";

  const prompt = `You are an assistant that helps users of CP Build Field Tracker refine AI-generated feedback reports.

## Task
The user already has a draft ${input.feedbackType === "BUG" ? "bug report" : "feature request"} below. Revise it to follow their calibration instructions — improve clarity, tone, or emphasis as asked, without inventing facts they did not provide.

${pageLine}

Initial title: "${input.initialTitle || "(blank)"}"
Initial description from the user:
"""
${input.initialDescription}
"""

## Conversation so far (for context only)
${formatTranscriptForPrompt(input.transcript)}

## Current draft report (JSON — this is what you must revise)
${JSON.stringify(input.currentReport, null, 2)}

## User's calibration instructions
"""
${input.calibrationInstructions}
"""

## Output rules
- Respond with JSON only — a single object matching the same schema as the draft: fields kind, suggestedTitle, suggestedDescription, summary, and bugDetails OR featureDetails as appropriate.
- "kind" must remain "${input.feedbackType}".
- Keep the same structure as the draft; update fields where the instructions call for changes.
- Do not add fictional reproduction steps, environments, or metrics. If the instructions ask for something unknown, state that briefly in summary or description rather than guessing.
- suggestedTitle <= 120 characters. suggestedDescription can be long but stay focused; reserve space for acceptance criteria lists.
- Redact secrets (passwords, tokens) as "[redacted]".

${input.videoRef ? "A screen recording is attached — use it only when it helps justify edits the user asked for." : ""}
${input.imageRef ? "A screenshot image is attached — reference visible UI when relevant to the calibration request." : ""}
`;

  const fileParts: Array<{ fileData: { fileUri: string; mimeType: string } }> = [];
  if (input.videoRef) {
    fileParts.push({
      fileData: {
        fileUri: input.videoRef.fileUri,
        mimeType: input.videoRef.mimeType,
      },
    });
  }
  if (input.imageRef) {
    fileParts.push({
      fileData: {
        fileUri: input.imageRef.fileUri,
        mimeType: input.imageRef.mimeType,
      },
    });
  }

  const parts:
    | Array<{ text: string } | { fileData: { fileUri: string; mimeType: string } }>
    = fileParts.length > 0 ? [...fileParts, { text: prompt }] : [{ text: prompt }];

  let result;
  try {
    result = await model.generateContent({
      contents: [{ role: "user", parts }],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    const hasFiles = Boolean(input.videoRef || input.imageRef);
    const looksLikeStaleFile =
      hasFiles && /file|not found|permission|404|invalid argument/i.test(msg);
    if (looksLikeStaleFile) {
      result = await model.generateContent(prompt);
    } else {
      throw err;
    }
  }

  const text = result.response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned non-JSON response");
  }

  const validated = assistFinalReportSchema.safeParse(
    typeof parsed === "object" && parsed !== null ? parsed : {},
  );
  if (!validated.success) {
    throw new Error(`Gemini response failed schema validation: ${validated.error.message}`);
  }
  if (validated.data.kind !== input.feedbackType) {
    throw new Error(
      `Gemini returned kind ${validated.data.kind} but session is ${input.feedbackType}`,
    );
  }
  return normalizeFeedbackAssistReport(validated.data, input.feedbackType);
}
