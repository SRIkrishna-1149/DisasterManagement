import { type LatLng, haversineKm } from "./geo";
import { isInsideAndhraPradesh } from "./domain";
import { loadGoogleMaps } from "./google-maps-loader";

export type FacilityType =
  "hospital" | "police" | "fire_station" | "shelter" | "emergency_facility";

export interface NearbyFacility {
  id: string;
  name: string;
  type: FacilityType;
  categoryLabel: string;
  lat: number;
  lng: number;
  address: string | null;
  distanceKm: number;
  travelTimeMinutes: number | null;
  isOpen: boolean | null;
  phone: string | null;
  googleMapsUrl: string | null;
  source: "GOOGLE_PLACES" | "VERIFIED_DATABASE";
  retrievedAt: string;
}

// In-memory cache for Places queries to prevent redundant API calls
const placesCache = new Map<string, { timestamp: number; data: NearbyFacility[] }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export const FACILITY_TYPE_CONFIG: Record<
  FacilityType,
  { label: string; googleTypes: string[]; icon: string; colorClass: string }
> = {
  hospital: {
    label: "Hospitals & Medical Centers",
    googleTypes: ["hospital", "doctor", "health"],
    icon: "✚",
    colorClass: "text-safe border-safe/40 bg-safe/10",
  },
  police: {
    label: "Police Stations",
    googleTypes: ["police"],
    icon: "🛡",
    colorClass: "text-primary border-primary/40 bg-primary/10",
  },
  fire_station: {
    label: "Fire & Rescue Stations",
    googleTypes: ["fire_station"],
    icon: "🚒",
    colorClass: "text-high border-high/40 bg-high/10",
  },
  shelter: {
    label: "Designated Emergency Shelters",
    googleTypes: ["local_government_office", "school", "community_center"],
    icon: "⌂",
    colorClass: "text-safe border-safe/40 bg-safe/10",
  },
  emergency_facility: {
    label: "Emergency Public Facilities",
    googleTypes: ["local_government_office", "civic_center"],
    icon: "★",
    colorClass: "text-accent border-accent/40 bg-accent/10",
  },
};

/**
 * Searches nearby real-world emergency facilities around user coordinates using Google Places.
 * Never fabricates places. Returns empty array if none found or service is unavailable.
 */
export async function searchNearbyGooglePlaces(
  center: LatLng,
  facilityType: FacilityType = "hospital",
  radiusMeters = 15000,
): Promise<NearbyFacility[]> {
  if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) {
    return [];
  }

  const cacheKey = `${facilityType}_${center.lat.toFixed(3)}_${center.lng.toFixed(3)}_${radiusMeters}`;
  const cached = placesCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const google = await loadGoogleMaps();
    const config = FACILITY_TYPE_CONFIG[facilityType];

    // Create hidden DOM node for PlacesService if needed
    const dummyElement = document.createElement("div");
    const placesService = new google.maps.places.PlacesService(dummyElement);
    const primaryType = config.googleTypes[0] || "hospital";

    const results = await new Promise<google.maps.places.PlaceResult[]>((resolve) => {
      const request: google.maps.places.PlaceSearchRequest = {
        location: new google.maps.LatLng(center.lat, center.lng),
        radius: radiusMeters,
        type: primaryType,
        keyword:
          facilityType === "shelter"
            ? "relief shelter community hall cyclone shelter"
            : facilityType === "fire_station"
              ? "fire station rescue"
              : facilityType === "police"
                ? "police station"
                : "hospital emergency trauma center",
      };

      placesService.nearbySearch(request, (places, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && places && places.length > 0) {
          resolve(places);
        } else {
          resolve([]);
        }
      });
    });

    const now = new Date().toISOString();
    const facilities: NearbyFacility[] = results
      .filter((place) => place.geometry?.location)
      .map((place) => {
        const loc = place.geometry!.location!;
        const lat = loc.lat();
        const lng = loc.lng();
        const distanceKm = haversineKm(center, { lat, lng });

        // Accurate place classification
        let categoryLabel = config.label;
        if (facilityType === "shelter") {
          categoryLabel = "Potential Public Shelter / Hall";
        }

        return {
          id: `place-${place.place_id || Math.random().toString(36).substring(2, 9)}`,
          name: place.name || "Emergency Facility",
          type: facilityType,
          categoryLabel,
          lat,
          lng,
          address: place.vicinity || place.formatted_address || null,
          distanceKm: Number(distanceKm.toFixed(2)),
          travelTimeMinutes: Math.round(distanceKm * 2.2), // initial road estimate, refined when routed
          isOpen: place.opening_hours ? (place.opening_hours.isOpen?.() ?? null) : null,
          phone: null,
          googleMapsUrl: place.place_id
            ? `https://www.google.com/maps/place/?q=place_id:${place.place_id}`
            : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
          source: "GOOGLE_PLACES" as const,
          retrievedAt: now,
        };
      })
      .filter((facility) => isInsideAndhraPradesh(facility.lat, facility.lng))
      .sort((a, b) => a.distanceKm - b.distanceKm);

    placesCache.set(cacheKey, { timestamp: Date.now(), data: facilities });
    return facilities;
  } catch (error) {
    console.warn("Google Places nearby search error:", error);
    return [];
  }
}
