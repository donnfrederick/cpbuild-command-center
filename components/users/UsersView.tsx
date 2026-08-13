"use client";

import React from "react";
import { useState, useCallback, useMemo } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { resendInvite } from "@/lib/invites";
import { InviteModal } from "@/components/team/InviteModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, ShieldPlus, X, Loader2, Check, Copy, Trash2, KeyRound, Search } from "lucide-react";
import { NON_GRANTABLE_SPECIAL_PERMISSIONS, PERMISSIONS } from "@/lib/permissions";
import { permissionLabel } from "@/lib/permission-metadata";
import { MasqueradeButton } from "@/components/users/MasqueradeButton";
import { GenerateResetLinkModal } from "@/components/users/GenerateResetLinkModal";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SpecialPermission {
  id: string;
  permission: string;
  note: string | null;
  grantedAt: string;
  grantedBy: string | null;
}

type UserStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";

interface Member {
  id: string;
  name: string | null;
  email: string;
  role: string;
  roleId: string;
  roleName: string;
  status: UserStatus;
  createdAt: string;
  specialPermissions: SpecialPermission[];
}

interface Role {
  id: string;
  code: string;
  name: string;
}

interface PendingInvite {
  id: string;
  email: string;
  token: string;
  role: string;
  roleName: string;
  expiresAt: string;
  createdAt: string;
  sentBy: string;
}

interface Props {
  canPreviewEmail?: boolean;
  members: Member[];
  pendingInvites: PendingInvite[];
  allRoles: Role[];
  canInvite: boolean;
  canManageRoles: boolean;
  canMasquerade: boolean;
  currentUserId: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const NON_GRANTABLE = new Set<string>(NON_GRANTABLE_SPECIAL_PERMISSIONS);

const ALL_PERMISSIONS = Object.entries(PERMISSIONS)
  .filter(([, code]) => !NON_GRANTABLE.has(code))
  .map(([, code]) => ({
    code,
    label: permissionLabel(code),
  }));

function roleBadgeVariant(role: string): "default" | "secondary" | "outline" {
  if (role === "ADMIN") return "default";
  if (["TEAM_LEAD", "DESIGNER", "PROJECT_MANAGER", "INSTALL_MANAGER", "INSTALL_DIRECTOR"].includes(role))
    return "secondary";
  return "outline";
}

const STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  SUSPENDED: "Suspended",
};

function memberMatchesSearch(member: Member, query: string, unnamedLabel: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const haystack = [
    member.name,
    member.name ? null : unnamedLabel,
    member.email,
    member.roleName,
    member.role,
    member.status,
    STATUS_LABELS[member.status],
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(q);
}

const STATUS_STYLES: Record<UserStatus, React.CSSProperties> = {
  ACTIVE: {
    backgroundColor: "rgba(22,163,74,0.10)",
    color: "var(--green-600)",
  },
  INACTIVE: {
    backgroundColor: "var(--color-surface-sunken)",
    color: "var(--color-text-secondary)",
  },
  SUSPENDED: {
    backgroundColor: "rgba(220,38,38,0.08)",
    color: "var(--color-error)",
  },
};

function StatusBadge({ status }: { status: UserStatus }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: 10,
        fontWeight: 700,
        padding: "2px 7px",
        borderRadius: 99,
        ...STATUS_STYLES[status],
      }}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

// ── Special Permissions Panel ─────────────────────────────────────────────────

function SpecialPermissionsPanel({
  member,
  onGranted,
  onRevoked,
}: {
  member: Member;
  onGranted: (sp: SpecialPermission) => void;
  onRevoked: (id: string) => void;
}) {
  const [granting, setGranting] = useState(false);
  const [selectedPerm, setSelectedPerm] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const grantedCodes = new Set(member.specialPermissions.map((sp) => sp.permission));
  const available = ALL_PERMISSIONS.filter((p) => !grantedCodes.has(p.code));

  async function handleGrant() {
    if (!selectedPerm) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${member.id}/special-permissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permission: selectedPerm, note: note.trim() || undefined }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? "Failed to grant permission");
      }
      const { data } = await res.json() as { data: SpecialPermission };
      onGranted(data);
      setSelectedPerm("");
      setNote("");
      setGranting(false);
      toast.success("Permission granted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to grant permission");
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke(sp: SpecialPermission) {
    setRevokingId(sp.id);
    try {
      const res = await fetch(`/api/users/${member.id}/special-permissions/${sp.id}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) throw new Error("Failed to revoke");
      onRevoked(sp.id);
      toast.success("Permission revoked");
    } catch {
      toast.error("Failed to revoke permission");
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div
      style={{
        marginTop: 12,
        padding: 14,
        backgroundColor: "var(--color-bg)",
        borderRadius: "var(--radius-md)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
          <span
          style={{ fontSize: "var(--text-micro)", fontWeight: "var(--font-weight-bold)" as React.CSSProperties["fontWeight"], color: "var(--color-text-disabled)", textTransform: "uppercase", letterSpacing: "var(--tracking-section)" }}
        >
          Special Permissions
        </span>
        {available.length > 0 && !granting && (
          <button
            onClick={() => setGranting(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 10px",
              borderRadius: "var(--radius-sm)",
              border: "none",
              backgroundColor: "var(--color-accent-subtle)",
              color: "var(--color-accent-hover)",
              fontSize: 11,
              fontWeight: "var(--font-weight-bold)" as React.CSSProperties["fontWeight"],
              cursor: "pointer",
            }}
          >
            <ShieldPlus size={12} />
            Grant permission
          </button>
        )}
      </div>

      {/* Existing grants */}
      {member.specialPermissions.length === 0 && !granting && (
        <p style={{ fontSize: 12, color: "var(--neutral-400)", margin: 0 }}>
          No special permissions — role defaults apply.
        </p>
      )}
      {member.specialPermissions.map((sp) => {
        const label = ALL_PERMISSIONS.find((p) => p.code === sp.permission)?.label ?? sp.permission;
        const isRevoking = revokingId === sp.id;
        return (
          <div
            key={sp.id}
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 8,
              padding: "8px 0",
              borderBottom: "1px solid var(--neutral-200)",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--neutral-900)",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Check size={12} color="var(--success-600)" />
                {label}
              </span>
              {sp.note && (
                <p style={{ margin: "2px 0 0 18px", fontSize: 11, color: "var(--neutral-500)" }}>
                  {sp.note}
                </p>
              )}
              <p style={{ margin: "2px 0 0 18px", fontSize: 10, color: "var(--neutral-400)" }}>
                Granted {new Date(sp.grantedAt).toLocaleDateString()}
                {sp.grantedBy ? ` by ${sp.grantedBy}` : ""}
              </p>
            </div>
            <button
              onClick={() => handleRevoke(sp)}
              disabled={isRevoking}
              aria-label={`Revoke ${label}`}
              style={{
                flexShrink: 0,
                padding: "3px 8px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--error-300)",
                backgroundColor: "transparent",
                color: "var(--error-600)",
                fontSize: 11,
                cursor: isRevoking ? "default" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              {isRevoking ? <Loader2 size={10} style={{ animation: "spin 1s linear infinite" }} /> : <X size={10} />}
              Revoke
            </button>
          </div>
        );
      })}

      {/* Grant form */}
      {granting && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          <select
            value={selectedPerm}
            onChange={(e) => setSelectedPerm(e.target.value)}
            style={{
              padding: "6px 8px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--neutral-300)",
              fontSize: 12,
              backgroundColor: "var(--neutral-0)",
              color: "var(--neutral-900)",
            }}
          >
            <option value="">— Select a permission —</option>
            {available.map((p) => (
              <option key={p.code} value={p.code}>
                {p.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Reason / note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            style={{
              padding: "6px 8px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--neutral-300)",
              fontSize: 12,
              backgroundColor: "var(--neutral-0)",
              color: "var(--neutral-900)",
            }}
          />
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button
              onClick={() => { setGranting(false); setSelectedPerm(""); setNote(""); }}
              style={{ padding: "4px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--neutral-300)", backgroundColor: "var(--neutral-0)", fontSize: 12, cursor: "pointer" }}
            >
              Cancel
            </button>
            <button
              onClick={handleGrant}
              disabled={!selectedPerm || saving}
              style={{
                padding: "4px 12px",
                borderRadius: "var(--radius-sm)",
                border: "none",
                backgroundColor: selectedPerm && !saving ? "var(--color-accent)" : "var(--color-surface-sunken)",
                color: selectedPerm && !saving ? "var(--color-text-inverse)" : "var(--color-text-disabled)",
                fontSize: 12,
                fontWeight: 700,
                cursor: selectedPerm && !saving ? "pointer" : "default",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              {saving ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} /> : <ShieldPlus size={11} />}
              Grant
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Member Row ────────────────────────────────────────────────────────────────

function MemberRow({
  member,
  allRoles,
  canManageRoles,
  canMasquerade,
  currentUserId,
  onRoleChanged,
  onStatusChanged,
  onPermissionGranted,
  onPermissionRevoked,
  onOpenResetLink,
}: {
  member: Member;
  allRoles: Role[];
  canManageRoles: boolean;
  canMasquerade: boolean;
  currentUserId: string;
  onRoleChanged: (userId: string, newRole: string, newRoleName: string, newRoleId: string) => void;
  onStatusChanged: (userId: string, newStatus: UserStatus) => void;
  onPermissionGranted: (userId: string, sp: SpecialPermission) => void;
  onPermissionRevoked: (userId: string, spId: string) => void;
  onOpenResetLink: () => void;
}) {
  const t = useTranslations("users");
  const [expanded, setExpanded] = useState(false);
  const [changingRole, setChangingRole] = useState(false);
  const [savingRole, setSavingRole] = useState(false);
  const [pendingRoleId, setPendingRoleId] = useState(member.roleId);
  const [changingStatus, setChangingStatus] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<UserStatus>(member.status);

  const isCurrentUser = member.id === currentUserId;
  const canExpand = canManageRoles && !isCurrentUser;

  async function handleRoleChange() {
    if (pendingRoleId === member.roleId) { setChangingRole(false); return; }
    setSavingRole(true);
    try {
      const res = await fetch(`/api/team/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId: pendingRoleId }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? "Failed to update role");
      }
      const { data } = await res.json() as { data: { role: string; roleName: string } };
      onRoleChanged(member.id, data.role, data.roleName, pendingRoleId);
      setChangingRole(false);
      toast.success("Role updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setSavingRole(false);
    }
  }

  async function handleStatusChange() {
    if (pendingStatus === member.status) { setChangingStatus(false); return; }
    setSavingStatus(true);
    try {
      const res = await fetch(`/api/team/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: pendingStatus }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? "Failed to update status");
      }
      onStatusChanged(member.id, pendingStatus);
      setChangingStatus(false);
      toast.success(`Account set to ${STATUS_LABELS[pendingStatus]}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setSavingStatus(false);
    }
  }

  return (
    <li
      style={{
        borderBottom: "1px solid var(--neutral-100)",
        backgroundColor: expanded ? "var(--color-accent-subtle)" : "var(--color-surface)",
        transition: "background-color 0.15s",
      }}
    >
      {/* Row header */}
      <div
        className="users-row-header"
        style={{
          padding: "var(--space-4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-3)",
          cursor: canExpand ? "pointer" : "default",
        }}
        onClick={() => canExpand && setExpanded((e) => !e)}
      >
        {/* Col 1: Name (+ email sub-label on mobile) */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
            <span style={{ fontWeight: "var(--font-weight-bold)" as React.CSSProperties["fontWeight"], color: "var(--color-text-primary)" }}>
              {member.name ?? t("unnamedMember")}
            </span>
            {isCurrentUser && (
              <span style={{ fontSize: 11, color: "var(--neutral-400)", fontStyle: "italic" }}>
                {t("youLabel")}
              </span>
            )}
            {member.specialPermissions.length > 0 && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "1px 6px",
                  borderRadius: 99,
                  backgroundColor: "var(--primary-100)",
                  color: "var(--primary-700)",
                }}
              >
                +{member.specialPermissions.length} special
              </span>
            )}
          </div>
          {/* Email sub-label — hidden on desktop where it becomes its own column */}
          <div className="users-email-sublabel" style={{ fontSize: "var(--text-caption)", fontWeight: 500, color: "var(--color-text-tertiary)", marginTop: 2 }}>
            {member.email}
          </div>
        </div>

        {/* Col 2: Email — desktop column only, hidden on mobile */}
        <div className="users-cell-email" style={{ display: "none", flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: "var(--text-caption)", fontWeight: 500, color: "var(--color-text-tertiary)" }}>
            {member.email}
          </span>
        </div>

        {/* Col 3: Role, status, actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexShrink: 0 }}>
          <Badge variant={roleBadgeVariant(member.role)}>{member.roleName}</Badge>
          {member.status !== "ACTIVE" && <StatusBadge status={member.status} />}
          {canMasquerade && !isCurrentUser && (
            <span onClick={(e) => e.stopPropagation()}>
              <MasqueradeButton
                userId={member.id}
                userName={member.name}
                userEmail={member.email}
              />
            </span>
          )}
          {canExpand && (
            <span style={{ color: "var(--neutral-400)" }}>
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </span>
          )}
        </div>
      </div>

      {/* Expanded panel */}
      {expanded && canExpand && (
        <div
          style={{
            padding: "0 var(--space-4) var(--space-4)",
            borderTop: "1px solid var(--color-divider)",
          }}
        >
          {/* Role change */}
          <div style={{ marginTop: 12 }}>
            <p style={{ margin: "0 0 6px", fontSize: "var(--text-micro)", fontWeight: "var(--font-weight-bold)" as React.CSSProperties["fontWeight"], color: "var(--color-text-disabled)", textTransform: "uppercase", letterSpacing: "var(--tracking-section)" }}>
              Role
            </p>
            {changingRole ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <select
                  value={pendingRoleId}
                  onChange={(e) => setPendingRoleId(e.target.value)}
                  style={{
                    flex: 1,
                    minWidth: 160,
                    padding: "6px 8px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--neutral-300)",
                    fontSize: 13,
                    backgroundColor: "var(--neutral-0)",
                    color: "var(--neutral-900)",
                  }}
                >
                  {allRoles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
                <button
                  onClick={handleRoleChange}
                  disabled={savingRole}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "var(--radius-sm)",
                    border: "none",
                    backgroundColor: savingRole ? "var(--color-surface-sunken)" : "var(--color-accent)",
                    color: savingRole ? "var(--color-text-disabled)" : "var(--color-text-inverse)",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: savingRole ? "default" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {savingRole ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : null}
                  Save
                </button>
                <button
                  onClick={() => { setChangingRole(false); setPendingRoleId(member.roleId); }}
                  style={{ padding: "6px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--neutral-300)", backgroundColor: "var(--neutral-0)", fontSize: 12, cursor: "pointer" }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13, color: "var(--neutral-700)" }}>{member.roleName}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); setChangingRole(true); }}
                  style={{
                    padding: "3px 10px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--neutral-300)",
                    backgroundColor: "var(--neutral-0)",
                    color: "var(--neutral-700)",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  Change role
                </button>
              </div>
            )}
          </div>

          {/* Status change */}
          <div style={{ marginTop: 12 }}>
            <p style={{ margin: "0 0 6px", fontSize: "var(--text-micro)", fontWeight: "var(--font-weight-bold)" as React.CSSProperties["fontWeight"], color: "var(--color-text-disabled)", textTransform: "uppercase", letterSpacing: "var(--tracking-section)" }}>
              Account Status
            </p>
            {changingStatus ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <select
                  value={pendingStatus}
                  onChange={(e) => setPendingStatus(e.target.value as UserStatus)}
                  style={{
                    flex: 1,
                    minWidth: 160,
                    padding: "6px 8px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--neutral-300)",
                    fontSize: 13,
                    backgroundColor: "var(--neutral-0)",
                    color: "var(--neutral-900)",
                  }}
                >
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                  <option value="SUSPENDED">Suspended</option>
                </select>
                <button
                  onClick={handleStatusChange}
                  disabled={savingStatus}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "var(--radius-sm)",
                    border: "none",
                    backgroundColor: savingStatus ? "var(--color-surface-sunken)" : "var(--color-accent)",
                    color: savingStatus ? "var(--color-text-disabled)" : "var(--color-text-inverse)",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: savingStatus ? "default" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {savingStatus ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : null}
                  Save
                </button>
                <button
                  onClick={() => { setChangingStatus(false); setPendingStatus(member.status); }}
                  style={{ padding: "6px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--neutral-300)", backgroundColor: "var(--neutral-0)", fontSize: 12, cursor: "pointer" }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <StatusBadge status={member.status} />
                <button
                  onClick={(e) => { e.stopPropagation(); setChangingStatus(true); }}
                  style={{
                    padding: "3px 10px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--neutral-300)",
                    backgroundColor: "var(--neutral-0)",
                    color: "var(--neutral-700)",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  Change status
                </button>
              </div>
            )}
          </div>

          {/* Special permissions */}
          <SpecialPermissionsPanel
            member={member}
            onGranted={(sp) => onPermissionGranted(member.id, sp)}
            onRevoked={(spId) => onPermissionRevoked(member.id, spId)}
          />

          {/* Password reset — never shown for the current user's own row */}
          {!isCurrentUser && <div style={{ marginTop: 12 }}>
            <p
              style={{
                margin: "0 0 6px",
                fontSize: "var(--text-micro)",
                fontWeight: "var(--font-weight-bold)" as React.CSSProperties["fontWeight"],
                color: "var(--color-text-disabled)",
                textTransform: "uppercase",
                letterSpacing: "var(--tracking-section)",
              }}
            >
              {t("resetLink.sectionLabel")}
            </p>
            <button
              onClick={(e) => { e.stopPropagation(); onOpenResetLink(); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "3px 10px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--neutral-300)",
                backgroundColor: "var(--neutral-0)",
                color: "var(--neutral-700)",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              <KeyRound size={11} />
              {t("resetLink.button")}
            </button>
          </div>}
        </div>
      )}
    </li>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function UsersView({
  members: initialMembers,
  pendingInvites,
  allRoles,
  canInvite,
  canManageRoles,
  canMasquerade,
  canPreviewEmail = false,
  currentUserId,
}: Props) {
  const t = useTranslations("users");
  const locale = useLocale();
  const router = useRouter();
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pendingInviteList, setPendingInviteList] = useState<PendingInvite[]>(pendingInvites);
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [resetLinkMember, setResetLinkMember] = useState<Member | null>(null);
  const [search, setSearch] = useState("");

  const filteredMembers = useMemo(() => {
    if (!search.trim()) return members;
    return members.filter((m) => memberMatchesSearch(m, search, t("unnamedMember")));
  }, [members, search, t]);

  const hasActiveSearch = search.trim().length > 0;

  const handleRoleChanged = useCallback(
    (userId: string, newRole: string, newRoleName: string, newRoleId: string) => {
      setMembers((prev) =>
        prev.map((m) =>
          m.id === userId ? { ...m, role: newRole, roleName: newRoleName, roleId: newRoleId } : m
        )
      );
    },
    []
  );

  const handleStatusChanged = useCallback(
    (userId: string, newStatus: UserStatus) => {
      setMembers((prev) =>
        prev.map((m) => (m.id === userId ? { ...m, status: newStatus } : m))
      );
    },
    []
  );

  const handlePermissionGranted = useCallback((userId: string, sp: SpecialPermission) => {
    setMembers((prev) =>
      prev.map((m) =>
        m.id === userId
          ? { ...m, specialPermissions: [...m.specialPermissions.filter((p) => p.id !== sp.id), sp] }
          : m
      )
    );
  }, []);

  const handlePermissionRevoked = useCallback((userId: string, spId: string) => {
    setMembers((prev) =>
      prev.map((m) =>
        m.id === userId
          ? { ...m, specialPermissions: m.specialPermissions.filter((p) => p.id !== spId) }
          : m
      )
    );
  }, []);

  async function handleResend(inviteId: string) {
    setResendingId(inviteId);
    try {
      await resendInvite(inviteId);
      toast.success(t("resendSuccess"));
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("resendFailed"));
    } finally {
      setResendingId(null);
    }
  }

  async function handleDelete(inviteId: string) {
    setDeletingId(inviteId);
    try {
      const res = await fetch(`/api/invites/${inviteId}`, { method: "DELETE" });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "Failed to delete invite");
      }
      setPendingInviteList((prev) => prev.filter((i) => i.id !== inviteId));
      toast.success("Invite cancelled");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete invite");
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  function handleCopyLink(invite: PendingInvite) {
    const link = `${window.location.origin}/${locale}/invite/${invite.token}`;
    void navigator.clipboard.writeText(link);
    setCopiedId(invite.id);
    toast.success("Invite link copied");
    setTimeout(() => setCopiedId(null), 2000);
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
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "var(--space-4)",
          flexWrap: "nowrap",
        }}
      >
        <div style={{ flex: "1 1 auto", minWidth: 0, maxWidth: 360 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "var(--tracking-tight)", color: "var(--color-text-primary)", margin: 0, lineHeight: 1.2 }}>
            {t("title")}
          </h1>
          {canManageRoles && (
            <p style={{ margin: "4px 0 0", maxWidth: 280, fontSize: 13, fontWeight: 500, color: "var(--color-text-tertiary)", lineHeight: 1.35 }}>
              Click any member to manage their role and special permissions.
            </p>
          )}
        </div>
        {canInvite && (
          <div style={{ marginLeft: "auto", flexShrink: 0, paddingTop: 2 }}>
            <InviteModal canPreviewEmail={canPreviewEmail} />
          </div>
        )}
      </div>

      {/* Team members */}
      <section
        data-tour="team-directory"
        className="app-card"
        style={{ overflow: "hidden", padding: 0 }}
      >
        <div
          style={{
            padding: "var(--space-4)",
            borderBottom: "1px solid var(--neutral-200)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <h2 style={{ fontSize: "var(--text-subheading)", fontWeight: "var(--font-weight-bold)" as React.CSSProperties["fontWeight"], letterSpacing: "var(--tracking-ui)", color: "var(--color-text-primary)", margin: 0 }}>
            {hasActiveSearch
              ? t("membersFilteredCount", { filtered: filteredMembers.length, total: members.length })
              : t("membersCount", { count: members.length })}
          </h2>
          {members.length > 0 && (
            <div style={{ position: "relative", maxWidth: 400 }}>
              <Search
                size={15}
                aria-hidden
                style={{
                  position: "absolute",
                  left: 11,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--neutral-400)",
                  pointerEvents: "none",
                }}
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("searchPlaceholder")}
                aria-label={t("searchPlaceholder")}
                style={{
                  width: "100%",
                  paddingLeft: 34,
                  paddingRight: 12,
                  paddingTop: 8,
                  paddingBottom: 8,
                  borderRadius: 8,
                  border: "1px solid var(--neutral-250, var(--neutral-300))",
                  backgroundColor: "var(--neutral-50)",
                  fontSize: 13,
                  color: "var(--neutral-800, var(--neutral-900))",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
            </div>
          )}
        </div>
        {/* Desktop column headers — hidden on mobile */}
        {filteredMembers.length > 0 && (
          <div
            className="users-table-header"
            style={{ display: "none" }}
            aria-hidden
          >
            <div>{t("colName")}</div>
            <div>{t("colEmail")}</div>
            <div>{t("colRoleStatus")}</div>
          </div>
        )}

        {filteredMembers.length === 0 ? (
          <div style={{ padding: "var(--space-6)", color: "var(--neutral-500)", fontSize: "var(--text-body)" }}>
            {hasActiveSearch ? t("searchNoResults") : t("noMembers")}
          </div>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {filteredMembers.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                allRoles={allRoles}
                canManageRoles={canManageRoles}
                canMasquerade={canMasquerade}
                currentUserId={currentUserId}
                onRoleChanged={handleRoleChanged}
                onStatusChanged={handleStatusChanged}
                onPermissionGranted={handlePermissionGranted}
                onPermissionRevoked={handlePermissionRevoked}
                onOpenResetLink={() => setResetLinkMember(m)}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Pending invites */}
      {canInvite && (
        <section
          className="app-card"
          style={{ overflow: "hidden", padding: 0 }}
        >
          <div style={{ padding: "var(--space-4)", borderBottom: "1px solid var(--neutral-200)" }}>
            <h2 style={{ fontSize: "var(--text-subheading)", fontWeight: "var(--font-weight-bold)" as React.CSSProperties["fontWeight"], letterSpacing: "var(--tracking-ui)", color: "var(--color-text-primary)", margin: 0 }}>
              {t("pendingInvites")} ({pendingInvites.length})
            </h2>
          </div>
          {pendingInviteList.length === 0 ? (
            <div style={{ padding: "var(--space-6)", color: "var(--neutral-500)", fontSize: "var(--text-body)" }}>
              {t("noPendingInvites")}
            </div>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {pendingInviteList.map((i) => (
                <li
                  key={i.id}
                  style={{
                    padding: "var(--space-4)",
                    borderBottom: "1px solid var(--neutral-100)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-2)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-2)" }}>
                    <div>
                      <span style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>{i.email}</span>
                      <div style={{ fontSize: "var(--text-caption)", fontWeight: 500, color: "var(--color-text-tertiary)", marginTop: 2 }}>
                        {t("invitedBy")} {i.sentBy} · {t("expires")} {new Date(i.expiresAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopyLink(i)}
                        aria-label="Copy invite link"
                      >
                        {copiedId === i.id ? (
                          <><Check className="mr-1.5 h-3.5 w-3.5" />Copied</>
                        ) : (
                          <><Copy className="mr-1.5 h-3.5 w-3.5" />Copy link</>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleResend(i.id)}
                        disabled={resendingId === i.id}
                        aria-label={t("resendInvite")}
                      >
                        {resendingId === i.id ? t("resending") : t("resend")}
                      </Button>
                      <Badge variant="outline">{i.roleName}</Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmDeleteId(i.id)}
                        aria-label="Cancel invite"
                        style={{ color: "var(--error-600)" }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Inline delete confirmation */}
                  {confirmDeleteId === i.id && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "var(--space-3)",
                        padding: "var(--space-3)",
                        borderRadius: "var(--radius-sm)",
                        backgroundColor: "var(--error-50)",
                        border: "1px solid var(--error-200)",
                      }}
                    >
                      <span style={{ fontSize: "var(--text-caption)", color: "var(--error-700)", fontWeight: 500 }}>
                        Cancel this invite? The link will stop working immediately.
                      </span>
                      <div style={{ display: "flex", gap: "var(--space-2)", flexShrink: 0 }}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmDeleteId(null)}
                          disabled={deletingId === i.id}
                        >
                          Keep it
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => void handleDelete(i.id)}
                          disabled={deletingId === i.id}
                          style={{ backgroundColor: "var(--color-error)", color: "var(--color-text-inverse)" }}
                        >
                          {deletingId === i.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            "Yes, cancel"
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }

        @media (min-width: 768px) {
          .users-table-header {
            display: grid !important;
            grid-template-columns: 1fr 1.4fr auto;
            align-items: center;
            gap: 16px;
            padding: 8px 16px;
            border-bottom: 1px solid var(--neutral-200);
            font-size: 11px;
            font-weight: 700;
            color: var(--color-text-disabled);
            text-transform: uppercase;
            letter-spacing: 0.06em;
          }
          .users-row-header {
            display: grid !important;
            grid-template-columns: 1fr 1.4fr auto;
            align-items: center;
            gap: 16px;
            justify-content: unset;
          }
          .users-email-sublabel {
            display: none !important;
          }
          .users-cell-email {
            display: flex !important;
            align-items: center;
          }
        }
      `}</style>

      {resetLinkMember && (
        <GenerateResetLinkModal
          userId={resetLinkMember.id}
          userName={resetLinkMember.name}
          onClose={() => setResetLinkMember(null)}
        />
      )}
    </div>
  );
}
