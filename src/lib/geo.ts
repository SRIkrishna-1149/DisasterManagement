import { AP_BOUNDS, isInsideAndhraPradesh } from "./domain";

export interface LatLng {
  lat: number;
  lng: number;
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

export interface Viewport {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export function inViewport(p: LatLng, v: Viewport): boolean {
  return p.lat >= v.minLat && p.lat <= v.maxLat && p.lng >= v.minLng && p.lng <= v.maxLng;
}

export interface SimulatedRoute {
  points: LatLng[];
  distanceKm: number;
  label: "SIMULATED ROUTE";
  variant: number;
}

/**
 * Deterministic route preview for demo mode. It is deliberately not presented
 * as a road, traffic, or safety guarantee and is rejected if any waypoint
 * leaves the AP operating bounds.
 */
export function generateSimulatedRoute(
  origin: LatLng,
  destination: LatLng,
  variant = 0,
): SimulatedRoute | null {
  if (
    !isValidCoordinate(origin.lat, origin.lng) ||
    !isValidCoordinate(destination.lat, destination.lng) ||
    !isInsideAndhraPradesh(origin.lat, origin.lng) ||
    !isInsideAndhraPradesh(destination.lat, destination.lng)
  )
    return null;

  const bend = variant % 3;
  const midpoint: LatLng = {
    lat: (origin.lat + destination.lat) / 2 + (bend - 1) * 0.035,
    lng: (origin.lng + destination.lng) / 2 + (1 - bend) * 0.045,
  };
  const points = [origin, midpoint, destination];
  if (
    !points.every(
      (point) =>
        point.lat >= AP_BOUNDS.minLat &&
        point.lat <= AP_BOUNDS.maxLat &&
        point.lng >= AP_BOUNDS.minLng &&
        point.lng <= AP_BOUNDS.maxLng,
    )
  )
    return null;

  return {
    points,
    distanceKm: points
      .slice(1)
      .reduce((total, point, index) => total + haversineKm(points[index]!, point), 0),
    label: "SIMULATED ROUTE",
    variant,
  };
}

export function nearbyToRoute<T extends LatLng>(items: T[], route: LatLng[], radiusKm = 2): T[] {
  return items.filter((item) => route.some((point) => haversineKm(item, point) <= radiusKm));
}

export interface Cluster<T> {
  lat: number;
  lng: number;
  items: T[];
}

/** Grid clustering — keeps marker counts low on constrained devices. */
export function clusterPoints<T extends LatLng>(points: T[], cellSize: number): Cluster<T>[] {
  const cells = new Map<string, T[]>();
  for (const p of points) {
    const key = `${Math.floor(p.lat / cellSize)}:${Math.floor(p.lng / cellSize)}`;
    const bucket = cells.get(key);
    if (bucket) bucket.push(p);
    else cells.set(key, [p]);
  }
  return [...cells.values()].map((items) => ({
    lat: items.reduce((s, i) => s + i.lat, 0) / items.length,
    lng: items.reduce((s, i) => s + i.lng, 0) / items.length,
    items,
  }));
}

/** Distance-ordered geospatial+time clustering used for crisis incidents. */
export function clusterIncidents<T extends LatLng & { created_at: string; category?: string }>(
  items: T[],
  radiusKm = 0.5,
  windowMinutes = 90,
): T[][] {
  const groups: T[][] = [];
  for (const item of items) {
    const group = groups.find((g) => {
      const head = g[0]!;
      const dt = Math.abs(
        new Date(item.created_at).getTime() - new Date(head.created_at).getTime(),
      );
      return haversineKm(head, item) <= radiusKm && dt <= windowMinutes * 60_000;
    });
    if (group) group.push(item);
    else groups.push([item]);
  }
  return groups;
}
