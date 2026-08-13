import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

const localStorageStore: Record<string, string> = {};
const blobStore = new Map<string, { data: ArrayBuffer; mimeType: string; fileName: string }>();

vi.mock("@/lib/offline/blob-store", () => ({
  storeBlobVerified: vi.fn(async (file: File) => {
    const id = `blob-${file.name}-${file.size}`;
    blobStore.set(id, {
      data: await file.arrayBuffer(),
      mimeType: file.type,
      fileName: file.name,
    });
    return id;
  }),
  getBlob: vi.fn(async (id: string) => {
    const entry = blobStore.get(id);
    if (!entry) return null;
    return new Blob([entry.data], { type: entry.mimeType });
  }),
  getBlobMeta: vi.fn(async (id: string) => {
    const entry = blobStore.get(id);
    if (!entry) return null;
    return { id, mimeType: entry.mimeType, fileName: entry.fileName, createdAt: Date.now() };
  }),
  deleteBlob: vi.fn(async (id: string) => {
    blobStore.delete(id);
  }),
}));

import {
  clearObservationDraft,
  hasMeaningfulObservationDraft,
  loadObservationDraft,
  observationDraftStorageKey,
  restoreObservationDraftMedia,
  saveObservationDraft,
  type ObservationDraftRecord,
} from "@/lib/offline/observation-draft-storage";

vi.stubGlobal("localStorage", {
  getItem: (key: string) => localStorageStore[key] ?? null,
  setItem: (key: string, value: string) => { localStorageStore[key] = value; },
  removeItem: (key: string) => { delete localStorageStore[key]; },
  clear: () => { Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k]); },
});

const PROJECT_ID = "proj-1";
const UNIT_REF = "B1|L5|U203";

function makeDraft(overrides: Partial<ObservationDraftRecord> = {}): ObservationDraftRecord {
  return {
    version: 1,
    selectedRowIds: ["scope-1"],
    title: "Safety issue on L5",
    obsType: "SAFETY",
    description: "Missing guardrail",
    media: [],
    savedAt: Date.now(),
    ...overrides,
  };
}

describe("observation draft storage", () => {
  beforeEach(() => {
    localStorageStore[observationDraftStorageKey(PROJECT_ID, UNIT_REF)] = "";
    delete localStorageStore[observationDraftStorageKey(PROJECT_ID, UNIT_REF)];
    blobStore.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k]);
    blobStore.clear();
  });

  it("hasMeaningfulObservationDraft detects text, type, and media", () => {
    expect(hasMeaningfulObservationDraft(makeDraft({ title: "", description: "", obsType: "" }))).toBe(false);
    expect(hasMeaningfulObservationDraft(makeDraft({ obsType: "SAFETY" }))).toBe(true);
    expect(hasMeaningfulObservationDraft(makeDraft({
      media: [{ clientId: "c1", blobId: "b1", mimeType: "image/jpeg", caption: "" }],
    }))).toBe(true);
  });

  it("saveObservationDraft stores text in localStorage and blobs in blob store", async () => {
    const file = new File(["photo"], "walk.jpg", { type: "image/jpeg" });
    const blobMap = await saveObservationDraft({
      projectId: PROJECT_ID,
      unitRef: UNIT_REF,
      selectedRowIds: ["scope-1"],
      title: "Progress note",
      obsType: "PROGRESS",
      description: "Drywall started",
      stagedMedia: [{
        clientId: "media-1",
        file,
        mimeType: "image/jpeg",
        caption: "North wall",
      }],
      blobIdsByClientId: new Map(),
    });

    expect(blobMap.get("media-1")).toBeTruthy();
    const loaded = loadObservationDraft(PROJECT_ID, UNIT_REF);
    expect(loaded?.title).toBe("Progress note");
    expect(loaded?.media).toHaveLength(1);
    expect(loaded?.media[0]?.caption).toBe("North wall");
  });

  it("restoreObservationDraftMedia rehydrates staged files", async () => {
    const file = new File(["photo"], "walk.jpg", { type: "image/jpeg" });
    const blobMap = await saveObservationDraft({
      projectId: PROJECT_ID,
      unitRef: UNIT_REF,
      selectedRowIds: [],
      title: "x",
      obsType: "OTHER",
      description: "",
      stagedMedia: [{ clientId: "media-1", file, mimeType: "image/jpeg", caption: "" }],
      blobIdsByClientId: new Map(),
    });

    const loaded = loadObservationDraft(PROJECT_ID, UNIT_REF)!;
    const restored = await restoreObservationDraftMedia(loaded);
    expect(restored).toHaveLength(1);
    expect(restored[0]?.file.name).toBe("walk.jpg");
    expect(restored[0]?.localUrl.startsWith("blob:")).toBe(true);
    expect(blobMap.get("media-1")).toBe(loaded.media[0]?.blobId);
  });

  it("clearObservationDraft removes localStorage and blob entries", async () => {
    const file = new File(["photo"], "walk.jpg", { type: "image/jpeg" });
    await saveObservationDraft({
      projectId: PROJECT_ID,
      unitRef: UNIT_REF,
      selectedRowIds: [],
      title: "x",
      obsType: "QUALITY",
      description: "",
      stagedMedia: [{ clientId: "media-1", file, mimeType: "image/jpeg", caption: "" }],
      blobIdsByClientId: new Map(),
    });

    await clearObservationDraft(PROJECT_ID, UNIT_REF);
    expect(loadObservationDraft(PROJECT_ID, UNIT_REF)).toBeNull();
    expect(blobStore.size).toBe(0);
  });

  it("loadObservationDraft returns null for expired drafts", async () => {
    const file = new File(["photo"], "walk.jpg", { type: "image/jpeg" });
    await saveObservationDraft({
      projectId: PROJECT_ID,
      unitRef: UNIT_REF,
      selectedRowIds: [],
      title: "old",
      obsType: "SAFETY",
      description: "",
      stagedMedia: [{ clientId: "media-1", file, mimeType: "image/jpeg", caption: "" }],
      blobIdsByClientId: new Map(),
    });

    const key = observationDraftStorageKey(PROJECT_ID, UNIT_REF);
    const parsed = JSON.parse(localStorageStore[key]!) as ObservationDraftRecord;
    parsed.savedAt = Date.now() - (25 * 60 * 60 * 1000);
    localStorageStore[key] = JSON.stringify(parsed);

    expect(loadObservationDraft(PROJECT_ID, UNIT_REF)).toBeNull();
    expect(localStorageStore[key]).toBeUndefined();
  });
});
