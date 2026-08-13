import { Loader2 } from "lucide-react";

export default function FeedbackDetailLoading() {
  return (
    <div className="mx-auto flex w-full max-w-4xl justify-center py-16 p-4">
      <Loader2 className="h-8 w-8 animate-spin text-[var(--neutral-400)]" aria-hidden />
    </div>
  );
}
