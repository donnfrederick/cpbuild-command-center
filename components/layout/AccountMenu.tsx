"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import { NavLink } from "@/components/navigation/nav-link";
import { ChevronDown, Settings, LogOut, SlidersHorizontal } from "lucide-react";
import { RolePreviewPicker } from "@/components/layout/RolePreviewPicker";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface AccountMenuProps {
  name: string;
  role: string;
  locale: string;
  /** Whether this user has permission to preview roles (ADMIN, DESIGNER, DEVELOPER). */
  canPreviewRole?: boolean;
  /** The real role — passed to RolePreviewPicker so it can label the user's own role. */
  realRole?: string;
  /** Active preview role code, or null if no preview is in effect. */
  activePreviewRole?: string | null;
  /** Whether this user can open the Dev Tools panel (ADMIN, DESIGNER, DEVELOPER). */
  canUseDevTools?: boolean;
}

export function AccountMenu({ name, role, locale, canPreviewRole = false, realRole, activePreviewRole = null, canUseDevTools = false }: AccountMenuProps) {
  const t = useTranslations("projects");
  const tAuth = useTranslations("auth");
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      {/* User trigger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 transition-colors duration-150"
        style={{
          padding: "var(--space-2) var(--space-4)",
          borderRadius: "var(--radius-sm)",
          backgroundColor: "transparent",
          color: "var(--neutral-700)",
          fontSize: "var(--text-body)",
          fontWeight: "var(--font-weight-medium)",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.backgroundColor = "var(--neutral-100)")
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.backgroundColor = "transparent")
        }
        aria-expanded={open}
        aria-label={t("accountSettings")}
      >
        {/* Avatar circle with initials */}
        <div
          className="flex items-center justify-center flex-shrink-0"
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            backgroundColor: "#0057F5",
            color: "#fff",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.02em",
          }}
        >
          {getInitials(name)}
        </div>

        {/* Name + role */}
        <div className="flex-1 min-w-0 text-left">
          <p
            style={{
              fontSize: "var(--text-body)",
              fontWeight: "var(--font-weight-medium)",
              color: "var(--neutral-900)",
              margin: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {name}
          </p>
          <p
            style={{
              fontSize: "var(--text-caption)",
              color: "var(--neutral-500)",
              margin: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {role}
          </p>
        </div>

        <ChevronDown
          style={{
            width: "var(--icon-size)",
            height: "var(--icon-size)",
            flexShrink: 0,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 150ms",
          }}
        />
      </button>

      {/* Dropdown — positioned absolutely above the trigger so it's never clipped */}
      {open && (
        <>
          {/* Click-outside backdrop */}
          <div
            aria-hidden
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 40 }}
          />
          <div
            className="flex flex-col"
            style={{
              position: "absolute",
              bottom: "calc(100% + var(--space-1))",
              left: 0,
              right: 0,
              zIndex: 50,
              backgroundColor: "var(--neutral-0)",
              border: "1px solid var(--neutral-200)",
              borderRadius: "var(--radius-md)",
              boxShadow: "0 4px 20px rgba(0,0,0,0.10)",
              overflow: "hidden",
            }}
          >
            <NavLink
              href="/settings"
              onClick={() => setOpen(false)}
              className="w-full flex items-center gap-3 transition-colors duration-150"
              style={{
                padding: "var(--space-2) var(--space-4)",
                backgroundColor: "transparent",
                color: "var(--neutral-700)",
                fontSize: "var(--text-body)",
                fontWeight: "var(--font-weight-medium)",
                border: "none",
                borderBottom: "1px solid var(--neutral-100)",
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                textDecoration: "none",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = "var(--neutral-100)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = "transparent")
              }
            >
              <Settings style={{ width: "var(--icon-size)", height: "var(--icon-size)" }} />
              <span>{t("accountSettings")}</span>
            </NavLink>

            {canUseDevTools && (
              <button
                onClick={() => {
                  setOpen(false);
                  window.dispatchEvent(new CustomEvent("devtools:open"));
                }}
                className="w-full flex items-center gap-3 transition-colors duration-150"
                style={{
                  padding: "var(--space-2) var(--space-4)",
                  backgroundColor: "transparent",
                  color: "var(--neutral-700)",
                  fontSize: "var(--text-body)",
                  fontWeight: "var(--font-weight-medium)",
                  border: "none",
                  borderBottom: "1px solid var(--neutral-100)",
                  cursor: "pointer",
                  textAlign: "left",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = "var(--neutral-100)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = "transparent")
                }
              >
                <SlidersHorizontal style={{ width: "var(--icon-size)", height: "var(--icon-size)" }} />
                <span>Dev Tools</span>
              </button>
            )}

            <button
              onClick={() => {
                setOpen(false);
                void signOut({ callbackUrl: `/${locale}/login` });
              }}
              className="w-full flex items-center gap-3 transition-colors duration-150"
              style={{
                padding: "var(--space-2) var(--space-4)",
                backgroundColor: "transparent",
                color: "var(--error-600)",
                fontSize: "var(--text-body)",
                fontWeight: "var(--font-weight-medium)",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = "var(--error-100)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = "transparent")
              }
            >
              <LogOut style={{ width: "var(--icon-size)", height: "var(--icon-size)" }} />
              <span>{tAuth("logout")}</span>
            </button>

            {canPreviewRole && realRole !== undefined && (
              <RolePreviewPicker
                realRole={realRole}
                activePreviewRole={activePreviewRole}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
