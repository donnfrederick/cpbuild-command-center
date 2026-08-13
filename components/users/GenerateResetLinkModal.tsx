"use client";

import { useState, useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Copy, Check, Loader2, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface Props {
  userId: string;
  userName: string | null;
  onClose: () => void;
}

interface GenerateResponse {
  token: string;
  name: string | null;
  email: string;
}

export function GenerateResetLinkModal({ userId, userName, onClose }: Props) {
  const locale = useLocale();
  const t = useTranslations("users.resetLink");
  const [loading, setLoading] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  // Computed lazily to avoid accessing window during SSR
  const [origin, setOrigin] = useState<string>("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const resetLink = resetToken && origin
    ? `${origin}/${locale}/reset-password/${resetToken}`
    : null;

  const messageText = resetLink
    ? t("messageTemplate", { name: userName ?? t("nameFallback"), link: resetLink })
    : "";

  async function handleGenerate() {
    setLoading(true);
    try {
      const res = await fetch(`/api/users/${userId}/generate-reset-link`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? t("generateError"));
      }
      const data = await res.json() as GenerateResponse;
      setResetToken(data.token);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("generateError"));
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!messageText) return;
    try {
      await navigator.clipboard.writeText(messageText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("copyFailed"));
    }
  }

  async function handleCopyLink() {
    if (!resetLink) return;
    try {
      await navigator.clipboard.writeText(resetLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      toast.error(t("copyFailed"));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{t("modalTitle")}</DialogTitle>
          <DialogDescription>
            {t("modalDescription", { name: userName ?? t("descriptionFallback") })}
          </DialogDescription>
        </DialogHeader>

        {!resetToken ? (
          <button
            onClick={handleGenerate}
            disabled={loading}
            style={{
              width: "100%",
              padding: "10px 16px",
              borderRadius: "var(--radius-sm)",
              border: "none",
              backgroundColor: "var(--primary-600)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? "default" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            {loading ? (
              <>
                <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                {t("generating")}
              </>
            ) : (
              <>
                <LinkIcon size={14} />
                {t("button")}
              </>
            )}
          </button>
        ) : (
          <div>
            <div style={{ marginBottom: 12 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--neutral-700)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {t("messageLabel")}
                </span>
                <button
                  onClick={handleCopy}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "4px 10px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--neutral-300)",
                    backgroundColor: copied ? "var(--success-50)" : "var(--neutral-0)",
                    color: copied ? "var(--success-700)" : "var(--neutral-700)",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {copied ? <Check size={11} /> : <Copy size={11} />}
                  {copied ? t("copied") : t("copyMessage")}
                </button>
              </div>
              <textarea
                readOnly
                value={messageText}
                rows={7}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--neutral-200)",
                  backgroundColor: "var(--neutral-50)",
                  fontSize: 12,
                  lineHeight: 1.6,
                  color: "var(--neutral-800)",
                  fontFamily: "inherit",
                  resize: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <button
                onClick={handleCopyLink}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 10px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--neutral-300)",
                  backgroundColor: copiedLink ? "var(--success-50)" : "var(--neutral-0)",
                  color: copiedLink ? "var(--success-700)" : "var(--neutral-700)",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {copiedLink ? <Check size={11} /> : <Copy size={11} />}
                {copiedLink ? t("copied") : t("copyLinkOnly")}
              </button>
              <span style={{ fontSize: 11, color: "var(--neutral-400)" }}>
                {t("copyLinkHint")}
              </span>
            </div>
            <p style={{ margin: "0 0 4px", fontSize: 11, color: "var(--neutral-500)" }}>
              {t("singleUseNote")}
            </p>
          </div>
        )}

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}
