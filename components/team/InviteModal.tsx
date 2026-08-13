"use client";

import { useState, useEffect, useRef, type CSSProperties } from "react";
import { useRouter } from "@/i18n/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Check, Copy, Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createInviteSchema } from "@/lib/validations/invite";
import type { CreateInviteInput } from "@/lib/validations/invite";

interface Role {
  id: string;
  code: string;
  name: string;
  description: string | null;
}

interface InviteModalProps {
  canPreviewEmail?: boolean;
}

const CREATE_BUTTON_STYLE = {
  height: 40,
  padding: "0 16px",
  borderRadius: "var(--radius-md)",
  border: "none",
  backgroundColor: "var(--color-accent)",
  color: "var(--color-text-inverse)",
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: "var(--tracking-ui)",
} satisfies CSSProperties;

export function InviteModal({ canPreviewEmail = false }: InviteModalProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [roles, setRoles] = useState<Role[]>([]);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState<boolean>(false);
  const [copied, setCopied] = useState(false);

  // Email preview state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSubject, setPreviewSubject] = useState<string>("");
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [rolesError, setRolesError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      queueMicrotask(() => {
        setRolesError(null);
        setRolesLoading(true);
      });
      fetch("/api/roles")
        .then((res) => {
          if (!res.ok) {
            if (res.status === 401) throw new Error("Please sign in to invite.");
            if (res.status === 403) throw new Error("You don't have permission to invite.");
            throw new Error("Failed to load roles");
          }
          return res.json();
        })
        .then((json) => {
          if (Array.isArray(json?.data)) setRoles(json.data);
          else setRoles([]);
        })
        .catch((err) => setRolesError(err instanceof Error ? err.message : "Failed to load roles"))
        .finally(() => setRolesLoading(false));
    }
  }, [open]);

  const defaultRoleId = roles.find((r) => r.code === "MEMBER")?.id ?? roles[0]?.id ?? "";

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<CreateInviteInput>({
    resolver: zodResolver(createInviteSchema),
    defaultValues: { roleId: "" },
  });

  useEffect(() => {
    if (defaultRoleId) setValue("roleId", defaultRoleId);
  }, [defaultRoleId, setValue]);

  // Push updated HTML into the sandboxed iframe whenever it changes
  useEffect(() => {
    if (iframeRef.current && previewHtml) {
      iframeRef.current.srcdoc = previewHtml;
    }
  }, [previewHtml]);

  async function onSubmit(data: CreateInviteInput) {
    const res = await fetch("/api/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const json = (await res.json()) as { error?: string; detail?: string };
      toast.error(json.detail ?? json.error ?? "Failed to create invite");
      return;
    }

    const json = (await res.json()) as { data: { email: string; inviteLink: string; emailSent: boolean } };
    setInviteEmail(json.data.email);
    setInviteLink(json.data.inviteLink);
    setEmailSent(json.data.emailSent);
    reset({ roleId: defaultRoleId });
    router.refresh();
  }

  function handleCopy() {
    if (!inviteLink) return;
    void navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    toast.success("Link copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  async function handlePreview() {
    const values = getValues();
    const roleId = values.roleId;
    const roleName = roles.find((r) => r.id === roleId)?.name;
    const params = new URLSearchParams({ type: "invite" });
    if (values.email) params.set("to", values.email);
    if (values.inviteeName) params.set("inviteeName", values.inviteeName);
    if (roleName) params.set("roleName", roleName);
    params.set("inviterName", "You");

    setPreviewLoading(true);
    setPreviewOpen(true);
    try {
      const res = await fetch(`/api/devtools/email-preview?${params.toString()}`);
      if (!res.ok) {
        if (res.status === 403 || res.status === 401) {
          toast.error("You don't have permission to preview emails.");
        } else {
          toast.error("Email preview is not available in this environment.");
        }
        setPreviewOpen(false);
        return;
      }
      const json = await res.json() as { data: { subject: string; html: string } };
      setPreviewSubject(json.data.subject);
      setPreviewHtml(json.data.html);
    } catch {
      toast.error("Failed to load email preview.");
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  }

  function handleClose() {
    setOpen(false);
    setInviteLink(null);
    setInviteEmail(null);
    setEmailSent(false);
    setCopied(false);
  }

  // Defer Dialog until after hydration to avoid Radix aria-controls ID mismatch
  if (!mounted) {
    return (
      <Button type="button" aria-label="Invite user" style={CREATE_BUTTON_STYLE}>
        + New User
      </Button>
    );
  }

  return (
    <>
    <Dialog open={open} onOpenChange={(isOpen) => { if (isOpen) setOpen(true); else handleClose(); }}>
      <DialogTrigger asChild>
        <Button data-tour="invite-button" aria-label="Invite user" style={CREATE_BUTTON_STYLE}>
          + New User
        </Button>
      </DialogTrigger>
      <DialogContent className="overflow-hidden">
        {inviteLink ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {emailSent ? "Invite sent!" : "Invite link created"}
              </DialogTitle>
              <DialogDescription>
                {emailSent ? (
                  <>
                    We emailed an invite to{" "}
                    <span className="font-medium text-foreground break-all">{inviteEmail}</span>.
                    {" "}Copy the link below as a backup in case they don&apos;t receive it.
                  </>
                ) : (
                  <>
                    The invite was created but the email couldn&apos;t be sent.
                    Share this link directly with{" "}
                    <span className="font-medium text-foreground break-all">{inviteEmail}</span>.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              {!emailSent && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Email delivery is not configured in this environment.
                </div>
              )}

              {/* URL box: break-all prevents the URL from forcing the modal wider */}
              <div className="rounded-md border bg-muted/50 p-3">
                <p className="mb-2 break-all font-mono text-sm text-muted-foreground">
                  {inviteLink}
                </p>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleCopy}
                  >
                    {copied ? (
                      <><Check className="mr-1.5 h-3.5 w-3.5" />Copied</>
                    ) : (
                      <><Copy className="mr-1.5 h-3.5 w-3.5" />Copy</>
                    )}
                  </Button>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Link expires in 7 days. Share via email, Slack, or text.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={handleClose}>
                Done
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setInviteLink(null);
                  setInviteEmail(null);
                  setEmailSent(false);
                  setCopied(false);
                }}
              >
                Invite another
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Invite a team member</DialogTitle>
              <DialogDescription>
                Enter their work email and choose a role. You&apos;ll get a link to share with them directly.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="invite-name">
                  Name <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  id="invite-name"
                  type="text"
                  placeholder="e.g. Donn"
                  autoComplete="off"
                  aria-describedby={errors.inviteeName ? "invite-name-error" : "invite-name-hint"}
                  aria-invalid={!!errors.inviteeName}
                  {...register("inviteeName")}
                />
                {errors.inviteeName ? (
                  <p id="invite-name-error" className="text-sm text-destructive" role="alert">
                    {errors.inviteeName.message}
                  </p>
                ) : (
                  <p id="invite-name-hint" className="text-xs text-muted-foreground">
                    Appears in the invite email greeting. They&apos;ll set their full name when they sign up.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="invite-email">Work email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="teammate@company.com"
                  aria-describedby={errors.email ? "invite-email-error" : undefined}
                  aria-invalid={!!errors.email}
                  {...register("email")}
                />
                {errors.email && (
                  <p id="invite-email-error" className="text-sm text-destructive" role="alert">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="invite-role">Role</Label>
                <select
                  id="invite-role"
                  aria-describedby={errors.roleId || rolesError ? "invite-role-error" : undefined}
                  aria-invalid={!!errors.roleId || !!rolesError}
                  disabled={rolesLoading}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
                  {...register("roleId")}
                >
                  <option value="">
                    {rolesLoading ? "Loading roles…" : "Select role…"}
                  </option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                {(errors.roleId || rolesError) && (
                  <p id="invite-role-error" className="text-sm text-destructive" role="alert">
                    {errors.roleId?.message ?? rolesError}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between gap-2">
                {canPreviewEmail ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => void handlePreview()}
                  >
                    <Eye className="mr-1.5 h-3.5 w-3.5" />
                    Preview email
                  </Button>
                ) : <span />}
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={handleClose}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Creating…" : "Create invite link"}
                  </Button>
                </div>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>

    {/* Email preview modal — rendered outside the invite Dialog to avoid nesting issues */}
    <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
      <DialogContent className="max-w-2xl overflow-hidden p-0" showCloseButton={false}>
        <VisuallyHidden.Root>
          <DialogTitle>Email preview</DialogTitle>
        </VisuallyHidden.Root>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Email preview
            </p>
            {previewSubject && (
              <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
                {previewSubject}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 pl-4 flex-shrink-0">
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              Preview only — no email sent
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setPreviewOpen(false)}
              aria-label="Close preview"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="relative" style={{ height: 480 }}>
          {previewLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Loading preview…
            </div>
          ) : (
            <iframe
              ref={iframeRef}
              title="Email preview"
              sandbox="allow-same-origin"
              className="h-full w-full border-0 bg-white"
              style={{ display: "block" }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
