"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Bug, Lightbulb, Loader2, Inbox, RefreshCw, Link2, Send, Square, CheckSquare, X, ExternalLink } from "lucide-react";
import { useRouter, usePathname } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FeedbackDetailView,
  FeedbackPriorityBadge,
  FeedbackStatusBadge,
  formatShortId,
  type FeedbackReport,
  type FeedbackStatus,
} from "@/components/feedback/FeedbackDetailView";
import type { FeedbackListProdFeedStatus } from "@/lib/feedback-environment";
import {
  filterFeedbackInboxRows,
  type FeedbackInboxEnvironmentFilter,
  type FeedbackInboxPriorityFilter,
  type FeedbackInboxTypeFilter,
  type FeedbackInboxView,
} from "@/lib/feedback-inbox-filters";
import { FEEDBACK_INBOX_REFRESH_EVENT } from "@/lib/feedback-inbox-events";
import { useOptionalRouteFetch } from "@/components/navigation/route-fetch-provider";
import { isAbortError } from "@/lib/route-fetch";

export interface FeedbackInboxProps {
  locale: string;
  currentUserId: string;
  canTriage: boolean;
}

type FilterStatus = "ALL" | FeedbackStatus;

const SELECT_CLASS =
  "min-h-[40px] min-w-[7.5rem] rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-xs text-neutral-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500";

export function FeedbackInbox({ locale, currentUserId, canTriage }: FeedbackInboxProps) {
  const t = useTranslations("feedback");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  /** True while closing: URL still has `open=` for a frame; skip sync effect so it does not reopen the modal. */
  const closingModalRef = useRef(false);
  /** Tracks the in-flight fetch so we can abort it on a new request or unmount. */
  const fetchAbortRef = useRef<AbortController | null>(null);

  const [reports, setReports] = useState<FeedbackReport[]>([]);
  const [prodFeed, setProdFeed] = useState<FeedbackListProdFeedStatus>("off");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<FeedbackInboxView>("all");
  const [filter, setFilter] = useState<FilterStatus>("ALL");
  const [searchInput, setSearchInput] = useState("");
  const [typeFilter, setTypeFilter] = useState<FeedbackInboxTypeFilter>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<FeedbackInboxPriorityFilter>("ALL");
  const [environmentFilter, setEnvironmentFilter] =
    useState<FeedbackInboxEnvironmentFilter>("ALL");
  const [selected, setSelected] = useState<FeedbackReport | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [deletedReports, setDeletedReports] = useState<FeedbackReport[]>([]);
  const [loadingDeleted, setLoadingDeleted] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [isSendingToRadDash, setIsSendingToRadDash] = useState(false);

  const searchNormalized = useMemo(() => searchInput.trim().toLowerCase(), [searchInput]);

  const filterCriteria = useMemo(
    () => ({
      view,
      currentUserId,
      typeFilter,
      priorityFilter,
      environmentFilter,
      search: searchNormalized,
    }),
    [view, currentUserId, typeFilter, priorityFilter, environmentFilter, searchNormalized]
  );

  const basePool = useMemo(
    () => filterFeedbackInboxRows(reports, filterCriteria),
    [reports, filterCriteria]
  );

  const filtered = useMemo(
    () => (filter === "ALL" ? basePool : basePool.filter((r) => r.status === filter)),
    [basePool, filter]
  );

  const counts: Partial<Record<FilterStatus, number>> = useMemo(
    () => ({
      ALL: basePool.length,
      OPEN: basePool.filter((r) => r.status === "OPEN").length,
      IN_PROGRESS: basePool.filter((r) => r.status === "IN_PROGRESS").length,
      WAITING_FOR_RESPONSE: basePool.filter((r) => r.status === "WAITING_FOR_RESPONSE").length,
      NEEDS_INVESTIGATION: basePool.filter((r) => r.status === "NEEDS_INVESTIGATION").length,
      WONT_FIX: basePool.filter((r) => r.status === "WONT_FIX").length,
      RESOLVED: basePool.filter((r) => r.status === "RESOLVED").length,
      DELETED: deletedReports.length,
    }),
    [basePool, deletedReports]
  );

  const assignedToMeCount = useMemo(
    () => reports.filter((r) => r.assignee?.id === currentUserId).length,
    [reports, currentUserId]
  );

  const showEnvironmentFilter = useMemo(
    () => reports.some((r) => r.environment === "production"),
    [reports]
  );

  const hasActiveFilters =
    searchNormalized.length > 0 ||
    typeFilter !== "ALL" ||
    priorityFilter !== "ALL" ||
    environmentFilter !== "ALL";

  const clearFilters = useCallback(() => {
    setSearchInput("");
    setTypeFilter("ALL");
    setPriorityFilter("ALL");
    setEnvironmentFilter("ALL");
  }, []);

  const reportKey = (report: FeedbackReport) => `${report.environment ?? "x"}-${report.id}`;

  const toggleSelect = useCallback((report: FeedbackReport, e: React.MouseEvent) => {
    e.stopPropagation();
    const key = reportKey(report);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedKeys(new Set()), []);

  const sendToRadDash = useCallback(async () => {
    if (selectedKeys.size === 0 || isSendingToRadDash) return;
    setIsSendingToRadDash(true);
    try {
      const allReports = [...reports, ...deletedReports];
      const selected = allReports.filter((r) => selectedKeys.has(reportKey(r)));
      const feedbackIds = selected.map((r) => r.id);
      const res = await fetch("/api/webhooks/send-to-rad-dash", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ feedbackIds }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        toast.error(err.error ?? t("radDashSendFailed"));
        return;
      }
      const result = (await res.json()) as { created: number };
      toast.success(t("radDashSendSuccess", { count: result.created }));
      // Optimistically stamp sentToRadDashAt so the badge appears immediately.
      const now = new Date().toISOString();
      const stamp = (r: FeedbackReport) =>
        selectedKeys.has(reportKey(r)) ? { ...r, sentToRadDashAt: now } : r;
      setReports((prev) => prev.map(stamp));
      setDeletedReports((prev) => prev.map(stamp));
      clearSelection();
    } catch {
      toast.error(t("radDashSendFailed"));
    } finally {
      setIsSendingToRadDash(false);
    }
  }, [selectedKeys, isSendingToRadDash, reports, deletedReports, t, clearSelection]);

  const routeFetch = useOptionalRouteFetch();

  const fetchReports = useCallback(
    async (options?: { soft?: boolean }) => {
      // Abort any in-flight same-page request before starting a new one.
      fetchAbortRef.current?.abort();
      const controller = new AbortController();
      fetchAbortRef.current = controller;

      const soft = options?.soft === true;
      if (soft) setRefreshing(true);
      try {
        const res = await routeFetch("/api/feedback", { signal: controller.signal });
        if (!res.ok) throw new Error("Failed to load");
        const raw = (await res.json()) as
          | FeedbackReport[]
          | { reports: FeedbackReport[]; prodFeed: FeedbackListProdFeedStatus };
        const data = Array.isArray(raw) ? raw : raw.reports;
        const feedStatus: FeedbackListProdFeedStatus = Array.isArray(raw) ? "off" : raw.prodFeed;
        setProdFeed(feedStatus);
        const normalized = data as FeedbackReport[];
        setReports(normalized);
        setSelected((prev) => {
          if (!prev) return null;
          const next = normalized.find(
            (r) => r.id === prev.id && r.environment === prev.environment
          );
          return next ?? prev;
        });
      } catch (err) {
        if (isAbortError(err)) return;
        toast.error(t("loadFailed"));
      } finally {
        if (!soft) setLoading(false);
        if (soft) setRefreshing(false);
      }
    },
    [routeFetch, t]
  );

  const fetchDeletedReports = useCallback(async () => {
    if (!canTriage) return;
    setLoadingDeleted(true);
    try {
      const res = await routeFetch("/api/feedback?deleted=true");
      if (!res.ok) return;
      const raw = (await res.json()) as { reports: FeedbackReport[] } | FeedbackReport[];
      const data = Array.isArray(raw) ? raw : raw.reports;
      setDeletedReports(data as FeedbackReport[]);
    } catch (err) {
      if (isAbortError(err)) return;
    } finally {
      setLoadingDeleted(false);
    }
  }, [canTriage, routeFetch]);

  useEffect(() => {
    void fetchReports();
  }, [fetchReports]);

  useEffect(() => {
    const onRefresh = () => {
      void fetchReports({ soft: true });
      if (filter === "DELETED") void fetchDeletedReports();
    };
    window.addEventListener(FEEDBACK_INBOX_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(FEEDBACK_INBOX_REFRESH_EVENT, onRefresh);
  }, [fetchReports, fetchDeletedReports, filter]);

  useEffect(() => {
    if (filter === "DELETED") void fetchDeletedReports();
  }, [filter, fetchDeletedReports]);

  const openModal = useCallback(
    (r: FeedbackReport) => {
      closingModalRef.current = false;
      setSelected(r);
      const env =
        r.environment === "production"
          ? "&environment=production"
          : r.environment === "development"
            ? "&environment=development"
            : "";
      router.replace(`${pathname}?open=${encodeURIComponent(r.id)}${env}`);
    },
    [router, pathname]
  );

  const closeModal = useCallback(() => {
    closingModalRef.current = true;
    setSelected(null);
    router.replace(pathname);
  }, [router, pathname]);

  const openParam = searchParams.get("open");
  const envParam = searchParams.get("environment");

  useEffect(() => {
    if (!openParam) {
      closingModalRef.current = false;
      return;
    }
    if (loading) return;
    if (closingModalRef.current) return;

    const listMatches = reports.filter((r) => r.id === openParam);
    // Deep links with `open=` but no `environment=` never match merged rows; normalize URL once.
    if (!envParam) {
      const envToSet =
        listMatches.length === 1
          ? listMatches[0].environment
          : selected?.id === openParam
            ? selected.environment
            : undefined;
      if (envToSet === "production" || envToSet === "development") {
        router.replace(
          `${pathname}?open=${encodeURIComponent(openParam)}&environment=${encodeURIComponent(envToSet)}`
        );
        return;
      }
    }

    const env =
      envParam === "production"
        ? ("production" as const)
        : envParam === "development"
          ? ("development" as const)
          : undefined;
    if (selected?.id === openParam && selected.environment === env) return;

    const fromList = reports.find((r) => r.id === openParam && r.environment === env);
    if (fromList) {
      setSelected(fromList);
      return;
    }

    let cancelled = false;
    setLoadingDetail(true);
    void (async () => {
      try {
        const q =
          env === "production"
            ? "?environment=production"
            : env === "development"
              ? "?environment=development"
              : "";
        const res = await fetch(`/api/feedback/${encodeURIComponent(openParam)}${q}`);
        if (!res.ok) {
          if (res.status === 404) router.replace(pathname);
          return;
        }
        const detail = (await res.json()) as FeedbackReport;
        if (!cancelled) setSelected(detail);
      } catch {
        /* silent */
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [openParam, envParam, loading, reports, selected?.id, selected?.environment, router, pathname]);

  const filterOptions: { value: FilterStatus; label: string; adminOnly?: boolean }[] = [
    { value: "ALL", label: t("filterAll") },
    { value: "OPEN", label: t("statusOpen") },
    { value: "IN_PROGRESS", label: t("statusInProgress") },
    { value: "WAITING_FOR_RESPONSE", label: t("statusWaitingForResponse") },
    { value: "NEEDS_INVESTIGATION", label: t("statusNeedsInvestigation") },
    { value: "WONT_FIX", label: t("statusWontFix") },
    { value: "RESOLVED", label: t("statusResolved") },
    { value: "DELETED", label: t("statusDeleted"), adminOnly: true },
  ];

  const listBusy = loading || loadingDetail || (filter === "DELETED" && loadingDeleted);
  const activeList = filter === "DELETED" ? deletedReports : filtered;

  const selectAll = useCallback(() => {
    setSelectedKeys(new Set(activeList.map((r) => `${r.environment ?? "x"}-${r.id}`)));
  }, [activeList]);

  const emptyMessage = (() => {
    if (listBusy || reports.length > 0) return null;
    return t("noFeedback");
  })();

  const mineEmptyMessage = (() => {
    if (listBusy || reports.length === 0) return null;
    if (view !== "mine" || assignedToMeCount > 0) return null;
    return t("inboxMineEmpty");
  })();

  const noMatchesMessage = (() => {
    if (listBusy) return null;
    if (filter === "DELETED") return deletedReports.length === 0 ? t("inboxNoMatches") : null;
    if (reports.length === 0) return null;
    if (view === "mine" && assignedToMeCount === 0) return null;
    if (filtered.length > 0) return null;
    return t("inboxNoMatches");
  })();

  return (
    <div className="flex flex-col gap-4">
      {prodFeed === "error" && (
        <p className="rounded-lg border border-warning-600 bg-warning-100 px-3 py-2 text-xs text-warning-600">
          {t("prodFeedUnavailable")}
        </p>
      )}

      <div
        className="flex max-w-full items-center justify-between gap-2 rounded-lg p-1"
        style={{ backgroundColor: "var(--neutral-100)" }}
      >
        <div
          className="flex min-w-0 flex-1 gap-1 overflow-x-auto"
          role="tablist"
          aria-label={t("inboxScopeAria")}
        >
          <button
            type="button"
            role="tab"
            aria-selected={view === "all"}
            onClick={() => setView("all")}
            className={[
              "min-h-[44px] shrink-0 rounded-md px-3 py-2 text-xs font-medium transition-colors",
              view === "all"
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-500 hover:text-neutral-700",
            ].join(" ")}
          >
            {t("inboxScopeAll")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "mine"}
            onClick={() => setView("mine")}
            className={[
              "min-h-[44px] shrink-0 rounded-md px-3 py-2 text-xs font-medium transition-colors",
              view === "mine"
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-500 hover:text-neutral-700",
            ].join(" ")}
          >
            {t("inboxScopeMine")}
            {assignedToMeCount > 0 && (
              <span className="ml-1 text-neutral-500">({assignedToMeCount})</span>
            )}
          </button>
        </div>
        <button
          type="button"
          onClick={() => void fetchReports({ soft: true })}
          disabled={refreshing || loading}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-neutral-600 transition-colors hover:bg-white hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:pointer-events-none disabled:opacity-50"
          aria-label={t("inboxRefreshAria")}
        >
          <RefreshCw
            className={["h-5 w-5", refreshing ? "animate-spin" : ""].join(" ")}
            aria-hidden
          />
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Label htmlFor="feedback-inbox-search" className="text-xs text-neutral-600">
            {t("searchLabel")}
          </Label>
          <Input
            id="feedback-inbox-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-10 text-sm"
            autoComplete="off"
          />
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="feedback-inbox-type" className="text-xs text-neutral-600">
              {t("filterTypeLabel")}
            </Label>
            <select
              id="feedback-inbox-type"
              className={SELECT_CLASS}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as FeedbackInboxTypeFilter)}
            >
              <option value="ALL">{t("filterOptionAllTypes")}</option>
              <option value="BUG">{t("typeBug")}</option>
              <option value="FEATURE_REQUEST">{t("typeFeature")}</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="feedback-inbox-priority" className="text-xs text-neutral-600">
              {t("filterPriorityLabel")}
            </Label>
            <select
              id="feedback-inbox-priority"
              className={SELECT_CLASS}
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as FeedbackInboxPriorityFilter)}
            >
              <option value="ALL">{t("filterAll")}</option>
              <option value="NONE">{t("priorityNone")}</option>
              <option value="LOW">{t("priorityLow")}</option>
              <option value="MEDIUM">{t("priorityMedium")}</option>
              <option value="HIGH">{t("priorityHigh")}</option>
            </select>
          </div>
          {showEnvironmentFilter ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor="feedback-inbox-env" className="text-xs text-neutral-600">
                {t("filterEnvironmentLabel")}
              </Label>
              <select
                id="feedback-inbox-env"
                className={SELECT_CLASS}
                value={environmentFilter}
                onChange={(e) =>
                  setEnvironmentFilter(e.target.value as FeedbackInboxEnvironmentFilter)
                }
              >
                <option value="ALL">{t("filterOptionAllEnvironments")}</option>
                <option value="development">{t("environmentDevelopment")}</option>
                <option value="production">{t("environmentProduction")}</option>
              </select>
            </div>
          ) : null}
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="min-h-[40px] self-end rounded-md px-2 text-xs font-medium text-primary-600 underline-offset-2 hover:underline"
            >
              {t("clearFilters")}
            </button>
          ) : null}
        </div>
      </div>

      <div
        className="flex max-w-full gap-1 overflow-x-auto rounded-lg p-1"
        style={{ backgroundColor: "var(--neutral-100)" }}
        role="tablist"
        aria-label={t("inboxStatusFilterAria")}
      >
        {filterOptions
          .filter(({ adminOnly }) => !adminOnly || canTriage)
          .map(({ value, label }) => {
            const count = counts[value] ?? 0;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={filter === value}
                onClick={() => setFilter(value)}
                className={[
                  "min-h-[44px] shrink-0 rounded-md px-3 py-2 text-xs font-medium transition-colors",
                  filter === value
                    ? "bg-white text-neutral-900 shadow-sm"
                    : "text-neutral-500 hover:text-neutral-700",
                  value === "DELETED" ? "border border-dashed border-neutral-300" : "",
                ].join(" ")}
              >
                {label}
                {count > 0 && <span className="ml-1 text-neutral-400">({count})</span>}
              </button>
            );
          })}
      </div>

      {canTriage && selectedKeys.size > 0 && (
        <div
          className="sticky top-2 z-10 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-primary-300 bg-primary-50 px-3 py-2.5"
          style={{ boxShadow: "var(--shadow-2)" }}
        >
          {/* Left group — count + select-all */}
          <div className="flex shrink-0 items-center gap-2">
            <CheckSquare size={14} className="shrink-0 text-primary-600" aria-hidden />
            <span className="text-xs font-semibold text-primary-800">
              {t("radDashSelectionCount", { count: selectedKeys.size })}
            </span>
            {activeList.length > selectedKeys.size && (
              <button
                type="button"
                onClick={selectAll}
                aria-label={t("radDashSelectAllAria")}
                className="rounded text-xs text-primary-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              >
                {t("radDashSelectAll")}
              </button>
            )}
          </div>

          {/* Divider (hidden on smallest screens) */}
          <div className="hidden h-4 w-px shrink-0 bg-primary-200 sm:block" aria-hidden />

          {/* Right group — send + clear */}
          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void sendToRadDash()}
              disabled={isSendingToRadDash}
              className="inline-flex min-h-[34px] flex-end shrink-0 items-center gap-1.5 rounded-md bg-black px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:pointer-events-none disabled:opacity-50"
            >
              {isSendingToRadDash ? (
                <Loader2 size={13} className="animate-spin" aria-hidden />
              ) : (
                <Send size={13} aria-hidden />
              )}
              {t("radDashSendButton")}
            </button>

            <button
              type="button"
              onClick={clearSelection}
              aria-label={t("radDashClearSelectionAria")}
              className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md text-primary-500 transition-colors hover:bg-primary-100 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            >
              <X size={14} aria-hidden />
            </button>
          </div>
        </div>
      )}

      {listBusy ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="animate-spin text-neutral-500" />
        </div>
      ) : emptyMessage ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-neutral-500">
          <Inbox size={32} />
          <p className="text-sm">{emptyMessage}</p>
        </div>
      ) : mineEmptyMessage ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-neutral-500">
          <Inbox size={32} />
          <p className="text-sm">{mineEmptyMessage}</p>
        </div>
      ) : noMatchesMessage ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-neutral-500">
          <Inbox size={32} />
          <p className="text-sm">{noMatchesMessage}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {activeList.map((report) => {
            const key = reportKey(report);
            const isSelected = selectedKeys.has(key);
            return (
            <div
              key={key}
              role="button"
              tabIndex={0}
              onClick={() => openModal(report)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openModal(report);
                }
              }}
              className={[
                "min-h-[56px] w-full cursor-pointer rounded-lg border bg-white p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
                isSelected
                  ? "border-primary-400 bg-primary-50 ring-1 ring-inset ring-primary-300 hover:bg-primary-100"
                  : "border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50",
              ].join(" ")}
              style={{ boxShadow: isSelected ? "none" : "var(--shadow-1)" }}
            >
              <div className="flex items-start gap-3">
                {canTriage ? (
                  <button
                    type="button"
                    onClick={(e) => toggleSelect(report, e)}
                    aria-label={isSelected ? t("radDashDeselectAria") : t("radDashSelectAria")}
                    aria-pressed={isSelected}
                    className={[
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
                      isSelected
                        ? "text-primary-600"
                        : "text-neutral-300 hover:text-primary-500",
                    ].join(" ")}
                  >
                    {isSelected ? (
                      <CheckSquare size={18} aria-hidden />
                    ) : (
                      <Square size={18} aria-hidden />
                    )}
                  </button>
                ) : (
                <div className="mt-0.5 shrink-0">
                  {report.type === "BUG" ? (
                    <Bug size={16} className="text-error-600" />
                  ) : (
                    <Lightbulb size={16} className="text-primary-500" />
                  )}
                </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="shrink-0 font-mono text-xs font-medium text-neutral-500">
                      {formatShortId(report.shortId)}
                    </span>
                    <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-900">
                      {report.title}
                    </h3>
                    <FeedbackStatusBadge status={report.status} />
                    {report.priority ? <FeedbackPriorityBadge priority={report.priority} /> : null}
                    {typeof report.duplicatesCount === "number" && report.duplicatesCount > 0 && (
                      <Badge
                        variant="outline"
                        className="shrink-0 gap-1 border-amber-300 text-xs text-amber-700"
                      >
                        <Link2 size={10} aria-hidden />
                        {t("duplicatesCountBadge", { count: report.duplicatesCount })}
                      </Badge>
                    )}
                    {report.environment === "production" && (
                      <Badge variant="outline" className="shrink-0 border-(--neutral-400) text-xs text-(--neutral-700)">
                        {t("environmentProduction")}
                      </Badge>
                    )}
                    {report.environment === "development" ? (
                      <Badge variant="outline" className="shrink-0 border-(--neutral-400) text-xs text-(--neutral-700)">
                        {t("environmentDevelopment")}
                      </Badge>
                    ) : null}
                    {report.viewerContext === "mentioned" && (
                      <Badge
                        variant="outline"
                        className="shrink-0 border-primary-500 text-xs text-primary-700"
                      >
                        {t("mentionedBadge")}
                      </Badge>
                    )}
                    {report.sentToRadDashAt && (
                      <Badge
                        variant="outline"
                        className="shrink-0 gap-1 border-success-600 bg-success-50 text-xs text-success-700"
                      >
                        <ExternalLink size={10} aria-hidden />
                        {t("radDashSentBadge")}
                      </Badge>
                    )}
                    {report.assignee && (
                      <Badge
                        variant="outline"
                        className="shrink-0 border-(--neutral-400) bg-neutral-50 text-xs text-(--neutral-800)"
                      >
                        {t("assigneeCardTag", {
                          name: report.assignee.name ?? report.assignee.email,
                        })}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-neutral-500">
                    {t("submittedBy")} {report.user.name ?? report.user.email} ·{" "}
                    {new Date(report.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-neutral-500">{report.description}</p>
                  {typeof report.commentsCount === "number" && report.commentsCount > 0 && (
                    <p className="mt-1 text-[11px] text-(--neutral-400)">
                      {t("commentsCountLabel", { count: report.commentsCount })}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
          })}
        </div>
      )}

      {selected && (
        <FeedbackDetailView
          variant="modal"
          report={selected}
          locale={locale}
          canTriage={canTriage}
          currentUserId={currentUserId}
          onUpdate={async () => {
            await fetchReports();
            if (filter === "DELETED") void fetchDeletedReports();
          }}
          onRequestClose={closeModal}
        />
      )}
    </div>
  );
}
