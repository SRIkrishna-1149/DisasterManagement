/**
 * Google Maps loader deprecation stub.
 * Google Maps Platform dependency has been replaced by the Static Andhra Pradesh Operations Map.
 * No API keys or remote script loading are required.
 */
export const GOOGLE_MAPS_API_KEY = "";
export const GOOGLE_MAPS_MAP_ID = "";

export function configureGoogleMaps(): void {
  // No-op: Static map engine is used
}

export async function loadGoogleMaps(): Promise<never> {
  throw new Error(
    "Google Maps JavaScript API has been replaced by the Static Andhra Pradesh Operations Map. No Google API key is required.",
  );
}

export function isGoogleMapsConfigured(): boolean {
  return false;
}
