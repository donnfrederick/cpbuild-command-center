"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export interface TeamMemberOption {
  id: string;
  name: string | null;
  email: string;
}

export interface SeedBatchSummary {
  id: string;
  createdAt: string;
  createdByName: string;
  counts: {
    issues: number;
    observations: number;
    clearInspections: number;
    calibrations: number;
    comments: number;
    activityLogs: number;
  };
  configSummary: {
    issues: number;
    observations: number;
    clearInspections: number;
    calibrations: number;
    dateRangeDays: number;
  };
}

interface SeedTestDataFormProps {
  projectId: string;
  onSuccess?: () => void;
}

export function SeedTestDataForm({ projectId, onSuccess }: SeedTestDataFormProps) {
  const t = useTranslations("testDataSeed");
  const tCommon = useTranslations("common");

  const [members, setMembers] = useState<TeamMemberOption[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [issueCount, setIssueCount] = useState(10);
  const [observationCount, setObservationCount] = useState(10);
  const [clearCount, setClearCount] = useState(5);
  const [calibrationCount, setCalibrationCount] = useState(3);
  const [dateRangeDays, setDateRangeDays] = useState(90);
  const [resolvedRatio, setResolvedRatio] = useState(30);
  const [commentRatio, setCommentRatio] = useState(30);
  const [mediaRatio, setMediaRatio] = useState(40);
  const [passedRatio, setPassedRatio] = useState(70);
  const [calibrationPassedRatio, setCalibrationPassedRatio] = useState(70);
  const [batches, setBatches] = useState<SeedBatchSummary[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  const loadBatches = useCallback(async () => {
    setLoadingBatches(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/test-seed-batches`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.batches)) {
        setBatches(data.batches);
      }
    } finally {
      setLoadingBatches(false);
    }
  }, [projectId]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/team");
        const data = await res.json().catch(() => ({}));
        if (res.ok && Array.isArray(data.data)) {
          const list = data.data as TeamMemberOption[];
          setMembers(list);
          if (list.length > 0) {
            setSelectedUserIds([list[0]!.id]);
          }
        }
      } finally {
        setLoadingMembers(false);
      }
    })();
    void loadBatches();
  }, [loadBatches]);

  const toggleUser = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleSubmit = async () => {
    if (selectedUserIds.length === 0) {
      toast.error(t("selectUsersError"));
      return;
    }
    if (issueCount + observationCount + clearCount + calibrationCount === 0) {
      toast.error(t("zeroCountsError"));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/seed-test-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issues: { count: issueCount, resolvedRatio: resolvedRatio / 100, commentRatio: commentRatio / 100 },
          observations: { count: observationCount, withMediaRatio: mediaRatio / 100 },
          clearInspections: { count: clearCount, passedRatio: passedRatio / 100 },
          calibrations: { count: calibrationCount, passedRatio: calibrationPassedRatio / 100 },
          dateRangeDays,
          userIds: selectedUserIds,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : t("seedFailed"));
      }
      toast.success(
        t("seedSuccess", {
          issues: data.counts?.issues ?? 0,
          observations: data.counts?.observations ?? 0,
          clearInspections: data.counts?.clearInspections ?? 0,
          calibrations: data.counts?.calibrations ?? 0,
        })
      );
      await loadBatches();
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("seedFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveBatch = async (batchId: string) => {
    setRemovingId(batchId);
    try {
      const res = await fetch(`/api/projects/${projectId}/test-seed-batches/${batchId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : t("removeFailed"));
      }
      toast.success(t("removeSuccess"));
      setConfirmRemoveId(null);
      await loadBatches();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("removeFailed"));
    } finally {
      setRemovingId(null);
    }
  };

  const inputStyle = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--neutral-300)",
    fontSize: "var(--text-body-sm)",
  } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ margin: 0, fontSize: "var(--text-caption)", color: "var(--neutral-600)" }}>
        {t("disclaimer")}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "var(--text-caption)" }}>
          {t("issueCount")}
          <input
            type="number"
            min={0}
            max={500}
            value={issueCount}
            onChange={(e) => setIssueCount(Number(e.target.value))}
            style={inputStyle}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "var(--text-caption)" }}>
          {t("observationCount")}
          <input
            type="number"
            min={0}
            max={500}
            value={observationCount}
            onChange={(e) => setObservationCount(Number(e.target.value))}
            style={inputStyle}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "var(--text-caption)" }}>
          {t("clearInspectionCount")}
          <input
            type="number"
            min={0}
            max={500}
            value={clearCount}
            onChange={(e) => setClearCount(Number(e.target.value))}
            style={inputStyle}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "var(--text-caption)" }}>
          {t("calibrationCount")}
          <input
            type="number"
            min={0}
            max={500}
            value={calibrationCount}
            onChange={(e) => setCalibrationCount(Number(e.target.value))}
            style={inputStyle}
          />
        </label>
      </div>

      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "var(--text-caption)" }}>
        {t("dateRangeDays")}
        <input
          type="number"
          min={1}
          max={365}
          value={dateRangeDays}
          onChange={(e) => setDateRangeDays(Number(e.target.value))}
          style={inputStyle}
        />
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label style={{ fontSize: "var(--text-caption)" }}>
          {t("resolvedRatio")} ({resolvedRatio}%)
          <input
            type="range"
            min={0}
            max={100}
            value={resolvedRatio}
            onChange={(e) => setResolvedRatio(Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </label>
        <label style={{ fontSize: "var(--text-caption)" }}>
          {t("commentRatio")} ({commentRatio}%)
          <input
            type="range"
            min={0}
            max={100}
            value={commentRatio}
            onChange={(e) => setCommentRatio(Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </label>
        <label style={{ fontSize: "var(--text-caption)" }}>
          {t("mediaRatio")} ({mediaRatio}%)
          <input
            type="range"
            min={0}
            max={100}
            value={mediaRatio}
            onChange={(e) => setMediaRatio(Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </label>
        <label style={{ fontSize: "var(--text-caption)" }}>
          {t("passedRatio")} ({passedRatio}%)
          <input
            type="range"
            min={0}
            max={100}
            value={passedRatio}
            onChange={(e) => setPassedRatio(Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </label>
        <label style={{ fontSize: "var(--text-caption)" }}>
          {t("calibrationPassedRatio")} ({calibrationPassedRatio}%)
          <input
            type="range"
            min={0}
            max={100}
            value={calibrationPassedRatio}
            onChange={(e) => setCalibrationPassedRatio(Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </label>
      </div>

      <fieldset style={{ border: "1px solid var(--neutral-200)", borderRadius: "var(--radius-sm)", padding: 10, margin: 0 }}>
        <legend style={{ fontSize: "var(--text-caption)", padding: "0 4px" }}>{t("userPool")}</legend>
        {loadingMembers ? (
          <span style={{ fontSize: "var(--text-caption)", color: "var(--neutral-500)" }}>{tCommon("loading")}</span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 140, overflowY: "auto" }}>
            {members.map((m) => (
              <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--text-caption)" }}>
                <input
                  type="checkbox"
                  checked={selectedUserIds.includes(m.id)}
                  onChange={() => toggleUser(m.id)}
                />
                {m.name ?? m.email}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <button
        type="button"
        disabled={submitting || loadingMembers}
        onClick={() => void handleSubmit()}
        style={{
          padding: "10px 14px",
          borderRadius: "var(--radius-sm)",
          border: "none",
          backgroundColor: "var(--primary-600)",
          color: "var(--neutral-0)",
          fontWeight: 600,
          cursor: submitting ? "wait" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        {submitting && <Loader2 size={16} className="animate-spin" />}
        {t("generate")}
      </button>

      <div>
        <h3 style={{ margin: "0 0 8px", fontSize: "var(--text-body-sm)", fontWeight: 600 }}>{t("batchHistory")}</h3>
        {loadingBatches ? (
          <span style={{ fontSize: "var(--text-caption)", color: "var(--neutral-500)" }}>{tCommon("loading")}</span>
        ) : batches.length === 0 ? (
          <span style={{ fontSize: "var(--text-caption)", color: "var(--neutral-500)" }}>{t("noBatches")}</span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {batches.map((b) => (
              <div
                key={b.id}
                style={{
                  border: "1px solid var(--neutral-200)",
                  borderRadius: "var(--radius-sm)",
                  padding: 10,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  alignItems: "flex-start",
                }}
              >
                <div style={{ fontSize: "var(--text-caption)", minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{new Date(b.createdAt).toLocaleString()}</div>
                  <div style={{ color: "var(--neutral-600)" }}>
                    {t("batchCounts", {
                      issues: b.counts.issues,
                      observations: b.counts.observations,
                      clearInspections: b.counts.clearInspections,
                      calibrations: b.counts.calibrations ?? 0,
                    })}
                  </div>
                  <div style={{ color: "var(--neutral-500)" }}>{b.createdByName}</div>
                </div>
                {confirmRemoveId === b.id ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                    <span style={{ fontSize: "var(--text-caption)" }}>{t("confirmRemove")}</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        disabled={removingId === b.id}
                        onClick={() => void handleRemoveBatch(b.id)}
                        style={{
                          padding: "4px 8px",
                          fontSize: "var(--text-caption)",
                          backgroundColor: "var(--error-600)",
                          color: "var(--neutral-0)",
                          border: "none",
                          borderRadius: "var(--radius-sm)",
                          cursor: "pointer",
                        }}
                      >
                        {removingId === b.id ? "…" : t("removeConfirm")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRemoveId(null)}
                        style={{
                          padding: "4px 8px",
                          fontSize: "var(--text-caption)",
                          border: "1px solid var(--neutral-300)",
                          borderRadius: "var(--radius-sm)",
                          background: "var(--neutral-0)",
                          cursor: "pointer",
                        }}
                      >
                        {tCommon("cancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmRemoveId(b.id)}
                    aria-label={t("removeBatchAria")}
                    title={t("removeBatch")}
                    style={{
                      padding: "6px 8px",
                      fontSize: "var(--text-caption)",
                      border: "1px solid var(--neutral-300)",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--neutral-0)",
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    {t("removeBatch")}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
