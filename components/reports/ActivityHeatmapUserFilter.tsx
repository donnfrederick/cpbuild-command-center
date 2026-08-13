"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { useTranslations } from "next-intl";

export interface ActivityHeatmapActor {
  id: string;
  name: string;
}

export interface ActivityHeatmapUserFilterProps {
  actors: ActivityHeatmapActor[];
  selectedUserIds: string[];
  onChange: (userIds: string[]) => void;
}

export function ActivityHeatmapUserFilter({
  actors,
  selectedUserIds,
  onChange,
}: ActivityHeatmapUserFilterProps) {
  const t = useTranslations("activityHeatmap");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const label =
    selectedUserIds.length === 0
      ? t("allTeamMembers")
      : selectedUserIds.length === 1
        ? (actors.find((a) => a.id === selectedUserIds[0])?.name ?? t("membersSelectedCount", { count: 1 }))
        : t("membersSelectedCount", { count: selectedUserIds.length });

  return (
    <div ref={rootRef} style={{ position: "relative", display: "flex", alignItems: "center", gap: 6 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("teamMembers")}
        aria-expanded={open}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          padding: "8px 10px",
          minHeight: 40,
          borderRadius: 6,
          border: "1px solid var(--neutral-300)",
          background: "var(--neutral-0)",
          cursor: "pointer",
          maxWidth: 200,
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        <ChevronDown size={14} aria-hidden style={{ flexShrink: 0 }} />
      </button>
      {selectedUserIds.length > 0 ? (
        <button
          type="button"
          onClick={() => onChange([])}
          aria-label={t("clearTeamMemberFilter")}
          title={t("clearTeamMemberFilter")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 40,
            height: 40,
            padding: 0,
            border: "none",
            borderRadius: 6,
            background: "transparent",
            cursor: "pointer",
            color: "var(--neutral-600)",
          }}
        >
          <X size={16} aria-hidden />
        </button>
      ) : null}
      {open ? (
        <div
          role="listbox"
          aria-label={t("teamMembers")}
          aria-multiselectable
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 4,
            zIndex: 20,
            minWidth: 220,
            maxHeight: 240,
            overflowY: "auto",
            background: "var(--neutral-0)",
            border: "1px solid var(--neutral-200)",
            borderRadius: 8,
            boxShadow: "var(--shadow-2)",
            padding: "6px 0",
          }}
        >
          {actors.map((actor) => {
            const checked = selectedUserIds.includes(actor.id);
            return (
              <label
                key={actor.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    if (checked) {
                      onChange(selectedUserIds.filter((id) => id !== actor.id));
                    } else {
                      onChange([...selectedUserIds, actor.id]);
                    }
                  }}
                />
                <span>{actor.name}</span>
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
