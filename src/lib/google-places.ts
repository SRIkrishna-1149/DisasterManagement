/**
 * Static facility compatibility wrapper.
 * Re-exports the static emergency facilities dataset without Google Places API dependencies.
 */
export * from "./static-facilities";
import { searchNearbyStaticFacilities } from "./static-facilities";

export const searchNearbyGooglePlaces = searchNearbyStaticFacilities;
