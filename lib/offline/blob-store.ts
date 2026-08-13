/**
 * Offline blob store — native IndexedDB.
 *
 * DB: "cc-offline-blobs", store: "blobs"
 *
 * Blobs are stored here when the device is offline and the user captures
 * a photo or video. When the mutation queue flushes on reconnect, each
 * blob is uploaded to Supabase Storage and the real URL is substituted
 * into the mutation body before the write API is called.
 */

const DB_NAME = "cc-offline-blobs";
const STORE_NAME = "blobs";
const DB_VERSION = 1;

export interface StoredBlob {
  id: string;
  mimeType: string;
  data: ArrayBuffer;
  fileName: string;
  createdAt: number;
}

// ─── IDB helpers ─────────────────────────────────────────────────────────────

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function dbRequest<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    const store = tx.objectStore(STORE_NAME);
    const req = action(store);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
    req.onsuccess = () => {
      tx.oncomplete = () => resolve(req.result);
    };
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function storeBlob(file: File): Promise<string> {
  const id = `blob-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const data = await file.arrayBuffer();
  const entry: StoredBlob = {
    id,
    mimeType: file.type,
    data,
    fileName: file.name,
    createdAt: Date.now(),
  };
  const db = await openDb();
  try {
    await dbRequest(db, "readwrite", (store) => store.put(entry));
  } finally {
    db.close();
  }
  return id;
}

export class BlobStoreVerificationError extends Error {
  constructor(message = "Photo could not be saved on this device") {
    super(message);
    this.name = "BlobStoreVerificationError";
  }
}

/**
 * storeBlob + immediate read-back so callers never enqueue a mutation whose blob
 * was lost (iOS storage pressure, IDB write failure, etc.).
 */
export async function storeBlobVerified(file: File): Promise<string> {
  const id = await storeBlob(file);
  const blob = await getBlob(id);
  if (!blob || blob.size === 0) {
    await deleteBlob(id).catch(() => undefined);
    throw new BlobStoreVerificationError();
  }
  return id;
}

/**
 * Retrieve a stored blob as a Blob object, or null if not found.
 */
export async function getBlob(id: string): Promise<Blob | null> {
  const db = await openDb();
  try {
    const entry = await dbRequest<StoredBlob | undefined>(db, "readonly", (store) =>
      store.get(id) as IDBRequest<StoredBlob | undefined>
    );
    if (!entry) return null;
    return new Blob([entry.data], { type: entry.mimeType });
  } finally {
    db.close();
  }
}

/**
 * Retrieve a stored blob's metadata (without the data buffer).
 */
export async function getBlobMeta(id: string): Promise<Omit<StoredBlob, "data"> | null> {
  const db = await openDb();
  try {
    const entry = await dbRequest<StoredBlob | undefined>(db, "readonly", (store) =>
      store.get(id) as IDBRequest<StoredBlob | undefined>
    );
    if (!entry) return null;
    const { data: _data, ...meta } = entry;
    void _data;
    return meta;
  } finally {
    db.close();
  }
}

/**
 * Delete a stored blob after it has been uploaded.
 */
export async function deleteBlob(id: string): Promise<void> {
  const db = await openDb();
  try {
    await dbRequest(db, "readwrite", (store) => store.delete(id));
  } finally {
    db.close();
  }
}

/**
 * Delete all blobs older than maxAgeMs (default: 7 days).
 * Call periodically to avoid unbounded storage growth.
 */
export async function pruneOldBlobs(maxAgeMs = 7 * 24 * 60 * 60 * 1000): Promise<number> {
  const cutoff = Date.now() - maxAgeMs;
  const db = await openDb();
  let all: StoredBlob[];
  try {
    all = await dbRequest<StoredBlob[]>(db, "readonly", (store) =>
      store.getAll() as IDBRequest<StoredBlob[]>
    );
  } finally {
    db.close();
  }

  const stale = all.filter((b) => b.createdAt < cutoff);
  await Promise.all(stale.map((b) => deleteBlob(b.id)));
  return stale.length;
}
