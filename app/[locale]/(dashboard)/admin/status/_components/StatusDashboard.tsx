"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import type { AdminStatusResponse } from "@/app/api/admin/status/route";

// ── Constants ──────────────────────────────────────────────────────────────────

const PROD_URL = "https://command-center-reboot-production.up.railway.app";
const GITHUB_ACTIONS_URL =
  "https://github.com/cp-build-dev-ops/command-center-reboot/actions";
const RAILWAY_URL = "https://railway.app";
const AUTO_REFRESH_SECONDS = 60;

// Only endpoints NOT already fetched individually. /api/health is covered by the
// dedicated health fetch — including it here would send the request twice.
const API_CHECKS = [
  { label: "/api/projects", url: "/api/projects" },
  { label: "/api/team", url: "/api/team" },
] as const;

// ── Types ──────────────────────────────────────────────────────────────────────

interface HealthResponse {
  status: string;
  timestamp: string;
  version: string;
}

interface CheckResult {
  label: string;
  status: number | null;
  ok: boolean | null;
  durationMs: number | null;
}

interface StatusState {
  health: HealthResponse | null;
  deployment: AdminStatusResponse | null;
  checks: CheckResult[];
  checkedAt: Date | null;
  loading: boolean;
  error: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDeployedAgo(seconds: number, t: ReturnType<typeof useTranslations>): string {
  if (seconds < 120) return t("justDeployed");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("minutesAgo", { minutes });
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return t("hoursAgo", { hours, minutes: remainingMinutes });
}

function formatUptimeDuration(seconds: number, t: ReturnType<typeof useTranslations>): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return t("uptimeMinutes", { minutes, seconds: seconds % 60 });
  }
  return t("uptimeHours", { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        backgroundColor: "var(--neutral-0)",
        border: "1px solid var(--neutral-300)",
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
        boxShadow: "var(--shadow-1)",
      }}
    >
      <div
        style={{
          padding: "var(--space-4)",
          borderBottom: "1px solid var(--neutral-300)",
          backgroundColor: "var(--neutral-50)",
        }}
      >
        <span
          style={{
            fontSize: "var(--text-caption)",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--neutral-500)",
          }}
        >
          {title}
        </span>
      </div>
      <div style={{ padding: "var(--space-4)" }}>{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      className="flex items-start justify-between gap-4"
      style={{ marginBottom: "var(--space-3)" }}
    >
      <span style={{ fontSize: "var(--text-body)", color: "var(--neutral-500)", flexShrink: 0 }}>
        {label}
      </span>
      <span
        style={{
          fontSize: "var(--text-body)",
          color: "var(--neutral-900)",
          fontWeight: 500,
          textAlign: "right",
          wordBreak: "break-all",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-1)",
        padding: "2px var(--space-2)",
        borderRadius: "var(--radius-sm)",
        fontSize: "var(--text-caption)",
        fontWeight: 600,
        backgroundColor: ok ? "var(--success-100)" : "var(--error-100)",
        color: ok ? "var(--success-600)" : "var(--error-600)",
      }}
    >
      {/* Decorative dot — aria-hidden because the text label conveys status */}
      <span aria-hidden="true">●</span>
      {label}
    </span>
  );
}

function EnvBadge({ env }: { env: string }) {
  const isProd = env === "production";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px var(--space-2)",
        borderRadius: "var(--radius-sm)",
        fontSize: "var(--text-caption)",
        fontWeight: 600,
        backgroundColor: isProd ? "var(--primary-100)" : "var(--warning-100)",
        color: isProd ? "var(--primary-500)" : "var(--warning-600)",
        textTransform: "capitalize",
      }}
    >
      {env}
    </span>
  );
}

function SkeletonRow() {
  return (
    <div
      style={{
        height: 16,
        backgroundColor: "var(--neutral-100)",
        borderRadius: "var(--radius-sm)",
        marginBottom: "var(--space-3)",
        animation: "pulse 1.5s ease-in-out infinite",
      }}
    />
  );
}

function Skeleton() {
  return (
    <div>
      <SkeletonRow />
      <SkeletonRow />
      <SkeletonRow />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function StatusDashboard() {
  const t = useTranslations("adminStatus");

  const [state, setState] = useState<StatusState>({
    health: null,
    deployment: null,
    checks: API_CHECKS.map((c) => ({ label: c.label, status: null, ok: null, durationMs: null })),
    checkedAt: null,
    loading: true,
    error: null,
  });

  const [countdown, setCountdown] = useState(AUTO_REFRESH_SECONDS);
  const countdownRef = useRef(AUTO_REFRESH_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRunningRef = useRef(false);

  const runChecks = useCallback(async () => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;

    // Reset countdown immediately so it never goes negative while fetches are in-flight
    countdownRef.current = AUTO_REFRESH_SECONDS;
    setCountdown(AUTO_REFRESH_SECONDS);

    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      const [healthRes, deploymentRes, ...checkResponses] = await Promise.allSettled([
        fetch("/api/health").then((r) => {
          if (!r.ok) throw new Error(`Health check failed: ${r.status}`);
          return r.json() as Promise<HealthResponse>;
        }),
        fetch("/api/admin/status").then((r) => {
          if (!r.ok) throw new Error(`Admin status failed: ${r.status}`);
          return r.json() as Promise<AdminStatusResponse>;
        }),
        ...API_CHECKS.map(async ({ label, url }) => {
          const start = performance.now();
          try {
            const res = await fetch(url);
            return {
              label,
              status: res.status,
              ok: res.status === 200,
              durationMs: Math.round(performance.now() - start),
            };
          } catch {
            return { label, status: null, ok: false, durationMs: null };
          }
        }),
      ]);

      // Derive /api/health check result from the already-fetched healthRes
      const healthCheck: CheckResult = {
        label: "/api/health",
        status: healthRes.status === "fulfilled" ? 200 : null,
        ok: healthRes.status === "fulfilled",
        durationMs: null,
      };

      setState({
        health: healthRes.status === "fulfilled" ? healthRes.value : null,
        deployment: deploymentRes.status === "fulfilled" ? deploymentRes.value : null,
        checks: [
          healthCheck,
          ...(checkResponses.map((r) =>
            r.status === "fulfilled"
              ? r.value
              : { label: "", status: null, ok: false, durationMs: null }
          ) as CheckResult[]),
        ],
        checkedAt: new Date(),
        loading: false,
        error: null,
      });
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      isRunningRef.current = false;
    }
  }, []);

  // Initial load
  useEffect(() => {
    void runChecks();
  }, [runChecks]);

  // Countdown ticker — clamps at 0 so it never displays negative
  useEffect(() => {
    timerRef.current = setInterval(() => {
      countdownRef.current = Math.max(countdownRef.current - 1, 0);
      setCountdown(countdownRef.current);
      if (countdownRef.current <= 0) {
        void runChecks();
      }
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [runChecks]);

  const isHealthy = state.health?.status === "ok";

  const linkHoverStyle = (e: React.FocusEvent<HTMLAnchorElement> | React.MouseEvent<HTMLAnchorElement>, hover: boolean) => {
    (e.currentTarget as HTMLAnchorElement).style.backgroundColor = hover
      ? "var(--primary-100)"
      : "var(--neutral-50)";
  };

  return (
    <div style={{ padding: "var(--space-4)", color: "var(--neutral-900)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div
          className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between"
          style={{ marginBottom: "var(--space-6)" }}
        >
          <div>
            <h1
              style={{
                fontSize: "var(--text-heading)",
                fontWeight: 600,
                margin: 0,
                marginBottom: "var(--space-1)",
              }}
            >
              {t("title")}
            </h1>
            <p style={{ fontSize: "var(--text-body)", color: "var(--neutral-500)", margin: 0 }}>
              {t("subtitle")}
            </p>
          </div>

          <div
            className="flex items-center gap-3"
            style={{ marginTop: "var(--space-2)" }}
          >
            {state.checkedAt && (
              <span style={{ fontSize: "var(--text-caption)", color: "var(--neutral-500)" }}>
                {t("lastChecked")}: {formatTime(state.checkedAt)}
              </span>
            )}
            <span style={{ fontSize: "var(--text-caption)", color: "var(--neutral-500)" }}>
              {t("autoRefresh", { seconds: Math.max(countdown, 0) })}
            </span>
            <button
              onClick={() => void runChecks()}
              disabled={state.loading}
              style={{
                height: "var(--button-height)",
                padding: "0 var(--space-4)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--neutral-300)",
                backgroundColor: state.loading ? "var(--neutral-100)" : "var(--neutral-0)",
                color: "var(--neutral-700)",
                fontSize: "var(--text-body)",
                fontWeight: 500,
                cursor: state.loading ? "not-allowed" : "pointer",
                transition: "background-color 0.15s",
              }}
            >
              {state.loading ? t("refreshLoading") : t("refresh")}
            </button>
          </div>
        </div>

        {/* ── Cards grid ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* ── Card 1: Live Health ────────────────────────────────────────── */}
          <Card title={t("cardHealth")}>
            {state.loading && !state.health ? (
              <Skeleton />
            ) : state.health ? (
              <div>
                <div style={{ marginBottom: "var(--space-4)" }}>
                  <StatusPill
                    ok={isHealthy}
                    label={isHealthy ? t("statusHealthy") : t("statusDegraded")}
                  />
                </div>
                <Row label={t("labelVersion")} value={state.health.version} />
                <Row
                  label={t("labelStatus")}
                  value={
                    <code
                      style={{
                        fontSize: "var(--text-caption)",
                        backgroundColor: "var(--neutral-100)",
                        padding: "2px var(--space-2)",
                        borderRadius: "var(--radius-sm)",
                      }}
                    >
                      {state.health.status}
                    </code>
                  }
                />
                <Row
                  label={t("labelTimestamp")}
                  value={
                    <span style={{ fontSize: "var(--text-caption)", color: "var(--neutral-700)" }}>
                      {new Date(state.health.timestamp).toLocaleString()}
                    </span>
                  }
                />
              </div>
            ) : (
              <p style={{ color: "var(--error-600)", fontSize: "var(--text-body)", margin: 0 }}>
                {t("statusError")}
              </p>
            )}
          </Card>

          {/* ── Card 2: Deployment Info ────────────────────────────────────── */}
          <Card title={t("cardDeployment")}>
            {state.loading && !state.deployment ? (
              <Skeleton />
            ) : state.deployment ? (
              <div>
                <Row
                  label={t("labelEnvironment")}
                  value={<EnvBadge env={state.deployment.environment} />}
                />
                <Row
                  label={t("labelGitSha")}
                  value={
                    <code
                      style={{
                        fontSize: "var(--text-caption)",
                        backgroundColor: "var(--neutral-100)",
                        padding: "2px var(--space-2)",
                        borderRadius: "var(--radius-sm)",
                        fontFamily: "monospace",
                      }}
                    >
                      {state.deployment.gitSha}
                    </code>
                  }
                />
                <Row label={t("labelBranch")} value={state.deployment.gitBranch} />
                <Row
                  label={t("labelDeployed")}
                  value={formatDeployedAgo(state.deployment.uptimeSeconds, t)}
                />
                <Row
                  label={t("labelUptime")}
                  value={formatUptimeDuration(state.deployment.uptimeSeconds, t)}
                />
                <Row label={t("labelNodeVersion")} value={state.deployment.nodeVersion} />
              </div>
            ) : (
              <p style={{ color: "var(--error-600)", fontSize: "var(--text-body)", margin: 0 }}>
                {t("statusError")}
              </p>
            )}
          </Card>

          {/* ── Card 3: API Checks ─────────────────────────────────────────── */}
          <Card title={t("cardApiChecks")}>
            {state.loading && state.checks.every((c) => c.status === null) ? (
              <Skeleton />
            ) : (
              <div>
                {state.checks.map((check) => (
                  <div
                    key={check.label}
                    className="flex items-center justify-between"
                    style={{
                      padding: "var(--space-2) 0",
                      borderBottom: "1px solid var(--neutral-100)",
                    }}
                  >
                    <code
                      style={{
                        fontSize: "var(--text-caption)",
                        color: "var(--neutral-700)",
                        fontFamily: "monospace",
                      }}
                    >
                      {check.label}
                    </code>
                    <div className="flex items-center gap-2">
                      {check.durationMs !== null && (
                        <span
                          style={{ fontSize: "var(--text-caption)", color: "var(--neutral-500)" }}
                        >
                          {check.durationMs}ms
                        </span>
                      )}
                      {check.ok === null ? (
                        <span
                          style={{ fontSize: "var(--text-caption)", color: "var(--neutral-400)" }}
                        >
                          {t("checkChecking")}
                        </span>
                      ) : (
                        <>
                          <span
                            style={{
                              fontSize: "var(--text-caption)",
                              color:
                                check.status !== null ? "var(--neutral-500)" : "var(--error-600)",
                            }}
                          >
                            {check.status !== null ? `${check.status}` : "—"}
                          </span>
                          <StatusPill
                            ok={check.ok}
                            label={check.ok ? t("checkPass") : t("checkFail")}
                          />
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* ── Card 4: Quick Links ────────────────────────────────────────── */}
          <Card title={t("cardQuickLinks")}>
            <div className="flex flex-col gap-3">
              {[
                { label: t("linkRailway"), href: RAILWAY_URL },
                { label: t("linkGitHub"), href: GITHUB_ACTIONS_URL },
                { label: t("linkProd"), href: PROD_URL },
                { label: "/api/health (prod)", href: `${PROD_URL}/api/health` },
              ].map(({ label, href }) => (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "var(--space-3)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--neutral-200)",
                    backgroundColor: "var(--neutral-50)",
                    color: "var(--primary-500)",
                    fontSize: "var(--text-body)",
                    fontWeight: 500,
                    textDecoration: "none",
                    transition: "background-color 0.15s",
                    outline: "none",
                  }}
                  onMouseEnter={(e) => linkHoverStyle(e, true)}
                  onMouseLeave={(e) => linkHoverStyle(e, false)}
                  onFocus={(e) => linkHoverStyle(e, true)}
                  onBlur={(e) => linkHoverStyle(e, false)}
                >
                  <span>{label}</span>
                  <span style={{ fontSize: 12, color: "var(--neutral-400)" }}>↗</span>
                </a>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
