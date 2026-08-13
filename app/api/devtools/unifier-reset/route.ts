/**
 * POST /api/devtools/unifier-reset
 *
 * Dev-only route that resets the Unifier auth circuit breaker and config cache.
 * Use this after updating UNIFIER_PASSWORD so the next Unifier request retries
 * immediately, without waiting for the suspension window to expire or restarting
 * the server.
 *
 * GET /api/devtools/unifier-reset
 *
 * Returns the current circuit breaker state (for monitoring / DevTools UI).
 *
 * Hard-blocked in production.
 */

import { NextResponse } from "next/server";
import { isDevToolsAllowed, DEVTOOLS_BLOCKED_MESSAGE } from "@/lib/devtools-env";
import { requireDevToolsAdmin } from "@/lib/devtools-auth";
import {
  resetCircuitBreaker,
  getCircuitBreakerState,
} from "@/lib/unifier/client";

export const dynamic = "force-dynamic";

function guardDevTools() {
  if (!isDevToolsAllowed()) {
    return NextResponse.json({ error: DEVTOOLS_BLOCKED_MESSAGE }, { status: 403 });
  }
  return null;
}

async function guardAuth() {
  if (process.env.NODE_ENV === "production") {
    const authError = await requireDevToolsAdmin();
    if (authError) return authError;
  }
  return null;
}

/** GET — return current circuit breaker state */
export async function GET() {
  const devGuard = guardDevTools();
  if (devGuard) return devGuard;

  const authGuard = await guardAuth();
  if (authGuard) return authGuard;

  const state = getCircuitBreakerState();
  return NextResponse.json({
    ok: true,
    circuitBreaker: state,
    hint: state.isSuspended
      ? `Unifier API calls are suspended until ${state.resumesAt}. POST to this endpoint to reset.`
      : "Circuit breaker is closed — Unifier calls are allowed.",
  });
}

/** POST — reset the circuit breaker so the next Unifier call retries immediately */
export async function POST() {
  const devGuard = guardDevTools();
  if (devGuard) return devGuard;

  const authGuard = await guardAuth();
  if (authGuard) return authGuard;

  const stateBefore = getCircuitBreakerState();
  resetCircuitBreaker();
  const stateAfter = getCircuitBreakerState();

  return NextResponse.json({
    ok: true,
    message: "Unifier circuit breaker reset. The next Unifier API call will re-resolve credentials and retry.",
    before: stateBefore,
    after: stateAfter,
  });
}
