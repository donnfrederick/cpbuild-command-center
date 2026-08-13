"use client";

/**
 * Global host for retaking a queued status-update photo from the upload queue.
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CameraCapture } from "@/components/projects/CameraCapture";
import type { CapturedFile } from "@/components/projects/CameraCapture";
import type { BurnLocation } from "@/lib/image-utils";
import { getMutationById, discardMutation } from "@/lib/offline/mutation-queue";
import {
  enqueueStatusPhotoMutation,
  parseStatusPhotoMutation,
  type StatusPhotoQueueContext,
} from "@/lib/offline/status-photo-queue";
import { subscribeStatusPhotoRetake } from "@/lib/offline/pending-status-photo-retake";
import { OFFLINE_SYNC_COMPLETE_EVENT } from "@/lib/offline/events";

function burnLocationFromUnitRef(unitRef: string): BurnLocation | undefined {
  const [building = "", level = "", unit = ""] = unitRef.split("|");
  if (!building && !level && !unit) return undefined;
  return {
    building: building.trim() || undefined,
    level: level.trim() || undefined,
    unit: unit.trim() || undefined,
  };
}

export function StatusPhotoRetakeHost() {
  const t = useTranslations("offlineCachePanel");
  const [mutationId, setMutationId] = useState<string | null>(null);
  const [context, setContext] = useState<StatusPhotoQueueContext | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleOpen = useCallback(async (id: string) => {
    const mutation = await getMutationById(id);
    const parsed = mutation ? parseStatusPhotoMutation(mutation) : null;
    if (!parsed) {
      toast.error(t("queuedItemRetakeMissing"));
      return;
    }
    setMutationId(id);
    setContext(parsed);
  }, [t]);

  useEffect(() => subscribeStatusPhotoRetake((id) => {
    void handleOpen(id);
  }), [handleOpen]);

  const handleCapture = useCallback(async (captured: CapturedFile[]) => {
    if (!mutationId || !context || captured.length === 0) return;
    setIsSaving(true);
    try {
      await discardMutation(mutationId);
      let saved = 0;
      for (const c of captured) {
        try {
          await enqueueStatusPhotoMutation({
            albumUrl: context.albumUrl,
            sourceLabel: context.sourceLabel,
            file: c.file,
          });
          saved += 1;
        } catch {
          // try remaining captures
        }
      }
      if (saved > 0) {
        toast.success(t("queuedItemRetakeSuccess"));
        window.dispatchEvent(new CustomEvent(OFFLINE_SYNC_COMPLETE_EVENT));
        setMutationId(null);
        setContext(null);
      } else {
        toast.error(t("queuedItemRetakeFailed"));
      }
    } finally {
      setIsSaving(false);
    }
  }, [context, mutationId, t]);

  if (!mutationId || !context) return null;

  return (
    <CameraCapture
      projectId={context.projectId}
      location={burnLocationFromUnitRef(context.unitRef)}
      burnOptions={{
        scopeName: context.scopeName,
        statusLabel: context.statusDisplayLabel,
      }}
      onCapture={(files) => void handleCapture(files)}
      onClose={() => {
        if (!isSaving) {
          setMutationId(null);
          setContext(null);
        }
      }}
    />
  );
}
