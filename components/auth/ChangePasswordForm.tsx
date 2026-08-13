"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { changePasswordSchema, type ChangePasswordInput } from "@/lib/validations/auth";

export function ChangePasswordForm() {
  const t = useTranslations("auth");
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
  });

  const newPassword = watch("newPassword", "");

  const requirements = [
    { label: "8+ characters", met: newPassword.length >= 8 },
    { label: "Uppercase letter", met: /[A-Z]/.test(newPassword) },
    { label: "Number", met: /[0-9]/.test(newPassword) },
    { label: "Special character", met: /[^A-Za-z0-9]/.test(newPassword) },
  ];

  async function onSubmit(data: ChangePasswordInput) {
    setServerError(null);
    setSuccess(false);

    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const json = await res.json().catch(() => ({}));

      if (res.status === 400) {
        const msg = (json as { error?: string }).error;
        setServerError(
          msg === "Current password is incorrect"
            ? t("changePasswordError")
            : t("changePasswordGenericError")
        );
        return;
      }
      if (!res.ok) {
        setServerError(t("changePasswordGenericError"));
        return;
      }

      setSuccess(true);
      reset();
    } catch {
      setServerError(t("changePasswordGenericError"));
    }
  }

  return (
    <section
      style={{
        backgroundColor: "var(--neutral-0)",
        border: "1px solid var(--neutral-300)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-6)",
      }}
    >
      <h2
        style={{
          fontSize: "var(--text-subheading)",
          fontWeight: "var(--font-weight-semibold)",
          color: "var(--neutral-900)",
          margin: "0 0 var(--space-1)",
        }}
      >
        {t("changePasswordTitle")}
      </h2>
      <p
        style={{
          fontSize: "var(--text-body)",
          color: "var(--neutral-500)",
          margin: "0 0 var(--space-4)",
        }}
      >
        {t("changePasswordDescription")}
      </p>

      {success && (
        <div
          role="status"
          style={{
            padding: "10px 12px",
            borderRadius: "var(--radius-sm)",
            backgroundColor: "var(--success-100)",
            border: "1px solid var(--success-600)",
            fontSize: "var(--text-body)",
            color: "var(--success-600)",
            marginBottom: "var(--space-4)",
          }}
        >
          {t("changePasswordSuccess")}
        </div>
      )}

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
            marginBottom: "var(--space-4)",
          }}
        >
          {serverError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-3">
        {/* Current password */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="currentPassword"
            style={{
              fontSize: "var(--text-body)",
              fontWeight: "var(--font-weight-medium)",
              color: "var(--neutral-700)",
            }}
          >
            {t("currentPassword")}
          </label>
          <input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.currentPassword}
            {...register("currentPassword")}
            style={{
              height: "var(--input-height)",
              padding: "0 var(--space-4)",
              border: `1px solid ${errors.currentPassword ? "var(--error-600)" : "var(--neutral-300)"}`,
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--neutral-0)",
              color: "var(--neutral-900)",
              fontSize: "var(--text-body)",
              outline: "none",
            }}
            onFocus={(e) => (e.currentTarget.style.boxShadow = errors.currentPassword ? "var(--focus-ring-error)" : "var(--focus-ring)")}
            onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
          />
          {errors.currentPassword && (
            <p role="alert" style={{ fontSize: "var(--text-caption)", color: "var(--error-600)", margin: 0 }}>
              {errors.currentPassword.message}
            </p>
          )}
        </div>

        {/* New password */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="newPassword"
            style={{
              fontSize: "var(--text-body)",
              fontWeight: "var(--font-weight-medium)",
              color: "var(--neutral-700)",
            }}
          >
            {t("newPassword")}
          </label>
          <input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            aria-describedby="new-password-requirements"
            aria-invalid={!!errors.newPassword}
            {...register("newPassword")}
            style={{
              height: "var(--input-height)",
              padding: "0 var(--space-4)",
              border: `1px solid ${errors.newPassword ? "var(--error-600)" : "var(--neutral-300)"}`,
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--neutral-0)",
              color: "var(--neutral-900)",
              fontSize: "var(--text-body)",
              outline: "none",
            }}
            onFocus={(e) => (e.currentTarget.style.boxShadow = errors.newPassword ? "var(--focus-ring-error)" : "var(--focus-ring)")}
            onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
          />
          {errors.newPassword && (
            <p role="alert" style={{ fontSize: "var(--text-caption)", color: "var(--error-600)", margin: 0 }}>
              {errors.newPassword.message}
            </p>
          )}

          {/* Password strength checklist */}
          {newPassword.length > 0 && (
            <ul
              id="new-password-requirements"
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

        {/* Confirm new password */}
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
            <p role="alert" style={{ fontSize: "var(--text-caption)", color: "var(--error-600)", margin: 0 }}>
              {errors.confirmPassword.message}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="transition-colors duration-150"
          style={{
            height: "var(--button-height)",
            marginTop: "var(--space-1)",
            padding: "0 var(--space-6)",
            alignSelf: "flex-start",
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
          {isSubmitting ? t("changePasswordSubmitting") : t("changePasswordSubmit")}
        </button>
      </form>
    </section>
  );
}
