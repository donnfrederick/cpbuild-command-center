"use client";

/**
 * Token-driven issue row — shared by the project issues log and unit-card previews.
 * Left accent rail + compact metadata; actions are flex siblings (never overlaid).
 */

import {
  CheckCircle2,
  ChevronRight,
  MessageSquare,
  Pencil,
  WifiOff,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { IssueSummary } from "@/components/projects/UnitCards";
import {
  buildIssueScopePills,
  formatIssueAgeLabel,
  formatResponsibleParty,
  formatResponsibleParties,
  issueAgeTone,
  issueRowStateClass,
  issueTypePillClass,
  resolveIssueTypeDisplayName,
} from "@/lib/issues/issueDisplay";
import { FieldNotePhotoStrip } from "@/components/shared/FieldNotePhotoStrip";
import type { PublicIssueTypeCatalogItem } from "@/lib/issues/issue-catalog";

export interface IssueLogRowProps {
  issue: Pick<
    IssueSummary,
    | "id"
    | "issueType"
    | "shortDescription"
    | "status"
    | "isBlockingWork"
    | "createdAt"
    | "resolvedAt"
    | "responsibleParty"
    | "responsibleParties"
    | "createdBy"
    | "attachments"
    | "scopeTags"
    | "subScopeTags"
    | "_count"
    | "_pendingSync"
  >;
  /** Pre-built scope pills; computed from issue when omitted. */
  scopePills?: string[];
  /** Log list uses split view + resolve; unit accordion uses icon actions. */
  variant?: "log" | "unit";
  onView: () => void;
  onResolve?: () => void;
  onEdit?: () => void;
  showResponsible?: boolean;
  /** When true, row tap toggles selection instead of opening detail. */
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  issueTypeCatalog?: PublicIssueTypeCatalogItem[];
}

function SelectIndicator({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        width: 18,
        height: 18,
        borderRadius: "50%",
        backgroundColor: selected ? "var(--primary-500)" : "var(--neutral-0)",
        border: selected ? "none" : "1.5px solid var(--neutral-400)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {selected && (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
          <polyline
            points="1.5,5 4,7.5 8.5,2.5"
            stroke="var(--neutral-0)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );
}

function IssuePhotoStrip({
  attachments,
}: {
  attachments: IssueSummary["attachments"];
}) {
  return <FieldNotePhotoStrip attachments={attachments ?? []} />;
}

function IssueRowBody({
  issue,
  scopePills,
  showResponsible,
  issueTypeCatalog,
}: {
  issue: IssueLogRowProps["issue"];
  scopePills: string[];
  showResponsible?: boolean;
  issueTypeCatalog?: PublicIssueTypeCatalogItem[];
}) {
  const t = useTranslations("units");
  const isResolved = issue.status === "RESOLVED";
  const isPending = issue._pendingSync === true;
  const authorName = issue.createdBy.name ?? issue.createdBy.email.split("@")[0];
  const ageLabel = formatIssueAgeLabel(issue, t);
  const ageTone = issueAgeTone(issue);

  const typeLabel = resolveIssueTypeDisplayName(
    issue.issueType,
    (key) => t(key as "issueTypeSubstrate"),
    issueTypeCatalog,
  );

  return (
    <>
      <p
        className={`issue-log-row__title${isResolved ? " issue-log-row__title--resolved" : ""}`}
      >
        {issue.shortDescription}
      </p>

      <div className="issue-log-row__tags">
        <span className={issueTypePillClass(issue.issueType)}>{typeLabel}</span>
        {issue.isBlockingWork && !isResolved && (
          <span className="issue-log-row__blocking-pill">{t("blockingLabel")}</span>
        )}
        {isPending && (
          <span className="issue-log-row__pending-pill">
            <WifiOff size={10} aria-hidden />
            {t("pendingSync")}
          </span>
        )}
        {scopePills.slice(0, 3).map((pill) => (
          <span
            key={pill}
            className={`issue-log-row__scope-pill${
              pill.includes(":") ? " issue-log-row__scope-pill--sub" : ""
            }`}
          >
            {pill}
          </span>
        ))}
        {scopePills.length > 3 && (
          <span className="issue-log-row__scope-overflow">+{scopePills.length - 3}</span>
        )}
      </div>

      <div className="issue-log-row__meta">
        <span>{authorName}</span>
        <span className="issue-log-row__dot" aria-hidden>
          ·
        </span>
        <span className={`issue-log-row__age issue-log-row__age--${ageTone}`}>
          {ageLabel}
        </span>
        {issue._count.comments > 0 && (
          <>
            <span className="issue-log-row__dot" aria-hidden>
              ·
            </span>
            <span className="issue-log-row__comments">
              <MessageSquare size={10} aria-hidden />
              {issue._count.comments}
            </span>
          </>
        )}
        {isResolved && (
          <>
            <span className="issue-log-row__dot" aria-hidden>
              ·
            </span>
            <span className="issue-log-row__resolved-pill">{t("issueStatusResolved")}</span>
          </>
        )}
      </div>

      {showResponsible && (
        <p className="issue-log-row__responsible">
          {t("issueLogResponsible")}: {formatResponsibleParties(issue.responsibleParties, issue.responsibleParty)}
        </p>
      )}
    </>
  );
}

function IssueRowPhotos({ attachments }: { attachments: IssueSummary["attachments"] }) {
  if (!attachments?.length) return null;
  const hasImage = attachments.some(
    (a) => a.storageUrl?.trim() && (!a.mimeType || a.mimeType.startsWith("image/")),
  );
  if (!hasImage) return null;
  return (
    <div className="issue-log-row__photos">
      <IssuePhotoStrip attachments={attachments} />
    </div>
  );
}

export function IssueLogRow({
  issue,
  scopePills: scopePillsProp,
  variant = "log",
  onView,
  onResolve,
  onEdit,
  showResponsible = false,
  selectMode = false,
  selected = false,
  onToggleSelect,
  issueTypeCatalog,
}: IssueLogRowProps) {
  const t = useTranslations("units");
  const isResolved = issue.status === "RESOLVED";
  const state = issueRowStateClass(issue.status, issue.isBlockingWork);
  const scopePills = scopePillsProp ?? buildIssueScopePills(issue);
  const showSplitResolve =
    variant === "log" && !isResolved && onResolve != null && !selectMode;
  const showUnitActions = variant === "unit" && (!isResolved || onEdit) && !selectMode;

  const rowClass = [
    "issue-log-row",
    `issue-log-row--${state}`,
    variant === "unit" ? "issue-log-row--card" : "",
    showSplitResolve ? "issue-log-row--split" : "",
    issue._pendingSync ? "issue-log-row--pending" : "",
    selectMode && selected ? "issue-log-row--selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const handleRowClick = () => {
    if (selectMode && onToggleSelect) {
      onToggleSelect();
      return;
    }
    onView();
  };

  const rowAriaLabel = selectMode
    ? t("issueLogSelectAria", { title: issue.shortDescription })
    : t("issueLogViewAria", { title: issue.shortDescription });

  if (showSplitResolve) {
    return (
      <div className={rowClass}>
        <div className="issue-log-row__tap-col">
          <button
            type="button"
            className="issue-log-row__view"
            onClick={onView}
            aria-label={t("issueLogViewAria", { title: issue.shortDescription })}
          >
            <div className="issue-log-row__content">
              <IssueRowBody
                issue={issue}
                scopePills={scopePills}
                showResponsible={showResponsible}
                issueTypeCatalog={issueTypeCatalog}
              />
            </div>
            <ChevronRight size={14} className="issue-log-row__chevron" aria-hidden />
          </button>
          <IssueRowPhotos attachments={issue.attachments} />
        </div>
        <div className="issue-log-row__split-divider" aria-hidden />
        <button
          type="button"
          className="issue-log-row__resolve"
          onClick={onResolve}
          aria-label={t("issueLogResolveAria", { title: issue.shortDescription })}
        >
          {t("issueLogResolve")}
        </button>
      </div>
    );
  }

  return (
    <div className={rowClass}>
      <div className="issue-log-row__tap-col">
        <button
          type="button"
          className="issue-log-row__main"
          onClick={handleRowClick}
          aria-label={rowAriaLabel}
          aria-pressed={selectMode ? selected : undefined}
        >
          {selectMode && <SelectIndicator selected={selected} />}
          <div className="issue-log-row__content">
            <IssueRowBody
              issue={issue}
              scopePills={scopePills}
              showResponsible={showResponsible}
              issueTypeCatalog={issueTypeCatalog}
            />
          </div>
          {variant === "log" && !selectMode && (
            <ChevronRight size={14} className="issue-log-row__chevron" aria-hidden />
          )}
        </button>
        <IssueRowPhotos attachments={issue.attachments} />
      </div>

      {showUnitActions && (
        <div className="issue-log-row__actions">
          {onEdit && (
            <button
              type="button"
              className="issue-log-row__action-btn"
              aria-label={t("issueLogEditAria")}
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
            >
              <Pencil size={15} aria-hidden />
            </button>
          )}
          {!isResolved && onResolve && (
            <button
              type="button"
              className="issue-log-row__action-btn issue-log-row__action-btn--resolve"
              aria-label={t("issueLogResolveAria", { title: issue.shortDescription })}
              onClick={(e) => {
                e.stopPropagation();
                onResolve();
              }}
            >
              <CheckCircle2 size={16} aria-hidden />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
