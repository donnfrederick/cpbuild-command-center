"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronUp, ChevronsDown, ChevronsUp, Building2, ImageIcon, ImageOff } from "lucide-react";
import {
  applyUnitCardFilters,
  FIELD_TRACKER_SEARCH_DEBOUNCE_MS,
  type ActiveFilters,
  type UnitCard,
} from "@/components/projects/UnitCards";
import { UnitMediaViewRow } from "@/components/projects/UnitMediaViewRow";
import { MediaLocationsSkeleton } from "@/components/projects/MediaLocationsSkeleton";
import { MediaBulkLoadDialog, type MediaBulkLoadPhase } from "@/components/projects/MediaBulkLoadDialog";
import { UnitDetailModalPanel } from "@/components/projects/UnitDetailModalPanel";
import { CustomSiteAreaDetailModal } from "@/components/projects/CustomSiteAreaDetailModal";
import { useOfflineStatus } from "@/hooks/use-offline-status";
import { useRegisterOfflineCacheView } from "@/hooks/use-register-offline-cache-view";
import { fetchCustomSiteLocations } from "@/lib/custom-site-locations-api";
import type { CustomSiteLocation } from "@/lib/custom-site-locations";
import { fetchUnitsWithGridInspection } from "@/lib/inspections/fetch-units-with-grid-inspection";
import {
  buildMediaLocationGroups,
  buildingStripeForKey,
  customSiteLocationToMediaCard,
  customSiteLocationsForBuilding,
  customSiteLocationsForLevel,
  filterCustomSiteLocationsForSearch,
  formatLocationLabel,
  groupMediaRowsIntoUnitCards,
  MISSING_LOCATION_LABEL,
  orderedBuildingKeysFromCards,
  standaloneCustomSiteLocations,
  type MediaUnitRow,
} from "@/lib/media/media-location-list";
import { readSnapshotUnitsForProject } from "@/lib/offline/snapshot-cache";
import { unitRefsNeedingAlbumFetch } from "@/lib/media/unit-album-client-cache";
import type { AlbumSourceType } from "@/lib/media/album-types";
import {
  EMPTY_MEDIA_FILTERS,
  filterLocationGroupsForMediaFilters,
  standaloneCustomVisibleForMediaFilters,
  type MediaActiveFilters,
  unitRefMatchesMediaFilters,
} from "@/lib/media/media-filters";
import { shouldShowCustomSiteLocations } from "@/lib/location-kind-filter";
import { buildUnitsBuildingLevelFilterOptions } from "@/lib/units-location-filter-options";
import { MediaFilterPanel } from "@/components/projects/MediaFilterPanel";
import { buildMediaExportLocations } from "@/lib/media/build-media-export-locations";
import { withMediaExportLocationDetails } from "@/lib/media/format-media-export-location-detail";
import type { MediaExportSnapshot } from "@/lib/media/media-export-types";
import { MEDIA_ALBUM_PDF_MAX_LOCATIONS } from "@/lib/pdf/media-album-export-limits";
import {
  areAllMediaLocationsExpanded,
  computeMediaExpandAllTargets,
  levelSectionKeysWithMedia,
  unitKeysWithMedia,
} from "@/lib/media/media-expand-all";

const BULK_LOAD_DIALOG_MIN = 2;
const MOBILE_BULK_WARN_THRESHOLD = 20;

interface MediaLocationsViewProps {
  projectId: string;
  search: string;
  onSearchChange: (search: string) => void;
  filters: MediaActiveFilters;
  onFiltersChange: (filters: MediaActiveFilters) => void;
  showFilters: boolean;
  onShowFiltersChange: (show: boolean) => void;
  canManageStatus?: boolean;
  canCalibrate?: boolean;
  currentUserId?: string;
  currentUserRole?: string;
  onExportSnapshotChange?: (snapshot: MediaExportSnapshot) => void;
}

function levelSectionKey(buildingKey: string, levelKey: string): string {
  return `${buildingKey}::${levelKey}`;
}

function customBuildingSectionKey(buildingKey: string): string {
  return `custom-building::${buildingKey}`;
}

export function MediaLocationsView({
  projectId,
  search,
  onSearchChange,
  filters,
  onFiltersChange,
  showFilters,
  onShowFiltersChange,
  canManageStatus = false,
  canCalibrate = false,
  currentUserId,
  currentUserRole,
  onExportSnapshotChange,
}: MediaLocationsViewProps) {
  const t = useTranslations("units.mediaView");
  const tUnits = useTranslations("units");
  const tCustom = useTranslations("units.customSite");
  const tAlbum = useTranslations("units.album");
  const { isOnline } = useOfflineStatus();
  const [cards, setCards] = useState<UnitCard[]>([]);
  const [customLocations, setCustomLocations] = useState<CustomSiteLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFromCache, setIsFromCache] = useState(false);
  const [cacheDate, setCacheDate] = useState<string | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  /** Collapsed by default — expand a level to scan its unit rows. */
  const [expandedLevels, setExpandedLevels] = useState<Set<string>>(() => new Set());
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(() => new Set());
  const [unitRefsWithMedia, setUnitRefsWithMedia] = useState<Set<string>>(() => new Set());
  const [sourceTypesByUnitRef, setSourceTypesByUnitRef] = useState<Record<string, AlbumSourceType[]>>({});
  const [coverageLoaded, setCoverageLoaded] = useState(false);
  const [hideWithoutMedia, setHideWithoutMedia] = useState(false);
  const [bulkAlbumLoad, setBulkAlbumLoad] = useState<{
    total: number;
    completed: number;
    pending: Set<string>;
  } | null>(null);
  const [bulkLoadDialogOpen, setBulkLoadDialogOpen] = useState(false);
  const [bulkLoadDialogPhase, setBulkLoadDialogPhase] = useState<MediaBulkLoadPhase>("confirm");
  const [expandedStandaloneCustom, setExpandedStandaloneCustom] = useState(false);
  const [expandedCustomBuildingSections, setExpandedCustomBuildingSections] = useState<Set<string>>(() => new Set());
  const [detailUnitKey, setDetailUnitKey] = useState<string | null>(null);
  const [activeCustomLocation, setActiveCustomLocation] = useState<CustomSiteLocation | null>(null);
  const loadAbortRef = useRef<AbortController | null>(null);
  const coverageLoadedForProjectRef = useRef<string | null>(null);
  const prevDebouncedSearchRef = useRef("");

  useEffect(() => {
    setCoverageLoaded(false);
    setUnitRefsWithMedia(new Set());
    coverageLoadedForProjectRef.current = null;
  }, [projectId]);

  useRegisterOfflineCacheView(isFromCache, cacheDate);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), FIELD_TRACKER_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const loadUnits = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError(null);
    setIsFromCache(false);
    setCacheDate(null);

    const params = new URLSearchParams();
    const q = debouncedSearch.trim();
    if (q) params.set("search", q);

    try {
      const qs = params.toString();
      const [unitsResult, customRows] = await Promise.all([
        fetchUnitsWithGridInspection<MediaUnitRow & { id: string }>(
          projectId,
          `/api/projects/${projectId}/units${qs ? `?${qs}` : ""}`,
          false,
          { signal, cache: "no-store" },
        ),
        fetchCustomSiteLocations(projectId),
      ]);
      if (signal.aborted) return;
      setCards(groupMediaRowsIntoUnitCards(unitsResult.page.units));
      setCustomLocations(customRows);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      const fallback = await readSnapshotUnitsForProject<MediaUnitRow & { id: string; projectId?: string }>(projectId);
      if (fallback) {
        setCards(groupMediaRowsIntoUnitCards(fallback.units as MediaUnitRow[]));
        setIsFromCache(true);
        setCacheDate(fallback.generatedAt);
        setLoading(false);
        return;
      }
      setError(e instanceof Error ? e.message : tUnits("error", { error: "Failed to load" }));
    } finally {
      setLoading(false);
    }
  }, [projectId, debouncedSearch, tUnits]);

  useEffect(() => {
    const controller = new AbortController();
    void loadUnits(controller.signal);
    return () => controller.abort();
  }, [loadUnits]);

  useEffect(() => {
    if (loading) return;
    if (coverageLoadedForProjectRef.current === projectId) return;

    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/album/coverage`, {
          signal: controller.signal,
          cache: isOnline ? "no-store" : "default",
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          unitRefs: string[];
          sourceTypesByUnitRef?: Record<string, AlbumSourceType[]>;
        };
        if (controller.signal.aborted) return;
        setUnitRefsWithMedia(new Set(data.unitRefs));
        setSourceTypesByUnitRef(data.sourceTypesByUnitRef ?? {});
        coverageLoadedForProjectRef.current = projectId;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      } finally {
        if (!controller.signal.aborted) {
          setCoverageLoaded(true);
        }
      }
    })();
    return () => controller.abort();
  }, [projectId, isOnline, loading]);

  const locationFiltersForCards = useMemo((): ActiveFilters => ({
    stages: [],
    scopeTypeNames: [],
    scopeSubNames: [],
    unitTypes: [],
    locationKinds: filters.locationKinds,
    buildings: filters.buildings,
    levels: filters.levels,
    buildPhases: [],
    areas: [],
    issueTypes: [],
    responsibleParties: [],
    issueStatuses: [],
    issueBlocking: null,
    issueScopeTypeNames: [],
    issueSubScopeNames: [],
    inspectionStatuses: [],
    calibrationStatuses: [],
    subcontractorAssigned: null,
    subcontractorIds: [],
    unitsWithIssuesOnly: false,
  }), [filters.buildings, filters.levels, filters.locationKinds]);

  const serverSearchActive = debouncedSearch.trim().length > 0;
  const filteredCards = useMemo(
    () => applyUnitCardFilters(cards, search, locationFiltersForCards, serverSearchActive),
    [cards, search, locationFiltersForCards, serverSearchActive],
  );

  const filteredCustomLocations = useMemo(
    () => filterCustomSiteLocationsForSearch(customLocations, debouncedSearch),
    [customLocations, debouncedSearch],
  );

  const effectiveMediaUnitRefs = useMemo(() => {
    if (filters.mediaSourceTypes.length === 0 && filters.albumSourceTags.length === 0) {
      return unitRefsWithMedia;
    }
    return new Set(
      [...unitRefsWithMedia].filter((ref) =>
        unitRefMatchesMediaFilters(ref, sourceTypesByUnitRef, filters),
      ),
    );
  }, [unitRefsWithMedia, sourceTypesByUnitRef, filters.mediaSourceTypes, filters.albumSourceTags]);

  const applyMediaVisibility = useCallback(
    (unitRef: string) => {
      const needsMediaFilter =
        hideWithoutMedia
        || filters.mediaSourceTypes.length > 0
        || filters.albumSourceTags.length > 0;
      if (!needsMediaFilter) return true;
      return effectiveMediaUnitRefs.has(unitRef);
    },
    [
      hideWithoutMedia,
      filters.mediaSourceTypes.length,
      filters.albumSourceTags.length,
      effectiveMediaUnitRefs,
    ],
  );

  const displayCards = useMemo(
    () => filteredCards.filter((card) => applyMediaVisibility(card.key)),
    [filteredCards, applyMediaVisibility],
  );

  const showCustomSiteLocations = shouldShowCustomSiteLocations(filters);

  const displayCustomLocations = useMemo(() => {
    if (!showCustomSiteLocations) return [];
    return filteredCustomLocations.filter((loc) => applyMediaVisibility(loc.unitRef));
  }, [filteredCustomLocations, showCustomSiteLocations, applyMediaVisibility]);

  const standaloneCustomLocs = useMemo(
    () => standaloneCustomSiteLocations(displayCustomLocations),
    [displayCustomLocations],
  );

  const locationGroups = useMemo(
    () => buildMediaLocationGroups(displayCards),
    [displayCards],
  );

  const orderedBuildingKeys = useMemo(
    () => orderedBuildingKeysFromCards(displayCards),
    [displayCards],
  );

  const orderedCards = useMemo(
    () => locationGroups.flatMap((g) => g.levels.flatMap((lvl) => lvl.units)),
    [locationGroups],
  );

  const detailCard = useMemo(
    () => (detailUnitKey ? orderedCards.find((card) => card.key === detailUnitKey) ?? null : null),
    [detailUnitKey, orderedCards],
  );

  const detailNavIndex = detailCard
    ? orderedCards.findIndex((card) => card.key === detailCard.key)
    : -1;

  const refreshAll = useCallback(() => {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    void loadUnits(controller.signal);
    setActiveCustomLocation(null);
  }, [loadUnits]);

  const buildingDisplayLabel = useCallback(
    (buildingKey: string) =>
      buildingKey === MISSING_LOCATION_LABEL
        ? tUnits("buildingNotSet")
        : formatLocationLabel(buildingKey),
    [tUnits],
  );

  /** When searching, auto-expand every level and unit that still has matches. */
  useEffect(() => {
    const prevSearch = prevDebouncedSearchRef.current;
    prevDebouncedSearchRef.current = debouncedSearch;

    if (!debouncedSearch.trim()) {
      if (prevSearch.trim()) {
        setExpandedLevels(new Set());
        setExpandedUnits(new Set());
        setExpandedStandaloneCustom(false);
        setExpandedCustomBuildingSections(new Set());
      }
      return;
    }
    setExpandedStandaloneCustom(standaloneCustomLocs.length > 0);
    setExpandedLevels(
      new Set(
        locationGroups.flatMap((g) =>
          g.levels.map((lvl) => levelSectionKey(g.buildingKey, lvl.levelKey)),
        ),
      ),
    );
    setExpandedCustomBuildingSections(
      new Set(
        locationGroups
          .map((g) => g.buildingKey)
          .filter((buildingKey) =>
            customSiteLocationsForBuilding(filteredCustomLocations, buildingKey).length > 0,
          )
          .map((buildingKey) => customBuildingSectionKey(buildingKey)),
      ),
    );
    setExpandedUnits(
      new Set([
        ...filteredCards.map((card) => card.key),
        ...filteredCustomLocations.map((loc) => loc.unitRef),
      ]),
    );
  }, [debouncedSearch, locationGroups, filteredCards, filteredCustomLocations, standaloneCustomLocs.length]);

  const setUnitExpanded = useCallback((unitKey: string, open: boolean) => {
    setExpandedUnits((prev) => {
      const next = new Set(prev);
      if (open) next.add(unitKey);
      else next.delete(unitKey);
      return next;
    });
  }, []);

  const toggleLevelSection = useCallback((sectionKey: string, unitKeys: string[]) => {
    const opening = !expandedLevels.has(sectionKey);
    setExpandedLevels((prev) => {
      const next = new Set(prev);
      if (opening) next.add(sectionKey);
      else next.delete(sectionKey);
      return next;
    });
    setExpandedUnits((prev) => {
      const next = new Set(prev);
      if (opening) unitKeys.forEach((key) => next.add(key));
      else unitKeys.forEach((key) => next.delete(key));
      return next;
    });
  }, [expandedLevels]);

  const levelHasMedia = useCallback(
    (units: UnitCard[], levelCustomLocs: CustomSiteLocation[]) =>
      units.some((unit) => effectiveMediaUnitRefs.has(unit.key))
      || levelCustomLocs.some((loc) => effectiveMediaUnitRefs.has(loc.unitRef)),
    [effectiveMediaUnitRefs],
  );

  const toggleCustomBuildingSection = useCallback((buildingKey: string, unitRefs: string[]) => {
    const sectionKey = customBuildingSectionKey(buildingKey);
    const opening = !expandedCustomBuildingSections.has(sectionKey);
    setExpandedCustomBuildingSections((prev) => {
      const next = new Set(prev);
      if (opening) next.add(sectionKey);
      else next.delete(sectionKey);
      return next;
    });
    setExpandedUnits((prev) => {
      const next = new Set(prev);
      if (opening) unitRefs.forEach((key) => next.add(key));
      else unitRefs.forEach((key) => next.delete(key));
      return next;
    });
  }, [expandedCustomBuildingSections]);

  const beginBulkAlbumLoad = useCallback((unitRefs: string[]) => {
    if (unitRefs.length === 0) return;
    const pendingRefs = unitRefsNeedingAlbumFetch(projectId, unitRefs);
    setBulkAlbumLoad({
      total: unitRefs.length,
      completed: unitRefs.length - pendingRefs.length,
      pending: new Set(pendingRefs),
    });
  }, [projectId]);

  const handleAlbumFetchSettled = useCallback((unitRef: string) => {
    setBulkAlbumLoad((prev) => {
      if (!prev?.pending.has(unitRef)) return prev;
      const pending = new Set(prev.pending);
      pending.delete(unitRef);
      const completed = prev.completed + 1;
      if (pending.size === 0) return null;
      return { total: prev.total, completed, pending };
    });
  }, []);

  const renderCustomMediaRows = useCallback(
    (locations: CustomSiteLocation[], showCustomIndicator = false) =>
      locations.map((loc) => (
        <UnitMediaViewRow
          key={loc.unitRef}
          projectId={projectId}
          unitRef={loc.unitRef}
          unitLabel={loc.name}
          card={customSiteLocationToMediaCard(loc)}
          expanded={expandedUnits.has(loc.unitRef)}
          onExpandedChange={(open) => setUnitExpanded(loc.unitRef, open)}
          isCustomLocation={showCustomIndicator}
          onOpenDetail={() => {
            setDetailUnitKey(null);
            setActiveCustomLocation(loc);
          }}
          onAlbumFetchSettled={handleAlbumFetchSettled}
          mediaSourceTypes={filters.mediaSourceTypes}
          albumSourceTags={filters.albumSourceTags}
        />
      )),
    [projectId, expandedUnits, setUnitExpanded, handleAlbumFetchSettled],
  );

  const levelKeysForBuilding = useCallback(
    (building: (typeof locationGroups)[number]) =>
      building.levels.map((lvl) => levelSectionKey(building.buildingKey, lvl.levelKey)),
    [],
  );

  const unitKeysForBuilding = useCallback(
    (building: (typeof locationGroups)[number]) =>
      building.levels.flatMap((lvl) => [
        ...customSiteLocationsForLevel(
          displayCustomLocations,
          building.buildingKey,
          lvl.levelKey,
        ).map((loc) => loc.unitRef),
        ...lvl.units.map((unit) => unit.key),
      ]),
    [displayCustomLocations],
  );

  const buildingCustomUnitRefs = useCallback(
    (building: (typeof locationGroups)[number]) =>
      customSiteLocationsForBuilding(displayCustomLocations, building.buildingKey).map(
        (loc) => loc.unitRef,
      ),
    [displayCustomLocations],
  );

  const levelKeysWithMediaForBuilding = useCallback(
    (building: (typeof locationGroups)[number]) =>
      levelSectionKeysWithMedia(
        building,
        (buildingKey, levelKey) =>
          customSiteLocationsForLevel(displayCustomLocations, buildingKey, levelKey),
        levelHasMedia,
        levelSectionKey,
      ),
    [displayCustomLocations, levelHasMedia],
  );

  const areAllExpandedForBuilding = useCallback(
    (building: (typeof locationGroups)[number]) => {
      const levelKeys = levelKeysWithMediaForBuilding(building);
      const unitKeys = unitKeysWithMedia(unitKeysForBuilding(building), effectiveMediaUnitRefs);
      const buildingCustomWithMedia = unitKeysWithMedia(
        buildingCustomUnitRefs(building),
        effectiveMediaUnitRefs,
      );
      const buildingCustomSectionOpen =
        buildingCustomWithMedia.length === 0
        || expandedCustomBuildingSections.has(customBuildingSectionKey(building.buildingKey));
      if (levelKeys.length === 0 && buildingCustomWithMedia.length === 0) return false;
      return (
        buildingCustomSectionOpen
        && levelKeys.every((key) => expandedLevels.has(key))
        && unitKeys.every((key) => expandedUnits.has(key))
        && buildingCustomWithMedia.every((key) => expandedUnits.has(key))
      );
    },
    [
      expandedLevels,
      expandedUnits,
      expandedCustomBuildingSections,
      levelKeysWithMediaForBuilding,
      unitKeysForBuilding,
      buildingCustomUnitRefs,
      effectiveMediaUnitRefs,
    ],
  );

  const levelDisplayLabel = useCallback(
    (levelKey: string) =>
      levelKey === MISSING_LOCATION_LABEL ? tUnits("levelNotSet") : formatLocationLabel(levelKey),
    [tUnits],
  );

  const buildingUnitCount = useCallback(
    (building: (typeof locationGroups)[number]) => {
      const buildingCustomCount = customSiteLocationsForBuilding(
        displayCustomLocations,
        building.buildingKey,
      ).length;
      const levelCustomCount = building.levels.reduce(
        (n, lvl) =>
          n + customSiteLocationsForLevel(displayCustomLocations, building.buildingKey, lvl.levelKey).length,
        0,
      );
      const unitCount = building.levels.reduce((n, lvl) => n + lvl.units.length, 0);
      return unitCount + buildingCustomCount + levelCustomCount;
    },
    [displayCustomLocations],
  );

  const totalVisibleLocationCount = displayCards.length + displayCustomLocations.length;
  const totalFilteredLocationCount = filteredCards.length + filteredCustomLocations.length;
  const mediaLocationCount = useMemo(() => {
    const visibleCustom = showCustomSiteLocations ? filteredCustomLocations : [];
    const cardCount = filteredCards.filter((card) => effectiveMediaUnitRefs.has(card.key)).length;
    const customCount = visibleCustom.filter((loc) => effectiveMediaUnitRefs.has(loc.unitRef)).length;
    return cardCount + customCount;
  }, [filteredCards, filteredCustomLocations, showCustomSiteLocations, effectiveMediaUnitRefs]);

  const exportFilterSummary = useMemo(() => {
    const parts: string[] = [];
    const q = search.trim();
    if (q) parts.push(t("exportFilterSearch", { query: q }));
    if (hideWithoutMedia) parts.push(t("hideWithoutMediaLabel"));

    const mediaTypeLabels = {
      observation: t("filterMediaTypeObservation"),
      issue: t("filterMediaTypeIssue"),
      inspection: t("filterMediaTypeInspection"),
      general: t("filterMediaTypeGeneral"),
      status_update: t("filterMediaTypeStatusUpdate"),
    } as const;
    for (const key of filters.mediaSourceTypes) {
      parts.push(mediaTypeLabels[key]);
    }

    const sourceTagLabels = {
      observation: tAlbum("sourceObservation"),
      observation_comment: tAlbum("sourceObservationComment"),
      issue: tAlbum("sourceIssue"),
      issue_comment: tAlbum("sourceIssueComment"),
      inspection: tAlbum("sourceInspection"),
      general: tAlbum("sourceGeneral"),
      status_update: tAlbum("sourceStatusUpdate"),
    } as const;
    for (const tag of filters.albumSourceTags) {
      parts.push(sourceTagLabels[tag]);
    }

    if (filters.buildings.length > 0) {
      parts.push(t("exportFilterBuildings", { count: filters.buildings.length }));
    }
    if (filters.levels.length > 0) {
      parts.push(t("exportFilterLevels", { count: filters.levels.length }));
    }
    if (filters.locationKinds.length > 0) {
      parts.push(t("exportFilterLocationKinds", { count: filters.locationKinds.length }));
    }
    return parts.join(" · ") || t("exportAllMedia");
  }, [search, hideWithoutMedia, filters, t, tAlbum]);

  const applyExportVisibility = useCallback(
    /** PDF export always omits locations without media, even when "Media only" is off. */
    (unitRef: string) => effectiveMediaUnitRefs.has(unitRef),
    [effectiveMediaUnitRefs],
  );

  /** Filter-scoped hierarchy for PDF — uses search/building/level filters, not hideWithoutMedia. */
  const exportFilteredLocationGroups = useMemo(
    () =>
      filterLocationGroupsForMediaFilters(
        buildMediaLocationGroups(filteredCards),
        filters,
      ),
    [filteredCards, filters.buildings, filters.levels],
  );

  const exportFilteredCustomLocations = useMemo(() => {
    if (!shouldShowCustomSiteLocations(filters)) return [];
    return filteredCustomLocations;
  }, [filteredCustomLocations, filters]);

  const exportStandaloneCustomLocs = useMemo(
    () => standaloneCustomSiteLocations(exportFilteredCustomLocations),
    [exportFilteredCustomLocations],
  );

  const exportSnapshot = useMemo((): MediaExportSnapshot => {
    const ready = coverageLoaded && !loading;
    if (!ready) {
      return { ready: false, locationCount: 0, request: null };
    }

    const rawLocations = buildMediaExportLocations({
      standaloneCustomLocs: exportStandaloneCustomLocs,
      locationGroups: exportFilteredLocationGroups,
      displayCustomLocations: exportFilteredCustomLocations,
      filters,
      applyMediaVisibility: applyExportVisibility,
      buildingDisplayLabel,
      levelDisplayLabel,
    });

    const locations = withMediaExportLocationDetails(rawLocations, {
      area: (area) => tUnits("locationMetaAreaLabel", { area }),
      buildPhase: (phase) => tUnits("locationMetaPhaseLabel", { phase }),
    });

    if (locations.length === 0) {
      return { ready: true, locationCount: 0, request: null };
    }

    if (locations.length > MEDIA_ALBUM_PDF_MAX_LOCATIONS) {
      return {
        ready: true,
        locationCount: locations.length,
        request: null,
        overLocationLimit: true,
      };
    }

    const sourceLabels = {
      observation: tAlbum("sourceObservation"),
      observation_comment: tAlbum("sourceObservationComment"),
      issue: tAlbum("sourceIssue"),
      issue_comment: tAlbum("sourceIssueComment"),
      inspection: tAlbum("sourceInspection"),
      general: tAlbum("sourceGeneral"),
      status_update: tAlbum("sourceStatusUpdate"),
    } as const;

    return {
      ready: true,
      locationCount: locations.length,
      request: {
        locations,
        filters: {
          mediaSourceTypes: filters.mediaSourceTypes,
          albumSourceTags: filters.albumSourceTags,
        },
        filterSummary: exportFilterSummary,
        sourceLabels,
        standaloneSectionTitle: tCustom("sectionTitle"),
        customLocationBadge: t("customLocationBadge"),
      },
    };
  }, [
    coverageLoaded,
    loading,
    exportStandaloneCustomLocs,
    exportFilteredLocationGroups,
    exportFilteredCustomLocations,
    filters,
    applyExportVisibility,
    buildingDisplayLabel,
    levelDisplayLabel,
    exportFilterSummary,
    tAlbum,
    tCustom,
    t,
    tUnits,
  ]);

  useEffect(() => {
    onExportSnapshotChange?.(exportSnapshot);
  }, [exportSnapshot, onExportSnapshotChange]);

  const locationFilterOptions = useMemo(() => {
    const cardOpts = buildUnitsBuildingLevelFilterOptions(cards);
    const customOpts = buildUnitsBuildingLevelFilterOptions(customLocations);
    const buildings = Array.from(new Set([...cardOpts.buildings, ...customOpts.buildings])).sort();
    const buildingLevels: Record<string, string[]> = {};
    for (const building of buildings) {
      const levels = new Set([
        ...(cardOpts.buildingLevels[building] ?? []),
        ...(customOpts.buildingLevels[building] ?? []),
      ]);
      buildingLevels[building] = Array.from(levels).sort();
    }
    return { buildings, buildingLevels };
  }, [cards, customLocations]);

  const mediaExpandAllTargets = useMemo(
    () =>
      computeMediaExpandAllTargets(
        {
          locationGroups,
          standaloneCustomUnitRefs: standaloneCustomLocs.map((loc) => loc.unitRef),
          customLocsForLevel: (buildingKey, levelKey) =>
            customSiteLocationsForLevel(displayCustomLocations, buildingKey, levelKey),
          customLocsForBuilding: (buildingKey) =>
            customSiteLocationsForBuilding(displayCustomLocations, buildingKey),
          levelHasMedia,
          levelSectionKey,
          customBuildingSectionKey,
        },
        effectiveMediaUnitRefs,
      ),
    [
      locationGroups,
      standaloneCustomLocs,
      displayCustomLocations,
      levelHasMedia,
    ],
  );

  const standaloneMediaCount = useMemo(
    () =>
      unitKeysWithMedia(
        standaloneCustomLocs.map((loc) => loc.unitRef),
        effectiveMediaUnitRefs,
      ).length,
    [standaloneCustomLocs, effectiveMediaUnitRefs],
  );

  const bulkExpandLocationGroups = useMemo(
    () => filterLocationGroupsForMediaFilters(locationGroups, filters),
    [locationGroups, filters.buildings, filters.levels],
  );

  const dialogExpandTargets = useMemo(
    () =>
      computeMediaExpandAllTargets(
        {
          locationGroups: bulkExpandLocationGroups,
          standaloneCustomUnitRefs: standaloneCustomVisibleForMediaFilters(filters)
            ? standaloneCustomLocs.map((loc) => loc.unitRef)
            : [],
          customLocsForLevel: (buildingKey, levelKey) =>
            customSiteLocationsForLevel(displayCustomLocations, buildingKey, levelKey),
          customLocsForBuilding: (buildingKey) =>
            customSiteLocationsForBuilding(displayCustomLocations, buildingKey),
          levelHasMedia,
          levelSectionKey,
          customBuildingSectionKey,
        },
        effectiveMediaUnitRefs,
      ),
    [
      bulkExpandLocationGroups,
      filters.buildings,
      filters.levels,
      standaloneCustomLocs,
      displayCustomLocations,
      levelHasMedia,
      effectiveMediaUnitRefs,
    ],
  );

  const applyExpandTargets = useCallback(
    (targets: ReturnType<typeof computeMediaExpandAllTargets>) => {
      setExpandedStandaloneCustom(targets.expandStandaloneCustom);
      setExpandedCustomBuildingSections(new Set(targets.customBuildingSectionKeys));
      setExpandedLevels(new Set(targets.levelKeys));
      setExpandedUnits(new Set(targets.unitKeys));
    },
    [],
  );

  const openBulkLoadDialog = useCallback((buildingKey: string | null = null) => {
    if (buildingKey) {
      onFiltersChange({
        ...filters,
        buildings: [buildingKey],
        levels: [],
      });
    }
    setBulkLoadDialogPhase("confirm");
    setBulkLoadDialogOpen(true);
  }, [filters, onFiltersChange]);

  const handleBulkLoadStart = useCallback(() => {
    const targets = dialogExpandTargets;
    if (targets.unitKeys.length === 0) return;
    setBulkLoadDialogPhase("loading");
    beginBulkAlbumLoad(targets.unitKeys);
    applyExpandTargets(targets);
  }, [applyExpandTargets, beginBulkAlbumLoad, dialogExpandTargets]);

  const toggleAllForBuilding = useCallback(
    (building: (typeof locationGroups)[number]) => {
      const allLevelKeys = levelKeysForBuilding(building);
      const allUnitKeys = unitKeysForBuilding(building);
      const allBuildingCustom = buildingCustomUnitRefs(building);
      const mediaLevelKeys = levelKeysWithMediaForBuilding(building);
      const mediaUnitKeys = unitKeysWithMedia(allUnitKeys, effectiveMediaUnitRefs);
      const mediaBuildingCustom = unitKeysWithMedia(allBuildingCustom, effectiveMediaUnitRefs);
      const buildingCustomKey = customBuildingSectionKey(building.buildingKey);
      const allOpen = areAllExpandedForBuilding(building);

      if (allOpen) {
        setExpandedCustomBuildingSections((prev) => {
          const next = new Set(prev);
          next.delete(buildingCustomKey);
          return next;
        });
        setExpandedLevels((prev) => {
          const next = new Set(prev);
          allLevelKeys.forEach((key) => next.delete(key));
          return next;
        });
        setExpandedUnits((prev) => {
          const next = new Set(prev);
          [...allUnitKeys, ...allBuildingCustom].forEach((key) => next.delete(key));
          return next;
        });
        setBulkAlbumLoad(null);
        return;
      }

      const mediaKeys = [...mediaUnitKeys, ...mediaBuildingCustom];
      beginBulkAlbumLoad(mediaKeys);
      setExpandedCustomBuildingSections((prev) => {
        const next = new Set(prev);
        if (mediaBuildingCustom.length > 0) next.add(buildingCustomKey);
        return next;
      });
      setExpandedLevels((prev) => {
        const next = new Set(prev);
        mediaLevelKeys.forEach((key) => next.add(key));
        return next;
      });
      setExpandedUnits((prev) => {
        const next = new Set(prev);
        mediaKeys.forEach((key) => next.add(key));
        return next;
      });
    },
    [
      areAllExpandedForBuilding,
      beginBulkAlbumLoad,
      levelKeysForBuilding,
      levelKeysWithMediaForBuilding,
      unitKeysForBuilding,
      buildingCustomUnitRefs,
      effectiveMediaUnitRefs,
    ],
  );

  useEffect(() => {
    if (bulkLoadDialogOpen && bulkLoadDialogPhase === "loading" && bulkAlbumLoad === null) {
      setBulkLoadDialogPhase("done");
    }
  }, [bulkAlbumLoad, bulkLoadDialogOpen, bulkLoadDialogPhase]);

  const allMediaExpanded = useMemo(
    () =>
      areAllMediaLocationsExpanded(mediaExpandAllTargets, {
        expandedLevels,
        expandedUnits,
        expandedCustomBuildingSections,
        expandedStandaloneCustom,
      }),
    [
      mediaExpandAllTargets,
      expandedLevels,
      expandedUnits,
      expandedCustomBuildingSections,
      expandedStandaloneCustom,
    ],
  );

  const collapseAllMedia = useCallback(() => {
    setExpandedLevels(new Set());
    setExpandedUnits(new Set());
    setExpandedStandaloneCustom(false);
    setExpandedCustomBuildingSections(new Set());
    setBulkAlbumLoad(null);
    setBulkLoadDialogOpen(false);
    setBulkLoadDialogPhase("confirm");
  }, []);

  const toggleGlobalMediaExpand = useCallback(() => {
    if (!coverageLoaded) return;
    if (allMediaExpanded) {
      collapseAllMedia();
      return;
    }
    if (mediaLocationCount >= BULK_LOAD_DIALOG_MIN) {
      openBulkLoadDialog(null);
      return;
    }
    const targets = mediaExpandAllTargets;
    beginBulkAlbumLoad(targets.unitKeys);
    applyExpandTargets(targets);
  }, [
    allMediaExpanded,
    applyExpandTargets,
    beginBulkAlbumLoad,
    collapseAllMedia,
    coverageLoaded,
    mediaExpandAllTargets,
    mediaLocationCount,
    openBulkLoadDialog,
  ]);

  if (loading && cards.length === 0) {
    return <MediaLocationsSkeleton loadingLabel={tUnits("loading")} />;
  }

  if (error) {
    return (
      <p style={{ fontSize: 12, color: "var(--error-600)", textAlign: "center", padding: "24px 12px", margin: 0 }} role="alert">
        {error}
      </p>
    );
  }

  if (cards.length === 0 && customLocations.length === 0) {
    return (
      <p style={{ fontSize: 13, color: "var(--neutral-500)", textAlign: "center", padding: "32px 12px", margin: 0 }}>
        {tUnits("noUnits")}
      </p>
    );
  }

  if (filteredCards.length === 0 && filteredCustomLocations.length === 0) {
    return (
      <p style={{ fontSize: 13, color: "var(--neutral-500)", textAlign: "center", padding: "32px 12px", margin: 0 }}>
        {t("noMatch")}
      </p>
    );
  }

  if ((hideWithoutMedia || filters.mediaSourceTypes.length > 0 || filters.albumSourceTags.length > 0) && coverageLoaded && totalVisibleLocationCount === 0) {
    return (
      <p style={{ fontSize: 13, color: "var(--neutral-500)", textAlign: "center", padding: "32px 12px", margin: 0 }}>
        {t("noLocationsWithMedia")}
      </p>
    );
  }

  return (
    <div style={{ paddingBottom: 8 }}>
      <div className="media-toolbar">
        <p className="media-toolbar__summary">
          {coverageLoaded
            ? t("toolbarSummary", {
                withMedia: mediaLocationCount,
                total: totalFilteredLocationCount,
              })
            : t("locationCount", { count: totalFilteredLocationCount })}
        </p>
        <div className="media-toolbar__actions">
          <button
            type="button"
            className={`media-toolbar__btn${hideWithoutMedia ? " media-toolbar__btn--active" : ""}`}
            aria-pressed={hideWithoutMedia}
            disabled={!coverageLoaded}
            aria-label={
              hideWithoutMedia ? t("showAllLocationsAria") : t("hideWithoutMediaAria")
            }
            title={
              hideWithoutMedia ? t("showAllLocationsLabel") : t("hideWithoutMediaLabelShort")
            }
            onClick={() => setHideWithoutMedia((on) => !on)}
          >
            {hideWithoutMedia ? (
              <ImageIcon size={16} aria-hidden style={{ flexShrink: 0 }} />
            ) : (
              <ImageOff size={16} aria-hidden style={{ flexShrink: 0 }} />
            )}
            <span className="media-toolbar__btn-label">
              {hideWithoutMedia ? t("showAllLocationsLabel") : t("hideWithoutMediaLabel")}
            </span>
          </button>
          <button
            type="button"
            className="media-toolbar__btn"
            disabled={!coverageLoaded || mediaLocationCount === 0}
            aria-label={
              !coverageLoaded
                ? t("expandAllWaitingForCoverage")
                : allMediaExpanded
                  ? t("collapseAllMediaGlobalAria")
                  : t("expandAllMediaGlobalAria")
            }
            title={
              allMediaExpanded
                ? t("collapseAllMediaGlobalLabel")
                : t("expandAllMediaGlobalLabel")
            }
            onClick={toggleGlobalMediaExpand}
          >
            {allMediaExpanded ? (
              <ChevronsUp size={16} aria-hidden style={{ flexShrink: 0 }} />
            ) : (
              <ChevronsDown size={16} aria-hidden style={{ flexShrink: 0 }} />
            )}
            <span className="media-toolbar__btn-label">
              {allMediaExpanded
                ? t("collapseAllMediaGlobalLabel")
                : t("expandAllMediaGlobalLabel")}
            </span>
          </button>
        </div>
      </div>

      {standaloneCustomLocs.length > 0 ? (
        <section>
          <button
            type="button"
            aria-expanded={expandedStandaloneCustom}
            aria-controls="media-custom-standalone"
            onClick={() => setExpandedStandaloneCustom((open) => !open)}
            aria-label={
              expandedStandaloneCustom
                ? tCustom("sectionToggleCollapse", { title: tCustom("sectionTitle") })
                : tCustom("sectionToggleExpand", { title: tCustom("sectionTitle") })
            }
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              margin: 0,
              padding: "10px 12px",
              border: "none",
              borderBottom: "1px solid var(--neutral-200)",
              background: expandedStandaloneCustom ? "var(--primary-50)" : "var(--neutral-50)",
              cursor: "pointer",
              textAlign: "left",
              fontFamily: "inherit",
            }}
          >
            <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "var(--primary-700)" }}>
              {tCustom("sectionTitle")}
            </span>
            <span style={{ fontSize: 12, color: "var(--neutral-500)", flexShrink: 0 }}>
              {t("locationCount", { count: standaloneCustomLocs.length })}
            </span>
            <span style={{ flexShrink: 0, color: "var(--neutral-400)", display: "flex" }}>
              {expandedStandaloneCustom ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
            </span>
          </button>
          {expandedStandaloneCustom ? (
            <div id="media-custom-standalone">
              {renderCustomMediaRows(standaloneCustomLocs)}
            </div>
          ) : null}
        </section>
      ) : null}

      {locationGroups.map((building, bIdx) => {
        const buildingStripe = buildingStripeForKey(building.buildingKey, orderedBuildingKeys);
        const buildingName = buildingDisplayLabel(building.buildingKey);
        const buildingCustomLocs = customSiteLocationsForBuilding(
          displayCustomLocations,
          building.buildingKey,
        );
        const buildingCustomSectionKey = customBuildingSectionKey(building.buildingKey);
        const buildingCustomExpanded = expandedCustomBuildingSections.has(buildingCustomSectionKey);
        const buildingCustomContentId = `media-custom-building-${building.buildingKey.replace(/[^a-zA-Z0-9-]/g, "-")}`;

        return (
        <section key={building.buildingKey}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 12px",
              borderTop: bIdx > 0 ? "1px solid var(--neutral-200)" : undefined,
              borderBottom: "1px solid var(--neutral-200)",
              background: "var(--neutral-50)",
            }}
          >
            <span
              aria-hidden
              style={{
                width: 3,
                alignSelf: "stretch",
                minHeight: 20,
                borderRadius: 2,
                backgroundColor: buildingStripe,
                flexShrink: 0,
              }}
            />
            <Building2
              size={14}
              style={{ flexShrink: 0, color: buildingStripe }}
              aria-hidden
            />
            <span
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: 14,
                fontWeight: 700,
                color: "var(--neutral-900)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {t("buildingTitle", { name: buildingName })}
            </span>
            <span
              style={{
                flexShrink: 0,
                fontSize: 13,
                color: "var(--neutral-500)",
              }}
            >
              {t("locationCount", { count: buildingUnitCount(building) })}
            </span>
            {building.levels.length > 0 || buildingCustomLocs.length > 0 ? (
              <button
                type="button"
                disabled={!coverageLoaded}
                onClick={() => {
                  if (!coverageLoaded) return;
                  toggleAllForBuilding(building);
                }}
                aria-label={
                  areAllExpandedForBuilding(building)
                    ? t("collapseAllMediaAria")
                    : t("expandAllMediaAria")
                }
                title={
                  areAllExpandedForBuilding(building)
                    ? t("collapseAllMediaAria")
                    : t("expandAllMediaAria")
                }
                style={{
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 32,
                  height: 32,
                  padding: 0,
                  border: "none",
                  borderRadius: 6,
                  background: "transparent",
                  color: coverageLoaded ? "var(--neutral-500)" : "var(--neutral-300)",
                  cursor: coverageLoaded ? "pointer" : "not-allowed",
                }}
              >
                {areAllExpandedForBuilding(building) ? (
                  <ChevronsUp size={16} aria-hidden />
                ) : (
                  <ChevronsDown size={16} aria-hidden />
                )}
              </button>
            ) : null}
          </div>

          {building.buildingKey !== MISSING_LOCATION_LABEL && buildingCustomLocs.length > 0 ? (
            <div>
              <button
                type="button"
                aria-expanded={buildingCustomExpanded}
                aria-controls={buildingCustomContentId}
                onClick={() =>
                  toggleCustomBuildingSection(
                    building.buildingKey,
                    buildingCustomLocs.map((loc) => loc.unitRef),
                  )
                }
                aria-label={
                  buildingCustomExpanded
                    ? tCustom("buildingSectionToggleCollapse", { title: tCustom("buildingSectionTitle") })
                    : tCustom("buildingSectionToggleExpand", { title: tCustom("buildingSectionTitle") })
                }
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  margin: 0,
                  padding: "10px 12px",
                  border: "none",
                  borderBottom: "1px solid var(--neutral-100)",
                  background: buildingCustomExpanded ? "var(--neutral-50)" : "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "inherit",
                }}
              >
                <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "var(--neutral-800)" }}>
                  {tCustom("buildingSectionTitle")}
                </span>
                <span style={{ fontSize: 13, color: "var(--neutral-500)" }}>
                  {t("locationCount", { count: buildingCustomLocs.length })}
                </span>
                <span style={{ flexShrink: 0, color: "var(--neutral-400)", display: "flex" }}>
                  {buildingCustomExpanded ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
                </span>
              </button>
              {buildingCustomExpanded ? (
                <div id={buildingCustomContentId}>
                  {renderCustomMediaRows(buildingCustomLocs, true)}
                </div>
              ) : null}
            </div>
          ) : null}

          {building.levels.map((level) => {
            const sectionKey = levelSectionKey(building.buildingKey, level.levelKey);
            const levelExpanded = expandedLevels.has(sectionKey);
            const levelLabel = levelDisplayLabel(level.levelKey);
            const levelCustomLocs = customSiteLocationsForLevel(
              displayCustomLocations,
              building.buildingKey,
              level.levelKey,
            );
            const levelUnitKeys = [
              ...levelCustomLocs.map((loc) => loc.unitRef),
              ...level.units.map((unit) => unit.key),
            ];
            const hasPhotos = levelHasMedia(level.units, levelCustomLocs);
            const contentId = `media-level-${sectionKey.replace(/[^a-zA-Z0-9-]/g, "-")}`;

            return (
              <div key={sectionKey}>
                <button
                  type="button"
                  aria-expanded={levelExpanded}
                  aria-controls={contentId}
                  onClick={() => toggleLevelSection(sectionKey, levelUnitKeys)}
                  aria-label={
                    levelExpanded
                      ? t("levelCollapseAria", { level: levelLabel })
                      : t("levelExpandAria", { level: levelLabel })
                  }
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    margin: 0,
                    padding: "10px 12px",
                    border: "none",
                    background: levelExpanded ? "var(--neutral-50)" : "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "inherit",
                  }}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      fontSize: 14,
                      fontWeight: 700,
                      color: "var(--neutral-800)",
                      minWidth: 28,
                    }}
                  >
                    {levelLabel}
                  </span>
                  {hasPhotos ? (
                    <ImageIcon
                      size={14}
                      style={{ flexShrink: 0, color: "var(--primary-600)" }}
                      aria-label={t("levelHasPhotosAria")}
                    />
                  ) : null}
                  <span
                    style={{
                      flex: 1,
                      fontSize: 13,
                      color: "var(--neutral-500)",
                      textAlign: "right",
                    }}
                  >
                    {t("locationCount", { count: level.units.length + levelCustomLocs.length })}
                  </span>
                  <span style={{ flexShrink: 0, color: "var(--neutral-400)", display: "flex" }}>
                    {levelExpanded ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
                  </span>
                </button>

                {levelExpanded ? (
                  <div id={contentId}>
                    {renderCustomMediaRows(levelCustomLocs, true)}
                    {level.units.map((card) => (
                      <UnitMediaViewRow
                        key={card.key}
                        projectId={projectId}
                        unitRef={card.key}
                        unitLabel={card.unit}
                        unitType={card.unitType || undefined}
                        card={card}
                        expanded={expandedUnits.has(card.key)}
                        onExpandedChange={(open) => setUnitExpanded(card.key, open)}
                        onOpenDetail={() => {
                          setActiveCustomLocation(null);
                          setDetailUnitKey(card.key);
                        }}
                        onAlbumFetchSettled={handleAlbumFetchSettled}
                        mediaSourceTypes={filters.mediaSourceTypes}
          albumSourceTags={filters.albumSourceTags}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </section>
        );
      })}
      {detailCard ? (
        <UnitDetailModalPanel
          target={{
            projectId,
            building: detailCard.building,
            level: detailCard.level,
            unit: detailCard.unit,
          }}
          nav={{
            items: orderedCards.map((card) => ({
              building: card.building,
              level: card.level,
              unit: card.unit,
            })),
            index: detailNavIndex,
            onNav: (index) => {
              const next = orderedCards[index];
              if (next) setDetailUnitKey(next.key);
            },
          }}
          canManageStatus={canManageStatus}
          canCalibrate={canCalibrate}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          onClose={() => setDetailUnitKey(null)}
          onRefreshAll={refreshAll}
          desktopPanel
        />
      ) : null}
      {activeCustomLocation ? (
        <CustomSiteAreaDetailModal
          projectId={projectId}
          location={activeCustomLocation}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          desktopPanel
          onClose={() => setActiveCustomLocation(null)}
          onRefresh={refreshAll}
        />
      ) : null}
      <MediaBulkLoadDialog
        open={bulkLoadDialogOpen}
        onOpenChange={setBulkLoadDialogOpen}
        phase={bulkLoadDialogPhase}
        completed={bulkAlbumLoad?.completed ?? 0}
        total={dialogExpandTargets.unitKeys.length}
        search={search}
        onSearchChange={onSearchChange}
        hideWithoutMedia={hideWithoutMedia}
        onHideWithoutMediaChange={setHideWithoutMedia}
        filters={filters}
        onFiltersChange={onFiltersChange}
        locationFilterOptions={locationFilterOptions}
        standaloneMediaCount={standaloneMediaCount}
        onStartLoad={handleBulkLoadStart}
        onCollapseAll={collapseAllMedia}
      />
      {showFilters ? (
        <MediaFilterPanel
          filters={filters}
          options={locationFilterOptions}
          onChange={onFiltersChange}
          onClose={() => onShowFiltersChange(false)}
          onClear={() => onFiltersChange(EMPTY_MEDIA_FILTERS)}
          locationCount={{
            filtered: totalVisibleLocationCount,
            total: totalFilteredLocationCount,
          }}
        />
      ) : null}
    </div>
  );
}
