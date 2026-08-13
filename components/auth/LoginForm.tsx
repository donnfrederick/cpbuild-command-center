"use client";

import { useActionState, useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { credentialsLoginAction } from "@/app/actions/credentials-login";
import { postLoginRedirectPath } from "@/lib/post-login-redirect";

export function LoginForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const [state, formAction, isPending] = useActionState(credentialsLoginAction, undefined);

  const redirectTo = useMemo(() => {
    const p = postLoginRedirectPath(searchParams.get("callbackUrl"));
    return p === "/" ? `/${locale}` : p;
  }, [searchParams, locale]);

  const isDev = process.env.NODE_ENV === "development";
  const [showPassword, setShowPassword] = useState(false);

  const serverError =
    state?.ok === false
      ? state.error === "invalidCredentials"
        ? t("invalidCredentials")
        : t("validationError")
      : null;

  return (
    <form action={formAction} noValidate className="flex flex-col gap-3">
      <input type="hidden" name="redirectTo" value={redirectTo} />

      {serverError && (
        <div
          role="alert"
          style={{
            padding: "10px 12px",
            borderRadius: "var(--radius-sm)",
            backgroundColor: "var(--error-100)",
            border: "1px solid var(--error-600)",
            fontSize: "var(--text-body)",
            color: "var(--error-600)",
          }}
        >
          {serverError}
        </div>
      )}

      {/* Email */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="email"
          style={{
            fontSize: "var(--text-body)",
            fontWeight: "var(--font-weight-medium)",
            color: "var(--neutral-700)",
          }}
        >
          {t("email")}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={isDev ? "admin@example.com" : undefined}
          style={{
            height: "var(--input-height)",
            padding: "0 var(--space-4)",
            border: "1px solid var(--neutral-300)",
            borderRadius: "var(--radius-sm)",
            backgroundColor: "var(--neutral-0)",
            color: "var(--neutral-900)",
            fontSize: "var(--text-body)",
            outline: "none",
          }}
          onFocus={(e) => (e.currentTarget.style.boxShadow = "var(--focus-ring)")}
          onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
        />
      </div>

      {/* Password */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="password"
          style={{
            fontSize: "var(--text-body)",
            fontWeight: "var(--font-weight-medium)",
            color: "var(--neutral-700)",
          }}
        >
          {t("password")}
        </label>
        <div style={{ position: "relative" }}>
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            defaultValue={isDev ? "ChangeMe123!" : undefined}
            style={{
              width: "100%",
              height: "var(--input-height)",
              padding: "0 calc(var(--space-4) + 36px) 0 var(--space-4)",
              border: "1px solid var(--neutral-300)",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--neutral-0)",
              color: "var(--neutral-900)",
              fontSize: "var(--text-body)",
              outline: "none",
              boxSizing: "border-box",
            }}
            onFocus={(e) => (e.currentTarget.style.boxShadow = "var(--focus-ring)")}
            onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
          />
          <button
            type="button"
            aria-label={showPassword ? t("hidePassword") : t("showPassword")}
            aria-pressed={showPassword}
            title={showPassword ? t("hidePassword") : t("showPassword")}
            onClick={() => setShowPassword((prev) => !prev)}
            style={{
              position: "absolute",
              top: "50%",
              right: 8,
              transform: "translateY(-50%)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              padding: 0,
              border: "none",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "transparent",
              color: "var(--neutral-600)",
              cursor: "pointer",
            }}
          >
            {showPassword ? (
              <EyeOff size={16} aria-hidden="true" />
            ) : (
              <Eye size={16} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Forgot password */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Link
          href="/forgot-password"
          style={{
            fontSize: "var(--text-caption)",
            color: "var(--primary-500)",
            textDecoration: "none",
          }}
        >
          {t("forgotPassword")}
        </Link>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isPending}
        className="w-full flex items-center justify-center transition-colors duration-150"
        style={{
          height: "var(--button-height)",
          marginTop: "var(--space-1)",
          backgroundColor: isPending ? "var(--primary-500)" : "var(--primary-700)",
          color: "var(--neutral-0)",
          borderRadius: "var(--radius-sm)",
          fontSize: "var(--text-body)",
          fontWeight: "var(--font-weight-semibold)",
          border: "none",
          cursor: isPending ? "not-allowed" : "pointer",
          opacity: isPending ? 0.7 : 1,
        }}
        onMouseEnter={(e) => {
          if (!isPending) e.currentTarget.style.backgroundColor = "var(--primary-500)";
        }}
        onMouseLeave={(e) => {
          if (!isPending) e.currentTarget.style.backgroundColor = "var(--primary-700)";
        }}
      >
        {isPending ? t("signingIn") : t("signIn")}
      </button>

      {isDev && (
        <p style={{ fontSize: "var(--text-caption)", color: "var(--neutral-500)", textAlign: "center", margin: 0 }}>
          {t("devPrefilled")}
        </p>
      )}
    </form>
  );
}
