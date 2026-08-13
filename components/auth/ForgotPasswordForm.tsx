"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@/i18n/navigation";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/validations/auth";

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  async function onSubmit(data: ForgotPasswordInput) {
    setServerError(null);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok && res.status !== 200) {
        setServerError(t("forgotPasswordError"));
        return;
      }

      setSubmitted(true);
    } catch {
      setServerError(t("forgotPasswordError"));
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col gap-4">
        <div
          role="alert"
          style={{
            padding: "var(--space-4)",
            borderRadius: "var(--radius-sm)",
            backgroundColor: "var(--success-100)",
            border: "1px solid var(--success-600)",
            fontSize: "var(--text-body)",
            color: "var(--success-600)",
            lineHeight: 1.5,
          }}
        >
          {t("forgotPasswordSuccess")}
        </div>

        <Link
          href="/login"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "var(--space-1)",
            fontSize: "var(--text-body)",
            color: "var(--primary-500)",
            textDecoration: "none",
            marginTop: "var(--space-2)",
          }}
        >
          ← {t("backToSignIn")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-3">
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
          type="email"
          autoComplete="email"
          aria-describedby={errors.email ? "email-error" : undefined}
          aria-invalid={!!errors.email}
          {...register("email")}
          style={{
            height: "var(--input-height)",
            padding: "0 var(--space-4)",
            border: `1px solid ${errors.email ? "var(--error-600)" : "var(--neutral-300)"}`,
            borderRadius: "var(--radius-sm)",
            backgroundColor: "var(--neutral-0)",
            color: "var(--neutral-900)",
            fontSize: "var(--text-body)",
            outline: "none",
          }}
          onFocus={(e) => (e.currentTarget.style.boxShadow = errors.email ? "var(--focus-ring-error)" : "var(--focus-ring)")}
          onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
        />
        {errors.email && (
          <p id="email-error" role="alert" style={{ fontSize: "var(--text-caption)", color: "var(--error-600)", margin: 0 }}>
            {errors.email.message}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full flex items-center justify-center transition-colors duration-150"
        style={{
          height: "var(--button-height)",
          marginTop: "var(--space-1)",
          backgroundColor: isSubmitting ? "var(--primary-500)" : "var(--primary-700)",
          color: "var(--neutral-0)",
          borderRadius: "var(--radius-sm)",
          fontSize: "var(--text-body)",
          fontWeight: "var(--font-weight-semibold)",
          border: "none",
          cursor: isSubmitting ? "not-allowed" : "pointer",
          opacity: isSubmitting ? 0.7 : 1,
        }}
        onMouseEnter={(e) => {
          if (!isSubmitting) e.currentTarget.style.backgroundColor = "var(--primary-500)";
        }}
        onMouseLeave={(e) => {
          if (!isSubmitting) e.currentTarget.style.backgroundColor = "var(--primary-700)";
        }}
      >
        {isSubmitting ? t("forgotPasswordSubmitting") : t("forgotPasswordSubmit")}
      </button>

      <Link
        href="/login"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "var(--text-body)",
          color: "var(--neutral-500)",
          textDecoration: "none",
          marginTop: "var(--space-1)",
        }}
      >
        ← {t("backToSignIn")}
      </Link>
    </form>
  );
}
