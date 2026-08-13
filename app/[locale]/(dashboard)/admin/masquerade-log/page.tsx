import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { getEffectiveSession } from "@/lib/masquerade";
import { db } from "@/lib/db";

export async function generateMetadata() {
  const t = await getTranslations("masquerade");
  return { title: `${t("logTitle")} — CP Build Field Tracker` };
}

const PAGE_SIZE = 30;

export default async function MasqueradeLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const locale = await getLocale();
  const effective = await getEffectiveSession();

  if (!effective?.user) redirect(`/${locale}/login`);

  // Use the REAL session role — this page is always gated on actual ADMIN role
  const realRole = effective.masquerade?.actorRole ?? effective.user.role;
  if (!hasPermission(realRole, PERMISSIONS.MASQUERADE_USER)) {
    redirect(`/${locale}`);
  }

  const t = await getTranslations("masquerade");
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? "1"));
  const skip = (page - 1) * PAGE_SIZE;

  const [total, entries] = await db.$transaction([
    db.masqueradeLog.count(),
    db.masqueradeLog.findMany({
      skip,
      take: PAGE_SIZE,
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        startedAt: true,
        endedAt: true,
        actor: { select: { id: true, name: true, email: true } },
        target: {
          select: {
            id: true,
            name: true,
            email: true,
            role: { select: { code: true, name: true } },
          },
        },
      },
    }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  function formatDuration(start: Date, end: Date | null): string {
    if (!end) return "—";
    const ms = end.getTime() - start.getTime();
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }

  return (
    <div
      style={{
        padding: "var(--page-padding-x)",
        maxWidth: 960,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "var(--section-gap)",
      }}
    >
      {/* Page header */}
      <div>
        <h1
          style={{
            fontSize: "var(--text-heading)",
            fontWeight: 700,
            color: "var(--neutral-900)",
            margin: 0,
          }}
        >
          {t("logTitle")}
        </h1>
        <p
          style={{
            margin: "4px 0 0",
            fontSize: "var(--text-caption)",
            color: "var(--neutral-500)",
          }}
        >
          {t("logDescription")}
        </p>
      </div>

      {/* Table */}
      <section
        style={{
          backgroundColor: "var(--neutral-0)",
          border: "1px solid var(--neutral-300)",
          borderRadius: "var(--radius-md)",
          overflow: "hidden",
        }}
      >
        {entries.length === 0 ? (
          <div
            style={{
              padding: "var(--space-8)",
              textAlign: "center",
              color: "var(--neutral-500)",
              fontSize: "var(--text-body)",
            }}
          >
            {t("logEmpty")}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "var(--text-body)",
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid var(--neutral-200)",
                    backgroundColor: "var(--neutral-50)",
                  }}
                >
                  {[
                    t("logColumnActor"),
                    t("logColumnTarget"),
                    t("logColumnStarted"),
                    t("logColumnDuration"),
                    t("logColumnStatus"),
                  ].map((col) => (
                    <th
                      key={col}
                      style={{
                        padding: "var(--space-3) var(--space-4)",
                        textAlign: "left",
                        fontWeight: 600,
                        color: "var(--neutral-700)",
                        fontSize: "var(--text-caption)",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const isActive = !entry.endedAt;
                  return (
                    <tr
                      key={entry.id}
                      style={{
                        borderBottom: "1px solid var(--neutral-100)",
                        backgroundColor: isActive ? "var(--warning-100)" : "var(--neutral-0)",
                      }}
                    >
                      {/* Actor */}
                      <td style={{ padding: "var(--space-3) var(--space-4)" }}>
                        <div style={{ fontWeight: 500, color: "var(--neutral-900)" }}>
                          {entry.actor.name ?? "—"}
                        </div>
                        <div style={{ fontSize: "var(--text-caption)", color: "var(--neutral-500)" }}>
                          {entry.actor.email}
                        </div>
                      </td>
                      {/* Target */}
                      <td style={{ padding: "var(--space-3) var(--space-4)" }}>
                        <div style={{ fontWeight: 500, color: "var(--neutral-900)" }}>
                          {entry.target.name ?? "—"}
                        </div>
                        <div style={{ fontSize: "var(--text-caption)", color: "var(--neutral-500)" }}>
                          {entry.target.email} · {entry.target.role.name}
                        </div>
                      </td>
                      {/* Started */}
                      <td
                        style={{
                          padding: "var(--space-3) var(--space-4)",
                          color: "var(--neutral-700)",
                          fontSize: "var(--text-caption)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {entry.startedAt.toLocaleString()}
                      </td>
                      {/* Duration */}
                      <td
                        style={{
                          padding: "var(--space-3) var(--space-4)",
                          color: "var(--neutral-700)",
                          fontSize: "var(--text-caption)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatDuration(entry.startedAt, entry.endedAt)}
                      </td>
                      {/* Status */}
                      <td style={{ padding: "var(--space-3) var(--space-4)" }}>
                        <span
                          style={{
                            fontSize: "var(--text-caption)",
                            fontWeight: 600,
                            padding: "2px var(--space-2)",
                            borderRadius: "var(--radius-sm)",
                            backgroundColor: isActive ? "var(--warning-600)" : "var(--neutral-200)",
                            color: isActive ? "var(--neutral-0)" : "var(--neutral-600)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {isActive ? t("logStatusActive") : t("logStatusEnded")}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Pagination */}
      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            justifyContent: "center",
            fontSize: "var(--text-caption)",
            color: "var(--neutral-600)",
          }}
        >
          {page > 1 && (
            <a
              href={`?page=${page - 1}`}
              style={{
                padding: "var(--space-1) var(--space-3)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--neutral-300)",
                color: "var(--neutral-700)",
                textDecoration: "none",
              }}
            >
              ← Prev
            </a>
          )}
          <span>
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <a
              href={`?page=${page + 1}`}
              style={{
                padding: "var(--space-1) var(--space-3)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--neutral-300)",
                color: "var(--neutral-700)",
                textDecoration: "none",
              }}
            >
              Next →
            </a>
          )}
        </div>
      )}
    </div>
  );
}
