/**
 * Shared type definitions for the Field Tracker → Rad-Dash webhook integration.
 *
 * Field Tracker sends POST /api/webhooks/field-tracker (on Rad-Dash) with this payload.
 * Rad-Dash validates the Authorization: Bearer <FIELD_TRACKER_WEBHOOK_SECRET> header
 * and creates one ticket per feedback item.
 */

/** A project returned by GET /api/projects on the Rad-Dash instance. */
export interface RadDashProject {
  id: string;
  name: string;
}

export interface FieldTrackerFeedbackItem {
  id: string;
  shortId: number;
  type: "BUG" | "FEATURE_REQUEST";
  title: string;
  description: string;
  screenshot: string | null;
  videoUrl: string | null;
  pageUrl: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH" | null;
  submittedBy: string;
  createdAt?: string;
}

export interface FieldTrackerWebhookPayload {
  /** Which environment the feedback originated from. */
  environment: "dev" | "prod";
  feedbackItems: FieldTrackerFeedbackItem[];
}
