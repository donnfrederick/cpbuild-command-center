/** Dispatched after pending offline mutations are flushed so open unit modals can re-fetch counts and attachment URLs. */
export const OFFLINE_SYNC_COMPLETE_EVENT = "offline-sync-complete";

/**
 * Dispatched by EagerSyncActivator after a successful auto-warm so the
 * use-offline-sync hook can update its in-memory projectSyncedAt without
 * waiting for the next full layout remount.
 *
 * detail: { projectId: string; syncedAt: string } (ISO timestamp)
 */
export const OFFLINE_SNAPSHOT_SYNCED_EVENT = "offline-snapshot-synced";
