"use client";

import { useEffect, useState, useCallback } from "react";
import { Bot, Check, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

interface AgentIdentity {
  agentName: string | null;
  agentCallsign: string | null;
  agentMission: string | null;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function AgentIdentityForm() {
  const t = useTranslations("account");
  const [identity, setIdentity] = useState<AgentIdentity>({
    agentName: "",
    agentCallsign: "",
    agentMission: "",
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/users/me/agent-identity")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json() as Promise<AgentIdentity>;
      })
      .then((data) => {
        if (cancelled) return;
        setIdentity({
          agentName:     data.agentName     ?? "",
          agentCallsign: data.agentCallsign ?? "",
          agentMission:  data.agentMission  ?? "",
        });
      })
      .catch(() => { if (!cancelled) setLoadError(t("agentIdentityLoadError")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNameChange = useCallback((value: string) => {
    setIdentity((prev) => ({
      ...prev,
      agentName: value,
      agentCallsign:
        prev.agentCallsign === "" || prev.agentCallsign === (prev.agentName ?? "").slice(0, 3).toUpperCase()
          ? value.slice(0, 3).toUpperCase()
          : prev.agentCallsign,
    }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaveStatus("saving");
    try {
      const res = await fetch("/api/users/me/agent-identity", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentName:     identity.agentName     ?? "",
          agentCallsign: identity.agentCallsign ?? "",
          agentMission:  identity.agentMission  ?? "",
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      const updated = await res.json() as AgentIdentity;
      setIdentity({
        agentName:     updated.agentName     ?? "",
        agentCallsign: updated.agentCallsign ?? "",
        agentMission:  updated.agentMission  ?? "",
      });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
    }
  }, [identity]);

  const name = identity.agentName ?? "";
  const callsign = identity.agentCallsign ?? "";
  const previewTag =
    name && callsign ? `_[${callsign}/${String(t("email") ?? "User")} - 2026-03-17]_` : null;

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "var(--space-2) var(--space-3)",
    border: "1px solid var(--neutral-300)",
    borderRadius: "var(--radius-sm)",
    fontSize: "var(--text-body)",
    color: "var(--neutral-900)",
    backgroundColor: "var(--neutral-0)",
    outline: "none",
  };

  const hintStyle: React.CSSProperties = {
    fontSize: "var(--text-caption)",
    color: "var(--neutral-500)",
    marginTop: "var(--space-1)",
  };

  return (
    <section
      style={{
        backgroundColor: "var(--neutral-0)",
        border: "1px solid var(--neutral-300)",
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
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
            width: 40,
            height: 40,
            borderRadius: "var(--radius-sm)",
            backgroundColor: "var(--primary-100)",
            color: "var(--primary-700)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Bot style={{ width: 20, height: 20 }} aria-hidden />
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
            {t("agentIdentityTitle")}
          </h2>
          <p style={hintStyle}>{t("agentIdentityDescription")}</p>
        </div>
      </div>

      {/* Body */}
      <div
        style={{
          padding: "var(--space-4)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-4)",
        }}
      >
        {loadError && (
          <p style={{ ...hintStyle, color: "var(--error-600)" }}>{loadError}</p>
        )}

        {loading ? (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", color: "var(--neutral-500)" }}>
            <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" aria-hidden />
            <span style={{ fontSize: "var(--text-caption)" }}>Loading...</span>
          </div>
        ) : (
          <>
            {/* Agent Name + Callsign row */}
            <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 200px" }}>
                <label
                  htmlFor="agent-name"
                  style={{ display: "block", fontSize: "var(--text-caption)", fontWeight: 500, marginBottom: "var(--space-1)", color: "var(--neutral-700)" }}
                >
                  {t("agentName")}
                </label>
                <input
                  id="agent-name"
                  type="text"
                  value={name}
                  maxLength={40}
                  placeholder={t("agentNamePlaceholder")}
                  onChange={(e) => handleNameChange(e.target.value)}
                  style={inputStyle}
                />
                <p style={hintStyle}>{t("agentNameHint")}</p>
              </div>

              <div style={{ flex: "0 0 120px" }}>
                <label
                  htmlFor="agent-callsign"
                  style={{ display: "block", fontSize: "var(--text-caption)", fontWeight: 500, marginBottom: "var(--space-1)", color: "var(--neutral-700)" }}
                >
                  {t("agentCallsign")}
                </label>
                <input
                  id="agent-callsign"
                  type="text"
                  value={callsign}
                  maxLength={3}
                  placeholder="MAX"
                  onChange={(e) =>
                    setIdentity((prev) => ({
                      ...prev,
                      agentCallsign: e.target.value.toUpperCase().slice(0, 3),
                    }))
                  }
                  style={{ ...inputStyle, textTransform: "uppercase", fontFamily: "monospace" }}
                />
                <p style={hintStyle}>{t("agentCallsignHint")}</p>
              </div>
            </div>

            {/* Mission */}
            <div>
              <label
                htmlFor="agent-mission"
                style={{ display: "block", fontSize: "var(--text-caption)", fontWeight: 500, marginBottom: "var(--space-1)", color: "var(--neutral-700)" }}
              >
                {t("agentMission")}
              </label>
              <textarea
                id="agent-mission"
                value={identity.agentMission ?? ""}
                maxLength={280}
                rows={2}
                placeholder={t("agentMissionPlaceholder")}
                onChange={(e) =>
                  setIdentity((prev) => ({ ...prev, agentMission: e.target.value }))
                }
                style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
              />
            </div>

            {/* Attribution preview */}
            {previewTag && (
              <p style={{ ...hintStyle, fontFamily: "monospace" }}>
                {t("agentAttributionPreviewLabel")} <code>{previewTag}</code>
              </p>
            )}

            {/* Save button */}
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
              <button
                type="button"
                disabled={saveStatus === "saving"}
                onClick={handleSave}
                style={{
                  padding: "var(--space-2) var(--space-4)",
                  backgroundColor: "var(--primary-600)",
                  color: "var(--neutral-0)",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "var(--text-body)",
                  fontWeight: 500,
                  cursor: saveStatus === "saving" ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                  opacity: saveStatus === "saving" ? 0.7 : 1,
                }}
              >
                {saveStatus === "saving" ? (
                  <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" aria-hidden />
                ) : saveStatus === "saved" ? (
                  <Check style={{ width: 14, height: 14 }} aria-hidden />
                ) : null}
                {saveStatus === "saved" ? t("agentSaved") : t("agentSave")}
              </button>
              {saveStatus === "error" && (
                <p style={{ ...hintStyle, color: "var(--error-600)", margin: 0 }}>
                  {t("agentSaveError")}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
