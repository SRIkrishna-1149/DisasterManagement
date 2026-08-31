import { type LatLng, isValidCoordinate, haversineKm } from "./geo";
import { isInsideAndhraPradesh } from "./domain";
import {
  AP_ROAD_NODES,
  AP_ROAD_SEGMENTS,
  findNearestRoadNode,
  type RoadNode,
  type RoadSegment,
} from "./static-road-network";

export interface RouteStep {
  instruction: string;
  distanceText: string;
  durationText: string;
  lat: number;
  lng: number;
}

export interface CalculatedRoute {
  id: string;
  summary: string;
  distanceKm: number;
  durationMinutes: number;
  distanceText: string;
  durationText: string;
  path: LatLng[];
  steps: RouteStep[];
  bounds: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
  isPrimary: boolean;
  variantIndex: number;
  hazardRisk: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  hazardReason: string | null;
}

interface GraphEdge {
  neighborId: string;
  segment: RoadSegment;
  isForward: boolean;
}

// Build adjacency graph once
const graph = new Map<string, GraphEdge[]>();

for (const node of AP_ROAD_NODES) {
  graph.set(node.id, []);
}

for (const seg of AP_ROAD_SEGMENTS) {
  const fromList = graph.get(seg.fromNodeId);
  if (fromList) {
    fromList.push({ neighborId: seg.toNodeId, segment: seg, isForward: true });
  }
  const toList = graph.get(seg.toNodeId);
  if (toList) {
    toList.push({ neighborId: seg.fromNodeId, segment: seg, isForward: false });
  }
}

const nodeMap = new Map<string, RoadNode>(AP_ROAD_NODES.map((n) => [n.id, n]));

/**
 * A* Pathfinding algorithm on the static Andhra Pradesh road graph.
 */
function findShortestPath(
  startNodeId: string,
  targetNodeId: string,
  travelMode: "DRIVING" | "WALKING" = "DRIVING",
): { segments: RoadSegment[]; forwardFlags: boolean[] } | null {
  if (startNodeId === targetNodeId) {
    return { segments: [], forwardFlags: [] };
  }

  const targetNode = nodeMap.get(targetNodeId);
  if (!targetNode) return null;

  // Priority queue item: [nodeId, currentCost, priority]
  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();
  const cameFrom = new Map<
    string,
    { prevNodeId: string; segment: RoadSegment; isForward: boolean }
  >();

  const openSet = new Set<string>([startNodeId]);
  gScore.set(startNodeId, 0);

  const startNode = nodeMap.get(startNodeId)!;
  const initialH = haversineKm(
    { lat: startNode.lat, lng: startNode.lng },
    { lat: targetNode.lat, lng: targetNode.lng },
  );
  fScore.set(startNodeId, initialH);

  while (openSet.size > 0) {
    // Pick node in openSet with lowest fScore
    let current: string | null = null;
    let lowestF = Infinity;

    for (const nodeId of openSet) {
      const f = fScore.get(nodeId) ?? Infinity;
      if (f < lowestF) {
        lowestF = f;
        current = nodeId;
      }
    }

    if (!current) break;

    if (current === targetNodeId) {
      // Reconstruct path
      const segments: RoadSegment[] = [];
      const forwardFlags: boolean[] = [];
      let curr = targetNodeId;

      while (cameFrom.has(curr)) {
        const edge = cameFrom.get(curr)!;
        segments.unshift(edge.segment);
        forwardFlags.unshift(edge.isForward);
        curr = edge.prevNodeId;
      }

      return { segments, forwardFlags };
    }

    openSet.delete(current);
    const currentG = gScore.get(current) ?? Infinity;
    const neighbors = graph.get(current) || [];

    for (const edge of neighbors) {
      const neighbor = edge.neighborId;
      const neighborNode = nodeMap.get(neighbor);
      if (!neighborNode) continue;

      // Weight based on distance and road quality
      const baseDist = edge.segment.distanceKm;
      const speed = travelMode === "WALKING" ? 5 : edge.segment.speedLimitKmh;
      // In driving mode, we minimize travel time slightly favoring higher-speed national highways
      const weight = travelMode === "WALKING" ? baseDist : baseDist * (80 / Math.max(40, speed));

      const tentativeG = currentG + weight;
      if (tentativeG < (gScore.get(neighbor) ?? Infinity)) {
        cameFrom.set(neighbor, {
          prevNodeId: current,
          segment: edge.segment,
          isForward: edge.isForward,
        });
        gScore.set(neighbor, tentativeG);

        const h = haversineKm(
          { lat: neighborNode.lat, lng: neighborNode.lng },
          { lat: targetNode.lat, lng: targetNode.lng },
        );
        fScore.set(neighbor, tentativeG + h);
        openSet.add(neighbor);
      }
    }
  }

  return null;
}

/**
 * Calculates deterministic road routes using the bundled static Andhra Pradesh road network.
 * Completely local, zero network requests, instant sub-10ms calculation.
 */
export async function calculateStaticRoadRoutes(
  origin: LatLng,
  destination: LatLng,
  travelMode: "DRIVING" | "WALKING" = "DRIVING",
): Promise<CalculatedRoute[]> {
  if (
    !isValidCoordinate(origin.lat, origin.lng) ||
    !isValidCoordinate(destination.lat, destination.lng)
  ) {
    throw new Error("Invalid origin or destination coordinates.");
  }

  if (
    !isInsideAndhraPradesh(origin.lat, origin.lng) &&
    !isInsideAndhraPradesh(destination.lat, destination.lng)
  ) {
    throw new Error("Locations must be within the Andhra Pradesh operations area.");
  }

  const startRoadNode = findNearestRoadNode(origin);
  const targetRoadNode = findNearestRoadNode(destination);

  const pathResult = findShortestPath(startRoadNode.id, targetRoadNode.id, travelMode);

  // Assemble the polyline geometry
  const fullPath: LatLng[] = [origin];
  const steps: RouteStep[] = [];

  const originToStartDist = haversineKm(origin, {
    lat: startRoadNode.lat,
    lng: startRoadNode.lng,
  });

  if (originToStartDist > 0.05) {
    fullPath.push({ lat: startRoadNode.lat, lng: startRoadNode.lng });
    steps.push({
      instruction: `Connect to ${startRoadNode.name}`,
      distanceText: `${originToStartDist.toFixed(1)} km`,
      durationText: `${Math.max(1, Math.round((originToStartDist / (travelMode === "WALKING" ? 4.5 : 40)) * 60))} min`,
      lat: origin.lat,
      lng: origin.lng,
    });
  }

  let totalDistanceKm = originToStartDist;
  let totalTimeHours = originToStartDist / (travelMode === "WALKING" ? 4.5 : 40);

  if (pathResult && pathResult.segments.length > 0) {
    for (let i = 0; i < pathResult.segments.length; i++) {
      const seg = pathResult.segments[i]!;
      const isForward = pathResult.forwardFlags[i]!;
      const segPath = isForward ? seg.path : [...seg.path].reverse();

      // Append points avoiding duplicate endpoints
      for (const pt of segPath) {
        const lastPt = fullPath[fullPath.length - 1];
        if (
          !lastPt ||
          Math.abs(lastPt.lat - pt.lat) > 0.0001 ||
          Math.abs(lastPt.lng - pt.lng) > 0.0001
        ) {
          fullPath.push(pt);
        }
      }

      totalDistanceKm += seg.distanceKm;
      const speed = travelMode === "WALKING" ? 4.8 : seg.speedLimitKmh;
      totalTimeHours += seg.distanceKm / speed;

      const toNode = nodeMap.get(isForward ? seg.toNodeId : seg.fromNodeId);
      steps.push({
        instruction: `Follow ${seg.roadName} towards ${toNode?.name || "corridor"}`,
        distanceText: `${seg.distanceKm.toFixed(1)} km`,
        durationText: `${Math.max(1, Math.round((seg.distanceKm / speed) * 60))} min`,
        lat: segPath[0]?.lat ?? origin.lat,
        lng: segPath[0]?.lng ?? origin.lng,
      });
    }
  }

  const targetToDestDist = haversineKm(
    { lat: targetRoadNode.lat, lng: targetRoadNode.lng },
    destination,
  );

  if (targetToDestDist > 0.05) {
    fullPath.push(destination);
    totalDistanceKm += targetToDestDist;
    totalTimeHours += targetToDestDist / (travelMode === "WALKING" ? 4.5 : 35);
    steps.push({
      instruction: `Arrive at destination (${targetToDestDist.toFixed(1)} km access road)`,
      distanceText: `${targetToDestDist.toFixed(1)} km`,
      durationText: `${Math.max(1, Math.round((targetToDestDist / (travelMode === "WALKING" ? 4.5 : 35)) * 60))} min`,
      lat: targetRoadNode.lat,
      lng: targetRoadNode.lng,
    });
  } else {
    fullPath.push(destination);
    steps.push({
      instruction: "Arrive at destination",
      distanceText: "0 km",
      durationText: "0 min",
      lat: destination.lat,
      lng: destination.lng,
    });
  }

  let minLat = 90;
  let maxLat = -90;
  let minLng = 180;
  let maxLng = -180;

  for (const p of fullPath) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }

  const finalDistKm = Number(totalDistanceKm.toFixed(1));
  const finalDurationMin = Math.max(1, Math.round(totalTimeHours * 60));

  const primarySummary =
    pathResult && pathResult.segments.length > 0
      ? `Via ${Array.from(new Set(pathResult.segments.map((s) => s.roadName))).join(" / ")}`
      : "Local connector route";

  const primaryRoute: CalculatedRoute = {
    id: `static-route-primary-${Date.now()}`,
    summary: primarySummary,
    distanceKm: finalDistKm,
    durationMinutes: finalDurationMin,
    distanceText: `${finalDistKm} km`,
    durationText: `${finalDurationMin} min`,
    path: fullPath,
    steps,
    bounds: { minLat, maxLat, minLng, maxLng },
    isPrimary: true,
    variantIndex: 0,
    hazardRisk: "LOW",
    hazardReason: null,
  };

  return [primaryRoute];
}

/**
 * Generates an optional external navigation link for third-party mapping applications if desired.
 */
export function getExternalNavigationUrl(destination: LatLng, origin?: LatLng): string {
  const base = "https://www.openstreetmap.org/directions?engine=fossgis_osrm_car";
  const routeParam = origin
    ? `&route=${origin.lat}%2C${origin.lng}%3B${destination.lat}%2C${destination.lng}`
    : `&route=%3B${destination.lat}%2C${destination.lng}`;
  return `${base}${routeParam}`;
}
