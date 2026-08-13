import { haversineDistanceMeters } from "@/lib/geo/haversine";

export const HEATMAP_CLUSTER_RADIUS_METERS = 50;

/** Screen-space radius for map clustering — markers within this many px merge at the current zoom. */
export const HEATMAP_CLUSTER_PIXEL_RADIUS = 40;

export interface HeatmapPoint {
  activityLogId: string;
  lat: number;
  lng: number;
  userId: string | null;
  projectId: string;
}

export interface HeatmapCluster {
  lat: number;
  lng: number;
  count: number;
  activityLogIds: string[];
  userCounts: Record<string, number>;
}

/** Greedy haversine clustering — ~50m radius by default. */
export function clusterMapPoints(
  points: HeatmapPoint[],
  radiusMeters: number = HEATMAP_CLUSTER_RADIUS_METERS,
): { clusters: HeatmapCluster[]; points: HeatmapPoint[] } {
  if (points.length === 0) return { clusters: [], points: [] };

  const remaining = [...points];
  const clusters: HeatmapCluster[] = [];
  const singletons: HeatmapPoint[] = [];

  while (remaining.length > 0) {
    const seed = remaining.shift()!;
    const members: HeatmapPoint[] = [seed];

    for (let i = remaining.length - 1; i >= 0; i--) {
      const candidate = remaining[i]!;
      const dist = haversineDistanceMeters(seed.lat, seed.lng, candidate.lat, candidate.lng);
      if (dist <= radiusMeters) {
        members.push(candidate);
        remaining.splice(i, 1);
      }
    }

    if (members.length === 1) {
      singletons.push(seed);
      continue;
    }

    const lat = members.reduce((s, p) => s + p.lat, 0) / members.length;
    const lng = members.reduce((s, p) => s + p.lng, 0) / members.length;
    const userCounts: Record<string, number> = {};
    for (const m of members) {
      const key = m.userId ?? "unknown";
      userCounts[key] = (userCounts[key] ?? 0) + 1;
    }

    clusters.push({
      lat,
      lng,
      count: members.length,
      activityLogIds: members.map((m) => m.activityLogId),
      userCounts,
    });
  }

  return { clusters, points: singletons };
}

/** Web Mercator world pixel at zoom (matches Leaflet tile math). */
export function latLngToWorldPixel(
  lat: number,
  lng: number,
  zoom: number,
): { x: number; y: number } {
  const scale = 256 * 2 ** zoom;
  const x = scale * (lng / 360 + 0.5);
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const y = scale * (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI));
  return { x, y };
}

function buildClusterFromMembers(members: HeatmapPoint[]): HeatmapCluster {
  const lat = members.reduce((s, p) => s + p.lat, 0) / members.length;
  const lng = members.reduce((s, p) => s + p.lng, 0) / members.length;
  const userCounts: Record<string, number> = {};
  for (const m of members) {
    const key = m.userId ?? "unknown";
    userCounts[key] = (userCounts[key] ?? 0) + 1;
  }
  return {
    lat,
    lng,
    count: members.length,
    activityLogIds: members.map((m) => m.activityLogId),
    userCounts,
  };
}

/**
 * Cluster by on-screen overlap at the given zoom — radius shrinks in ground meters as
 * the user zooms in, so clusters split into smaller groups or individual markers.
 */
export function clusterMapPointsAtZoom(
  points: HeatmapPoint[],
  zoom: number,
  pixelRadius: number = HEATMAP_CLUSTER_PIXEL_RADIUS,
): { clusters: HeatmapCluster[]; points: HeatmapPoint[] } {
  if (points.length === 0) return { clusters: [], points: [] };

  type PixelPoint = HeatmapPoint & { px: number; py: number };
  const remaining: PixelPoint[] = points.map((p) => {
    const { x, y } = latLngToWorldPixel(p.lat, p.lng, zoom);
    return { ...p, px: x, py: y };
  });

  const clusters: HeatmapCluster[] = [];
  const singletons: HeatmapPoint[] = [];

  while (remaining.length > 0) {
    const seed = remaining.shift()!;
    const members: HeatmapPoint[] = [seed];

    for (let i = remaining.length - 1; i >= 0; i--) {
      const candidate = remaining[i]!;
      const distPx = Math.hypot(candidate.px - seed.px, candidate.py - seed.py);
      if (distPx <= pixelRadius) {
        members.push(candidate);
        remaining.splice(i, 1);
      }
    }

    if (members.length === 1) {
      singletons.push(seed);
      continue;
    }

    clusters.push(buildClusterFromMembers(members));
  }

  return { clusters, points: singletons };
}

export function computeMapBounds(
  coords: Array<{ lat: number; lng: number }>,
): { south: number; west: number; north: number; east: number } | undefined {
  if (coords.length === 0) return undefined;
  let south = coords[0]!.lat;
  let north = coords[0]!.lat;
  let west = coords[0]!.lng;
  let east = coords[0]!.lng;
  for (const c of coords) {
    south = Math.min(south, c.lat);
    north = Math.max(north, c.lat);
    west = Math.min(west, c.lng);
    east = Math.max(east, c.lng);
  }
  return { south, west, north, east };
}
