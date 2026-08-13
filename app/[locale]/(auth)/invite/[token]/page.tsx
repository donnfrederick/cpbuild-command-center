import { InviteAcceptForm } from "@/components/auth/InviteAcceptForm";
import { db } from "@/lib/db";
import { TriangleAlertIcon } from "lucide-react";
import { notFound } from "next/navigation";

export const metadata = { title: "Accept Invitation — CP Build" };

interface PageProps {
  params: Promise<{ locale: string; token: string }>;
}

type InviteState =
  | { valid: true; email: string; role: string }
  | { valid: false; reason: "expired" | "accepted" | "not_found" };

async function getInviteState(token: string): Promise<InviteState> {
  const invite = await db.invite.findUnique({
    where: { token },
    select: {
      email: true,
      role: { select: { code: true } },
      expiresAt: true,
      acceptedAt: true,
    },
  });

  if (!invite) return { valid: false, reason: "not_found" };
  if (invite.acceptedAt) return { valid: false, reason: "accepted" };
  if (invite.expiresAt < new Date()) return { valid: false, reason: "expired" };
  return { valid: true, email: invite.email, role: invite.role.code };
}

const REASON_COPY: Record<"expired" | "accepted" | "not_found", { heading: string; body: string }> = {
  not_found: {
    heading: "This invite link is no longer valid",
    body: "The invite may have been cancelled or the link is incorrect. Ask your administrator to send you a new invite.",
  },
  expired: {
    heading: "This invite link has expired",
    body: "Invite links are valid for 7 days. Ask your administrator to resend the invite so you can get a fresh link.",
  },
  accepted: {
    heading: "This invite has already been used",
    body: "This link was already used to create an account. If you have an account, go to the sign-in page. If you need help, contact your administrator.",
  },
};

export default async function InvitePage({ params }: PageProps) {
  const { token } = await params;
  const state = await getInviteState(token);

  if (!state.valid) {
    // Token doesn't exist in the DB → true 404 (resource not found).
    // expired/accepted → 200 with informational UI (resource exists, just unusable).
    if (state.reason === "not_found") notFound();

    const copy = REASON_COPY[state.reason];
    return (
      <main id="main-content" className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
              <TriangleAlertIcon className="h-7 w-7 text-amber-600" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold text-neutral-900">{copy.heading}</h1>
            <p className="text-sm text-neutral-500">{copy.body}</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main id="main-content" className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <h1 className="text-2xl font-bold text-center">CP Build Field Tracker</h1>
        <InviteAcceptForm token={token} email={state.email} />
      </div>
    </main>
  );
}
