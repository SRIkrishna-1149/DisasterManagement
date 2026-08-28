import { useCallback, useEffect, useState } from "react";
import type { LocationSource } from "@/lib/domain";
import { isValidCoordinate } from "@/lib/geo";

export interface EmergencyLocation {
  lat: number;
  lng: number;
  source: LocationSource;
  accuracyM: number | null;
  landmark: string | null;
  capturedAt: string;
}

export type LocationStatus = "idle" | "locating" | "ready" | "denied" | "unavailable";

export function useEmergencyLocation() {
  const [location, setLocation] = useState<EmergencyLocation | null>(null);
  const [status, setStatus] = useState<LocationStatus>("idle");

  const request = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unavailable");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        if (!isValidCoordinate(latitude, longitude)) {
          setStatus("unavailable");
          return;
        }
        setLocation({
          lat: latitude,
          lng: longitude,
          source: "GPS",
          accuracyM: Number.isFinite(accuracy) ? accuracy : null,
          landmark: null,
          capturedAt: new Date().toISOString(),
        });
        setStatus("ready");
      },
      (error) => setStatus(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  }, []);

  useEffect(() => {
    request();
  }, [request]);

  const setManual = useCallback((lat: number, lng: number, landmark: string | null, source: LocationSource) => {
    setLocation({
      lat,
      lng,
      source,
      accuracyM: null,
      landmark,
      capturedAt: new Date().toISOString(),
    });
    setStatus("ready");
  }, []);

  return { location, status, request, setManual };
}
