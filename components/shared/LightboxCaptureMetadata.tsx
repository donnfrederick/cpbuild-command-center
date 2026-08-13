"use client";

import { CaptureLocationStrip } from "@/components/shared/CaptureLocationStrip";
import {
  CaptureMetadataPanel,
  hasCaptureMetadata,
} from "@/components/shared/CaptureMetadataPanel";
import type { SerializedCaptureContext } from "@/lib/media/serialize-capture-context";

export interface LightboxCaptureMetadataProps {
  captureContext?: SerializedCaptureContext | null;
  /** When true, only render the compact strip (not the full panel). */
  stripOnly?: boolean;
}

/** GPS strip + optional full metadata panel for image lightboxes. */
export function LightboxCaptureMetadata({
  captureContext,
  stripOnly = false,
}: LightboxCaptureMetadataProps) {
  if (!hasCaptureMetadata(captureContext)) return null;
  return (
    <>
      <CaptureLocationStrip captureContext={captureContext} />
      {!stripOnly ? <CaptureMetadataPanel captureContext={captureContext} /> : null}
    </>
  );
}
