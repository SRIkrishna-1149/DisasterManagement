import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

/**
 * Public Google Maps configuration.
 * Never hardcode private keys or server-only credentials.
 * The browser key must be restricted in Google Cloud Console by HTTP referrer and API scope.
 */
export const GOOGLE_MAPS_API_KEY: string =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    typeof import.meta.env["VITE_GOOGLE_MAPS_API_KEY"] === "string" &&
    import.meta.env["VITE_GOOGLE_MAPS_API_KEY"]) ||
  "";

export const GOOGLE_MAPS_MAP_ID: string =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    typeof import.meta.env["VITE_GOOGLE_MAPS_MAP_ID"] === "string" &&
    import.meta.env["VITE_GOOGLE_MAPS_MAP_ID"]) ||
  "DEMO_MAP_ID";

let configured = false;
let loadPromise: Promise<typeof globalThis.google> | null = null;

export function configureGoogleMaps(apiKey = GOOGLE_MAPS_API_KEY): void {
  if (!configured) {
    setOptions({
      key: apiKey || "DEMO_KEY",
      v: "weekly",
      region: "IN",
      language: "en",
      libraries: ["places", "geometry", "marker"],
    });
    configured = true;
  }
}

export async function loadGoogleMaps(
  apiKey = GOOGLE_MAPS_API_KEY,
): Promise<typeof globalThis.google> {
  const win =
    typeof window !== "undefined"
      ? (window as unknown as { google?: typeof globalThis.google })
      : null;
  if (win?.google?.maps) {
    return win.google;
  }

  if (loadPromise) {
    return loadPromise;
  }

  configureGoogleMaps(apiKey);

  loadPromise = Promise.all([
    importLibrary("maps"),
    importLibrary("places"),
    importLibrary("geometry"),
    importLibrary("marker"),
  ])
    .then(() => {
      const w =
        typeof window !== "undefined"
          ? (window as unknown as { google?: typeof globalThis.google })
          : null;
      if (w?.google) {
        return w.google;
      }
      throw new Error("Google Maps API script loaded but window.google is undefined");
    })
    .catch((err) => {
      // Reset loadPromise on failure so future retry attempts can re-attempt loading
      loadPromise = null;
      throw err;
    });

  return loadPromise;
}

export function isGoogleMapsConfigured(): boolean {
  return Boolean(GOOGLE_MAPS_API_KEY && GOOGLE_MAPS_API_KEY !== "YOUR_API_KEY");
}
