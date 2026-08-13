import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  navigateToProjectDetail,
  handleOfflineProjectLinkClick,
  hasActiveServiceWorker,
  isEffectivelyOffline,
  shouldUseOfflineDocumentNav,
} from "@/lib/offline/offline-project-navigation";

vi.mock("@/lib/offline/pages-cache", () => ({
  openCachedProjectPage: vi.fn(),
}));

import { openCachedProjectPage } from "@/lib/offline/pages-cache";

describe("offline-project-navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("navigator", { onLine: false, serviceWorker: { controller: {} } });
    vi.stubGlobal("location", { assign: vi.fn() });
    vi.stubEnv("NODE_ENV", "production");
    vi.mocked(openCachedProjectPage).mockResolvedValue(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("shouldUseOfflineDocumentNav is true only when offline and pre-downloaded", () => {
    vi.stubGlobal("navigator", { onLine: false, serviceWorker: { controller: {} } });
    expect(shouldUseOfflineDocumentNav(false, true)).toBe(true);
    vi.stubGlobal("navigator", { onLine: true, serviceWorker: { controller: {} } });
    expect(shouldUseOfflineDocumentNav(true, true)).toBe(false);
    expect(shouldUseOfflineDocumentNav(false, false)).toBe(false);
  });

  it("isEffectivelyOffline uses navigator.onLine when React state is still online", () => {
    vi.stubGlobal("navigator", { onLine: false, serviceWorker: { controller: {} } });
    expect(isEffectivelyOffline(true)).toBe(true);
    vi.stubGlobal("navigator", { onLine: true, serviceWorker: { controller: {} } });
    expect(isEffectivelyOffline(true)).toBe(false);
    expect(isEffectivelyOffline(false)).toBe(true);
  });

  it("uses document nav when pre-downloaded and navigator.onLine is false even if isOnline is true", async () => {
    vi.stubGlobal("navigator", { onLine: false, serviceWorker: { controller: {} } });
    vi.mocked(openCachedProjectPage).mockResolvedValue(true);
    const router = { push: vi.fn() };
    const result = await navigateToProjectDetail({
      locale: "en",
      projectId: "proj-1",
      isOnline: true,
      isPreDownloaded: true,
      router,
    });
    expect(result).toBe("document");
    expect(router.push).not.toHaveBeenCalled();
  });

  it("hasActiveServiceWorker reflects controller presence", () => {
    expect(hasActiveServiceWorker()).toBe(true);
    vi.stubGlobal("navigator", { onLine: false, serviceWorker: { controller: null } });
    expect(hasActiveServiceWorker()).toBe(false);
  });

  it("opens from pages-v1 cache when offline + pre-downloaded", async () => {
    vi.mocked(openCachedProjectPage).mockResolvedValue(true);
    const router = { push: vi.fn() };
    const result = await navigateToProjectDetail({
      locale: "en",
      projectId: "proj-1",
      isOnline: false,
      isPreDownloaded: true,
      router,
    });
    expect(result).toBe("document");
    expect(openCachedProjectPage).toHaveBeenCalledWith("en", "proj-1");
    expect(router.push).not.toHaveBeenCalled();
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it("falls back to SW document navigation in production when cache open misses", async () => {
    const router = { push: vi.fn() };
    const result = await navigateToProjectDetail({
      locale: "en",
      projectId: "proj-1",
      isOnline: false,
      isPreDownloaded: true,
      router,
    });
    expect(result).toBe("document");
    expect(window.location.assign).toHaveBeenCalledWith("/en/projects/proj-1");
  });

  it("returns unavailable in dev when cache open misses (no prod SW nav)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const router = { push: vi.fn() };
    const result = await navigateToProjectDetail({
      locale: "en",
      projectId: "proj-1",
      isOnline: false,
      isPreDownloaded: true,
      router,
    });
    expect(result).toBe("unavailable");
    expect(router.push).not.toHaveBeenCalled();
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it("uses router.push when online", async () => {
    vi.stubGlobal("navigator", { onLine: true, serviceWorker: { controller: {} } });
    const router = { push: vi.fn() };
    const result = await navigateToProjectDetail({
      locale: "en",
      projectId: "proj-1",
      isOnline: true,
      isPreDownloaded: true,
      router,
    });
    expect(result).toBe("client");
    expect(router.push).toHaveBeenCalledWith("/projects/proj-1");
  });

  it("handleOfflineProjectLinkClick prevents default when offline + pre-downloaded", async () => {
    vi.mocked(openCachedProjectPage).mockResolvedValue(true);
    const preventDefault = vi.fn();
    const router = { push: vi.fn() };
    const result = await handleOfflineProjectLinkClick(
      { preventDefault },
      { locale: "en", projectId: "p1", isOnline: false, isPreDownloaded: true, router },
    );
    expect(result).toBe("document");
    expect(preventDefault).toHaveBeenCalled();
  });
});
