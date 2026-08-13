/**
 * Max photos / video / audio attachments per observation, issue, comment batch, etc.
 * Keep API Zod schemas (see media-attachment-schemas.ts) and client UI in sync with this constant.
 */
export const MAX_MEDIA_ATTACHMENTS_PER_ENTITY = 30;

/**
 * Max photos a user can capture in a single CameraCapture session.
 * Applies to Field Tracker status updates and CLEAR inspection question photos.
 * Matches MAX_MEDIA_ATTACHMENTS_PER_ENTITY so the limits are consistent across
 * the Field Tracker app.
 */
export const MAX_PHOTOS_PER_CAPTURE_SESSION = 30;
