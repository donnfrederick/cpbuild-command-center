import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { User } from "lucide-react";
import { OfflinePreferences } from "@/components/account/OfflinePreferences";
import { AgentIdentityForm } from "@/components/account/AgentIdentityForm";
import { ProfileForm } from "@/components/account/ProfileForm";
import { ApiAccessSection } from "@/components/account/ApiAccessSection";
import { hasPermission, PERMISSIONS, type RoleCode } from "@/lib/permissions";
import { getEffectiveSession } from "@/lib/masquerade";
import { db } from "@/lib/db";


export async function generateMetadata() {
  const t = await getTranslations("account");
  return { title: `${t("title")} — CP Build` };
}

export default async function AccountSettingsPage() {
  const locale = await getLocale();
  const t = await getTranslations("account");
  const session = await getEffectiveSession();
  if (!session?.user) redirect(`/${locale}/login`);

  const { name, email, role } = session.user;
  const canSeeAgentIdentity = hasPermission(role, PERMISSIONS.ACCESS_DEVTOOLS);

  // Load API keys assigned to this user (shown for BI_ANALYST and any user with an active key)
  const activeApiKeys = await db.apiKey.findMany({
    where: { assignedToId: session.user.id, revokedAt: null },
    select: { id: true, name: true, keyPrefix: true, scopes: true, lastUsedAt: true, expiresAt: true },
    orderBy: { createdAt: "desc" },
  });
  // Filter out expired keys
  const validApiKeys = activeApiKeys.filter((k) => !k.expiresAt || k.expiresAt > new Date());

  return (
    <div
      style={{
        padding: "var(--space-4)",
        maxWidth: 720,
        margin: "0 auto",
      }}
    >
      <h1
        style={{
          fontSize: "var(--text-heading)",
          fontWeight: 600,
          color: "var(--neutral-900)",
          margin: 0,
          marginBottom: "var(--space-6)",
        }}
      >
        {t("title")}
      </h1>

      <div
        className="flex flex-col gap-6"
        style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}
      >
        {/* Profile card */}
        <section
          style={{
            backgroundColor: "var(--neutral-0)",
            border: "1px solid var(--neutral-300)",
            borderRadius: "var(--radius-md)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "var(--space-4)",
              borderBottom: "1px solid var(--neutral-200)",
              display: "flex",
              alignItems: "center",
              gap: "var(--space-3)",
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                backgroundColor: "var(--primary-100)",
                color: "var(--primary-700)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <User style={{ width: 24, height: 24 }} aria-hidden />
            </div>
            <div>
              <h2
                style={{
                  fontSize: "var(--text-subheading)",
                  fontWeight: 600,
                  color: "var(--neutral-900)",
                  margin: 0,
                }}
              >
                {t("profile")}
              </h2>
              <p
                style={{
                  fontSize: "var(--text-caption)",
                  color: "var(--neutral-500)",
                  margin: "var(--space-1) 0 0",
                }}
              >
                {t("profileDescription")}
              </p>
            </div>
          </div>
          <ProfileForm
            initialName={name ?? null}
            email={email ?? ""}
            role={role as RoleCode}
          />
        </section>

        {/* Agent identity card — ADMIN, DESIGNER, DEVELOPER only */}
        {canSeeAgentIdentity && <AgentIdentityForm />}

        {/* API Access card — shown to users who have active API keys */}
        {validApiKeys.length > 0 && <ApiAccessSection apiKeys={validApiKeys} />}

        {/* Offline preferences card */}
        <section
          style={{
            backgroundColor: "var(--neutral-0)",
            border: "1px solid var(--neutral-300)",
            borderRadius: "var(--radius-md)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "var(--space-4)",
              borderBottom: "1px solid var(--neutral-200)",
            }}
          >
            <h2
              style={{
                fontSize: "var(--text-subheading)",
                fontWeight: 600,
                color: "var(--neutral-900)",
                margin: 0,
              }}
            >
              {t("offlineData")}
            </h2>
            <p
              style={{
                fontSize: "var(--text-caption)",
                color: "var(--neutral-500)",
                margin: "var(--space-2) 0 0",
              }}
            >
              {t("offlineDescription")}
            </p>
          </div>
          <div style={{ padding: "var(--space-4)" }}>
            <OfflinePreferences />
          </div>
        </section>
      </div>
    </div>
  );
}
