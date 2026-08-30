import { type LatLng, isValidCoordinate } from "./geo";
import { isInsideAndhraPradesh } from "./domain";
import { loadGoogleMaps } from "./google-maps-loader";

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

// In-memory cache for computed routes
const routesCache = new Map<string, { timestamp: number; routes: CalculatedRoute[] }>();
const ROUTE_CACHE_TTL = 3 * 60 * 1000; // 3 minutes

/**
 * Calculates deterministic, actual road network routes between origin and destination using Google Directions.
 * Supports multiple route options with distance, estimated travel time, and step-by-step turn guidance.
 */
export async function calculateGoogleRoutes(
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
    throw new Error("Route endpoints are outside the Andhra Pradesh operating area.");
  }

  const cacheKey = `${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}->${destination.lat.toFixed(4)},${destination.lng.toFixed(4)}_${travelMode}`;
  const cached = routesCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < ROUTE_CACHE_TTL) {
    return cached.routes;
  }

  const google = await loadGoogleMaps();
  const directionsService = new google.maps.DirectionsService();

  const mode =
    travelMode === "WALKING" ? google.maps.TravelMode.WALKING : google.maps.TravelMode.DRIVING;

  const result = await new Promise<google.maps.DirectionsResult>((resolve, reject) => {
    directionsService.route(
      {
        origin: new google.maps.LatLng(origin.lat, origin.lng),
        destination: new google.maps.LatLng(destination.lat, destination.lng),
        travelMode: mode,
        provideRouteAlternatives: true,
        unitSystem: google.maps.UnitSystem.METRIC,
      },
      (res, status) => {
        if (status === google.maps.DirectionsStatus.OK && res) {
          resolve(res);
        } else {
          reject(new Error(`Directions calculation failed: ${status}`));
        }
      },
    );
  });

  const routes: CalculatedRoute[] = result.routes.map((gRoute, index) => {
    const leg = gRoute.legs[0];
    const distanceMeters = leg?.distance?.value ?? 0;
    const durationSeconds = leg?.duration?.value ?? 0;
    const distanceKm = Number((distanceMeters / 1000).toFixed(2));
    const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));

    // Convert polyline path
    const path: LatLng[] = (gRoute.overview_path || []).map((point) => ({
      lat: point.lat(),
      lng: point.lng(),
    }));

    // Steps
    const steps: RouteStep[] = (leg?.steps ?? []).map((step) => {
      // Strip HTML tags from instructions
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = step.instructions || "";
      const cleanText = tempDiv.textContent || tempDiv.innerText || "";

      return {
        instruction: cleanText,
        distanceText: step.distance?.text || "",
        durationText: step.duration?.text || "",
        lat: step.start_location.lat(),
        lng: step.start_location.lng(),
      };
    });

    const b = gRoute.bounds;
    const bounds = b
      ? {
          minLat: b.getSouthWest().lat(),
          maxLat: b.getNorthEast().lat(),
          minLng: b.getSouthWest().lng(),
          maxLng: b.getNorthEast().lng(),
        }
      : {
          minLat: Math.min(origin.lat, destination.lat),
          maxLat: Math.max(origin.lat, destination.lat),
          minLng: Math.min(origin.lng, destination.lng),
          maxLng: Math.max(origin.lng, destination.lng),
        };

    return {
      id: `route-${index}-${Math.random().toString(36).substring(2, 7)}`,
      summary:
        gRoute.summary || (index === 0 ? "Recommended road route" : `Alternative route ${index}`),
      distanceKm,
      durationMinutes,
      distanceText: leg?.distance?.text || `${distanceKm} km`,
      durationText: leg?.duration?.text || `${durationMinutes} min`,
      path,
      steps,
      bounds,
      isPrimary: index === 0,
      variantIndex: index,
      hazardRisk: "LOW",
      hazardReason: null,
    };
  });

  routesCache.set(cacheKey, { timestamp: Date.now(), routes });
  return routes;
}

/**
 * Builds external Google Maps navigation URI.
 */
export function getExternalNavigationUrl(destination: LatLng, origin?: LatLng): string {
  const base = "https://www.google.com/maps/dir/?api=1";
  const destParam = `destination=${destination.lat},${destination.lng}`;
  const originParam = origin ? `&origin=${origin.lat},${origin.lng}` : "";
  return `${base}&${destParam}${originParam}&travelmode=driving`;
}
