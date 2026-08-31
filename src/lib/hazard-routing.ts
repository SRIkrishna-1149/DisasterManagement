import { type LatLng, haversineKm } from "./geo";
import type { CalculatedRoute } from "./static-router";

export interface HazardZone {
  id: string;
  title: string;
  lat: number;
  lng: number;
  radiusKm: number;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  disasterType: string;
  source: string;
}

/**
 * Checks a calculated road route against active disaster hazard zones and alerts.
 * Identifies intersecting risk areas without fabricating closures or inventing fake blocked roads.
 */
export function evaluateRouteHazards(
  routes: CalculatedRoute[],
  hazardZones: HazardZone[],
): CalculatedRoute[] {
  if (!hazardZones || hazardZones.length === 0) {
    return routes.map((route) => ({
      ...route,
      hazardRisk: "LOW",
      hazardReason: "Lower-risk route based on currently available hazard data",
    }));
  }

  return routes.map((route) => {
    let highestSeverity: "LOW" | "MODERATE" | "HIGH" | "CRITICAL" = "LOW";
    const flaggedReasons: string[] = [];

    for (const hazard of hazardZones) {
      const bufferKm = Math.max(hazard.radiusKm, 1.5);
      // Sample route path every few points to check distance
      const step = Math.max(1, Math.floor(route.path.length / 25));
      const intersects = route.path.some((point, i) => {
        if (i % step !== 0 && i !== route.path.length - 1) return false;
        const dist = haversineKm(point, { lat: hazard.lat, lng: hazard.lng });
        return dist <= bufferKm;
      });

      if (intersects) {
        if (hazard.severity === "CRITICAL") {
          highestSeverity = "CRITICAL";
          flaggedReasons.push(
            `Route intersects reported ${hazard.disasterType.toLowerCase()} warning: "${hazard.title}" (${hazard.source})`,
          );
        } else if (hazard.severity === "HIGH") {
          if (highestSeverity !== "CRITICAL") highestSeverity = "HIGH";
          flaggedReasons.push(
            `Route passes near high-risk ${hazard.disasterType.toLowerCase()} zone: "${hazard.title}"`,
          );
        } else if (hazard.severity === "MEDIUM") {
          if (highestSeverity === "LOW") highestSeverity = "MODERATE";
          flaggedReasons.push(
            `Route passes near reported ${hazard.disasterType.toLowerCase()} advisory: "${hazard.title}"`,
          );
        }
      }
    }

    const hazardReason =
      flaggedReasons.length > 0
        ? flaggedReasons.join("; ")
        : "Lower-risk route based on available hazard data";

    return {
      ...route,
      hazardRisk: highestSeverity,
      hazardReason,
    };
  });
}
