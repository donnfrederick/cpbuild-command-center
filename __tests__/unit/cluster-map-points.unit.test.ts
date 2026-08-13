import { describe, expect, it } from "vitest";
import {
  clusterMapPoints,
  clusterMapPointsAtZoom,
} from "@/lib/activity/heatmap/cluster-map-points";

describe("clusterMapPoints()", () => {
  it("clusters points within 50m and leaves distant singletons", () => {
    const points = [
      { activityLogId: "a", lat: 40.0, lng: -105.0, userId: "u1", projectId: "p1" },
      { activityLogId: "b", lat: 40.00001, lng: -105.00001, userId: "u1", projectId: "p1" },
      { activityLogId: "c", lat: 41.0, lng: -106.0, userId: "u2", projectId: "p1" },
    ];
    const { clusters, points: singletons } = clusterMapPoints(points);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.count).toBe(2);
    expect(singletons).toHaveLength(1);
    expect(singletons[0]!.activityLogId).toBe("c");
  });
});

describe("clusterMapPointsAtZoom()", () => {
  const nearPair = [
    { activityLogId: "a", lat: 40.7128, lng: -74.006, userId: "u1", projectId: "p1" },
    { activityLogId: "b", lat: 40.71285, lng: -74.00605, userId: "u1", projectId: "p1" },
  ];
  const farApart = [
    { activityLogId: "a", lat: 40.7128, lng: -74.006, userId: "u1", projectId: "p1" },
    { activityLogId: "b", lat: 40.72, lng: -74.02, userId: "u1", projectId: "p1" },
  ];

  it("merges visually overlapping points at low zoom", () => {
    const lowZoom = clusterMapPointsAtZoom(nearPair, 12);
    expect(lowZoom.clusters).toHaveLength(1);
    expect(lowZoom.clusters[0]!.count).toBe(2);
    expect(lowZoom.points).toHaveLength(0);
  });

  it("splits nearby points into singles at high zoom when they no longer overlap on screen", () => {
    const highZoom = clusterMapPointsAtZoom(farApart, 18);
    expect(highZoom.clusters).toHaveLength(0);
    expect(highZoom.points).toHaveLength(2);
  });

  it("always merges identical coordinates regardless of zoom", () => {
    const duplicate = [
      { activityLogId: "a", lat: 40.0, lng: -105.0, userId: "u1", projectId: "p1" },
      { activityLogId: "b", lat: 40.0, lng: -105.0, userId: "u2", projectId: "p1" },
    ];
    const result = clusterMapPointsAtZoom(duplicate, 19);
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0]!.count).toBe(2);
  });
});
