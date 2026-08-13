"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@/i18n/navigation";
import { resetPasswordSchema, type ResetPasswordInput } from "@/lib/validations/auth";

interface Props {
  token: string;
}

export function ResetPasswordForm({ token }: Props) {
  const t = useTranslations("auth");
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token },
  });

  const password = watch("password", "");

  const requirements = [
    { label: "8+ characters", met: password.length >= 8 },
    { label: "Uppercase letter", met: /[A-Z]/.test(password) },
    { label: "Number", met: /[0-9]/.test(password) },
    { label: "Special character", met: /[^A-Za-z0-9]/.test(password) },
  ];

  async function onSubmit(data: ResetPasswordInput) {
    setServerError(null);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setServerError((json as { error?: string }).error ?? t("resetPasswordGenericError"));
        return;
      }

      setSuccess(true);
    } catch {
      setServerError(t("resetPasswordGenericError"));
    }
  }

  if (success) {
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
          {t("resetPasswordSuccess")}
        </div>

        <Link
          href="/login"
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
          {t("signIn")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-3">
      {/* Hidden token field */}
      <input type="hidden" {...register("token")} />

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
          <p style={{ margin: "0 0 8px" }}>{serverError}</p>
          <Link
            href="/forgot-password"
            style={{ color: "var(--error-600)", fontWeight: 600 }}
          >
            {t("requestNewLink")}
          </Link>
        </div>
      )}

      {/* New password */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="password"
          style={{
            fontSize: "var(--text-body)",
            fontWeight: "var(--font-weight-medium)",
            color: "var(--neutral-700)",
          }}
        >
          {t("newPassword")}
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          aria-describedby="password-requirements"
          aria-invalid={!!errors.password}
          {...register("password")}
          style={{
            height: "var(--input-height)",
            padding: "0 var(--space-4)",
            border: `1px solid ${errors.password ? "var(--error-600)" : "var(--neutral-300)"}`,
            borderRadius: "var(--radius-sm)",
            backgroundColor: "var(--neutral-0)",
            color: "var(--neutral-900)",
            fontSize: "var(--text-body)",
            outline: "none",
          }}
          onFocus={(e) => (e.currentTarget.style.boxShadow = errors.password ? "var(--focus-ring-error)" : "var(--focus-ring)")}
          onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
        />
        {errors.password && (
          <p role="alert" style={{ fontSize: "var(--text-caption)", color: "var(--error-600)", margin: 0 }}>
            {errors.password.message}
          </p>
        )}

        {/* Password strength checklist */}
        {password.length > 0 && (
          <ul
            id="password-requirements"
            aria-label="Password requirements"
            style={{
              margin: "var(--space-1) 0 0",
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            {requirements.map(({ label, met }) => (
              <li
                key={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: "var(--text-caption)",
                  color: met ? "var(--success-600)" : "var(--neutral-500)",
                }}
              >
                <span aria-hidden="true">{met ? "✓" : "○"}</span>
                {label}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Confirm password */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="confirmPassword"
          style={{
            fontSize: "var(--text-body)",
            fontWeight: "var(--font-weight-medium)",
            color: "var(--neutral-700)",
          }}
        >
          {t("confirmPassword")}
        </label>
        <input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          aria-describedby={errors.confirmPassword ? "confirm-error" : undefined}
          aria-invalid={!!errors.confirmPassword}
          {...register("confirmPassword")}
          style={{
            height: "var(--input-height)",
            padding: "0 var(--space-4)",
            border: `1px solid ${errors.confirmPassword ? "var(--error-600)" : "var(--neutral-300)"}`,
            borderRadius: "var(--radius-sm)",
            backgroundColor: "var(--neutral-0)",
            color: "var(--neutral-900)",
            fontSize: "var(--text-body)",
            outline: "none",
          }}
          onFocus={(e) => (e.currentTarget.style.boxShadow = errors.confirmPassword ? "var(--focus-ring-error)" : "var(--focus-ring)")}
          onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
        />
        {errors.confirmPassword && (
          <p id="confirm-error" role="alert" style={{ fontSize: "var(--text-caption)", color: "var(--error-600)", margin: 0 }}>
            {errors.confirmPassword.message}
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
        {isSubmitting ? t("resetPasswordSubmitting") : t("resetPasswordSubmit")}
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
