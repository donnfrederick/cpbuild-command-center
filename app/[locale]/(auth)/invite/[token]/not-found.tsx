import { TriangleAlertIcon } from "lucide-react";

export default function InviteNotFound() {
  return (
    <main id="main-content" className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
            <TriangleAlertIcon className="h-7 w-7 text-amber-600" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-neutral-900">
            This invite link is no longer valid
          </h1>
          <p className="text-sm text-neutral-500">
            The invite may have been cancelled or the link is incorrect. Ask
            your administrator to send you a new invite.
          </p>
        </div>
      </div>
    </main>
  );
}
