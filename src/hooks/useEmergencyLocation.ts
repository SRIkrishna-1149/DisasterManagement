import { useCallback, useEffect, useRef, useState } from "react";
import { isInsideAndhraPradesh, type LocationSource } from "@/lib/domain";
import { isValidCoordinate } from "@/lib/geo";

export interface EmergencyLocation {
  lat: number;
  lng: number;
  source: LocationSource;
  accuracyM: number | null;
  heading: number | null;
  speed: number | null;
  landmark: string | null;
  capturedAt: string;
}

export type LocationStatus =
  "idle" | "locating" | "ready" | "denied" | "unavailable" | "outside-region" | "timeout";

export function useEmergencyLocation(autoRequest = true) {
  const [location, setLocation] = useState<EmergencyLocation | null>(null);
  const [status, setStatus] = useState<LocationStatus>("idle");
  const [isWatching, setIsWatching] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const handlePosition = useCallback((position: GeolocationPosition) => {
    const { latitude, longitude, accuracy, heading, speed } = position.coords;
    if (!isValidCoordinate(latitude, longitude)) {
      setStatus("unavailable");
      setErrorMessage("Received invalid GPS coordinates from device.");
      return;
    }

    if (!isInsideAndhraPradesh(latitude, longitude)) {
      setStatus("outside-region");
      setErrorMessage(
        "Your current location is outside the Andhra Pradesh disaster-management coverage area.",
      );
      setLocation({
        lat: latitude,
        lng: longitude,
        source: "GPS",
        accuracyM: Number.isFinite(accuracy) ? accuracy : null,
        heading: Number.isFinite(heading) ? heading : null,
        speed: Number.isFinite(speed) ? speed : null,
        landmark: null,
        capturedAt: new Date().toISOString(),
      });
      return;
    }

    setLocation({
      lat: latitude,
      lng: longitude,
      source: "GPS",
      accuracyM: Number.isFinite(accuracy) ? accuracy : null,
      heading: Number.isFinite(heading) ? heading : null,
      speed: Number.isFinite(speed) ? speed : null,
      landmark: null,
      capturedAt: new Date().toISOString(),
    });
    setStatus("ready");
    setErrorMessage(null);
  }, []);

  const handleError = useCallback((error: GeolocationPositionError) => {
    if (error.code === error.PERMISSION_DENIED) {
      setStatus("denied");
      setErrorMessage(
        "Location permission was denied. Please allow location access in your browser or device settings to view nearby emergency facilities.",
      );
    } else if (error.code === error.TIMEOUT) {
      setStatus("timeout");
      setErrorMessage("Location request timed out. Please check your GPS signal and retry.");
    } else {
      setStatus("unavailable");
      setErrorMessage("Device location service is temporarily unavailable.");
    }
  }, []);

  const request = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unavailable");
      setErrorMessage("Geolocation is not supported by your browser or device.");
      return;
    }
    setStatus("locating");
    setErrorMessage(null);

    navigator.geolocation.getCurrentPosition(handlePosition, handleError, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 10000,
    });
  }, [handlePosition, handleError]);

  const startWatching = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unavailable");
      return;
    }
    if (watchIdRef.current !== null) return;

    setStatus("locating");
    setIsWatching(true);

    const id = navigator.geolocation.watchPosition(handlePosition, handleError, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 5000,
    });
    watchIdRef.current = id;
  }, [handlePosition, handleError]);

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      setIsWatching(false);
    }
  }, []);

  useEffect(() => {
    if (autoRequest) {
      request();
    }
    return () => {
      stopWatching();
    };
  }, [autoRequest, request, stopWatching]);

  const setManual = useCallback(
    (lat: number, lng: number, landmark: string | null, source: LocationSource) => {
      setLocation({
        lat,
        lng,
        source,
        accuracyM: null,
        heading: null,
        speed: null,
        landmark,
        capturedAt: new Date().toISOString(),
      });
      setStatus(isInsideAndhraPradesh(lat, lng) ? "ready" : "outside-region");
      setErrorMessage(null);
    },
    [],
  );

  return {
    location,
    status,
    errorMessage,
    isWatching,
    request,
    startWatching,
    stopWatching,
    setManual,
  };
}
