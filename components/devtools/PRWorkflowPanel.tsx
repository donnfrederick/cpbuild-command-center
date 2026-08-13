"use client";

/**
 * PRWorkflowPanel
 *
 * A standalone floating side panel (independent of DevTools) that guides
 * an admin through a two-phase pre-PR workflow:
 *
 * Phase 1 — Verify Branch
 *   Auto-fetches git diff → sends to Gemini → renders interactive step checklist.
 *
 * Phase 2 — Create PR
 *   Pre-filled form (title, body from step results, labels, base: dev).
 *   Calls POST /api/devtools/pr-workflow which uses GITHUB_TOKEN to create
 *   the PR, or falls back to a GitHub compare URL.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import {
  X,
  GitPullRequest,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  XCircle,
  Loader2,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Tag,
  GitBranch,
  Send,
  GripHorizontal,
  Clipboard,
  ClipboardCheck,
} from "lucide-react";
import type { VerificationStep } from "@/lib/ai/types";

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = "verify" | "create-pr";
type StepStatus = "pass" | "fail" | "pending";

interface StepResult {
  status: StepStatus;
  note?: string;
}

interface SessionResult {
  sessionId: string;
  url: string;
  stepCount: number;
  steps?: VerificationStep[];
}

interface GitDiffResult {
  branch: string;
  diff: string;
  isEmpty: boolean;
}

interface PRResult {
  prNumber?: number;
  prUrl?: string;
  fallbackUrl?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const AVAILABLE_LABELS = ["backend", "design", "chore", "dependencies", "security"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function branchToTitle(branch: string): string {
  return branch
    .replace(/^(feat|fix|chore|hannah|dependabot\/[^/]+)\//, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildPRBody(branch: string, steps: VerificationStep[], results: Record<number, StepResult>): string {
  const lines: string[] = ["## Summary", "", `Branch: \`${branch}\``, ""];

  const hasResults = Object.keys(results).length > 0;
  if (hasResults) {
    lines.push("## Verification", "");
    steps.forEach((step, i) => {
      const r = results[i];
      const icon = r?.status === "pass" ? "✅" : r?.status === "fail" ? "❌" : "⬜";
      lines.push(`${icon} ${step.title}${r?.note ? ` — ${r.note}` : ""}`);
    });
    lines.push("");
  }

  lines.push("## PR Checklist", "");
  lines.push("- [ ] Branch rebased on `dev`");
  lines.push("- [ ] `npm run build` passes");
  lines.push("- [ ] `npm run lint` passes");
  lines.push("- [ ] `npm run test:unit` passes");
  lines.push("- [ ] No secrets committed");

  return lines.join("\n");
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PanelHeader({
  branch,
  phase,
  onClose,
  onDragStart,
}: {
  branch: string;
  phase: Phase;
  onClose: () => void;
  onDragStart: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className="flex items-center justify-between px-3 py-2.5 border-b border-neutral-700 flex-shrink-0 select-none"
      style={{ backgroundColor: "#0a0c10", cursor: "grab" }}
      onMouseDown={onDragStart}
    >
      {/* Drag handle + title */}
      <div className="flex items-center gap-2 min-w-0">
        <GripHorizontal size={13} className="text-neutral-600 shrink-0" aria-hidden="true" />
        <GitPullRequest size={13} className="text-purple-400 shrink-0" />
        <span className="text-sm font-semibold text-neutral-100">Prepare PR</span>
        {branch && (
          <span className="text-xs text-neutral-600 truncate max-w-[120px]" title={branch}>
            {branch}
          </span>
        )}
      </div>
      {/* Phase badge + close */}
      <div className="flex items-center gap-2 shrink-0">
        <span
          className="text-xs px-2 py-0.5 rounded-full font-medium"
          style={{
            backgroundColor: phase === "verify" ? "rgba(168,85,247,0.15)" : "rgba(34,197,94,0.15)",
            color: phase === "verify" ? "#c084fc" : "#4ade80",
          }}
        >
          {phase === "verify" ? "Verify" : "Create PR"}
        </span>
        <button
          onClick={onClose}
          onMouseDown={(e) => e.stopPropagation()} // don't start drag when clicking close
          className="text-neutral-500 hover:text-neutral-300 p-1 rounded transition-colors"
          aria-label="Close PR Workflow panel"
          style={{ cursor: "pointer" }}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Summary screen sub-component ─────────────────────────────────────────────

interface SummaryScreenProps {
  passCount: number;
  failCount: number;
  steps: VerificationStep[];
  results: Record<number, StepResult>;
  buildAgentPrompt?: () => string;
  onContinue: () => void;
  onRerun: () => void;
}

function SummaryScreen({ passCount, failCount, steps, results, buildAgentPrompt, onContinue, onRerun }: SummaryScreenProps) {
  const [copied, setCopied] = useState(false);

  const copyPrompt = async () => {
    if (!buildAgentPrompt) return;
    try {
      await navigator.clipboard.writeText(buildAgentPrompt());
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback for environments where clipboard API isn't available
      const ta = document.createElement("textarea");
      ta.value = buildAgentPrompt();
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-4 flex-1 overflow-y-auto">
      <div className="text-center py-1">
        <div className="text-3xl mb-2" aria-hidden="true">{failCount === 0 ? "✅" : "⚠️"}</div>
        <div className="text-base font-semibold text-neutral-100">
          {passCount}/{steps.length} steps verified
        </div>
        {failCount > 0 && (
          <div className="text-sm text-yellow-400 mt-1">
            {failCount} issue{failCount > 1 ? "s" : ""} found
          </div>
        )}
      </div>

      <div className="space-y-1.5 max-h-44 overflow-y-auto">
        {steps.map((step, i) => {
          const r = results[i];
          return (
            <div key={i} className="flex items-start gap-2 text-xs">
              {r?.status === "pass" ? (
                <CheckCircle size={12} className="text-green-400 mt-0.5 shrink-0" />
              ) : r?.status === "fail" ? (
                <XCircle size={12} className="text-red-400 mt-0.5 shrink-0" />
              ) : (
                <span className="w-3 h-3 rounded-full border border-neutral-600 mt-0.5 shrink-0" />
              )}
              <span className={r?.status === "fail" ? "text-red-300" : "text-neutral-400"}>
                {step.title}
                {r?.note && <span className="text-neutral-600"> — {r.note}</span>}
              </span>
            </div>
          );
        })}
      </div>

      {/* Copy prompt for agent — only shown when there are failures */}
      {buildAgentPrompt && (
        <button
          onClick={() => void copyPrompt()}
          className="flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors border"
          style={{
            backgroundColor: copied ? "rgba(34,197,94,0.1)" : "rgba(168,85,247,0.08)",
            borderColor: copied ? "rgba(34,197,94,0.3)" : "rgba(168,85,247,0.25)",
            color: copied ? "#4ade80" : "#c084fc",
          }}
          aria-label="Copy agent prompt to clipboard"
        >
          {copied ? (
            <><ClipboardCheck size={12} /> Copied — paste into a new agent chat</>
          ) : (
            <><Clipboard size={12} /> Copy issues as agent prompt</>
          )}
        </button>
      )}

      <button
        onClick={onContinue}
        className="flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
      >
        <GitPullRequest size={14} />
        Continue to Create PR
      </button>

      <button
        onClick={onRerun}
        className="flex items-center justify-center gap-2 text-neutral-500 hover:text-neutral-300 text-xs transition-colors py-1"
      >
        <RefreshCw size={12} /> Re-run verification
      </button>
    </div>
  );
}

// ── Phase 1: Verify ───────────────────────────────────────────────────────────

interface VerifyPhaseProps {
  onComplete: (branch: string, steps: VerificationStep[], results: Record<number, StepResult>) => void;
}

function VerifyPhase({ onComplete }: VerifyPhaseProps) {
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [gitData, setGitData] = useState<GitDiffResult | null>(null);

  const [checklistLoading, setChecklistLoading] = useState(false);
  const [checklistError, setChecklistError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionResult | null>(null);
  const [steps, setSteps] = useState<VerificationStep[]>([]);

  const [currentStep, setCurrentStep] = useState(0);
  const [results, setResults] = useState<Record<number, StepResult>>({});
  const [showFailInput, setShowFailInput] = useState(false);
  const [failNote, setFailNote] = useState("");

  // Guards: prevent StrictMode double-invocation and track abort controllers
  const fetchStarted = useRef(false);
  const checklistStarted = useRef(false);
  const diffAbortRef = useRef<AbortController | null>(null);
  const checklistAbortRef = useRef<AbortController | null>(null);

  // Cancel in-flight fetches and reset guards on unmount.
  // Resetting the guards here is critical: React StrictMode mounts → unmounts → remounts
  // in development. Without the reset, fetchStarted.current stays true on the second
  // (real) mount and the fetch never fires.
  useEffect(() => {
    return () => {
      diffAbortRef.current?.abort();
      checklistAbortRef.current?.abort();
      fetchStarted.current = false;
      checklistStarted.current = false;
    };
  }, []);

  const fetchDiff = useCallback(async () => {
    if (fetchStarted.current) return;
    fetchStarted.current = true;

    const controller = new AbortController();
    diffAbortRef.current = controller;

    setDiffLoading(true);
    setDiffError(null);
    try {
      const res = await fetch("/api/devtools/git-diff", { signal: controller.signal });
      if (!res.ok) {
        const b = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string };
        throw new Error(b.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as GitDiffResult;
      setGitData(data);
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return; // unmounted — drop silently
      setDiffError((err as { message?: string }).message ?? "Failed to fetch git diff");
      fetchStarted.current = false; // allow retry on explicit button click
    } finally {
      setDiffLoading(false);
    }
  }, []);

  const generateChecklist = useCallback(async (diff: string, branch: string) => {
    if (checklistStarted.current) return;
    checklistStarted.current = true;

    const controller = new AbortController();
    checklistAbortRef.current = controller;

    setChecklistLoading(true);
    setChecklistError(null);
    setSession(null);
    setSteps([]);
    setResults({});
    setCurrentStep(0);
    try {
      const res = await fetch("/api/devtools/verification-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diff, branch }),
        signal: controller.signal,
      });
      if (res.status === 503) throw new Error("GEMINI_API_KEY is not configured.");
      if (!res.ok) {
        const b = await res.json().catch(() => ({ error: "Unknown error" })) as { error?: string };
        throw new Error(b.error ?? `API returned ${res.status}`);
      }
      const data = (await res.json()) as SessionResult;

      // Load the actual steps — abort signal passed here too
      const sessionRes = await fetch(
        `/api/devtools/verification-session?sessionId=${data.sessionId}`,
        { signal: controller.signal }
      );
      if (sessionRes.ok) {
        const sessionData = (await sessionRes.json()) as { steps: VerificationStep[] };
        setSteps(sessionData.steps ?? []);
      }
      setSession(data);
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return; // unmounted — drop silently
      setChecklistError((err as { message?: string }).message ?? "Failed to generate checklist");
      checklistStarted.current = false; // allow retry on button click
    } finally {
      setChecklistLoading(false);
    }
  }, []);

  // Auto-fetch diff once on mount
  useEffect(() => {
    void fetchDiff();
  }, [fetchDiff]);

  // Auto-generate checklist once diff arrives (only fires once — guarded by ref)
  useEffect(() => {
    if (gitData && !gitData.isEmpty && !checklistStarted.current) {
      void generateChecklist(gitData.diff, gitData.branch);
    }
  }, [gitData, generateChecklist]);

  // Auto-open the current step's page in a new tab when the step advances
  const lastAutoOpenedStep = useRef(-1);
  useEffect(() => {
    if (
      steps.length > 0 &&
      currentStep < steps.length &&
      currentStep !== lastAutoOpenedStep.current
    ) {
      const url = steps[currentStep]?.pageUrl;
      if (url && url !== "/" && url !== "/en") {
        lastAutoOpenedStep.current = currentStep;
        window.open(url, "_blank", "noopener,noreferrer");
      }
    }
  }, [currentStep, steps]);

  const markPass = useCallback(() => {
    setResults((prev) => ({ ...prev, [currentStep]: { status: "pass" } }));
    setShowFailInput(false);
    setFailNote("");
    if (currentStep < steps.length - 1) {
      setCurrentStep((n) => n + 1);
    } else {
      setCurrentStep(steps.length);
    }
  }, [currentStep, steps.length]);

  const markFail = useCallback(() => {
    if (!showFailInput) { setShowFailInput(true); return; }
    setResults((prev) => ({ ...prev, [currentStep]: { status: "fail", note: failNote || undefined } }));
    setShowFailInput(false);
    setFailNote("");
    if (currentStep < steps.length - 1) {
      setCurrentStep((n) => n + 1);
    } else {
      setCurrentStep(steps.length);
    }
  }, [showFailInput, failNote, currentStep, steps.length]);

  const isDone = currentStep >= steps.length && steps.length > 0;
  const passCount = Object.values(results).filter((r) => r.status === "pass").length;
  const failCount = Object.values(results).filter((r) => r.status === "fail").length;

  // ── Loading / error states ──────────────────────────────────────────────────

  if (diffLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 flex-1 text-sm">
        <Loader2 size={20} className="animate-spin text-purple-400" />
        <span className="text-neutral-400">Reading git diff…</span>
      </div>
    );
  }

  if (diffError) {
    return (
      <div className="flex flex-col gap-3 p-4 flex-1">
        <div className="flex items-start gap-2 bg-red-950 border border-red-800 rounded-lg px-3 py-2.5 text-xs text-red-300">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          {diffError}
        </div>
        <button
          onClick={() => { fetchStarted.current = false; void fetchDiff(); }}
          className="flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg px-4 py-2 text-sm transition-colors"
        >
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  if (gitData?.isEmpty) {
    return (
      <div className="flex flex-col gap-3 p-4 flex-1 text-sm">
        <div className="flex items-start gap-2 bg-yellow-950 border border-yellow-800 rounded-lg px-3 py-2.5 text-xs text-yellow-300">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          No diff found against <code className="font-mono">origin/dev</code>. Make sure you have committed changes and the remote is fetched.
        </div>
        <button
          onClick={() => { fetchStarted.current = false; void fetchDiff(); }}
          className="flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg px-4 py-2 text-sm transition-colors"
        >
          <RefreshCw size={14} /> Re-check
        </button>
      </div>
    );
  }

  if (checklistLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 flex-1 text-sm">
        <Loader2 size={20} className="animate-spin text-purple-400" />
        <span className="text-neutral-400">Generating AI checklist…</span>
        {gitData && (
          <span className="text-xs text-neutral-600">
            <GitBranch size={10} className="inline mr-1" />{gitData.branch}
          </span>
        )}
      </div>
    );
  }

  if (checklistError) {
    return (
      <div className="flex flex-col gap-3 p-4 flex-1">
        <div className="flex items-start gap-2 bg-red-950 border border-red-800 rounded-lg px-3 py-2.5 text-xs text-red-300">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          {checklistError}
        </div>
        {gitData && (
          <button
            onClick={() => { checklistStarted.current = false; void generateChecklist(gitData.diff, gitData.branch); }}
            className="flex items-center justify-center gap-2 bg-purple-700 hover:bg-purple-600 text-white rounded-lg px-4 py-2 text-sm transition-colors"
          >
            <RefreshCw size={14} /> Regenerate
          </button>
        )}
      </div>
    );
  }

  if (!session || steps.length === 0) return null;

  // ── Summary screen ──────────────────────────────────────────────────────────

  if (isDone) {
    const failedSteps = steps.filter((_, i) => results[i]?.status === "fail");
    const branch = gitData?.branch ?? "current branch";

    function buildAgentPrompt(): string {
      const lines: string[] = [
        `I ran pre-PR verification on branch \`${branch}\` and found ${failedSteps.length} issue${failedSteps.length === 1 ? "" : "s"} that need fixing before I can open a PR:`,
        "",
      ];
      failedSteps.forEach((step, idx) => {
        const r = results[steps.indexOf(step)];
        lines.push(`**Issue ${idx + 1}: ${step.title}**`);
        lines.push(`Page: ${step.pageUrl}`);
        lines.push(`What to verify: ${step.instruction}`);
        if (r?.note) lines.push(`What I found: ${r.note}`);
        lines.push("");
      });
      lines.push("Please investigate and fix these issues.");
      return lines.join("\n");
    }

    return (
      <SummaryScreen
        passCount={passCount}
        failCount={failCount}
        steps={steps}
        results={results}
        buildAgentPrompt={failedSteps.length > 0 ? buildAgentPrompt : undefined}
        onContinue={() => onComplete(branch, steps, results)}
        onRerun={() => {
          setResults({});
          setCurrentStep(0);
          setSession(null);
          setSteps([]);
          setShowFailInput(false);
          setFailNote("");
          checklistStarted.current = false;
          if (gitData) void generateChecklist(gitData.diff, gitData.branch);
        }}
      />
    );
  }

  // ── Step view ───────────────────────────────────────────────────────────────

  const step = steps[currentStep];

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Progress bar */}
      <div className="h-1 bg-neutral-800 flex-shrink-0">
        <div
          className="h-full bg-purple-500 transition-all duration-300"
          style={{ width: `${(currentStep / steps.length) * 100}%` }}
          role="progressbar"
          aria-valuenow={currentStep}
          aria-valuemin={0}
          aria-valuemax={steps.length}
        />
      </div>

      <div className="flex flex-col gap-3 p-4 flex-1 overflow-y-auto">
        {/* Step header */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-purple-400 font-medium uppercase tracking-wide">
            Step {currentStep + 1} of {steps.length}
          </span>
          <div className="flex gap-1">
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => { setCurrentStep(i); setShowFailInput(false); setFailNote(""); }}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === currentStep
                    ? "bg-purple-400"
                    : results[i]?.status === "pass"
                    ? "bg-green-600"
                    : results[i]?.status === "fail"
                    ? "bg-red-600"
                    : "bg-neutral-700"
                }`}
                aria-label={`Go to step ${i + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Step content */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-neutral-500 font-mono">{step.pageUrl}</span>
            <span className="text-xs text-green-500 flex items-center gap-0.5">
              <ExternalLink size={9} />
              opened
            </span>
          </div>
          <div className="text-sm font-semibold text-neutral-100 leading-snug">{step.title}</div>
        </div>

        <p className="text-sm text-neutral-300 leading-relaxed">{step.instruction}</p>

        {step.elementHint && (
          <div className="text-xs text-neutral-500 bg-neutral-800 rounded-lg px-3 py-2 border border-neutral-700">
            💡 {step.elementHint}
          </div>
        )}

        <a
          href={step.pageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-neutral-500 hover:text-purple-300 flex items-center gap-1 self-start transition-colors"
          aria-label={`Re-open ${step.pageUrl} in new tab`}
          title="Page was auto-opened — click to re-open"
        >
          <ExternalLink size={10} />
          Re-open {step.pageUrl}
        </a>

        {showFailInput && (
          <div className="flex flex-col gap-2">
            <label className="text-xs text-neutral-400" htmlFor="pr-fail-note">
              What went wrong? (optional)
            </label>
            <input
              id="pr-fail-note"
              value={failNote}
              onChange={(e) => setFailNote(e.target.value)}
              placeholder="e.g. 403 error, missing element, wrong data"
              className="w-full bg-neutral-800 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") markFail();
                if (e.key === "Escape") { setShowFailInput(false); setFailNote(""); }
              }}
            />
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={markPass}
            className="flex-1 flex items-center justify-center gap-1.5 bg-green-700 hover:bg-green-600 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors"
          >
            <CheckCircle size={14} /> Looks good
          </button>
          <button
            onClick={markFail}
            className="flex-1 flex items-center justify-center gap-1.5 bg-neutral-800 hover:bg-red-900 text-neutral-300 hover:text-red-300 rounded-lg px-3 py-2 text-sm font-medium border border-neutral-700 hover:border-red-800 transition-colors"
          >
            <XCircle size={14} />
            {showFailInput ? "Confirm issue" : "Something's wrong"}
          </button>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-1 border-t border-neutral-800">
          <button
            onClick={() => { setCurrentStep((n) => Math.max(0, n - 1)); setShowFailInput(false); setFailNote(""); }}
            disabled={currentStep === 0}
            className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={12} /> Previous
          </button>
          <button
            onClick={() => { setCurrentStep((n) => Math.min(steps.length - 1, n + 1)); setShowFailInput(false); setFailNote(""); }}
            disabled={currentStep === steps.length - 1}
            className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next <ChevronRight size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Phase 2: Create PR ────────────────────────────────────────────────────────

interface CreatePRPhaseProps {
  branch: string;
  steps: VerificationStep[];
  results: Record<number, StepResult>;
  onBack: () => void;
}

function CreatePRPhase({ branch, steps, results, onBack }: CreatePRPhaseProps) {
  const [title, setTitle] = useState(() => branchToTitle(branch));
  const [body, setBody] = useState(() => buildPRBody(branch, steps, results));
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PRResult | null>(null);

  const toggleLabel = (label: string) => {
    setSelectedLabels((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    );
  };

  const createPR = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/devtools/pr-workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, labels: selectedLabels, branch, base: "dev" }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string };
        throw new Error(b.error ?? `API returned ${res.status}`);
      }
      const data = (await res.json()) as PRResult;
      setResult(data);

      // If we only got a fallbackUrl, open it in a new tab automatically
      if (data.fallbackUrl && !data.prUrl) {
        window.open(data.fallbackUrl, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      setError((err as { message?: string }).message ?? "Failed to create PR");
    } finally {
      setLoading(false);
    }
  };

  if (result?.prUrl) {
    return (
      <div className="flex flex-col gap-4 p-4 flex-1 items-center justify-center text-center">
        <div className="text-3xl" aria-hidden="true">🎉</div>
        <div className="text-base font-semibold text-neutral-100">
          PR #{result.prNumber} created
        </div>
        <a
          href={result.prUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-sm text-purple-400 hover:text-purple-300 font-medium transition-colors"
        >
          View on GitHub <ExternalLink size={12} />
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4 flex-1 overflow-y-auto">
      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-300 self-start transition-colors mb-1"
      >
        <ChevronLeft size={12} /> Back to verification
      </button>

      {/* Branch (read-only) */}
      <div className="flex items-center gap-2 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2">
        <GitBranch size={12} className="text-neutral-500 shrink-0" />
        <span className="text-xs text-neutral-400 font-mono">{branch}</span>
        <span className="text-xs text-neutral-600 ml-auto">→ dev</span>
      </div>

      {/* Title */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-neutral-400" htmlFor="pr-title">
          Title
        </label>
        <input
          id="pr-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-neutral-800 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />
      </div>

      {/* Labels */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-neutral-400 flex items-center gap-1">
          <Tag size={10} /> Labels
        </label>
        <div className="flex flex-wrap gap-1.5">
          {AVAILABLE_LABELS.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => toggleLabel(label)}
              className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                selectedLabels.includes(label)
                  ? "bg-purple-700 border-purple-600 text-purple-100"
                  : "bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-neutral-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-1 flex-1">
        <label className="text-xs font-medium text-neutral-400" htmlFor="pr-body">
          Description
        </label>
        <textarea
          id="pr-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={10}
          className="flex-1 min-h-[200px] bg-neutral-800 border border-neutral-600 rounded-lg px-3 py-2 text-xs text-neutral-200 font-mono resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 bg-red-950 border border-red-800 rounded-lg px-3 py-2.5 text-xs text-red-300">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* GITHUB_TOKEN hint when result has fallbackUrl */}
      {result?.fallbackUrl && !result.prUrl && (
        <div className="text-xs text-neutral-500 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2">
          <span className="text-yellow-400 font-medium">No GITHUB_TOKEN set.</span> GitHub compare page opened in a new tab with title and body pre-filled. Complete the PR there.
        </div>
      )}

      {/* Submit */}
      <button
        onClick={() => void createPR()}
        disabled={loading || !title.trim()}
        className="flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
      >
        {loading ? (
          <>
            <Loader2 size={14} className="animate-spin" /> Creating PR…
          </>
        ) : (
          <>
            <Send size={14} /> Create PR
          </>
        )}
      </button>
    </div>
  );
}

// ── Draggable panel hook ──────────────────────────────────────────────────────

const PANEL_WIDTH = 420;
const PANEL_HEIGHT = 560;

function useDraggable() {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const origin = useRef({ mouseX: 0, mouseY: 0, panelX: 0, panelY: 0 });

  // Default position: top-right, inset slightly from edges
  const defaultPos = useCallback((): { x: number; y: number } => {
    if (typeof window === "undefined") return { x: 0, y: 60 };
    return {
      x: Math.max(0, window.innerWidth - PANEL_WIDTH - 16),
      y: 60, // below the top bar
    };
  }, []);

  const clamp = useCallback((x: number, y: number) => {
    if (typeof window === "undefined") return { x, y };
    return {
      x: Math.max(0, Math.min(x, window.innerWidth - PANEL_WIDTH)),
      y: Math.max(0, Math.min(y, window.innerHeight - 80)),
    };
  }, []);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const current = pos ?? defaultPos();
    dragging.current = true;
    origin.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      panelX: current.x,
      panelY: current.y,
    };

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const dx = ev.clientX - origin.current.mouseX;
      const dy = ev.clientY - origin.current.mouseY;
      setPos(clamp(origin.current.panelX + dx, origin.current.panelY + dy));
    };

    const onMouseUp = () => {
      dragging.current = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, [pos, defaultPos, clamp]);

  const resolvedPos = pos ?? defaultPos();

  return { pos: resolvedPos, onDragStart };
}

// ── Main Panel ────────────────────────────────────────────────────────────────

interface PRWorkflowPanelProps {
  onClose: () => void;
}

export function PRWorkflowPanel({ onClose }: PRWorkflowPanelProps) {
  const [phase, setPhase] = useState<Phase>("verify");
  const [verifyData, setVerifyData] = useState<{
    branch: string;
    steps: VerificationStep[];
    results: Record<number, StepResult>;
  } | null>(null);

  const { pos, onDragStart } = useDraggable();

  const handleVerifyComplete = useCallback(
    (branch: string, steps: VerificationStep[], results: Record<number, StepResult>) => {
      setVerifyData({ branch, steps, results });
      setPhase("create-pr");
    },
    []
  );

  return (
    <div
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        width: PANEL_WIDTH,
        height: PANEL_HEIGHT,
        zIndex: 9990,
        backgroundColor: "#0f1117",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 10,
        boxShadow: "0 8px 40px rgba(0,0,0,0.55)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
      role="complementary"
      aria-label="PR Workflow panel"
    >
      <PanelHeader
        branch={verifyData?.branch ?? ""}
        phase={phase}
        onClose={onClose}
        onDragStart={onDragStart}
      />

      {/* Phase indicator */}
      <div className="flex border-b border-neutral-800 flex-shrink-0">
        {(["verify", "create-pr"] as Phase[]).map((p, i) => (
          <div
            key={p}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium"
            style={{
              color: phase === p ? "#c084fc" : phase === "create-pr" && p === "verify" ? "#4ade80" : "#4b5563",
              borderBottom: phase === p ? "2px solid #c084fc" : "2px solid transparent",
            }}
          >
            {i === 0 ? <ShieldCheck size={11} /> : <GitPullRequest size={11} />}
            {p === "verify" ? "1. Verify" : "2. Create PR"}
          </div>
        ))}
      </div>

      {/* Phase content */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {phase === "verify" && (
          <VerifyPhase onComplete={handleVerifyComplete} />
        )}
        {phase === "create-pr" && verifyData && (
          <CreatePRPhase
            branch={verifyData.branch}
            steps={verifyData.steps}
            results={verifyData.results}
            onBack={() => setPhase("verify")}
          />
        )}
      </div>
    </div>
  );
}
