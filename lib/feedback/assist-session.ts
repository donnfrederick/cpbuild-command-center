/** Max screen-recording duration for feedback AI assist (seconds). */
export const MAX_FEEDBACK_RECORDING_SECONDS = 120;

/** True when both display capture and MediaRecorder are available. */
export function isFeedbackScreenRecordingSupported(): boolean {
  return (
    typeof navigator !== "undefined"
    && typeof navigator.mediaDevices?.getDisplayMedia === "function"
    && typeof MediaRecorder !== "undefined"
  );
}

/** Generate a cryptographically secure session ID (UUID v4). */
export function makeFeedbackAssistSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
    return `${hex[0]}${hex[1]}${hex[2]}${hex[3]}-${hex[4]}${hex[5]}-${hex[6]}${hex[7]}-${hex[8]}${hex[9]}-${hex[10]}${hex[11]}${hex[12]}${hex[13]}${hex[14]}${hex[15]}`;
  }
  throw new Error("Secure randomness is unavailable in this environment.");
}
