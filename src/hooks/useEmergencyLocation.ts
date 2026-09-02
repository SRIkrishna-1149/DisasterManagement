import { useCallback, useEffect, useRef, useState } from "react";
import { isInsideIndia, type LocationSource } from "@/lib/domain";
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
  | "idle"
  | "requesting-permission"
  | "acquiring-gps"
  | "location-acquired"
  | "accuracy-validation"
  | "ready"
  | "denied"
  | "unavailable"
  | "outside-region"
  | "timeout"
  | "low-accuracy";

export function useEmergencyLocation(autoRequest = true) {
  const [location, setLocation] = useState<EmergencyLocation | null>(null);
  const [status, setStatus] = useState<LocationStatus>("idle");
  const [isWatching, setIsWatching] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [accuracyWarning, setAccuracyWarning] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const handlePosition = useCallback((position: GeolocationPosition): EmergencyLocation | null => {
    setStatus("location-acquired");
    const { latitude, longitude, accuracy, heading, speed } = position.coords;

    if (!isValidCoordinate(latitude, longitude)) {
      setStatus("unavailable");
      setErrorMessage("Received invalid GPS coordinates from device.");
      return null;
    }

    setStatus("accuracy-validation");

    const acc = Number.isFinite(accuracy) ? accuracy : null;
    let warn: string | null = null;
    if (acc !== null) {
      if (acc > 500) {
        warn = `Location accuracy is currently low (±${Math.round(acc)} m). Move outdoors or enable device GPS.`;
      } else if (acc > 100) {
        warn = `Location accuracy is moderate (±${Math.round(acc)} m). Proximity sorting is approximate.`;
      }
    }
    setAccuracyWarning(warn);

    const loc: EmergencyLocation = {
      lat: latitude,
      lng: longitude,
      source: "GPS",
      accuracyM: acc,
      heading: Number.isFinite(heading) ? heading : null,
      speed: Number.isFinite(speed) ? speed : null,
      landmark: null,
      capturedAt: new Date().toISOString(),
    };

    if (!isInsideIndia(latitude, longitude)) {
      setStatus("outside-region");
      setErrorMessage(
        "Your current location is outside the India disaster-management operating area.",
      );
      setLocation(loc);
      return loc;
    }

    setLocation(loc);
    if (acc !== null && acc > 500) {
      setStatus("low-accuracy");
    } else {
      setStatus("ready");
    }
    setErrorMessage(null);
    return loc;
  }, []);

  const handleError = useCallback((error: GeolocationPositionError) => {
    if (error.code === error.PERMISSION_DENIED) {
      setStatus("denied");
      setErrorMessage(
        "Location permission was denied. Please allow location access in your browser or device settings to view nearby emergency facilities and calculate road routes.",
      );
    } else if (error.code === error.TIMEOUT) {
      setStatus("timeout");
      setErrorMessage("GPS location request timed out. Please check your device signal and retry.");
    } else {
      setStatus("unavailable");
      setErrorMessage("Device location service is temporarily unavailable.");
    }
  }, []);

  const request = useCallback(
    (forceFresh = false) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        setStatus("unavailable");
        setErrorMessage("Geolocation is not supported by your browser or device.");
        return;
      }
      setStatus("requesting-permission");
      setErrorMessage(null);

      setStatus("acquiring-gps");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          handlePosition(pos);
        },
        handleError,
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: forceFresh ? 0 : 5000,
        },
      );
    },
    [handlePosition, handleError],
  );

  const getCurrentLocation = useCallback(
    (timeoutMs = 15000): Promise<EmergencyLocation> => {
      return new Promise((resolve, reject) => {
        if (typeof navigator === "undefined" || !navigator.geolocation) {
          const msg = "Geolocation is not supported by your browser or device.";
          setStatus("unavailable");
          setErrorMessage(msg);
          reject(new Error(msg));
          return;
        }

        setStatus("acquiring-gps");
        setErrorMessage(null);

        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const loc = handlePosition(pos);
            if (loc) {
              resolve(loc);
            } else {
              reject(new Error("Invalid GPS coordinates received."));
            }
          },
          (err) => {
            handleError(err);
            if (err.code === err.PERMISSION_DENIED) {
              reject(
                new Error(
                  "Location permission denied. Please allow location access in your device settings.",
                ),
              );
            } else if (err.code === err.TIMEOUT) {
              reject(new Error("GPS location request timed out. Move outdoors and retry."));
            } else {
              reject(new Error("Unable to obtain GPS location from device."));
            }
          },
          {
            enableHighAccuracy: true,
            timeout: timeoutMs,
            maximumAge: 0,
          },
        );
      });
    },
    [handlePosition, handleError],
  );

  const startWatching = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unavailable");
      return;
    }
    if (watchIdRef.current !== null) return;

    setStatus("acquiring-gps");
    setIsWatching(true);

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        handlePosition(pos);
      },
      handleError,
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 3000,
      },
    );
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
      request(false);
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
      setStatus(isInsideIndia(lat, lng) ? "ready" : "outside-region");
      setErrorMessage(null);
      setAccuracyWarning(null);
    },
    [],
  );

  return {
    location,
    status,
    errorMessage,
    accuracyWarning,
    isWatching,
    request: () => request(true),
    getCurrentLocation,
    startWatching,
    stopWatching,
    setManual,
  };
}
