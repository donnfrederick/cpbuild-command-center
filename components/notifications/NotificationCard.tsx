"use client";

import { useTranslations } from "next-intl";
import { Bug, Lightbulb, CheckCircle, Clock, PlayCircle, AtSign, UserCheck } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { TOUR_USER_UI_ENABLED } from "@/lib/tour-user-ui";

export interface NotificationItem {
  id: string;
  type:
    | "FEEDBACK_IN_PROGRESS"
    | "FEEDBACK_RESOLVED"
    | "FEEDBACK_ASSIGNED"
    | "MENTIONED_IN_COMMENT"
    | "MENTIONED_IN_ISSUE_NOTES";
  read: boolean;
  createdAt: string;
  // Feedback notifications
  feedback: {
    id: string;
    type: "BUG" | "FEATURE_REQUEST";
    title: string;
    status: string;
    tour: { id: string } | null;
  } | null;
  // Mention notification fields
  actorName?: string | null;
  projectId?: string | null;
  issueId?: string | null;
  observationId?: string | null;
  mentionCommentId?: string | null;
}

interface NotificationCardProps {
  notification: NotificationItem;
  onMarkRead: (id: string) => void;
  onClose: () => void;
}

function relativeTime(iso: string, t: ReturnType<typeof useTranslations>): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 2) return t("justNow");
  if (diffMins < 60) return t("minutesAgo", { n: diffMins });
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return t("hoursAgo", { n: diffHrs });
  return t("daysAgo", { n: Math.floor(diffHrs / 24) });
}

export function NotificationCard({
  notification,
  onMarkRead,
  onClose,
}: NotificationCardProps) {
  const t = useTranslations("notifications");
  const router = useRouter();

  const { type, read, createdAt } = notification;
  const isMention = type === "MENTIONED_IN_COMMENT" || type === "MENTIONED_IN_ISSUE_NOTES";

  function handleMarkRead() {
    if (!read) onMarkRead(notification.id);
  }

  function handleClick() {
    handleMarkRead();
    if (isMention) {
      const { projectId, issueId, observationId, feedback } = notification;
      onClose();
      if (feedback && !projectId) {
        router.push(`/feedback/${feedback.id}`);
        return;
      }
      if (!projectId) return;
      if (issueId) {
        router.push(`/projects/${projectId}/issues-log?openIssue=${issueId}`);
      } else if (observationId) {
        router.push(`/projects/${projectId}?openObservation=${observationId}`);
      } else {
        router.push(`/projects/${projectId}`);
      }
    }
  }

  function handleFeedbackAssignedClick() {
    handleMarkRead();
    onClose();
    const fid = notification.feedback?.id;
    if (fid) router.push(`/feedback/${fid}`);
  }

  // ── Mention notification ──────────────────────────────────────────────────
  if (isMention) {
    const actor = notification.actorName ?? "Someone";
    const contextLabel =
      type === "MENTIONED_IN_ISSUE_NOTES" ? "issue notes" : "a comment";
    const headline = `${actor} mentioned you in ${contextLabel}`;
    // Derive the action label from where handleClick will actually navigate.
    const { projectId, issueId, feedback } = notification;
    const mentionNavLabel =
      feedback && !projectId ? t("viewFeedback") :
      issueId               ? t("viewIssue")     :
                              t("viewProject");
    const mentionAriaLabel = `${headline}. ${mentionNavLabel}`;

    return (
      <div
        onClick={handleClick}
        style={{
          display: "flex",
          gap: 12,
          padding: "12px 16px",
          borderBottom: "1px solid var(--color-divider)",
          backgroundColor: read ? "transparent" : "var(--color-accent-subtle)",
          cursor: "pointer",
          transition: "background-color 0.15s",
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
        aria-label={mentionAriaLabel}
      >
        <div style={{ flexShrink: 0, marginTop: 2 }}>
          <AtSign size={16} style={{ color: "var(--color-accent)" }} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                fontWeight: read ? 500 : 700,
                color: "var(--color-text-primary)",
                flex: 1,
              }}
            >
              {headline}
            </p>
          </div>

          <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--color-text-disabled)" }}>
            {relativeTime(createdAt, t)}
          </p>

          {!read && (
            <span
              style={{
                display: "inline-block",
                marginTop: 6,
                width: 7,
                height: 7,
                borderRadius: "50%",
                backgroundColor: "var(--color-accent)",
              }}
              aria-label={t("unread")}
            />
          )}
        </div>
      </div>
    );
  }

  const feedback = notification.feedback;

  // ── Feedback assigned ─────────────────────────────────────────────────────
  if (type === "FEEDBACK_ASSIGNED" && feedback) {
    const actor = notification.actorName;
    const headline = actor
      ? t("feedbackAssignedBy", { actor })
      : t("feedbackAssignedYou");
    const assignedAriaLabel = `${headline}. ${t("viewFeedback")}`;

    return (
      <div
        onClick={handleFeedbackAssignedClick}
        style={{
          display: "flex",
          gap: 12,
          padding: "12px 16px",
          borderBottom: "1px solid var(--color-divider)",
          backgroundColor: read ? "transparent" : "var(--color-accent-subtle)",
          cursor: "pointer",
          transition: "background-color 0.15s",
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleFeedbackAssignedClick();
          }
        }}
        aria-label={assignedAriaLabel}
      >
        <div style={{ flexShrink: 0, marginTop: 2 }}>
          <UserCheck size={16} style={{ color: "var(--color-accent)" }} aria-hidden />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: read ? 500 : 700,
              color: "var(--color-text-primary)",
            }}
          >
            {headline}
          </p>
          <p
            style={{
              margin: "2px 0 0",
              fontSize: 12,
              color: "var(--color-text-secondary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={feedback.title}
          >
            {feedback.title}
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--color-text-disabled)" }}>
            {relativeTime(createdAt, t)}
          </p>
          {!read && (
            <span
              style={{
                display: "inline-block",
                marginTop: 6,
                width: 7,
                height: 7,
                borderRadius: "50%",
                backgroundColor: "var(--color-accent)",
              }}
              aria-label={t("unread")}
            />
          )}
        </div>
      </div>
    );
  }

  // ── Feedback status (in progress / resolved) ─────────────────────────────
  if (!feedback) return null;

  const feedbackId = feedback.id;
  const hasTour = TOUR_USER_UI_ENABLED && !!feedback.tour && type === "FEEDBACK_RESOLVED";
  const typeLabel = feedback.type === "BUG" ? t("typeBug") : t("typeFeature");
  const headline =
    type === "FEEDBACK_RESOLVED"
      ? t("feedbackResolved", { type: typeLabel })
      : t("feedbackInProgress", { type: typeLabel });

  const statusCardAriaLabel = `${headline}. ${t("viewFeedback")}`;

  function handleFeedbackStatusOpen() {
    handleMarkRead();
    onClose();
    router.push(`/feedback/${feedbackId}`);
  }

  function handleWatchTour() {
    handleMarkRead();
    onClose();
    sessionStorage.setItem("pendingTour", JSON.stringify({ feedbackId }));
    router.push(`/feedback`);
  }

  return (
    <div
      onClick={handleFeedbackStatusOpen}
      style={{
        display: "flex",
        gap: 12,
        padding: "12px 16px",
        borderBottom: "1px solid var(--color-divider)",
        backgroundColor: read ? "transparent" : "var(--color-accent-subtle)",
        cursor: "pointer",
        transition: "background-color 0.15s",
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleFeedbackStatusOpen();
        }
      }}
      aria-label={statusCardAriaLabel}
    >
      <div style={{ flexShrink: 0, marginTop: 2 }}>
        {feedback.type === "BUG" ? (
          <Bug size={16} style={{ color: "var(--color-error)" }} />
        ) : (
          <Lightbulb size={16} style={{ color: "var(--color-accent)" }} />
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: read ? 500 : 700,
              color: "var(--color-text-primary)",
              flex: 1,
            }}
          >
            {headline}
          </p>
          {type === "FEEDBACK_RESOLVED" ? (
            <CheckCircle size={14} style={{ color: "var(--color-success)", flexShrink: 0 }} />
          ) : (
            <Clock size={14} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
          )}
        </div>

        <p
          style={{
            margin: "2px 0 0",
            fontSize: 12,
            color: "var(--color-text-secondary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={feedback.title}
        >
          {feedback.title}
        </p>

        <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--color-text-disabled)" }}>
          {relativeTime(createdAt, t)}
        </p>

        {hasTour && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleWatchTour(); }}
            style={{
              marginTop: 8,
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 10px",
              backgroundColor: "var(--color-accent)",
              color: "var(--color-text-inverse)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "var(--tracking-ui)",
              cursor: "pointer",
            }}
          >
            <PlayCircle size={13} />
            {t("watchTour")}
          </button>
        )}

        {!read && (
          <span
            style={{
              display: "inline-block",
              marginTop: hasTour ? 4 : 6,
              width: 7,
              height: 7,
              borderRadius: "50%",
              backgroundColor: "var(--color-accent)",
            }}
            aria-label={t("unread")}
          />
        )}
      </div>
    </div>
  );
}
