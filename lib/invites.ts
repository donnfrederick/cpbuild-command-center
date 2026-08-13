/**
 * Client-side invites service — centralises API calls for invite operations.
 */

export async function resendInvite(id: string): Promise<{ id: string; email: string }> {
  const res = await fetch(`/api/invites/${id}/resend`, { method: "POST" });
  const json = await res.json();
  if (!res.ok) {
    const msg = json.detail ? `${json.error}: ${json.detail}` : (json.error ?? "Failed to send invite email");
    throw new Error(msg);
  }
  return json.data as { id: string; email: string };
}
