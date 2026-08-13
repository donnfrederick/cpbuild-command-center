/**
 * Shared IndexedDB connection for inspection offline data:
 *   - pendingInspections (completed submissions awaiting sync)
 *   - inspectionDrafts (in-progress fill state)
 */

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { InspectionDraft } from "@/lib/inspections/inspection-draft";
import type { PendingInspection } from "@/lib/inspections/inspectionOfflineDb";

export const CPB_INSPECTION_DB_NAME = "cpb-command-center";
export const CPB_INSPECTION_DB_VERSION = 3;

export interface CpbInspectionSchema extends DBSchema {
  pendingInspections: {
    key: string;
    value: PendingInspection;
    indexes: {
      by_scope: string;
      by_unit: string;
      /**
       * idb DBSchema typings disallow boolean index types; typed as number to satisfy TS.
       * Not queried at runtime — getAllPending() uses getAll + JS filter; getPendingByScope()
       * uses by_scope and filters synced in JS.
       */
      by_synced: number;
    };
  };
  inspectionDrafts: {
    key: string;
    value: InspectionDraft;
    indexes: {
      by_scope: string;
      by_unit: string;
    };
  };
}

let _db: IDBPDatabase<CpbInspectionSchema> | null = null;

/** Serializes IDB reads/writes — Safari throws if transactions overlap while a connection is closing. */
let dbTaskTail: Promise<void> = Promise.resolve();

/**
 * Run one IndexedDB read/write against the shared inspection DB.
 *
 * Top-level callers are serialized via a promise-chain mutex so overlapping
 * transactions never run while Safari is closing the connection.
 *
 * **Not re-entrant:** do not call this from inside a callback already scheduled
 * by `runCpbInspectionDbTask` — the inner call waits for the outer task to
 * finish, while the outer task awaits the inner call → deadlock. Compose
 * multi-step flows as sequential top-level awaits instead (e.g.
 * `await queueInspection(...); await deleteDraft(...)`).
 */
export function runCpbInspectionDbTask<T>(fn: () => Promise<T>): Promise<T> {
  const run = dbTaskTail.then(fn);
  dbTaskTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function getCpbInspectionDb(): Promise<IDBPDatabase<CpbInspectionSchema>> {
  if (_db) return _db;
  _db = await openDB<CpbInspectionSchema>(CPB_INSPECTION_DB_NAME, CPB_INSPECTION_DB_VERSION, {
    upgrade(db, oldVersion, _newVersion, transaction) {
      if (oldVersion < 1) {
        const store = db.createObjectStore("pendingInspections", {
          keyPath: "localId",
        });
        store.createIndex("by_scope", "scopeRowId");
        store.createIndex("by_unit", "unitId");
        store.createIndex("by_synced", "synced");
      }
      if (oldVersion < 2 && !db.objectStoreNames.contains("inspectionDrafts")) {
        const draftStore = db.createObjectStore("inspectionDrafts", {
          keyPath: "draftKey",
        });
        draftStore.createIndex("by_scope", "scopeRowId");
        draftStore.createIndex("by_unit", "unitId");
      } else if (oldVersion < 3 && db.objectStoreNames.contains("inspectionDrafts")) {
        const draftStore = transaction.objectStore("inspectionDrafts");
        if (!draftStore.indexNames.contains("by_unit")) {
          draftStore.createIndex("by_unit", "unitId");
        }
      }
    },
  });
  _db.onversionchange = () => {
    _db?.close();
    _db = null;
  };
  return _db;
}

/** Test-only reset so unit tests get a fresh DB singleton. */
export function resetCpbInspectionDbForTests(): void {
  _db?.close();
  _db = null;
  dbTaskTail = Promise.resolve();
}

/** Drop the inspection DB entirely — use in test beforeEach after version bumps. */
export async function deleteCpbInspectionDbForTests(): Promise<void> {
  resetCpbInspectionDbForTests();
  if (typeof indexedDB === "undefined") return;
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(CPB_INSPECTION_DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("deleteDatabase failed"));
    req.onblocked = () => resolve();
  });
}
