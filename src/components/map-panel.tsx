import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  Component,
  type ErrorInfo,
} from "react";
import {
  Crosshair,
  Layers,
  MapPin,
  Maximize2,
  Minimize2,
  Navigation,
  Phone,
  RotateCcw,
  ShieldAlert,
  Compass,
} from "lucide-react";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { cn } from "@/lib/utils";
import { type LatLng, haversineKm } from "@/lib/geo";
import { AP_BOUNDS, AP_CENTER, isInsideAndhraPradesh, type DataQuality } from "@/lib/domain";
import { loadGoogleMaps, isGoogleMapsConfigured } from "@/lib/google-maps-loader";
import type { CalculatedRoute } from "@/lib/google-routes";
import { DataTag, Panel, Button } from "./kit";

export interface MapMarker extends LatLng {
  id: string;
  label: string;
  kind: "risk" | "resource" | "sos" | "team" | "alert" | "report";
  detail?: string;
  quality?: DataQuality;
  score?: number;
  phone?: string | null;
  address?: string | null;
  isOpen?: boolean | null;
  sourceUrl?: string | null;
}

const KIND_STYLE: Record<
  MapMarker["kind"],
  { bg: string; text: string; ring: string; icon: string; label: string }
> = {
  resource: {
    bg: "#10b981",
    text: "#ffffff",
    ring: "rgba(16, 185, 129, 0.3)",
    icon: "✚",
    label: "Shelters & hospitals",
  },
  risk: {
    bg: "#f59e0b",
    text: "#000000",
    ring: "rgba(245, 158, 11, 0.3)",
    icon: "⚠",
    label: "Hazard & risk zones",
  },
  sos: {
    bg: "#ef4444",
    text: "#ffffff",
    ring: "rgba(239, 68, 68, 0.4)",
    icon: "⚡",
    label: "SOS requests",
  },
  team: {
    bg: "#0ea5e9",
    text: "#ffffff",
    ring: "rgba(14, 165, 233, 0.3)",
    icon: "◆",
    label: "Rescue teams",
  },
  alert: {
    bg: "#f97316",
    text: "#ffffff",
    ring: "rgba(249, 115, 22, 0.3)",
    icon: "!",
    label: "Official alerts",
  },
  report: {
    bg: "#8b5cf6",
    text: "#ffffff",
    ring: "rgba(139, 92, 246, 0.3)",
    icon: "✎",
    label: "Verified observations",
  },
};

// Subtle dark-mode styling for emergency operations readability
const MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#111c24" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#111c24" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8ca3b8" }] },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d1d5db" }],
  },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#748ba0" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#172932" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1f3340" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#16252e" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca3af" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#2d4a5d" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1d3240" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#1e3341" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0a141b" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#38bdf8" }] },
];

interface OperationsMapProps {
  markers?: MapMarker[];
  className?: string;
  title?: string;
  route?: LatLng[];
  calculatedRoute?: CalculatedRoute | null;
  routeLabel?: string;
  pin?: LatLng;
  userLocation?: LatLng | null;
  userAccuracyM?: number | null;
  onMapClick?: (point: LatLng) => void;
  onSelectMarker?: (marker: MapMarker | null) => void;
  onRouteToMarker?: (marker: MapMarker) => void;
  centerOn?: LatLng | null;
  actions?: ReactNode;
}

export function OperationsMap(props: OperationsMapProps) {
  return (
    <MapErrorBoundary>
      <OperationsMapContent {...props} />
    </MapErrorBoundary>
  );
}

function OperationsMapContent({
  markers = [],
  className,
  title = "Andhra Pradesh operations map",
  route,
  calculatedRoute,
  routeLabel,
  pin,
  userLocation,
  userAccuracyM,
  onMapClick,
  onSelectMarker,
  onRouteToMarker,
  centerOn,
  actions,
}: OperationsMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const userMarkerRef = useRef<google.maps.Marker | null>(null);
  const accuracyCircleRef = useRef<google.maps.Circle | null>(null);
  const pinMarkerRef = useRef<google.maps.Marker | null>(null);
  const polylineRef = useRef<google.maps.Polyline | null>(null);

  const [mapLoaded, setMapLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MapMarker | null>(null);
  const [showLayers, setShowLayers] = useState(false);
  const [hiddenKinds, setHiddenKinds] = useState<Record<string, boolean>>({});
  const [followUser, setFollowUser] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Initialize Google Map
  useEffect(() => {
    let active = true;
    if (!containerRef.current) return;

    loadGoogleMaps()
      .then((google) => {
        if (!active || !containerRef.current) return;

        const apBounds = new google.maps.LatLngBounds(
          new google.maps.LatLng(AP_BOUNDS.minLat, AP_BOUNDS.minLng),
          new google.maps.LatLng(AP_BOUNDS.maxLat, AP_BOUNDS.maxLng),
        );

        const map = new google.maps.Map(containerRef.current, {
          center: { lat: AP_CENTER.lat, lng: AP_CENTER.lng },
          zoom: 7.5,
          minZoom: 6,
          maxZoom: 19,
          restriction: {
            latLngBounds: apBounds,
            strictBounds: false,
          },
          styles: MAP_STYLES,
          disableDefaultUI: true,
          zoomControl: false,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling: "greedy",
        });

        map.addListener("click", (e: google.maps.MapMouseEvent) => {
          if (e.latLng && onMapClick) {
            const lat = e.latLng.lat();
            const lng = e.latLng.lng();
            if (isInsideAndhraPradesh(lat, lng)) {
              onMapClick({ lat, lng });
            }
          }
        });

        // Suspend follow-me if user manually drags the map
        map.addListener("dragstart", () => {
          setFollowUser(false);
        });

        mapInstanceRef.current = map;
        setMapLoaded(true);
      })
      .catch((err) => {
        if (active) {
          console.warn("Failed to load Google Maps JS API:", err);
          setLoadError(
            err instanceof Error ? err.message : "Google Maps Platform script could not be loaded.",
          );
        }
      });

    return () => {
      active = false;
      if (clustererRef.current) {
        clustererRef.current.clearMarkers();
      }
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
      userMarkerRef.current?.setMap(null);
      polylineRef.current?.setMap(null);
    };
  }, [onMapClick]);

  // Center on explicit coordinate request
  useEffect(() => {
    if (!mapInstanceRef.current || !centerOn) return;
    mapInstanceRef.current.panTo({ lat: centerOn.lat, lng: centerOn.lng });
    if (mapInstanceRef.current.getZoom()! < 12) {
      mapInstanceRef.current.setZoom(13);
    }
  }, [centerOn]);

  // Handle User Location Marker & Accuracy Circle
  useEffect(() => {
    if (!mapInstanceRef.current || typeof window === "undefined" || !window.google?.maps) return;
    const google = window.google;
    const map = mapInstanceRef.current;

    if (!userLocation) {
      userMarkerRef.current?.setMap(null);
      accuracyCircleRef.current?.setMap(null);
      return;
    }

    const pos = { lat: userLocation.lat, lng: userLocation.lng };

    // Accuracy circle
    if (!accuracyCircleRef.current) {
      accuracyCircleRef.current = new google.maps.Circle({
        strokeColor: "#38bdf8",
        strokeOpacity: 0.6,
        strokeWeight: 1.5,
        fillColor: "#0284c7",
        fillOpacity: 0.15,
        map,
        center: pos,
        radius: userAccuracyM || 30,
        clickable: false,
      });
    } else {
      accuracyCircleRef.current.setCenter(pos);
      accuracyCircleRef.current.setRadius(userAccuracyM || 30);
      accuracyCircleRef.current.setMap(map);
    }

    // User marker
    const svgIcon = {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 8,
      fillColor: "#38bdf8",
      fillOpacity: 1,
      strokeColor: "#ffffff",
      strokeWeight: 3,
    };

    if (!userMarkerRef.current) {
      userMarkerRef.current = new google.maps.Marker({
        position: pos,
        map,
        title: "Your location",
        icon: svgIcon,
        zIndex: 999,
      });
      userMarkerRef.current.addListener("click", () => {
        setSelected({
          id: "user-loc",
          label: "Your Current Location",
          kind: "team",
          lat: userLocation.lat,
          lng: userLocation.lng,
          detail: `Accuracy: ±${Math.round(userAccuracyM || 0)} meters · Device GPS`,
          quality: "LIVE",
        });
      });
    } else {
      userMarkerRef.current.setPosition(pos);
      userMarkerRef.current.setMap(map);
    }

    if (followUser) {
      map.panTo(pos);
    }
  }, [userLocation, userAccuracyM, followUser]);

  // Handle Manual Pin (e.g. for /sos pin drop)
  useEffect(() => {
    if (!mapInstanceRef.current || typeof window === "undefined" || !window.google?.maps) return;
    const google = window.google;
    const map = mapInstanceRef.current;

    if (!pin) {
      pinMarkerRef.current?.setMap(null);
      return;
    }

    const pos = { lat: pin.lat, lng: pin.lng };
    if (!pinMarkerRef.current) {
      pinMarkerRef.current = new google.maps.Marker({
        position: pos,
        map,
        draggable: true,
        title: "Selected Emergency Pin",
        icon: {
          path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z",
          fillColor: "#ef4444",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 1.5,
          scale: 1.6,
          anchor: new google.maps.Point(12, 22),
        },
        zIndex: 998,
      });

      pinMarkerRef.current.addListener("dragend", (e: google.maps.MapMouseEvent) => {
        if (e.latLng && onMapClick) {
          const lat = e.latLng.lat();
          const lng = e.latLng.lng();
          if (isInsideAndhraPradesh(lat, lng)) {
            onMapClick({ lat, lng });
          }
        }
      });
    } else {
      pinMarkerRef.current.setPosition(pos);
      pinMarkerRef.current.setMap(map);
    }
  }, [pin, onMapClick]);

  // Render Clustered Facility / Alert / Incident Markers
  useEffect(() => {
    if (
      !mapLoaded ||
      !mapInstanceRef.current ||
      typeof window === "undefined" ||
      !window.google?.maps
    )
      return;
    const google = window.google;
    const map = mapInstanceRef.current;

    // Clear old markers
    if (clustererRef.current) {
      clustererRef.current.clearMarkers();
    }
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    const visibleMarkers = markers.filter(
      (m) => !hiddenKinds[m.kind] && isInsideAndhraPradesh(m.lat, m.lng),
    );

    const gMarkers: google.maps.Marker[] = visibleMarkers.map((marker) => {
      const style = KIND_STYLE[marker.kind] || KIND_STYLE.resource;
      const gMarker = new google.maps.Marker({
        position: { lat: marker.lat, lng: marker.lng },
        title: marker.label,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: style.bg,
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
        zIndex: marker.kind === "sos" ? 100 : marker.kind === "risk" ? 90 : 50,
      });

      gMarker.addListener("click", () => {
        setSelected(marker);
        onSelectMarker?.(marker);
      });

      return gMarker;
    });

    markersRef.current = gMarkers;
    clustererRef.current = new MarkerClusterer({ map, markers: gMarkers });
  }, [markers, hiddenKinds, mapLoaded, onSelectMarker]);

  // Render Real Road Network Polyline
  useEffect(() => {
    if (
      !mapLoaded ||
      !mapInstanceRef.current ||
      typeof window === "undefined" ||
      !window.google?.maps
    )
      return;
    const google = window.google;
    const map = mapInstanceRef.current;

    polylineRef.current?.setMap(null);
    polylineRef.current = null;

    const pathPoints = calculatedRoute?.path || route;
    if (!pathPoints || pathPoints.length < 2) return;

    const path = pathPoints.map((p) => new google.maps.LatLng(p.lat, p.lng));
    const isHazardous =
      calculatedRoute?.hazardRisk === "CRITICAL" || calculatedRoute?.hazardRisk === "HIGH";

    polylineRef.current = new google.maps.Polyline({
      path,
      strokeColor: isHazardous ? "#f97316" : "#0284c7",
      strokeOpacity: 0.9,
      strokeWeight: 5,
      map,
      zIndex: 200,
    });

    // Auto fit bounds to route
    const bounds = new google.maps.LatLngBounds();
    pathPoints.forEach((p) => bounds.extend(new google.maps.LatLng(p.lat, p.lng)));
    map.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 });
  }, [route, calculatedRoute, mapLoaded]);

  const resetApView = useCallback(() => {
    if (!mapInstanceRef.current || typeof window === "undefined" || !window.google?.maps) return;
    const google = window.google;
    const apBounds = new google.maps.LatLngBounds(
      new google.maps.LatLng(AP_BOUNDS.minLat, AP_BOUNDS.minLng),
      new google.maps.LatLng(AP_BOUNDS.maxLat, AP_BOUNDS.maxLng),
    );
    mapInstanceRef.current.fitBounds(apBounds);
    setFollowUser(false);
  }, []);

  const centerOnUser = useCallback(() => {
    if (!mapInstanceRef.current || !userLocation) return;
    mapInstanceRef.current.panTo({ lat: userLocation.lat, lng: userLocation.lng });
    mapInstanceRef.current.setZoom(14);
    setFollowUser(true);
  }, [userLocation]);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  return (
    <Panel
      title={title}
      className={cn("overflow-hidden", className)}
      action={
        <div className="flex items-center gap-1.5">
          {actions}
          <button
            type="button"
            aria-label="Toggle map layers"
            onClick={() => setShowLayers((prev) => !prev)}
            className={cn(
              "rounded-md p-2 text-muted-foreground hover:bg-surface-2 hover:text-foreground",
              showLayers && "bg-primary/15 text-primary",
            )}
          >
            <Layers className="h-4 w-4" />
          </button>
        </div>
      }
    >
      <div
        ref={containerRef}
        role="application"
        aria-label="Google Maps Andhra Pradesh response area"
        className="relative 'min-h-[380px]' w-full overflow-hidden rounded-xl border border-border bg-[#0f172a] sm:'min-h-[460px] lg:min-h-[520px]'"
      >
        {/* Map Canvas */}
        <div className="h-full w-full 'min-h-[380px]' sm:'min-h-[460px]' lg:'min-h-[520px]'" />

        {/* Loading Overlay */}
        {!mapLoaded && !loadError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0f172a]/90 text-cyan-50 backdrop-blur-sm">
            <Compass className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-3 text-sm font-semibold">Connecting to Google Maps Platform…</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Focusing on Andhra Pradesh response area
            </p>
          </div>
        )}

        {/* Fallback / Error Banner */}
        {loadError && (
          <div className="absolute inset-x-3 top-3 rounded-lg border border-accent/50 bg-accent/20 p-4 text-xs text-accent-foreground backdrop-blur-md">
            <p className="font-semibold flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-accent" />
              Google Maps Platform Configuration Required
            </p>
            <p className="mt-1">
              {!isGoogleMapsConfigured()
                ? "Add VITE_GOOGLE_MAPS_API_KEY to your environment variables to enable live Google road routing and Places discovery."
                : loadError}
            </p>
          </div>
        )}

        {/* Floating Top Left Badge: Scope */}
        <div className="absolute left-3 top-3 flex items-center gap-2 rounded-lg border border-cyan-100/20 bg-[#0f172a]/85 px-3 py-1.5 font-mono text-[10px] text-cyan-50 backdrop-blur-md shadow-lg">
          <span className="h-2 w-2 rounded-full bg-safe animate-pulse" />
          <span>Andhra Pradesh · Canonical Ops Map</span>
        </div>

        {/* Floating Top Right Controls */}
        <div className="absolute right-3 top-3 flex flex-col gap-1.5 z-10">
          <button
            type="button"
            title="Locate me & follow"
            aria-label="Locate me & follow"
            onClick={centerOnUser}
            disabled={!userLocation}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-100/20 bg-[#0f172a]/90 text-cyan-50 backdrop-blur-md shadow-lg hover:bg-[#1b333c] disabled:opacity-50",
              followUser && "border-primary bg-primary/25 text-primary",
            )}
          >
            <Crosshair className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Reset Andhra Pradesh view"
            aria-label="Reset Andhra Pradesh view"
            onClick={resetApView}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-100/20 bg-[#0f172a]/90 text-cyan-50 backdrop-blur-md shadow-lg hover:bg-[#1b333c]"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Toggle fullscreen"
            aria-label="Toggle fullscreen"
            onClick={toggleFullscreen}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-100/20 bg-[#0f172a]/90 text-cyan-50 backdrop-blur-md shadow-lg hover:bg-[#1b333c]"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>

        {/* Route Info Badge */}
        {(calculatedRoute || route) && (
          <div className="absolute top-12 left-3 max-w-[min(360px,calc(100%-6rem))] rounded-lg border border-primary/40 bg-[#0f172a]/90 p-2.5 text-xs text-cyan-50 shadow-xl backdrop-blur-md z-10">
            <p className="font-semibold text-primary flex items-center gap-1.5">
              <Navigation className="h-3.5 w-3.5" />
              {calculatedRoute?.summary || routeLabel || "Real Road Route"}
            </p>
            {calculatedRoute && (
              <div className="mt-1 text-[11px] text-muted-foreground">
                <span>{calculatedRoute.distanceText}</span> ·{" "}
                <span>{calculatedRoute.durationText}</span>
              </div>
            )}
            {calculatedRoute?.hazardReason && (
              <p
                className={cn(
                  "mt-1.5 rounded px-2 py-1 font-mono text-[10px]",
                  calculatedRoute.hazardRisk === "CRITICAL" || calculatedRoute.hazardRisk === "HIGH"
                    ? "border border-destructive/40 bg-destructive/20 text-destructive-foreground font-semibold"
                    : "border border-safe/30 bg-safe/10 text-safe",
                )}
              >
                {calculatedRoute.hazardReason}
              </p>
            )}
          </div>
        )}

        {/* Layers Drawer / Popover */}
        {showLayers && (
          <div className="absolute bottom-3 left-3 'max-w-[280px]' rounded-lg border border-cyan-100/20 bg-[#0f172a]/95 p-3.5 text-xs text-cyan-50 shadow-2xl backdrop-blur-md z-20">
            <div className="flex items-center justify-between border-b border-border/60 pb-2">
              <p className="font-semibold">Map Layers</p>
              <button
                type="button"
                onClick={() => setShowLayers(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>
            <div className="mt-2.5 grid gap-2">
              {(Object.keys(KIND_STYLE) as MapMarker["kind"][]).map((kind) => {
                const conf = KIND_STYLE[kind];
                return (
                  <label key={kind} className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded accent-primary"
                      checked={!hiddenKinds[kind]}
                      onChange={() => setHiddenKinds((prev) => ({ ...prev, [kind]: !prev[kind] }))}
                    />
                    <span
                      className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold"
                      style={{ backgroundColor: conf.bg, color: conf.text }}
                    >
                      {conf.icon}
                    </span>
                    <span className="text-xs">{conf.label}</span>
                  </label>
                );
              })}
            </div>
            <div className="mt-3 border-t border-cyan-100/15 pt-2 text-[10px] text-muted-foreground">
              Google Maps Platform · IMD Amaravati warnings
            </div>
          </div>
        )}

        {/* Selected Facility / Marker Details Card (Mobile Slide-up / Desktop Card) */}
        {selected && (
          <div className="absolute inset-x-3 bottom-3 sm:inset-x-auto sm:right-3 sm:max-w-sm rounded-xl border border-border bg-surface/95 p-4 shadow-2xl backdrop-blur-md z-30 animate-in fade-in slide-in-from-bottom-3 duration-200">
            <button
              type="button"
              className="float-right text-muted-foreground hover:text-foreground text-sm font-bold"
              onClick={() => {
                setSelected(null);
                onSelectMarker?.(null);
              }}
              aria-label="Close details"
            >
              ✕
            </button>
            <div className="pr-6">
              <span
                className="inline-block rounded px-2 py-0.5 font-mono text-[9px] font-bold uppercase"
                style={{
                  backgroundColor: KIND_STYLE[selected.kind]?.bg || "#0284c7",
                  color: KIND_STYLE[selected.kind]?.text || "#fff",
                }}
              >
                {KIND_STYLE[selected.kind]?.label || selected.kind}
              </span>
              <h3 className="mt-1.5 text-base font-bold text-foreground">{selected.label}</h3>
              {selected.detail && (
                <p className="mt-1 text-xs text-muted-foreground">{selected.detail}</p>
              )}
              {selected.address && (
                <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
                  {selected.address}
                </p>
              )}
              {selected.score !== undefined && (
                <p className="mt-1.5 font-mono text-xs font-bold text-high">
                  Risk score: {selected.score}/100
                </p>
              )}
              {selected.quality && (
                <div className="mt-2">
                  <DataTag quality={selected.quality} />
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2 border-t border-border/60 pt-3">
                {onRouteToMarker && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      onRouteToMarker(selected);
                      setSelected(null);
                    }}
                  >
                    <Navigation className="h-3.5 w-3.5" />
                    Route here
                  </Button>
                )}
                {selected.phone && (
                  <a
                    href={`tel:${selected.phone}`}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-semibold hover:bg-surface-2"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    Call
                  </a>
                )}
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${selected.lat},${selected.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-semibold text-foreground hover:bg-surface-2"
                >
                  External maps ↗
                </a>
              </div>
            </div>
          </div>
        )}
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground">
        Powered by Google Maps Platform & authoritative IMD Amaravati hazard layers. Drag to pan,
        scroll/pinch to zoom.
        {userLocation && ` Your position is accurate to ±${Math.round(userAccuracyM || 0)} m.`}
      </p>
    </Panel>
  );
}

class MapErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("OperationsMap error boundary caught an error:", error, errorInfo);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <Panel title="Operations map unavailable">
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive-foreground">
            <p className="font-semibold">An unexpected map rendering error occurred.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {this.state.error?.message || "Please refresh the page to reload the map component."}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Retry map
            </Button>
          </div>
        </Panel>
      );
    }
    return this.props.children;
  }
}
