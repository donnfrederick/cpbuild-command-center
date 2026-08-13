import { vi } from "vitest";

/** `server-only` throws outside Next.js; API route imports pull it via feedback merge helpers. */
vi.mock("server-only", () => ({}));

/** Field activity logs — routes use voidLogFieldActivity instead of raw logActivity. */
vi.mock("@/lib/activity/log-field-activity", () => ({
  voidLogFieldActivity: vi.fn(),
  logFieldActivity: vi.fn().mockResolvedValue("activity-log-test-id"),
}));

vi.mock("@/lib/activity/persist-activity-location", () => ({
  attachActivityLocationAfterLog: vi.fn().mockResolvedValue(undefined),
  persistActivityLocationContext: vi.fn().mockResolvedValue(undefined),
  promoteActivityLocationFromMedia: vi.fn().mockResolvedValue(undefined),
}));

/** Capture context promotion — exercised in unit tests; integration mocks use minimal db. */
vi.mock("@/lib/field-media/promote-upload-capture-context", () => ({
  promoteUploadCaptureContextsForStorageKeys: vi.fn().mockResolvedValue(undefined),
  promoteUploadCaptureContextsFromAttachments: vi.fn().mockResolvedValue(undefined),
}));
