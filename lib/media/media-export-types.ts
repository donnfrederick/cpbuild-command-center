import type { AlbumSourceType } from "@/lib/media/album-types";
import type { MediaSourceFilterKey } from "@/lib/media/media-filters";

export type MediaExportLocationKind = "standalone_custom" | "building_custom" | "unit";

export interface MediaExportLocationEntry {
  unitRef: string;
  label: string;
  kind: MediaExportLocationKind;
  buildingKey?: string | null;
  levelKey?: string | null;
  buildingLabel?: string | null;
  levelLabel?: string | null;
  area?: string | null;
  buildPhase?: string | null;
  /** Preformatted building · level · area · phase line for PDF headers. */
  detailLine?: string | null;
}

export interface MediaAlbumExportFilters {
  mediaSourceTypes: MediaSourceFilterKey[];
  albumSourceTags: AlbumSourceType[];
}

export interface MediaAlbumExportRequest {
  locations: MediaExportLocationEntry[];
  filters: MediaAlbumExportFilters;
  filterSummary: string;
  projectName?: string;
  sourceLabels: Record<AlbumSourceType, string>;
  standaloneSectionTitle?: string;
  customLocationBadge?: string;
}

export interface MediaExportSnapshot {
  ready: boolean;
  /** Locations with media that match current filters. */
  locationCount: number;
  request: MediaAlbumExportRequest | null;
  /** Set when locationCount exceeds server export cap — button stays disabled with tooltip. */
  overLocationLimit?: boolean;
}
