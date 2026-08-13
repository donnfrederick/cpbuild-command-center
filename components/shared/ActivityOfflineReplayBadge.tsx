"use client";

import {
  ACTIVITY_OFFLINE_REPLAY_CHIP_STYLE,
} from "@/lib/activity-event-styles";
import { isReplayedFromOfflineQueue } from "@/lib/activity/offline-replay-display";

interface ActivityOfflineReplayBadgeProps {
  metadata: Record<string, unknown>;
  label: string;
  title: string;
}

export function ActivityOfflineReplayBadge({
  metadata,
  label,
  title,
}: ActivityOfflineReplayBadgeProps) {
  if (!isReplayedFromOfflineQueue(metadata)) return null;

  return (
    <span
      title={title}
      style={{
        display: "inline-block",
        fontSize: 10,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color: ACTIVITY_OFFLINE_REPLAY_CHIP_STYLE.color,
        backgroundColor: ACTIVITY_OFFLINE_REPLAY_CHIP_STYLE.backgroundColor,
        borderRadius: 4,
        padding: "2px 6px",
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}
