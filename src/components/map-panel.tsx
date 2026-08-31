import {
  useCallback,
  useEffect,
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
  ZoomIn,
  ZoomOut,
  Info,
  Globe,
  Route as RouteIcon,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type LatLng, haversineKm, isValidCoordinate } from "@/lib/geo";
import { AP_BOUNDS, AP_CENTER, isInsideAndhraPradesh, type DataQuality } from "@/lib/domain";
import { AP_STATE_BOUNDARY, AP_DISTRICTS, AP_RIVERS, AP_CITIES } from "@/lib/ap-map-data";
import { AP_ROAD_SEGMENTS } from "@/lib/static-road-network";
import type { CalculatedRoute } from "@/lib/static-router";
import { DataTag, Panel, Button } from "./kit";

export type BasemapType = "satellite" | "hybrid" | "street";

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
    ring: "rgba(16, 185, 129, 0.45)",
    icon: "✚",
    label: "Shelters & hospitals",
  },
  risk: {
    bg: "#f59e0b",
    text: "#000000",
    ring: "rgba(245, 158, 11, 0.45)",
    icon: "⚠",
    label: "Hazard & risk zones",
  },
  sos: {
    bg: "#ef4444",
    text: "#ffffff",
    ring: "rgba(239, 68, 68, 0.5)",
    icon: "⚡",
    label: "SOS requests",
  },
  team: {
    bg: "#0ea5e9",
    text: "#ffffff",
    ring: "rgba(14, 165, 233, 0.45)",
    icon: "◆",
    label: "Rescue teams",
  },
  alert: {
    bg: "#f97316",
    text: "#ffffff",
    ring: "rgba(249, 115, 22, 0.45)",
    icon: "!",
    label: "Official alerts",
  },
  report: {
    bg: "#8b5cf6",
    text: "#ffffff",
    ring: "rgba(139, 92, 246, 0.45)",
    icon: "✎",
    label: "Verified reports",
  },
};

// Tile server endpoints (Free, legally permitted open GIS tile sources with zero Google API keys)
const TILE_SOURCES: Record<
  BasemapType,
  {
    getUrl: (x: number, y: number, z: number) => string;
    overlayUrl?: (x: number, y: number, z: number) => string;
    attribution: string;
    label: string;
  }
> = {
  satellite: {
    getUrl: (x, y, z) =>
      `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
    attribution: "Tiles © Esri, Maxar, Earthstar Geographics, USDA, USGS",
    label: "Satellite Imagery",
  },
  hybrid: {
    getUrl: (x, y, z) =>
      `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
    overlayUrl: (x, y, z) =>
      `https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/${z}/${y}/${x}`,
    attribution: "Tiles © Esri, Maxar, OpenStreetMap contributors",
    label: "Hybrid (Satellite + Labels)",
  },
  street: {
    getUrl: (x, y, z) => `https://basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`,
    attribution: "© OpenStreetMap contributors, © CARTO",
    label: "Street / Topo Map",
  },
};

// Global image cache for slippery raster tiles to prevent redundant network fetches
const TILE_CACHE = new Map<string, HTMLImageElement>();
const MAX_CACHE_SIZE = 600;

function getCachedTile(url: string, onLoaded?: () => void): HTMLImageElement | null {
  if (TILE_CACHE.has(url)) {
    const img = TILE_CACHE.get(url)!;
    if (img.complete && img.naturalWidth > 0) {
      return img;
    }
    return null;
  }

  // Evict oldest tiles if cache exceeds threshold
  if (TILE_CACHE.size >= MAX_CACHE_SIZE) {
    const firstKey = TILE_CACHE.keys().next().value;
    if (firstKey) TILE_CACHE.delete(firstKey);
  }

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  img.onload = () => {
    if (onLoaded) onLoaded();
  };
  img.onerror = () => {
    // Keep failed entry to avoid spamming failed URLs
  };
  TILE_CACHE.set(url, img);
  return null;
}

// Web Mercator (EPSG:3857) mathematical projection functions
function latLngToWorld(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const worldSize = 256 * Math.pow(2, zoom);
  const x = ((lng + 180) / 360) * worldSize;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const clampedSinLat = Math.max(-0.9999, Math.min(0.9999, sinLat));
  const y = (0.5 - Math.log((1 + clampedSinLat) / (1 - clampedSinLat)) / (4 * Math.PI)) * worldSize;
  return { x, y };
}

function worldToLatLng(x: number, y: number, zoom: number): LatLng {
  const worldSize = 256 * Math.pow(2, zoom);
  const lng = (x / worldSize) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / worldSize;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lng };
}

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
  title = "Satellite Operations Map",
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
  const outerContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Basemap & Layer toggles
  const [basemap, setBasemap] = useState<BasemapType>("satellite");
  const [showHazards, setShowHazards] = useState(true);
  const [showHighways, setShowHighways] = useState(true);
  const [showDistricts, setShowDistricts] = useState(true);
  const [showFacilities, setShowFacilities] = useState(true);
  const [showCities, setShowCities] = useState(true);

  const [selectedMarker, setSelectedMarker] = useState<MapMarker | null>(null);
  const [hoveredMarker, setHoveredMarker] = useState<MapMarker | null>(null);
  const [showLayers, setShowLayers] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Viewport camera state in (lat, lng) and continuous fractional zoom level
  const viewportRef = useRef<{ center: LatLng; zoom: number }>({
    center: { lat: Number(AP_CENTER.lat), lng: Number(AP_CENTER.lng) },
    zoom: 7.2, // Default zoom displaying entire Andhra Pradesh
  });

  const isDraggingRef = useRef(false);
  const dragStartPosRef = useRef({ x: 0, y: 0 });
  const dragStartCenterRef = useRef<LatLng>({
    lat: Number(AP_CENTER.lat),
    lng: Number(AP_CENTER.lng),
  });
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef<number>(7.2);
  const isMountedRef = useRef(true);

  // Store latest callbacks in refs to avoid stale closures
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;
  const onSelectMarkerRef = useRef(onSelectMarker);
  onSelectMarkerRef.current = onSelectMarker;

  // Convert (lat, lng) to canvas screen pixel coordinates
  const latLngToScreen = useCallback((lat: number, lng: number, width: number, height: number) => {
    const { center, zoom } = viewportRef.current;
    const centerWorld = latLngToWorld(center.lat, center.lng, zoom);
    const pointWorld = latLngToWorld(lat, lng, zoom);

    return {
      x: width / 2 + (pointWorld.x - centerWorld.x),
      y: height / 2 + (pointWorld.y - centerWorld.y),
    };
  }, []);

  // Convert canvas screen pixel coordinates to (lat, lng)
  const screenToLatLng = useCallback(
    (screenX: number, screenY: number, width: number, height: number): LatLng => {
      const { center, zoom } = viewportRef.current;
      const centerWorld = latLngToWorld(center.lat, center.lng, zoom);
      const pointWorldX = centerWorld.x + (screenX - width / 2);
      const pointWorldY = centerWorld.y + (screenY - height / 2);

      return worldToLatLng(pointWorldX, pointWorldY, zoom);
    },
    [],
  );

  // Main canvas render loop
  const renderMap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    if (width === 0 || height === 0) return;

    ctx.clearRect(0, 0, width, height);

    const { center, zoom } = viewportRef.current;
    const baseZ = Math.max(5, Math.min(18, Math.round(zoom)));
    const scale = Math.pow(2, zoom - baseZ);

    // 1. Draw Satellite / Aerial Basemap Tiles (Web Mercator Slippy Tiles)
    const centerWorld = latLngToWorld(center.lat, center.lng, baseZ);
    const topLeftX = centerWorld.x - width / 2 / scale;
    const topLeftY = centerWorld.y - height / 2 / scale;

    const numTiles = Math.pow(2, baseZ);
    const minTileX = Math.floor(topLeftX / 256);
    const maxTileX = Math.floor((topLeftX + width / scale) / 256);
    const minTileY = Math.max(0, Math.floor(topLeftY / 256));
    const maxTileY = Math.min(numTiles - 1, Math.floor((topLeftY + height / scale) / 256));

    const tileSource = TILE_SOURCES[basemap];

    // Background base fill before tiles arrive
    ctx.fillStyle = basemap === "street" ? "#e5e7eb" : "#0a1118";
    ctx.fillRect(0, 0, width, height);

    for (let ty = minTileY; ty <= maxTileY; ty++) {
      for (let tx = minTileX; tx <= maxTileX; tx++) {
        const normTx = ((tx % numTiles) + numTiles) % numTiles;
        const screenX = (tx * 256 - topLeftX) * scale;
        const screenY = (ty * 256 - topLeftY) * scale;
        const tileSize = 256 * scale;

        const tileUrl = tileSource.getUrl(normTx, ty, baseZ);
        const tileImg = getCachedTile(tileUrl, () => {
          if (isMountedRef.current) renderMap();
        });

        if (tileImg) {
          ctx.drawImage(tileImg, screenX, screenY, tileSize, tileSize);
        } else {
          // Draw low-res ancestor tile placeholder while high-res loads to eliminate black flicker
          const parentZ = baseZ - 1;
          if (parentZ >= 5) {
            const parentTx = Math.floor(normTx / 2);
            const parentTy = Math.floor(ty / 2);
            const parentUrl = tileSource.getUrl(parentTx, parentTy, parentZ);
            const parentImg = getCachedTile(parentUrl);
            if (parentImg) {
              const subX = (normTx % 2) * 128;
              const subY = (ty % 2) * 128;
              ctx.drawImage(parentImg, subX, subY, 128, 128, screenX, screenY, tileSize, tileSize);
            }
          }
        }

        // Draw hybrid reference overlay tiles if enabled
        if (tileSource.overlayUrl) {
          const overlayUrl = tileSource.overlayUrl(normTx, ty, baseZ);
          const overlayImg = getCachedTile(overlayUrl, () => {
            if (isMountedRef.current) renderMap();
          });
          if (overlayImg) {
            ctx.drawImage(overlayImg, screenX, screenY, tileSize, tileSize);
          }
        }
      }
    }

    // 2. Draw District Boundaries & Labels (if enabled)
    if (showDistricts) {
      ctx.save();
      ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 4]);

      AP_DISTRICTS.forEach((district) => {
        if (district.polygon.length < 3) return;
        ctx.beginPath();
        district.polygon.forEach((coord: LatLng, idx: number) => {
          const pt = latLngToScreen(coord.lat, coord.lng, width, height);
          if (idx === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.closePath();
        ctx.stroke();

        // District name at medium zoom
        if (zoom >= 7.8 && zoom <= 12) {
          const centerPt = latLngToScreen(
            district.centroid.lat,
            district.centroid.lng,
            width,
            height,
          );
          if (centerPt.x >= 0 && centerPt.x <= width && centerPt.y >= 0 && centerPt.y <= height) {
            ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
            ctx.font = "bold 10px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(district.name.toUpperCase(), centerPt.x, centerPt.y);
          }
        }
      });
      ctx.restore();
    }

    // 3. Draw Disaster Hazard Risk Zones (if enabled)
    if (showHazards) {
      markers
        .filter((m) => m.kind === "risk" && isValidCoordinate(m.lat, m.lng))
        .forEach((risk) => {
          const pt = latLngToScreen(risk.lat, risk.lng, width, height);
          const radius = Math.max(16, (risk.score || 60) * 0.4 * Math.pow(1.3, zoom - 7));

          // Semi-transparent danger zone overlay
          ctx.save();
          const grad = ctx.createRadialGradient(pt.x, pt.y, 2, pt.x, pt.y, radius);
          grad.addColorStop(0, "rgba(239, 68, 68, 0.5)");
          grad.addColorStop(0.7, "rgba(239, 68, 68, 0.2)");
          grad.addColorStop(1, "rgba(239, 68, 68, 0)");

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = "rgba(239, 68, 68, 0.8)";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, radius * 0.85, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        });
    }

    // 4. Draw Static Highway Network (if enabled)
    if (showHighways) {
      ctx.save();
      // Outer casing for contrast over satellite imagery
      ctx.strokeStyle = "rgba(10, 15, 25, 0.85)";
      ctx.lineWidth = Math.min(5, Math.max(2.5, 3 * Math.pow(1.15, zoom - 7)));
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      AP_ROAD_SEGMENTS.forEach((seg) => {
        if (seg.path.length < 2) return;
        ctx.beginPath();
        seg.path.forEach((pt: LatLng, idx: number) => {
          const s = latLngToScreen(pt.lat, pt.lng, width, height);
          if (idx === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        });
        ctx.stroke();
      });

      // Inner highway core
      ctx.strokeStyle = basemap === "street" ? "#f59e0b" : "#fbbf24";
      ctx.lineWidth = Math.min(3, Math.max(1.2, 1.8 * Math.pow(1.15, zoom - 7)));
      AP_ROAD_SEGMENTS.forEach((seg) => {
        if (seg.path.length < 2) return;
        ctx.beginPath();
        seg.path.forEach((pt: LatLng, idx: number) => {
          const s = latLngToScreen(pt.lat, pt.lng, width, height);
          if (idx === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        });
        ctx.stroke();
      });
      ctx.restore();
    }

    // 5. Draw Active Static Road Route
    const activeRoutePoints: LatLng[] = calculatedRoute?.path || route || [];
    if (activeRoutePoints.length >= 2) {
      ctx.save();
      // Route outer glow
      ctx.strokeStyle = "rgba(0, 245, 255, 0.4)";
      ctx.lineWidth = 9;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      activeRoutePoints.forEach((pt: LatLng, idx: number) => {
        const s = latLngToScreen(pt.lat, pt.lng, width, height);
        if (idx === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.stroke();

      // Route core
      ctx.strokeStyle = "#00f5ff";
      ctx.lineWidth = 4;
      ctx.beginPath();
      activeRoutePoints.forEach((pt: LatLng, idx: number) => {
        const s = latLngToScreen(pt.lat, pt.lng, width, height);
        if (idx === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.stroke();

      // Route start & end markers
      const firstPt = activeRoutePoints[0];
      const lastPt = activeRoutePoints[activeRoutePoints.length - 1];
      if (firstPt && lastPt) {
        const startPt = latLngToScreen(firstPt.lat, firstPt.lng, width, height);
        const endPt = latLngToScreen(lastPt.lat, lastPt.lng, width, height);

        // Start pin (green)
        ctx.fillStyle = "#10b981";
        ctx.beginPath();
        ctx.arc(startPt.x, startPt.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();

        // End pin (red/cyan)
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        ctx.arc(endPt.x, endPt.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      ctx.restore();
    }

    // 6. Draw Major Cities & Urban Centers (if enabled)
    if (showCities && zoom >= 7.0) {
      ctx.save();
      AP_CITIES.forEach((city) => {
        const pt = latLngToScreen(city.lat, city.lng, width, height);
        if (pt.x < -20 || pt.x > width + 20 || pt.y < -20 || pt.y > height + 20) return;

        ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, city.tier === 1 ? 3.5 : 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = city.tier === 1 ? "bold 11px sans-serif" : "10px sans-serif";
        ctx.textAlign = "left";
        ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
        ctx.shadowBlur = 4;
        ctx.fillText(city.name, pt.x + 6, pt.y + 3);
      });
      ctx.restore();
    }

    // 7. Draw Emergency Markers
    if (showFacilities) {
      const validMarkers = markers.filter((m) => isValidCoordinate(m.lat, m.lng));

      validMarkers.forEach((marker) => {
        const pt = latLngToScreen(marker.lat, marker.lng, width, height);
        if (pt.x < -30 || pt.x > width + 30 || pt.y < -30 || pt.y > height + 30) return;

        const isSelected = selectedMarker?.id === marker.id;
        const isHovered = hoveredMarker?.id === marker.id;
        const style = KIND_STYLE[marker.kind] || KIND_STYLE.resource;

        ctx.save();

        // Selection / Hover pulsing ring
        if (isSelected || isHovered) {
          ctx.strokeStyle = style.bg;
          ctx.lineWidth = isSelected ? 3 : 2;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, isSelected ? 18 : 15, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Marker circle
        ctx.fillStyle = style.bg;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, isSelected ? 12 : 10, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Marker icon / glyph
        ctx.fillStyle = style.text;
        ctx.font = `bold ${isSelected ? 11 : 9}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(style.icon, pt.x, pt.y);

        // Marker label at closer zooms or when hovered/selected
        if (isSelected || isHovered || zoom >= 10.5) {
          ctx.font = "bold 10px sans-serif";
          const text = marker.label;
          const metrics = ctx.measureText(text);
          const badgeW = metrics.width + 10;
          const badgeH = 18;
          const badgeX = pt.x - badgeW / 2;
          const badgeY = pt.y - 24;

          ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
          ctx.strokeStyle = style.bg;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = "#ffffff";
          ctx.fillText(text, pt.x, badgeY + badgeH / 2);
        }

        ctx.restore();
      });
    }

    // 8. Draw Precise User Location Marker
    if (userLocation && isValidCoordinate(userLocation.lat, userLocation.lng)) {
      const userPt = latLngToScreen(userLocation.lat, userLocation.lng, width, height);

      ctx.save();
      // Accuracy radius circle if available
      if (userAccuracyM && userAccuracyM > 0) {
        const metersPerPx =
          (156543.03392 * Math.cos((userLocation.lat * Math.PI) / 180)) / Math.pow(2, zoom);
        const radiusPx = Math.max(12, Math.min(120, userAccuracyM / metersPerPx));

        ctx.fillStyle = "rgba(59, 130, 246, 0.15)";
        ctx.strokeStyle = "rgba(59, 130, 246, 0.5)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(userPt.x, userPt.y, radiusPx, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Pulsing outer blue ring
      ctx.strokeStyle = "rgba(59, 130, 246, 0.8)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(userPt.x, userPt.y, 14, 0, Math.PI * 2);
      ctx.stroke();

      // Inner white border & vibrant blue core
      ctx.fillStyle = "#3b82f6";
      ctx.beginPath();
      ctx.arc(userPt.x, userPt.y, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();

      // "YOU ARE HERE" tag
      ctx.fillStyle = "#3b82f6";
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "center";
      ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
      ctx.shadowBlur = 4;
      ctx.fillText("YOU", userPt.x, userPt.y + 20);

      ctx.restore();
    }

    // 9. Draw Manual Pin Marker (if provided)
    if (pin && isValidCoordinate(pin.lat, pin.lng)) {
      const pinPt = latLngToScreen(pin.lat, pin.lng, width, height);

      ctx.save();
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(pinPt.x, pinPt.y, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("📍", pinPt.x, pinPt.y);
      ctx.restore();
    }
  }, [
    basemap,
    showHazards,
    showHighways,
    showDistricts,
    showFacilities,
    showCities,
    markers,
    calculatedRoute,
    route,
    userLocation,
    userAccuracyM,
    pin,
    selectedMarker,
    hoveredMarker,
    latLngToScreen,
  ]);

  // Center camera on centerOn prop when updated
  useEffect(() => {
    if (centerOn && isValidCoordinate(centerOn.lat, centerOn.lng)) {
      viewportRef.current.center = { lat: centerOn.lat, lng: centerOn.lng };
      viewportRef.current.zoom = Math.max(viewportRef.current.zoom, 10.5);
      renderMap();
    }
  }, [centerOn, renderMap]);

  // Auto-fit route when calculatedRoute is set
  useEffect(() => {
    if (calculatedRoute && calculatedRoute.path.length >= 2) {
      let minLat = 90;
      let maxLat = -90;
      let minLng = 180;
      let maxLng = -180;

      calculatedRoute.path.forEach((p: LatLng) => {
        if (p.lat < minLat) minLat = p.lat;
        if (p.lat > maxLat) maxLat = p.lat;
        if (p.lng < minLng) minLng = p.lng;
        if (p.lng > maxLng) maxLng = p.lng;
      });

      viewportRef.current.center = {
        lat: (minLat + maxLat) / 2,
        lng: (minLng + maxLng) / 2,
      };

      const latSpan = maxLat - minLat;
      const lngSpan = maxLng - minLng;
      const maxSpan = Math.max(latSpan, lngSpan);

      // Fit zoom to route span
      if (maxSpan > 2) viewportRef.current.zoom = 7.5;
      else if (maxSpan > 1) viewportRef.current.zoom = 8.8;
      else if (maxSpan > 0.4) viewportRef.current.zoom = 10.2;
      else viewportRef.current.zoom = 11.5;

      renderMap();
    }
  }, [calculatedRoute, renderMap]);

  // Setup canvas resolution and resize listener
  useEffect(() => {
    isMountedRef.current = true;
    const canvas = canvasRef.current;
    const container = outerContainerRef.current;
    if (!canvas || !container) return;

    const handleResize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const displayW = Math.max(300, Math.floor(rect.width));
      const displayH = Math.max(320, Math.floor(rect.height));

      canvas.width = displayW * dpr;
      canvas.height = displayH * dpr;
      canvas.style.width = `${displayW}px`;
      canvas.style.height = `${displayH}px`;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
      renderMap();
    };

    const resizeObserver = new ResizeObserver(() => handleResize());
    resizeObserver.observe(container);
    handleResize();

    return () => {
      isMountedRef.current = false;
      resizeObserver.disconnect();
    };
  }, [renderMap]);

  // Smooth zoom helper
  const handleZoom = (delta: number) => {
    const newZoom = Math.max(5.2, Math.min(17.5, viewportRef.current.zoom + delta));
    viewportRef.current.zoom = newZoom;
    renderMap();
  };

  // Reset view to Andhra Pradesh central default viewport
  const handleResetView = () => {
    viewportRef.current = {
      center: { lat: Number(AP_CENTER.lat), lng: Number(AP_CENTER.lng) },
      zoom: 7.2,
    };
    setSelectedMarker(null);
    renderMap();
  };

  // Center on current device GPS location
  const handleLocateMe = () => {
    if (userLocation && isValidCoordinate(userLocation.lat, userLocation.lng)) {
      viewportRef.current.center = { lat: userLocation.lat, lng: userLocation.lng };
      viewportRef.current.zoom = 12.5;
      renderMap();
    }
  };

  // Hit test for marker selection
  const findMarkerAtScreenPoint = (
    screenX: number,
    screenY: number,
    canvasW: number,
    canvasH: number,
  ): MapMarker | null => {
    const clickRadius = 18;
    for (const marker of markers) {
      if (!isValidCoordinate(marker.lat, marker.lng)) continue;
      const pt = latLngToScreen(marker.lat, marker.lng, canvasW, canvasH);
      const dist = Math.hypot(pt.x - screenX, pt.y - screenY);
      if (dist <= clickRadius) {
        return marker;
      }
    }
    return null;
  };

  // Mouse event handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true;
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
    dragStartCenterRef.current = { ...viewportRef.current.center };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (isDraggingRef.current) {
      const dx = e.clientX - dragStartPosRef.current.x;
      const dy = e.clientY - dragStartPosRef.current.y;

      const { zoom } = viewportRef.current;
      const startWorld = latLngToWorld(
        dragStartCenterRef.current.lat,
        dragStartCenterRef.current.lng,
        zoom,
      );
      const newCenterWorld = {
        x: startWorld.x - dx,
        y: startWorld.y - dy,
      };

      const newCenter = worldToLatLng(newCenterWorld.x, newCenterWorld.y, zoom);
      // Constrain latitude to valid Web Mercator range
      newCenter.lat = Math.max(-85, Math.min(85, newCenter.lat));
      viewportRef.current.center = newCenter;
      renderMap();
    } else {
      // Hover hit-test
      const hit = findMarkerAtScreenPoint(mouseX, mouseY, rect.width, rect.height);
      if (hit !== hoveredMarker) {
        setHoveredMarker(hit);
        renderMap();
      }
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const dragDist = Math.hypot(
      e.clientX - dragStartPosRef.current.x,
      e.clientY - dragStartPosRef.current.y,
    );

    isDraggingRef.current = false;

    // Treat as click if movement was minimal
    if (dragDist < 6) {
      const hit = findMarkerAtScreenPoint(mouseX, mouseY, rect.width, rect.height);
      if (hit) {
        setSelectedMarker(hit);
        if (onSelectMarkerRef.current) onSelectMarkerRef.current(hit);
      } else {
        setSelectedMarker(null);
        if (onSelectMarkerRef.current) onSelectMarkerRef.current(null);
        if (onMapClickRef.current) {
          const clickedLatLng = screenToLatLng(mouseX, mouseY, rect.width, rect.height);
          onMapClickRef.current(clickedLatLng);
        }
      }
      renderMap();
    }
  };

  // Cursor-centered mouse wheel zoom
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const { center, zoom } = viewportRef.current;
    const zoomDelta = e.deltaY < 0 ? 0.35 : -0.35;
    const newZoom = Math.max(5.2, Math.min(17.5, zoom + zoomDelta));
    if (newZoom === zoom) return;

    // Zoom centered on cursor location
    const mouseWorldBefore = latLngToWorld(center.lat, center.lng, zoom);
    const cursorWorldBefore = {
      x: mouseWorldBefore.x + (mouseX - rect.width / 2),
      y: mouseWorldBefore.y + (mouseY - rect.height / 2),
    };
    const cursorLatLng = worldToLatLng(cursorWorldBefore.x, cursorWorldBefore.y, zoom);

    const cursorWorldAfter = latLngToWorld(cursorLatLng.lat, cursorLatLng.lng, newZoom);
    const newCenterWorld = {
      x: cursorWorldAfter.x - (mouseX - rect.width / 2),
      y: cursorWorldAfter.y - (mouseY - rect.height / 2),
    };

    const newCenter = worldToLatLng(newCenterWorld.x, newCenterWorld.y, newZoom);
    viewportRef.current = {
      center: newCenter,
      zoom: newZoom,
    };
    renderMap();
  };

  // Touch handlers for mobile pan & 2-finger pinch-to-zoom
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1 && e.touches[0]) {
      isDraggingRef.current = true;
      dragStartPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      dragStartCenterRef.current = { ...viewportRef.current.center };
    } else if (e.touches.length === 2 && e.touches[0] && e.touches[1]) {
      isDraggingRef.current = false;
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      pinchStartDistRef.current = dist;
      pinchStartZoomRef.current = viewportRef.current.zoom;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1 && isDraggingRef.current && e.touches[0]) {
      e.preventDefault();
      const dx = e.touches[0].clientX - dragStartPosRef.current.x;
      const dy = e.touches[0].clientY - dragStartPosRef.current.y;

      const { zoom } = viewportRef.current;
      const startWorld = latLngToWorld(
        dragStartCenterRef.current.lat,
        dragStartCenterRef.current.lng,
        zoom,
      );
      const newCenterWorld = {
        x: startWorld.x - dx,
        y: startWorld.y - dy,
      };

      const newCenter = worldToLatLng(newCenterWorld.x, newCenterWorld.y, zoom);
      viewportRef.current.center = newCenter;
      renderMap();
    } else if (
      e.touches.length === 2 &&
      pinchStartDistRef.current &&
      e.touches[0] &&
      e.touches[1]
    ) {
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      const zoomRatio = dist / pinchStartDistRef.current;
      const newZoom = Math.max(
        5.2,
        Math.min(17.5, pinchStartZoomRef.current + Math.log2(zoomRatio)),
      );
      viewportRef.current.zoom = newZoom;
      renderMap();
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 0) {
      isDraggingRef.current = false;
      pinchStartDistRef.current = null;
    }
  };

  const toggleFullscreen = () => {
    if (!outerContainerRef.current) return;
    if (!document.fullscreenElement) {
      outerContainerRef.current.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  };

  return (
    <Panel
      title={title}
      action={
        <div className="flex items-center gap-2">
          {actions}
          {/* Active Basemap Tag */}
          <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-bold text-sky-400">
            <Globe className="h-3 w-3" />
            {TILE_SOURCES[basemap].label}
          </span>

          <button
            type="button"
            onClick={() => setShowLayers((s) => !s)}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-semibold hover:bg-surface-2 transition-colors",
              showLayers && "border-primary bg-primary/10 text-primary",
            )}
            title="Toggle Map Layers"
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Layers</span>
          </button>
        </div>
      }
    >
      <div
        ref={outerContainerRef}
        className={cn(
          "relative min-h-[420px] w-full overflow-hidden rounded-xl border border-border bg-black select-none touch-none",
          className,
        )}
      >
        {/* Isolated Canvas Leaf Node - Zero DOM Reconciliation Conflicts */}
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="absolute inset-0 h-full w-full cursor-grab active:cursor-grabbing"
        />

        {/* Top-Right Map Controls Toolbar */}
        <div className="absolute right-3 top-3 flex flex-col gap-1.5 z-10">
          <button
            type="button"
            onClick={() => handleZoom(0.8)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/80 bg-surface/90 text-foreground shadow-lg backdrop-blur hover:bg-surface active:scale-95 transition-all"
            title="Zoom In"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => handleZoom(-0.8)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/80 bg-surface/90 text-foreground shadow-lg backdrop-blur hover:bg-surface active:scale-95 transition-all"
            title="Zoom Out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleResetView}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/80 bg-surface/90 text-foreground shadow-lg backdrop-blur hover:bg-surface active:scale-95 transition-all"
            title="Reset View (Andhra Pradesh)"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleLocateMe}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg border border-border/80 bg-surface/90 shadow-lg backdrop-blur hover:bg-surface active:scale-95 transition-all",
              userLocation ? "text-primary hover:text-primary" : "text-muted-foreground",
            )}
            title={userLocation ? "Locate My GPS Position" : "GPS Location Not Available"}
          >
            <Crosshair className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/80 bg-surface/90 text-foreground shadow-lg backdrop-blur hover:bg-surface active:scale-95 transition-all"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>

        {/* Top-Left Status Overlay */}
        <div className="absolute left-3 top-3 flex flex-wrap items-center gap-2 z-10">
          <div className="flex items-center gap-2 rounded-lg border border-border/80 bg-surface/90 px-3 py-1.5 text-xs shadow-lg backdrop-blur">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-semibold tracking-wide text-foreground">SATELLITE OPS</span>
            <span className="text-muted-foreground">|</span>
            <span className="text-muted-foreground font-mono text-[11px]">
              {userLocation ? "GPS LOCKED" : "AP CENTER"}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowLegend((l) => !l)}
            className="flex items-center gap-1 rounded-lg border border-border/80 bg-surface/90 px-2.5 py-1.5 text-xs shadow-lg backdrop-blur hover:bg-surface transition-colors"
          >
            <Info className="h-3.5 w-3.5 text-primary" />
            <span>Legend</span>
          </button>
        </div>

        {/* Layer Control Drawer / Flyout */}
        {showLayers && (
          <div className="absolute right-3 top-14 w-64 rounded-xl border border-border/90 bg-surface/95 p-3.5 shadow-2xl backdrop-blur-md z-20 space-y-3.5 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center justify-between border-b border-border/60 pb-2">
              <p className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5" /> Map Layer Settings
              </p>
              <button
                type="button"
                onClick={() => setShowLayers(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>

            {/* Basemap Selection */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Basemap Imagery
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(["satellite", "hybrid", "street"] as BasemapType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setBasemap(type);
                      renderMap();
                    }}
                    className={cn(
                      "rounded-lg border px-2 py-1.5 text-[11px] font-semibold capitalize transition-colors text-center",
                      basemap === type
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border bg-surface-2 text-muted-foreground hover:bg-surface",
                    )}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* Overlay Toggles */}
            <div className="space-y-2 border-t border-border/60 pt-2">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Active Overlays
              </label>

              <label className="flex items-center justify-between text-xs cursor-pointer">
                <span>Disaster Hazard Zones</span>
                <input
                  type="checkbox"
                  checked={showHazards}
                  onChange={(e) => {
                    setShowHazards(e.target.checked);
                    renderMap();
                  }}
                  className="rounded accent-primary"
                />
              </label>

              <label className="flex items-center justify-between text-xs cursor-pointer">
                <span>National & State Highways</span>
                <input
                  type="checkbox"
                  checked={showHighways}
                  onChange={(e) => {
                    setShowHighways(e.target.checked);
                    renderMap();
                  }}
                  className="rounded accent-primary"
                />
              </label>

              <label className="flex items-center justify-between text-xs cursor-pointer">
                <span>District Boundaries</span>
                <input
                  type="checkbox"
                  checked={showDistricts}
                  onChange={(e) => {
                    setShowDistricts(e.target.checked);
                    renderMap();
                  }}
                  className="rounded accent-primary"
                />
              </label>

              <label className="flex items-center justify-between text-xs cursor-pointer">
                <span>Emergency Facilities</span>
                <input
                  type="checkbox"
                  checked={showFacilities}
                  onChange={(e) => {
                    setShowFacilities(e.target.checked);
                    renderMap();
                  }}
                  className="rounded accent-primary"
                />
              </label>

              <label className="flex items-center justify-between text-xs cursor-pointer">
                <span>City & Town Names</span>
                <input
                  type="checkbox"
                  checked={showCities}
                  onChange={(e) => {
                    setShowCities(e.target.checked);
                    renderMap();
                  }}
                  className="rounded accent-primary"
                />
              </label>
            </div>
          </div>
        )}

        {/* Map Legend Modal / Panel */}
        {showLegend && (
          <div className="absolute left-3 top-14 w-60 rounded-xl border border-border/90 bg-surface/95 p-3.5 shadow-2xl backdrop-blur-md z-20 space-y-2 text-xs">
            <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
              <span className="font-bold text-foreground">Map Legend</span>
              <button
                type="button"
                onClick={() => setShowLegend(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center gap-2">
                <span className="flex h-3 w-3 rounded-full bg-emerald-500" />
                <span>✚ Hospital / Shelter</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex h-3 w-3 rounded-full bg-sky-500" />
                <span>◆ Rescue Team</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex h-3 w-3 rounded-full bg-red-500" />
                <span>⚡ SOS Emergency</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex h-3 w-3 rounded-full bg-amber-500" />
                <span>⚠ Hazard Risk Zone</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex h-3 w-3 rounded-full bg-blue-500" />
                <span>● Your Location</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-1 w-5 rounded bg-cyan-400" />
                <span>Emergency Road Route</span>
              </div>
            </div>
          </div>
        )}

        {/* Selected Marker Detail Card (Bottom Floating) */}
        {selectedMarker && (
          <div className="absolute bottom-6 left-3 right-3 sm:left-4 sm:right-auto sm:max-w-sm rounded-xl border border-primary/40 bg-surface/95 p-4 shadow-2xl backdrop-blur-md z-20 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span
                  className="inline-block rounded px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider mb-1"
                  style={{
                    backgroundColor: KIND_STYLE[selectedMarker.kind]?.bg || KIND_STYLE.resource.bg,
                  }}
                >
                  {KIND_STYLE[selectedMarker.kind]?.label || "Resource"}
                </span>
                <h4 className="font-bold text-sm text-foreground">{selectedMarker.label}</h4>
                {selectedMarker.detail && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{selectedMarker.detail}</p>
                )}
                {selectedMarker.address && (
                  <p className="mt-1 text-[11px] text-muted-foreground/80">
                    📍 {selectedMarker.address}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedMarker(null)}
                className="text-muted-foreground hover:text-foreground text-sm p-1"
              >
                ✕
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-2.5">
              {onRouteToMarker && (
                <Button size="sm" variant="primary" onClick={() => onRouteToMarker(selectedMarker)}>
                  <Navigation className="h-3.5 w-3.5" />
                  Route here
                </Button>
              )}
              {selectedMarker.phone && (
                <a
                  href={`tel:${selectedMarker.phone}`}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-semibold hover:bg-surface-2"
                >
                  <Phone className="h-3 w-3 text-emerald-400" />
                  Call
                </a>
              )}
            </div>
          </div>
        )}

        {/* Map Attribution Bar */}
        <div className="absolute bottom-1 right-2 z-10 pointer-events-none">
          <span className="rounded bg-black/60 px-2 py-0.5 text-[9px] text-white/70 backdrop-blur font-mono">
            {TILE_SOURCES[basemap].attribution}
          </span>
        </div>
      </div>
    </Panel>
  );
}

class MapErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; errorText: string }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, errorText: "" };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorText: error.message };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("OperationsMap error boundary:", error, errorInfo);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-96 w-full flex-col items-center justify-center rounded-xl border border-destructive/40 bg-surface p-6 text-center">
          <ShieldAlert className="h-10 w-10 text-destructive mb-3" />
          <h3 className="font-bold text-base">Satellite Map Unavailable</h3>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">
            {this.state.errorText || "Map rendering encountered an issue."}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, errorText: "" })}
            className="mt-4 rounded-lg bg-surface-2 border border-border px-4 py-2 text-xs font-semibold hover:bg-surface"
          >
            Reload Satellite Map
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
