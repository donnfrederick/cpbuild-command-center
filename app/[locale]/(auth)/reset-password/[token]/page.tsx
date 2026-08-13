import { Suspense } from "react";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth, signOut } from "@/lib/auth";
import { db } from "@/lib/db";
import { hashToken, shouldSignOutBeforeResetForm } from "@/lib/password-reset";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher";
import { Link } from "@/i18n/navigation";

type Props = { params: Promise<{ locale: string; token: string }> };

export async function generateMetadata({ params }: Props) {
  await params;
  const t = await getTranslations("auth");
  return { title: `${t("resetPasswordTitle")} — CP Build` };
}

export default async function ResetPasswordPage({ params }: Props) {
  const { locale, token } = await params;
  const t = await getTranslations("auth");

  if (process.env.DEV_BYPASS_AUTH === "true" && process.env.NODE_ENV !== "production") {
    redirect(`/${locale}`);
  }

  // Validate token server-side before rendering the form.
  // This gives a clear error page instead of a form that will always fail.
  if (!token || token.length !== 64) notFound();

  const tokenHash = hashToken(token);
  const record = await db.passwordResetToken.findUnique({ where: { tokenHash } });

  const isExpiredOrUsed =
    !record || record.usedAt !== null || record.expiresAt < new Date();

  // If the user opens the email link in a browser that already has a session (e.g. default
  // browser while another profile has no password), signing out here avoids sending them to the
  // dashboard and blocking the reset form. JWT cookie is cleared for this browser only.
  // TODO: optional future enhancement — invalidate all sessions server-side on successful reset.
  const session = await auth();
  if (shouldSignOutBeforeResetForm(!!session, isExpiredOrUsed)) {
    await signOut({ redirectTo: `/${locale}/reset-password/${token}` });
  }

  return (
    <main
      id="main-content"
      className="min-h-screen relative flex flex-col items-center justify-center p-4 overflow-hidden"
      style={{ backgroundColor: "var(--neutral-50)" }}
    >
      {/* Blueprint-style background grid */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `
            linear-gradient(var(--neutral-300) 1px, transparent 1px),
            linear-gradient(90deg, var(--neutral-300) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
          opacity: 0.25,
        }}
      />

      {/* Gradient overlay */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(135deg, rgba(248,250,252,0.7) 0%, rgba(241,245,249,0.7) 100%)",
        }}
      />

      {/* Card */}
      <div
        className="w-full relative"
        style={{
          maxWidth: 448,
          zIndex: 10,
          backgroundColor: "var(--neutral-0)",
          border: "1px solid var(--neutral-300)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-2)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          className="flex flex-col items-center"
          style={{
            padding: "var(--space-8) var(--space-8) var(--space-6)",
            backgroundColor: "var(--neutral-50)",
            borderBottom: "1px solid var(--neutral-300)",
          }}
        >
          <div
            className="flex items-center justify-center"
            style={{
              width: 48,
              height: 48,
              borderRadius: "var(--radius-md)",
              backgroundColor: isExpiredOrUsed ? "var(--error-100)" : "var(--primary-100)",
              color: isExpiredOrUsed ? "var(--error-600)" : "var(--primary-700)",
              marginBottom: "var(--space-4)",
            }}
          >
            {isExpiredOrUsed ? (
              /* X icon for invalid tokens */
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" fill="none"/>
                <path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            ) : (
              /* Lock icon for valid tokens */
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2" fill="none"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <circle cx="12" cy="16" r="1.5" fill="currentColor"/>
              </svg>
            )}
          </div>

          <h2
            style={{
              fontSize: "var(--text-heading)",
              fontWeight: "var(--font-weight-semibold)",
              color: isExpiredOrUsed ? "var(--error-600)" : "var(--primary-700)",
              margin: "0 0 4px",
              textAlign: "center",
            }}
          >
            {isExpiredOrUsed ? t("resetPasswordError") : t("resetPasswordTitle")}
          </h2>
          {!isExpiredOrUsed && (
            <p
              style={{
                fontSize: "var(--text-body)",
                color: "var(--neutral-500)",
                margin: 0,
                textAlign: "center",
              }}
            >
              {t("resetPasswordDescription")}
            </p>
          )}
        </div>

        {/* Content */}
        <div style={{ padding: "var(--space-6) var(--space-8) var(--space-8)" }}>
          {isExpiredOrUsed ? (
            <div className="flex flex-col gap-3">
              <Link
                href="/forgot-password"
                className="w-full flex items-center justify-center"
                style={{
                  height: "var(--button-height)",
                  backgroundColor: "var(--primary-700)",
                  color: "var(--neutral-0)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "var(--text-body)",
                  fontWeight: "var(--font-weight-semibold)",
                  textDecoration: "none",
                }}
              >
                {t("requestNewLink")}
              </Link>
              <Link
                href="/login"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "var(--text-body)",
                  color: "var(--neutral-500)",
                  textDecoration: "none",
                }}
              >
                ← {t("backToSignIn")}
              </Link>
            </div>
          ) : (
            <Suspense>
              <ResetPasswordForm token={token} />
            </Suspense>
          )}
        </div>
      </div>

      {/* Locale switcher */}
      <div style={{ marginTop: "var(--space-4)", display: "flex", justifyContent: "center" }}>
        <LocaleSwitcher />
      </div>
    </main>
  );
}
