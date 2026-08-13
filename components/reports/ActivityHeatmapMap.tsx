"use client";

import { MapContainer, TileLayer, CircleMarker, Popup, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  clusterMapPointsAtZoom,
  type HeatmapCluster,
  type HeatmapPoint,
} from "@/lib/activity/heatmap/cluster-map-points";

export interface ActivityHeatmapMapProps {
  mapPoints: HeatmapPoint[];
  actorColors: Record<string, string>;
  projectSite?: { lat: number; lng: number; label: string };
  mapBounds?: { south: number; west: number; north: number; east: number };
}

function FitBounds({ bounds }: { bounds?: ActivityHeatmapMapProps["mapBounds"] }) {
  const map = useMap();
  useEffect(() => {
    if (!bounds) return;
    map.fitBounds(
      L.latLngBounds(
        [bounds.south, bounds.west],
        [bounds.north, bounds.east],
      ),
      { padding: [24, 24] },
    );
  }, [map, bounds]);
  return null;
}

function clusterCountLabel(count: number): string {
  return count > 99 ? "99+" : String(count);
}

function clusterIcon(count: number): L.DivIcon {
  const size = count >= 10 ? 32 : 28;
  const half = size / 2;
  return L.divIcon({
    className: "",
    html: `<div style="background:var(--primary-600);color:var(--neutral-0);border-radius:999px;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;border:2px solid var(--neutral-0);box-shadow:var(--shadow-1)">${clusterCountLabel(count)}</div>`,
    iconSize: [size, size],
    iconAnchor: [half, half],
  });
}

/** Re-clusters on every zoom change so overlapping markers merge/split with the viewport. */
function HeatmapClusterLayer({
  mapPoints,
  actorColors,
}: {
  mapPoints: HeatmapPoint[];
  actorColors: Record<string, string>;
}) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());

  useMapEvents({
    zoomend: () => setZoom(map.getZoom()),
  });

  const { clusters, points } = useMemo(
    () => clusterMapPointsAtZoom(mapPoints, zoom),
    [mapPoints, zoom],
  );

  return (
    <>
      {points.map((p) => (
        <CircleMarker
          key={p.activityLogId}
          center={[p.lat, p.lng]}
          radius={7}
          pathOptions={{
            color: actorColors[p.userId ?? "unknown"] ?? "var(--primary-600)",
            fillColor: actorColors[p.userId ?? "unknown"] ?? "var(--primary-500)",
            fillOpacity: 0.85,
          }}
        />
      ))}
      {clusters.map((c) => (
        <ClusterMarker key={clusterKey(c)} cluster={c} />
      ))}
    </>
  );
}

function clusterKey(c: HeatmapCluster): string {
  return `${c.lat.toFixed(6)}:${c.lng.toFixed(6)}:${c.activityLogIds.join(",")}`;
}

function ClusterMarker({ cluster }: { cluster: HeatmapCluster }) {
  const t = useTranslations("activityHeatmap");
  return (
    <Marker
      position={[cluster.lat, cluster.lng]}
      icon={clusterIcon(cluster.count)}
    >
      <Popup>
        {t("clusterPopupActivities", { count: cluster.count })}
        <br />
        <span style={{ fontSize: 11, color: "var(--neutral-600)" }}>
          {t("clusterPopupZoomHint")}
        </span>
      </Popup>
    </Marker>
  );
}

/** Leaflet map layer — client-only (dynamic import). */
export default function ActivityHeatmapMap({
  mapPoints,
  actorColors,
  projectSite,
  mapBounds,
}: ActivityHeatmapMapProps) {
  const center: [number, number] = projectSite
    ? [projectSite.lat, projectSite.lng]
    : mapPoints[0]
      ? [mapPoints[0].lat, mapPoints[0].lng]
      : [39.8283, -98.5795];

  return (
    <MapContainer
      center={center}
      zoom={14}
      style={{ height: "100%", width: "100%", minHeight: 280 }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds bounds={mapBounds} />
      {projectSite ? (
        <CircleMarker
          center={[projectSite.lat, projectSite.lng]}
          radius={8}
          pathOptions={{ color: "var(--primary-600)", fillColor: "var(--primary-400)", fillOpacity: 0.9 }}
        >
          <Popup>{projectSite.label || "Project site"}</Popup>
        </CircleMarker>
      ) : null}
      {mapPoints.length > 0 ? (
        <HeatmapClusterLayer mapPoints={mapPoints} actorColors={actorColors} />
      ) : null}
    </MapContainer>
  );
}
