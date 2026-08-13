import { Resend } from "resend";
import nodemailer from "nodemailer";
import { routing } from "@/i18n/routing";
import { isNonProd } from "@/lib/app-env";
import {
  tryRecordGlobalOutboundEmailSend,
  logEmailSecurityEvent,
} from "@/lib/email-outbound-rate-limit";
import { resolvePublicAppUrl, warnIfPublicAppUrlMisconfigured } from "@/lib/public-app-url";
import { PASSWORD_RESET_EXPIRY_MS } from "@/lib/password-reset";

/** Last-resort cap on total SMTP/Resend sends per process per hour. */
function assertGlobalOutboundEmailBudget(): void {
  const r = tryRecordGlobalOutboundEmailSend();
  if (!r.ok) {
    logEmailSecurityEvent({
      event: "global_transactional_email_rate_limited",
      count: r.count,
      limit: r.limit,
    });
    throw new Error("GLOBAL_EMAIL_OUTBOUND_RATE_LIMITED");
  }
}

// Strip any trailing slash so URL concatenation never produces double-slashes.
// AUTH_URL is the canonical variable (used by NextAuth v5 / Railway); fall back
// to NEXTAUTH_URL (legacy) then localhost for local dev.
const APP_URL = resolvePublicAppUrl();
const FROM_EMAIL =
  process.env.EMAIL_FROM ?? "CP Build <invites@cp-command-center.com>";

/** Escape HTML special characters to prevent XSS in email bodies. */
function esc(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * Build the invite acceptance URL for a given token.
 * Exported as a pure helper so it can be unit-tested independently.
 */
export function buildInviteUrl(appUrl: string, token: string): string {
  const base = appUrl.replace(/\/$/, "");
  return `${base}/${routing.defaultLocale}/invite/${token}`;
}

// When DEV_EMAIL_OVERRIDE is set, all outgoing emails are redirected to that
// address. Only active in non-production environments — guarded by both
// NODE_ENV and APP_ENV so it cannot fire on Railway production even if the
// variable is accidentally left set.
export { isNonProd } from "@/lib/app-env";

/** Exported for unit testing only. */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 1) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

/** Exported for unit testing only. */
export function resolveRecipient(to: string): string {
  const override = process.env.DEV_EMAIL_OVERRIDE;
  if (override && isNonProd()) {
    console.log(`[email] DEV_EMAIL_OVERRIDE: ${maskEmail(to)} → ${maskEmail(override)}`);
    return override;
  }
  return to;
}

// ─── Transport selection ───────────────────────────────────────────────────────
//
// In development (SMTP_HOST set, or no valid Resend key), emails are routed
// to Mailpit on localhost:1025 so you can read them at http://localhost:8025.
//
// In production, emails are sent via Resend.

function isDevSmtp(): boolean {
  const hasSmtpHost = !!process.env.SMTP_HOST;
  const hasRealResendKey =
    !!process.env.RESEND_API_KEY &&
    !process.env.RESEND_API_KEY.startsWith("re_YOUR");
  return hasSmtpHost || !hasRealResendKey;
}

async function sendViaSmtp(options: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  assertGlobalOutboundEmailBudget();
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "localhost",
    port: Number(process.env.SMTP_PORT ?? 1025),
    secure: false,
    auth:
      process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
        : undefined,
    ignoreTLS: true,
  });

  const actualTo = resolveRecipient(options.to);
  const info = await transport.sendMail({
    from: FROM_EMAIL,
    to: actualTo,
    subject: options.subject,
    html: options.html,
  });

  console.log(
    `[email:dev] Sent to ${maskEmail(actualTo)} via SMTP (messageId: ${info.messageId})`
  );
  console.log(
    `[email:dev] View at http://localhost:${process.env.SMTP_UI_PORT ?? 8025}`
  );
}

async function sendViaResend(options: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  assertGlobalOutboundEmailBudget();
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: resolveRecipient(options.to),
    subject: options.subject,
    html: options.html,
  });
  if (error) {
    const msg =
      error &&
      typeof error === "object" &&
      "message" in error &&
      typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : JSON.stringify(error);
    console.error("[email] Resend send failed:", error);
    throw new Error(`Failed to send email: ${msg}`);
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

export interface InviteEmailParams {
  /** Recipient email address — used to derive the greeting fallback. */
  to: string;
  inviterName: string;
  /** Invitee's first name as entered by the inviter. Falls back to the email local-part. */
  inviteeName?: string;
  /** Human-readable role label, e.g. "Member" or "Admin". Optional — omitted if unknown. */
  roleName?: string;
  /** Full invite URL. If omitted, a placeholder is shown (useful for previews). */
  inviteUrl?: string;
  /** When true, renders the [DEV] banner regardless of env (used by the email previewer). */
  forceDevBanner?: boolean;
}

/**
 * Build the invite email subject and HTML body.
 * Exported so the DevTools previewer can render it without sending.
 */
/** Strip CR/LF from a string to prevent email header injection. */
function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export function buildInviteEmailContent(
  params: InviteEmailParams,
  opts: { nonProd: boolean; isRedirected: boolean }
): { subject: string; html: string } {
  const { to, inviterName, inviteeName, roleName, inviteUrl: overrideUrl, forceDevBanner } = params;
  const { nonProd, isRedirected } = opts;

  const envLabel = nonProd ? "[DEV] " : "";
  const linkHref = overrideUrl ?? "#";

  const derivedFirst = (to.split("@")[0] ?? "").split(/[._-]/)[0] ?? "";
  const nameForGreeting = inviteeName?.trim() || derivedFirst;
  const greeting = nameForGreeting
    ? `Hi ${esc(nameForGreeting.charAt(0).toUpperCase() + nameForGreeting.slice(1))},`
    : "Hi there,";

  const roleBlurb = roleName
    ? `<p style="color:#444;font-size:14px">You'll join as a <strong>${esc(roleName)}</strong>.</p>`
    : "";

  // forceDevBanner is only honoured in non-prod — it must never surface in production.
  const showDevBanner = nonProd && (forceDevBanner || isRedirected);
  const devBanner = showDevBanner
    ? `<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#92400e">
        <strong>⚠️ DEV environment — email redirected</strong><br/>
        Original recipient: <strong>${esc(to)}</strong><br/>
        All non-production emails are redirected to the <code>DEV_EMAIL_OVERRIDE</code> address.
      </div>`
    : "";

  const subject = sanitizeHeader(`${envLabel}${inviterName} invited you to CP Build Field Tracker`);
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      ${devBanner}
      <h2>You've been invited!</h2>
      <p>${greeting}</p>
      <p><strong>${esc(inviterName)}</strong> has invited you to join CP Build Field Tracker.</p>
      ${roleBlurb}
      <p style="margin:24px 0">
        <a href="${linkHref}"
           style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:600">
          Accept Invitation
        </a>
      </p>
      <p style="color:#666;font-size:14px">This invite link expires in 7 days.</p>
      <p style="color:#666;font-size:14px">
        If you did not expect this invitation, you can safely ignore this email.
      </p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
      <p style="color:#999;font-size:12px">
        Or copy this link into your browser:<br/>
        <a href="${linkHref}" style="color:#666">${linkHref}</a>
      </p>
    </div>
  `;

  return { subject, html };
}

export async function sendInviteEmail({
  to,
  inviterName,
  inviteeName,
  roleName,
  token,
}: {
  to: string;
  inviterName: string;
  inviteeName?: string;
  roleName?: string;
  token: string;
}): Promise<void> {
  warnIfPublicAppUrlMisconfigured("invite-email");
  const inviteUrl = buildInviteUrl(APP_URL, token);
  const nonProd = isNonProd();
  const override = process.env.DEV_EMAIL_OVERRIDE;
  const isRedirected = nonProd && !!override && override !== to;

  const { subject, html } = buildInviteEmailContent(
    { to, inviterName, inviteeName, roleName, inviteUrl },
    { nonProd, isRedirected }
  );

  if (isDevSmtp()) {
    await sendViaSmtp({ to, subject, html });
  } else {
    await sendViaResend({ to, subject, html });
  }
}

/**
 * Build the password reset URL for a given raw token.
 * Exported as a pure helper so it can be unit-tested independently.
 */
export function buildPasswordResetUrl(appUrl: string, token: string): string {
  const base = appUrl.replace(/\/$/, "");
  return `${base}/${routing.defaultLocale}/reset-password/${token}`;
}

/** Send a password reset email with a single-use link. */
export async function sendPasswordResetEmail({
  to,
  token,
}: {
  to: string;
  token: string;
}): Promise<void> {
  warnIfPublicAppUrlMisconfigured("password-reset-email");
  const resetUrl = buildPasswordResetUrl(APP_URL, token);
  const expiryHours = Math.round(PASSWORD_RESET_EXPIRY_MS / (60 * 60 * 1000));
  const subject = "Reset your CP Build Field Tracker password";
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2>Reset your password</h2>
      <p>We received a request to reset your password for CP Build Field Tracker.</p>
      <p style="margin:24px 0">
        <a href="${resetUrl}"
           style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:600">
          Reset Password
        </a>
      </p>
      <p style="color:#666;font-size:14px">This link expires in ${expiryHours} hours. Use the most recent reset email — requesting a new link invalidates older ones.</p>
      <p style="color:#666;font-size:14px">
        If you did not request a password reset, you can safely ignore this email.
        Your password will not change.
      </p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
      <p style="color:#999;font-size:12px">
        Or copy this link into your browser:<br/>
        <a href="${resetUrl}" style="color:#666">${resetUrl}</a>
      </p>
    </div>
  `;

  if (isDevSmtp()) {
    await sendViaSmtp({ to, subject, html });
  } else {
    await sendViaResend({ to, subject, html });
  }
}

/**
 * Send a new-feedback notification to the admin.
 *
 * Recipient: ADMIN_NOTIFICATION_EMAIL env var (falls back to BOOTSTRAP_ADMIN_EMAIL).
 * If neither is set the call is a no-op — feedback is still saved to the DB.
 *
 * This is intentionally fire-and-forget from the API route; a failed email
 * must never cause the feedback submission itself to fail.
 */
export async function sendFeedbackNotificationEmail({
  submitterName,
  submitterEmail,
  type,
  title,
  description,
  pageUrl,
  feedbackId,
}: {
  submitterName: string | null;
  submitterEmail: string;
  type: "BUG" | "FEATURE_REQUEST";
  title: string;
  description: string;
  pageUrl: string | null;
  feedbackId: string;
}): Promise<void> {
  const adminEmail =
    process.env.ADMIN_NOTIFICATION_EMAIL ??
    process.env.BOOTSTRAP_ADMIN_EMAIL;

  if (!adminEmail) {
    console.warn("[feedback] No ADMIN_NOTIFICATION_EMAIL or BOOTSTRAP_ADMIN_EMAIL set — skipping notification email.");
    return;
  }

  const typeLabel = type === "BUG" ? "🐛 Bug Report" : "💡 Feature Request";
  // Use routing.defaultLocale so the URL stays correct if the default locale changes.
  const inboxUrl = `${APP_URL}/${routing.defaultLocale}/feedback`;
  const fromDisplay = submitterName ? `${esc(submitterName)} (${esc(submitterEmail)})` : esc(submitterEmail);

  const subject = `[Field Tracker] New ${typeLabel}: ${esc(title)}`;
  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#111">
      <h2 style="margin-bottom:4px">${typeLabel}</h2>
      <p style="color:#666;font-size:14px;margin-top:0">Submitted by ${fromDisplay}</p>

      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
        <tr>
          <td style="padding:8px 12px;background:#f5f5f5;border-radius:4px 0 0 4px;width:110px;color:#555;font-weight:600">Title</td>
          <td style="padding:8px 12px;background:#fafafa;border-radius:0 4px 4px 0">${esc(title)}</td>
        </tr>
        ${pageUrl ? `
        <tr>
          <td style="padding:8px 12px;background:#f5f5f5;border-radius:4px 0 0 4px;color:#555;font-weight:600;margin-top:4px">Page</td>
          <td style="padding:8px 12px;background:#fafafa;border-radius:0 4px 4px 0;word-break:break-all;margin-top:4px">
            <a href="${esc(pageUrl)}" style="color:#0066cc">${esc(pageUrl)}</a>
          </td>
        </tr>` : ""}
      </table>

      <div style="background:#f9f9f9;border:1px solid #eee;border-radius:6px;padding:16px;margin:16px 0;font-size:14px;white-space:pre-wrap;line-height:1.5">${esc(description)}</div>

      <p style="margin:24px 0">
        <a href="${inboxUrl}"
           style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:600;font-size:14px">
          View in Feedback Inbox
        </a>
      </p>

      <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
      <p style="color:#999;font-size:12px">
        Feedback ID: ${esc(feedbackId)}<br/>
        Sent from CP Build Field Tracker
      </p>
    </div>
  `;

  if (isDevSmtp()) {
    await sendViaSmtp({ to: adminEmail, subject, html });
  } else {
    await sendViaResend({ to: adminEmail, subject, html });
  }
}

/**
 * Notify a user that their feedback report status has changed.
 * Fire-and-forget from the API route — a failed email must never cause
 * the status update itself to fail.
 */
export async function sendFeedbackStatusEmail({
  to,
  userName,
  feedbackTitle,
  feedbackType,
  newStatus,
  adminNote,
  feedbackId,
}: {
  to: string;
  userName: string | null;
  feedbackTitle: string;
  feedbackType: "BUG" | "FEATURE_REQUEST";
  newStatus: "IN_PROGRESS" | "RESOLVED";
  adminNote: string | null;
  feedbackId: string;
}): Promise<void> {
  const greeting = userName ? `Hi ${esc(userName)},` : "Hi there,";
  const typeLabel = feedbackType === "BUG" ? "bug report" : "feature request";
  const statusLabel = newStatus === "IN_PROGRESS" ? "In Progress" : "Resolved";
  const statusColor = newStatus === "IN_PROGRESS" ? "#0066cc" : "#007700";

  const dashboardUrl = `${APP_URL}/${routing.defaultLocale}/feedback`;

  const subject = `[Field Tracker] Your ${typeLabel} is now ${statusLabel}`;
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#111">
      <h2 style="margin-bottom:4px">Update on your feedback</h2>
      <p>${greeting}</p>
      <p>Your <strong>${typeLabel}</strong> has been updated:</p>

      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
        <tr>
          <td style="padding:8px 12px;background:#f5f5f5;width:90px;font-weight:600;color:#555">Title</td>
          <td style="padding:8px 12px;background:#fafafa">${esc(feedbackTitle)}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;background:#f5f5f5;font-weight:600;color:#555">Status</td>
          <td style="padding:8px 12px;background:#fafafa;font-weight:600;color:${statusColor}">${statusLabel}</td>
        </tr>
        ${adminNote ? `
        <tr>
          <td style="padding:8px 12px;background:#f5f5f5;font-weight:600;color:#555">Note</td>
          <td style="padding:8px 12px;background:#fafafa">${esc(adminNote)}</td>
        </tr>` : ""}
      </table>

      ${newStatus === "RESOLVED" ? `
      <p style="color:#555;font-size:14px">
        If there's a guided tour available for this fix or feature, you'll see a
        <strong>"Watch the tour"</strong> button in your notifications when you log in.
      </p>` : ""}

      <p style="margin:24px 0">
        <a href="${dashboardUrl}"
           style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:600;font-size:14px">
          View in Field Tracker
        </a>
      </p>

      <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
      <p style="color:#999;font-size:12px">
        Feedback ID: ${esc(feedbackId)}<br/>
        Sent from CP Build Field Tracker
      </p>
    </div>
  `;

  if (isDevSmtp()) {
    await sendViaSmtp({ to, subject, html });
  } else {
    await sendViaResend({ to, subject, html });
  }
}

/**
 * Notify a user that feedback was assigned to them.
 * Fire-and-forget — a failed email must never block the API response.
 */
export async function sendFeedbackAssignedEmail({
  to,
  assigneeName,
  assignerName,
  feedbackTitle,
  feedbackType,
  feedbackId,
}: {
  to: string;
  assigneeName: string | null;
  assignerName: string;
  feedbackTitle: string;
  feedbackType: "BUG" | "FEATURE_REQUEST";
  feedbackId: string;
}): Promise<void> {
  const greeting = assigneeName ? `Hi ${esc(assigneeName)},` : "Hi there,";
  const typeLabel = feedbackType === "BUG" ? "bug report" : "feature request";
  const detailUrl = `${APP_URL}/${routing.defaultLocale}/feedback/${feedbackId}`;

  const subject = `[Field Tracker] You were assigned a ${typeLabel}`;
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#111">
      <h2 style="margin-bottom:4px">Feedback assigned to you</h2>
      <p>${greeting}</p>
      <p><strong>${esc(assignerName)}</strong> assigned you the following <strong>${typeLabel}</strong>:</p>

      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
        <tr>
          <td style="padding:8px 12px;background:#f5f5f5;width:90px;font-weight:600;color:#555">Title</td>
          <td style="padding:8px 12px;background:#fafafa">${esc(feedbackTitle)}</td>
        </tr>
      </table>

      <p style="margin:24px 0">
        <a href="${detailUrl}"
           style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:600;font-size:14px">
          Open feedback
        </a>
      </p>

      <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
      <p style="color:#999;font-size:12px">
        Feedback ID: ${esc(feedbackId)}<br/>
        Sent from CP Build Field Tracker
      </p>
    </div>
  `;

  if (isDevSmtp()) {
    await sendViaSmtp({ to, subject, html });
  } else {
    await sendViaResend({ to, subject, html });
  }
}

/**
 * Notify a user that they were @mentioned in a comment or issue notes.
 * Fire-and-forget — a failed email must never block the API response.
 */
export async function sendMentionEmail({
  to,
  actorName,
  contextType,
  contextTitle,
  projectUrl,
}: {
  to: string;
  actorName: string;
  contextType: "comment" | "issue_notes";
  contextTitle: string;
  projectUrl: string;
}): Promise<void> {
  const contextLabel = contextType === "comment" ? "a comment" : "issue notes";
  const subject = `[Field Tracker] ${esc(actorName)} mentioned you in ${contextLabel}`;
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#111">
      <h2 style="margin-bottom:4px">You were mentioned</h2>
      <p>Hi there,</p>
      <p><strong>${esc(actorName)}</strong> mentioned you in ${contextLabel}:</p>

      <div style="background:#f5f5f5;border-left:3px solid #333;padding:12px 16px;margin:16px 0;border-radius:0 6px 6px 0;font-size:14px;color:#333">
        ${esc(contextTitle)}
      </div>

      <p style="margin:24px 0">
        <a href="${esc(projectUrl)}"
           style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:600;font-size:14px">
          View in Field Tracker
        </a>
      </p>

      <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
      <p style="color:#999;font-size:12px">Sent from CP Build Field Tracker</p>
    </div>
  `;

  if (isDevSmtp()) {
    await sendViaSmtp({ to, subject, html });
  } else {
    await sendViaResend({ to, subject, html });
  }
}

/** Send a simple test email. Used by DevTools for troubleshooting. */
export async function sendTestEmail(to: string): Promise<{ transport: "smtp" | "resend"; messageId?: string }> {
  assertGlobalOutboundEmailBudget();
  const actualTo = resolveRecipient(to);
  const subject = "[Field Tracker] Test Email";
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2>Test Email</h2>
      <p>This is a test email from CP Build Field Tracker.</p>
      <p style="color:#666;font-size:14px">Sent at ${new Date().toISOString()}</p>
    </div>
  `;

  if (isDevSmtp()) {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? "localhost",
      port: Number(process.env.SMTP_PORT ?? 1025),
      secure: false,
      auth:
        process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
          : undefined,
      ignoreTLS: true,
    });
    const info = await transport.sendMail({
      from: FROM_EMAIL,
      to: actualTo,
      subject,
      html,
    });
    return { transport: "smtp", messageId: info.messageId };
  } else {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: actualTo,
      subject,
      html,
    });
    if (error) {
      const msg =
        error && typeof error === "object" && "message" in error
          ? String((error as { message?: unknown }).message)
          : JSON.stringify(error);
      throw new Error(msg);
    }
    return { transport: "resend", messageId: data?.id };
  }
}

/** Shape of the derived email configuration used by DevTools. */
export interface EmailConfig {
  transport: "smtp" | "resend";
  resendKeySet: boolean;
  resendKeyValid: boolean;
  emailFromSet: boolean;
  smtpHostSet: boolean;
}

/**
 * Pure helper to derive email configuration from a given environment.
 * Exported to enable focused unit tests without mutating global process.env.
 */
export function computeEmailConfig(env: NodeJS.ProcessEnv): EmailConfig {
  const resendKey = env.RESEND_API_KEY;
  const hasSmtpHost = !!env.SMTP_HOST;
  const hasRealResendKey = !!resendKey && !resendKey.startsWith("re_YOUR");
  const transport: "smtp" | "resend" = hasSmtpHost || !hasRealResendKey ? "smtp" : "resend";

  return {
    transport,
    resendKeySet: !!resendKey,
    resendKeyValid: !!resendKey && !resendKey.startsWith("re_YOUR"),
    emailFromSet: !!env.EMAIL_FROM,
    smtpHostSet: !!env.SMTP_HOST,
  };
}

/** For DevTools: detect transport and config status without sending. */
export function getEmailConfig(): EmailConfig {
  return computeEmailConfig(process.env);
}
