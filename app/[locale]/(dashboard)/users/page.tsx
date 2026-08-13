import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { hasPermission, PERMISSIONS, getGlobalNavAccess } from "@/lib/permissions";
import { getEffectiveSession } from "@/lib/masquerade";
import { isDevToolsAllowed } from "@/lib/devtools-env";
import { db } from "@/lib/db";
import { UsersView } from "@/components/users/UsersView";


export async function generateMetadata() {
  const t = await getTranslations("users");
  return { title: `${t("title")} — CP Build Field Tracker` };
}

export default async function UsersPage() {
  const locale = await getLocale();
  const effective = await getEffectiveSession();
  if (!effective?.user) redirect(`/${locale}/login`);
  const session = effective;

  const sp = session.user.specialPermissions;
  const { canViewUsers } = getGlobalNavAccess(session.user.role, sp);
  if (!canViewUsers) redirect(`/${locale}/projects`);

  const canViewTeam    = hasPermission(session.user.role, PERMISSIONS.VIEW_TEAM, sp);
  const canInvite      = hasPermission(session.user.role, PERMISSIONS.INVITE_MEMBER, sp);
  const canManageRoles = hasPermission(session.user.role, PERMISSIONS.MANAGE_ROLES, sp);
  // canMasquerade uses the REAL session role (not the overlay) — only a true ADMIN can see these buttons.
  // We check the actor role when masquerading, or the session role otherwise.
  const realRole = effective.masquerade?.actorRole ?? session.user.role;
  const canMasquerade  = hasPermission(realRole, PERMISSIONS.MASQUERADE_USER);

  if (!canViewTeam && !canInvite) {
    redirect(`/${locale}`);
  }

  // Fetch all members
  const users = await db.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      createdAt: true,
      role: { select: { id: true, code: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Fetch special permissions separately (only when admin needs to manage them)
  type RawGrant = {
    id: string;
    userId: string;
    permission: string;
    note: string | null;
    grantedAt: Date;
    grantedBy: { name: string | null; email: string } | null;
  };
  let allGrants: RawGrant[] = [];
  if (canManageRoles) {
    allGrants = await db.userSpecialPermission.findMany({
      select: {
        id: true,
        userId: true,
        permission: true,
        note: true,
        grantedAt: true,
        grantedBy: { select: { name: true, email: true } },
      },
      orderBy: { grantedAt: "asc" },
    });
  }

  const grantsByUser = allGrants.reduce<Record<string, RawGrant[]>>((acc, g) => {
    (acc[g.userId] ??= []).push(g);
    return acc;
  }, {});

  const members = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role.code,
    roleId: u.role.id,
    roleName: u.role.name,
    status: u.status,
    createdAt: u.createdAt.toISOString(),
    specialPermissions: (grantsByUser[u.id] ?? []).map((sp) => ({
      id: sp.id,
      permission: sp.permission,
      note: sp.note,
      grantedAt: sp.grantedAt.toISOString(),
      grantedBy: sp.grantedBy?.name ?? sp.grantedBy?.email ?? null,
    })),
  }));

  // Fetch all available roles for the role-change selector
  const allRoles = canManageRoles
    ? await db.role.findMany({
        select: { id: true, code: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  // Pending invites (only for users who can invite)
  let pendingInvites: Array<{
    id: string;
    email: string;
    token: string;
    role: string;
    roleName: string;
    expiresAt: string;
    createdAt: string;
    sentBy: string;
  }> = [];

  if (canInvite) {
    try {
      const invites = await db.$queryRaw<
        Array<{
          id: string;
          email: string;
          token: string;
          roleId: string;
          expiresAt: Date;
          createdAt: Date;
          sentById: string;
        }>
      >`
        SELECT "id", "email", "token", "roleId", "expiresAt", "createdAt", "sentById"
        FROM "Invite"
        WHERE "acceptedAt" IS NULL AND "expiresAt" > NOW()
        ORDER BY "createdAt" DESC
      `;
      const roleIds  = [...new Set(invites.map((i) => i.roleId))];
      const senderIds = [...new Set(invites.map((i) => i.sentById))];
      const [roles, senders] = await Promise.all([
        roleIds.length > 0
          ? db.role.findMany({ where: { id: { in: roleIds } }, select: { id: true, code: true, name: true } })
          : [],
        senderIds.length > 0
          ? db.user.findMany({ where: { id: { in: senderIds } }, select: { id: true, name: true, email: true } })
          : [],
      ]);
      const roleMap   = Object.fromEntries(roles.map((r) => [r.id, r]));
      const senderMap = Object.fromEntries(senders.map((s) => [s.id, s]));
      pendingInvites = invites.map((i) => {
        const role   = roleMap[i.roleId];
        const sentBy = senderMap[i.sentById];
        return {
          id: i.id,
          email: i.email,
          token: i.token,
          role: role?.code ?? "MEMBER",
          roleName: role?.name ?? "Member",
          expiresAt: i.expiresAt.toISOString(),
          createdAt: i.createdAt.toISOString(),
          sentBy: sentBy?.name ?? sentBy?.email ?? "—",
        };
      });
    } catch {
      pendingInvites = [];
    }
  }

  return (
    <UsersView
      members={members}
      pendingInvites={pendingInvites}
      allRoles={allRoles}
      canInvite={canInvite}
      canManageRoles={canManageRoles}
      canMasquerade={canMasquerade}
      canPreviewEmail={isDevToolsAllowed() && hasPermission(session.user.role, PERMISSIONS.ACCESS_DEVTOOLS)}
      currentUserId={session.user.id}
    />
  );
}
