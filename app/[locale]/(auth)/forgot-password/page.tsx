import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  await params;
  const t = await getTranslations("auth");
  return { title: `${t("forgotPasswordTitle")} — CP Build` };
}

export default async function ForgotPasswordPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations("auth");

  if (process.env.DEV_BYPASS_AUTH === "true" && process.env.NODE_ENV !== "production") {
    redirect(`/${locale}`);
  }

  const session = await auth();
  if (session) redirect(`/${locale}`);

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
              backgroundColor: "var(--primary-100)",
              color: "var(--primary-700)",
              marginBottom: "var(--space-4)",
            }}
          >
            {/* Lock icon */}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2" fill="none"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="12" cy="16" r="1.5" fill="currentColor"/>
            </svg>
          </div>

          <h2
            style={{
              fontSize: "var(--text-heading)",
              fontWeight: "var(--font-weight-semibold)",
              color: "var(--primary-700)",
              margin: "0 0 4px",
              textAlign: "center",
            }}
          >
            {t("forgotPasswordTitle")}
          </h2>
          <p
            style={{
              fontSize: "var(--text-body)",
              color: "var(--neutral-500)",
              margin: 0,
              textAlign: "center",
            }}
          >
            {t("forgotPasswordDescription")}
          </p>
        </div>

        {/* Form */}
        <div style={{ padding: "var(--space-6) var(--space-8) var(--space-8)" }}>
          <Suspense>
            <ForgotPasswordForm />
          </Suspense>
        </div>
      </div>

      {/* Locale switcher */}
      <div style={{ marginTop: "var(--space-4)", display: "flex", justifyContent: "center" }}>
        <LocaleSwitcher />
      </div>
    </main>
  );
}
