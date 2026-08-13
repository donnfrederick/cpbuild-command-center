import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { LoginForm } from "@/components/auth/LoginForm";
import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const t = await getTranslations("auth");
  return { title: `${t("signIn")} — CP Build` };
}

export default async function LoginPage({ params }: Props) {
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
        {/* ── Logo + Branding section ── */}
        <div
          className="flex flex-col items-center"
          style={{
            padding: "var(--space-8) var(--space-8) var(--space-6)",
            backgroundColor: "var(--neutral-50)",
            borderBottom: "1px solid var(--neutral-300)",
          }}
        >
          {/* Logo mark */}
          <div
            className="flex items-center justify-center"
            style={{
              width: 64,
              height: 64,
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--primary-700)",
              color: "var(--neutral-0)",
              marginBottom: "var(--space-4)",
            }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 32 32"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <rect x="4" y="20" width="24" height="8" rx="1" fill="currentColor" opacity="0.9" />
              <rect x="8" y="12" width="16" height="9" rx="1" fill="currentColor" opacity="0.8" />
              <rect x="12" y="4" width="8" height="9" rx="1" fill="currentColor" opacity="0.7" />
              <rect x="14" y="6" width="4" height="5" rx="0.5" fill="var(--primary-700)" />
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
            {t("commandCenter")}
          </h2>
          <p
            style={{
              fontSize: "var(--text-body)",
              color: "var(--neutral-500)",
              margin: 0,
              textAlign: "center",
            }}
          >
            {t("internalToolsDashboard")}
          </p>
        </div>

        {/* ── Sign-in section ── */}
        <div style={{ padding: "var(--space-6) var(--space-8) var(--space-8)" }}>
          <div style={{ marginBottom: "var(--space-4)", textAlign: "center" }}>
            <h3
              style={{
                fontSize: "var(--text-subheading)",
                fontWeight: "var(--font-weight-medium)",
                color: "var(--neutral-900)",
                margin: "0 0 4px",
              }}
            >
              {t("signInToAccount")}
            </h3>
            <p style={{ fontSize: "var(--text-body)", color: "var(--neutral-500)", margin: 0 }}>
              {t("employeesOnly")}
            </p>
          </div>

          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>

      {/* Locale switcher */}
      <div style={{ marginTop: "var(--space-4)", display: "flex", justifyContent: "center" }}>
        <LocaleSwitcher />
      </div>

      {/* Footer */}
      <p
        style={{
          marginTop: "var(--space-6)",
          fontSize: "var(--text-body)",
          color: "var(--neutral-500)",
          position: "relative",
          zIndex: 10,
          textAlign: "center",
        }}
      >
        {t("needHelp")}{" "}
        <a
          href="mailto:it@cpbuild.com"
          style={{ color: "var(--primary-500)" }}
        >
          {t("contactIT")}
        </a>
      </p>
    </main>
  );
}
