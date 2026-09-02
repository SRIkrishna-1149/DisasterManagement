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
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type LatLng, haversineKm, isValidCoordinate } from "@/lib/geo";
import {
  INDIA_BOUNDS,
  INDIA_CENTER,
  isInsideIndia,
  formatEmergencyDistance,
  type DataQuality,
} from "@/lib/domain";
import {
  INDIA_NATIONAL_BOUNDARY,
  INDIA_STATES,
  AP_DISTRICTS,
  MAJOR_INDIAN_RIVERS,
  MAJOR_INDIAN_WATER_BODIES,
  INDIAN_PLACES,
} from "@/lib/india-map-data";
import { INDIAN_ROAD_SEGMENTS } from "@/lib/static-road-network";
import type { CalculatedRoute } from "@/lib/static-router";
import { DataTag, Panel, Button } from "./kit";

export type BasemapType = "hybrid" | "satellite" | "street";

export interface MapMarker extends LatLng {
  id: string;
  label: string;
  kind: "risk" | "resource" | "sos" | "team" | "alert" | "report";
  subType?:
    "HOSPITAL" | "SHELTER" | "POLICE" | "FIRE" | "RESCUE_BASE" | "EVACUATION_POINT" | "OTHER";
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
    label: "Emergency Facilities",
  },
  risk: {
    bg: "#f59e0b",
    text: "#000000",
    ring: "rgba(245, 158, 11, 0.45)",
    icon: "⚠",
    label: "Hazard & Risk Zones",
  },
  sos: {
    bg: "#ef4444",
    text: "#ffffff",
    ring: "rgba(239, 68, 68, 0.5)",
    icon: "⚡",
    label: "SOS Requests",
  },
  team: {
    bg: "#0ea5e9",
    text: "#ffffff",
    ring: "rgba(14, 165, 233, 0.45)",
    icon: "◆",
    label: "Rescue Teams",
  },
  alert: {
    bg: "#f97316",
    text: "#ffffff",
    ring: "rgba(249, 115, 22, 0.45)",
    icon: "!",
    label: "Official Warnings",
  },
  report: {
    bg: "#8b5cf6",
    text: "#ffffff",
    ring: "rgba(139, 92, 246, 0.45)",
    icon: "✎",
    label: "Field Reports",
  },
};

export function getMarkerVisual(marker: MapMarker) {
  if (marker.kind === "resource" && marker.subType) {
    switch (marker.subType) {
      case "HOSPITAL":
        return {
          bg: "#10b981",
          text: "#ffffff",
          ring: "rgba(16, 185, 129, 0.45)",
          icon: "✚",
          label: "Hospital / Medical",
        };
      case "SHELTER":
        return {
          bg: "#06b6d4",
          text: "#ffffff",
          ring: "rgba(6, 182, 212, 0.45)",
          icon: "⌂",
          label: "Relief Shelter",
        };
      case "POLICE":
        return {
          bg: "#6366f1",
          text: "#ffffff",
          ring: "rgba(99, 102, 241, 0.45)",
          icon: "🛡",
          label: "Police Station",
        };
      case "FIRE":
        return {
          bg: "#f97316",
          text: "#ffffff",
          ring: "rgba(249, 115, 22, 0.45)",
          icon: "🚒",
          label: "Fire & Rescue",
        };
      case "RESCUE_BASE":
        return {
          bg: "#0ea5e9",
          text: "#ffffff",
          ring: "rgba(14, 165, 233, 0.45)",
          icon: "◆",
          label: "NDRF/SDRF Base",
        };
      case "EVACUATION_POINT":
        return {
          bg: "#eab308",
          text: "#000000",
          ring: "rgba(234, 179, 8, 0.45)",
          icon: "★",
          label: "Evacuation Point",
        };
    }
  }
  return KIND_STYLE[marker.kind] || KIND_STYLE.resource;
}

// Legally permitted open GIS tile sources (Zero paid Google Cloud API requirements)
const TILE_SOURCES: Record<
  BasemapType,
  {
    getUrl: (x: number, y: number, z: number) => string;
    overlayUrl?: (x: number, y: number, z: number) => string;
    transportUrl?: (x: number, y: number, z: number) => string;
    attribution: string;
    label: string;
  }
> = {
  hybrid: {
    getUrl: (x, y, z) =>
      `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
    overlayUrl: (x, y, z) =>
      `https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/${z}/${y}/${x}`,
    transportUrl: (x, y, z) =>
      `https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/${z}/${y}/${x}`,
    attribution: "Tiles © Esri, Maxar, Earthstar Geographics, USDA, USGS",
    label: "Satellite + Labels",
  },
  satellite: {
    getUrl: (x, y, z) =>
      `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
    attribution: "Tiles © Esri, Maxar, Earthstar Geographics, USDA, USGS",
    label: "Satellite",
  },
  street: {
    getUrl: (x, y, z) =>
      `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${z}/${y}/${x}`,
    attribution: "Tiles © Esri, HERE, Garmin, OpenStreetMap contributors",
    label: "Street / Roads",
  },
};

// In-memory tile cache with bound to prevent memory leaks
const TILE_CACHE = new Map<string, HTMLImageElement>();
const FAILED_TILES = new Set<string>();
const MAX_CACHE_SIZE = 1000;

function getCachedTile(url: string, onLoaded?: () => void): HTMLImageElement | null {
  if (FAILED_TILES.has(url)) {
    return null;
  }

  if (TILE_CACHE.has(url)) {
    const img = TILE_CACHE.get(url)!;
    if (img.complete && img.naturalWidth > 0) {
      return img;
    }
    return null;
  }

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
    FAILED_TILES.add(url);
    if (onLoaded) onLoaded();
  };
  TILE_CACHE.set(url, img);
  return null;
}

// Web Mercator projection calculations
function latLngToWorld(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const scale = 256 * Math.pow(2, zoom);
  const x = ((lng + 180) / 360) * scale;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const clampedSin = Math.max(-0.9999, Math.min(0.9999, sinLat));
  const y = (0.5 - Math.log((1 + clampedSin) / (1 - clampedSin)) / (4 * Math.PI)) * scale;
  return { x, y };
}

function worldToLatLng(x: number, y: number, zoom: number): LatLng {
  const scale = 256 * Math.pow(2, zoom);
  const lng = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return {
    lat: Math.max(-85, Math.min(85, lat)),
    lng: Math.max(-180, Math.min(180, lng)),
  };
}

export interface MapPanelProps {
  markers?: MapMarker[];
  activeRoute?: CalculatedRoute | null;
  calculatedRoute?: CalculatedRoute | null;
  userLocation?: LatLng | null;
  accuracyM?: number | null;
  userAccuracyM?: number | null;
  title?: string;
  interactive?: boolean;
  onSelectMarker?: (marker: MapMarker | null) => void;
  onMapClick?: (point: LatLng) => void;
  onRouteToMarker?: (marker: MapMarker) => void;
  onRequestLocation?: () => Promise<unknown> | void;
  className?: string;
  pinMode?: boolean;
  pinLocation?: LatLng | null;
  selectedMarkerId?: string | null;
  initialCenter?: LatLng;
  initialZoom?: number;
  centerOn?: LatLng | null;
  hazardPolygons?: Array<{
    id: string;
    label: string;
    severity: "CRITICAL" | "HIGH" | "MEDIUM";
    points: LatLng[];
  }>;
}

export function MapPanel(props: MapPanelProps) {
  const resolvedRoute = props.activeRoute ?? props.calculatedRoute ?? null;
  const resolvedAccuracy = props.accuracyM ?? props.userAccuracyM ?? null;

  return (
    <MapErrorBoundary>
      <OperationsMapInternal {...props} activeRoute={resolvedRoute} accuracyM={resolvedAccuracy} />
    </MapErrorBoundary>
  );
}

export const OperationsMap = MapPanel;

class MapErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Map rendering error caught safely:", error, info);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center bg-slate-950 p-6 text-center text-slate-300">
          <AlertTriangle className="mb-3 h-10 w-10 text-amber-400" />
          <h3 className="text-base font-semibold text-white">Map Engine Initializing</h3>
          <p className="mt-1 text-xs text-slate-400">Reconnecting satellite imagery feed.</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            className="mt-4 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-xs font-medium text-cyan-300 hover:bg-cyan-500/20"
          >
            Reload Map
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Label collision detection box manager to prevent unreadable text overlap
 */
class LabelCollisionManager {
  private boxes: Array<{ x: number; y: number; w: number; h: number }> = [];

  canPlace(x: number, y: number, w: number, h: number): boolean {
    const pad = 4;
    for (const b of this.boxes) {
      if (x - pad < b.x + b.w && x + w + pad > b.x && y - pad < b.y + b.h && y + h + pad > b.y) {
        return false;
      }
    }
    return true;
  }

  add(x: number, y: number, w: number, h: number) {
    this.boxes.push({ x, y, w, h });
  }

  clear() {
    this.boxes = [];
  }
}

function OperationsMapInternal({
  markers = [],
  activeRoute = null,
  userLocation = null,
  accuracyM = null,
  interactive = true,
  onSelectMarker,
  onMapClick,
  onRouteToMarker,
  onRequestLocation,
  className,
  pinMode = false,
  pinLocation = null,
  selectedMarkerId = null,
  initialCenter,
  centerOn = null,
  hazardPolygons = [],
}: MapPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | null>(null);

  const [basemap, setBasemap] = useState<BasemapType>("hybrid");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showLayerDrawer, setShowLayerDrawer] = useState(false);
  const [selectedMarker, setSelectedMarker] = useState<MapMarker | null>(null);
  const [hoveredMarker, setHoveredMarker] = useState<MapMarker | null>(null);
  const [tileLoadError, setTileLoadError] = useState(false);

  const [layerSettings, setLayerSettings] = useState({
    hazards: true,
    highways: true,
    districts: true,
    facilities: true,
    labels: true,
    water: true,
  });

  // Default viewport opens on India overview
  const defaultCenter =
    initialCenter && isValidCoordinate(initialCenter.lat, initialCenter.lng)
      ? initialCenter
      : INDIA_CENTER;
  const defaultZoom = 5.0;

  const viewportRef = useRef<{ center: LatLng; zoom: number }>({
    center: { ...defaultCenter },
    zoom: defaultZoom,
  });

  // Input pointer state machine (prevents cursor movement from dragging map!)
  const pointerStateRef = useRef<{
    isDown: boolean;
    isDragging: boolean;
    startX: number;
    startY: number;
    startCenter: LatLng;
  }>({
    isDown: false,
    isDragging: false,
    startX: 0,
    startY: 0,
    startCenter: { ...defaultCenter },
  });

  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef<number>(5.0);

  const onSelectMarkerRef = useRef(onSelectMarker);
  const onMapClickRef = useRef(onMapClick);
  useEffect(() => {
    onSelectMarkerRef.current = onSelectMarker;
    onMapClickRef.current = onMapClick;
  }, [onSelectMarker, onMapClick]);

  // Sync selected marker from external props
  useEffect(() => {
    if (selectedMarkerId) {
      const match = markers.find((m) => m.id === selectedMarkerId);
      if (match) setSelectedMarker(match);
    }
  }, [selectedMarkerId, markers]);

  // Coordinate transformations
  const latLngToScreen = useCallback((lat: number, lng: number, width: number, height: number) => {
    const { center, zoom } = viewportRef.current;
    const pointWorld = latLngToWorld(lat, lng, zoom);
    const centerWorld = latLngToWorld(center.lat, center.lng, zoom);
    return {
      x: width / 2 + (pointWorld.x - centerWorld.x),
      y: height / 2 + (pointWorld.y - centerWorld.y),
    };
  }, []);

  const screenToLatLng = useCallback(
    (screenX: number, screenY: number, width: number, height: number): LatLng => {
      const { center, zoom } = viewportRef.current;
      const centerWorld = latLngToWorld(center.lat, center.lng, zoom);
      const pointWorld = {
        x: centerWorld.x + (screenX - width / 2),
        y: centerWorld.y + (screenY - height / 2),
      };
      return worldToLatLng(pointWorld.x, pointWorld.y, zoom);
    },
    [],
  );

  // Main rendering pipeline
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
    const labelManager = new LabelCollisionManager();

    // 1. Draw raster tiles (ESRI World Imagery or Esri Street)
    const baseZ = Math.min(19, Math.max(2, Math.round(zoom)));
    const scale = Math.pow(2, zoom - baseZ);
    const tileSource = TILE_SOURCES[basemap];

    const centerWorld = latLngToWorld(center.lat, center.lng, baseZ);
    const topLeftWorldX = centerWorld.x - width / (2 * scale);
    const topLeftWorldY = centerWorld.y - height / (2 * scale);

    const startTileX = Math.floor(topLeftWorldX / 256);
    const endTileX = Math.floor((topLeftWorldX + width / scale) / 256);
    const startTileY = Math.floor(topLeftWorldY / 256);
    const endTileY = Math.floor((topLeftWorldY + height / scale) / 256);

    const numTiles = Math.pow(2, baseZ);

    for (let tx = startTileX; tx <= endTileX; tx++) {
      for (let ty = startTileY; ty <= endTileY; ty++) {
        if (ty < 0 || ty >= numTiles) continue;
        const wrappedTx = ((tx % numTiles) + numTiles) % numTiles;

        const tileUrl = tileSource.getUrl(wrappedTx, ty, baseZ);
        const tileImg = getCachedTile(tileUrl, () => {
          if (animFrameRef.current === null) {
            animFrameRef.current = requestAnimationFrame(() => {
              animFrameRef.current = null;
              renderMap();
            });
          }
        });

        const screenTileX = (tx * 256 - topLeftWorldX) * scale;
        const screenTileY = (ty * 256 - topLeftWorldY) * scale;
        const renderTileSize = 256 * scale;

        if (tileImg) {
          ctx.drawImage(tileImg, screenTileX, screenTileY, renderTileSize, renderTileSize);
        } else {
          // Robust ancestor tile fallback (levels -1 and -2) to eliminate blank flickering
          let drawn = false;
          for (let pLevel = 1; pLevel <= 2; pLevel++) {
            const parentZ = baseZ - pLevel;
            if (parentZ >= 2) {
              const factor = Math.pow(2, pLevel);
              const ptx = Math.floor(wrappedTx / factor);
              const pty = Math.floor(ty / factor);
              const parentUrl = tileSource.getUrl(ptx, pty, parentZ);
              const parentImg = TILE_CACHE.get(parentUrl);
              if (parentImg && parentImg.complete && parentImg.naturalWidth > 0) {
                const subSize = 256 / factor;
                const subX = (wrappedTx % factor) * subSize;
                const subY = (ty % factor) * subSize;
                ctx.drawImage(
                  parentImg,
                  subX,
                  subY,
                  subSize,
                  subSize,
                  screenTileX,
                  screenTileY,
                  renderTileSize,
                  renderTileSize,
                );
                drawn = true;
                break;
              }
            }
          }
          if (!drawn) {
            ctx.fillStyle = "#0c1524";
            ctx.fillRect(screenTileX, screenTileY, renderTileSize, renderTileSize);
          }
        }

        // Draw hybrid reference labels & roads tiles if enabled
        if (layerSettings.labels && tileSource.overlayUrl) {
          const overlayUrl = tileSource.overlayUrl(wrappedTx, ty, baseZ);
          const overlayImg = getCachedTile(overlayUrl, () => renderMap());
          if (overlayImg) {
            ctx.drawImage(overlayImg, screenTileX, screenTileY, renderTileSize, renderTileSize);
          }
        }
        if (layerSettings.highways && tileSource.transportUrl && zoom >= 7.5) {
          const transUrl = tileSource.transportUrl(wrappedTx, ty, baseZ);
          const transImg = getCachedTile(transUrl, () => renderMap());
          if (transImg) {
            ctx.drawImage(transImg, screenTileX, screenTileY, renderTileSize, renderTileSize);
          }
        }
      }
    }

    // 2. Administrative Boundaries & State Names
    if (layerSettings.districts) {
      // National border outline
      ctx.beginPath();
      let first = true;
      for (const pt of INDIA_NATIONAL_BOUNDARY) {
        const s = latLngToScreen(pt.lat, pt.lng, width, height);
        if (first) {
          ctx.moveTo(s.x, s.y);
          first = false;
        } else {
          ctx.lineTo(s.x, s.y);
        }
      }
      ctx.strokeStyle = "rgba(0, 245, 255, 0.4)";
      ctx.lineWidth = Math.max(1.5, Math.min(3.5, zoom * 0.35));
      ctx.stroke();

      // State Names & Centroids (Z4 to Z8)
      if (zoom >= 4.0 && zoom <= 8.5) {
        ctx.font = "bold 11px system-ui, sans-serif";
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        for (const st of INDIA_STATES) {
          const s = latLngToScreen(st.centroid.lat, st.centroid.lng, width, height);
          if (s.x > -60 && s.x < width + 60 && s.y > -20 && s.y < height + 20) {
            if (labelManager.canPlace(s.x - 45, s.y - 8, 90, 16)) {
              ctx.shadowColor = "rgba(0,0,0,0.85)";
              ctx.shadowBlur = 4;
              ctx.fillText(st.name.toUpperCase(), s.x, s.y);
              ctx.shadowBlur = 0;
              labelManager.add(s.x - 45, s.y - 8, 90, 16);
            }
          }
        }
      }

      // Andhra Pradesh 26 Districts Boundaries & HQ (Z6.5 to Z12)
      if (zoom >= 6.5) {
        for (const dist of AP_DISTRICTS) {
          if (dist.polygon.length > 0) {
            ctx.beginPath();
            let pFirst = true;
            for (const p of dist.polygon) {
              const s = latLngToScreen(p.lat, p.lng, width, height);
              if (pFirst) {
                ctx.moveTo(s.x, s.y);
                pFirst = false;
              } else {
                ctx.lineTo(s.x, s.y);
              }
            }
            ctx.closePath();
            ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
            ctx.lineWidth = 1.2;
            ctx.stroke();
          }

          if (zoom >= 8.0 && zoom <= 12.0) {
            const cs = latLngToScreen(dist.centroid.lat, dist.centroid.lng, width, height);
            if (cs.x > 0 && cs.x < width && cs.y > 0 && cs.y < height) {
              if (labelManager.canPlace(cs.x - 40, cs.y - 7, 80, 14)) {
                ctx.font = "600 10px system-ui, sans-serif";
                ctx.fillStyle = "rgba(224, 242, 254, 0.9)";
                ctx.textAlign = "center";
                ctx.shadowColor = "rgba(0,0,0,0.9)";
                ctx.shadowBlur = 4;
                ctx.fillText(dist.name, cs.x, cs.y);
                ctx.shadowBlur = 0;
                labelManager.add(cs.x - 40, cs.y - 7, 80, 14);
              }
            }
          }
        }
      }
    }

    // 3. Water Bodies & Rivers
    if (layerSettings.water) {
      ctx.strokeStyle = "rgba(56, 189, 248, 0.65)";
      ctx.lineWidth = Math.max(1.5, Math.min(4, zoom * 0.4));
      ctx.lineCap = "round";

      for (const river of MAJOR_INDIAN_RIVERS) {
        ctx.beginPath();
        let rFirst = true;
        for (const pt of river.path) {
          const s = latLngToScreen(pt.lat, pt.lng, width, height);
          if (rFirst) {
            ctx.moveTo(s.x, s.y);
            rFirst = false;
          } else {
            ctx.lineTo(s.x, s.y);
          }
        }
        ctx.stroke();
      }

      // Lakes & Reservoirs
      if (zoom >= 6.5) {
        for (const wb of MAJOR_INDIAN_WATER_BODIES) {
          const s = latLngToScreen(wb.center.lat, wb.center.lng, width, height);
          if (s.x > -50 && s.x < width + 50 && s.y > -50 && s.y < height + 50) {
            const radPx = Math.max(6, (wb.radiusKm / 40000) * 256 * Math.pow(2, zoom));
            ctx.beginPath();
            ctx.arc(s.x, s.y, radPx, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(14, 165, 233, 0.35)";
            ctx.fill();
            ctx.strokeStyle = "rgba(56, 189, 248, 0.7)";
            ctx.lineWidth = 1;
            ctx.stroke();

            if (zoom >= 8.5 && labelManager.canPlace(s.x - 35, s.y - 7, 70, 14)) {
              ctx.font = "italic 9px system-ui, sans-serif";
              ctx.fillStyle = "#bae6fd";
              ctx.textAlign = "center";
              ctx.shadowColor = "rgba(0,0,0,0.9)";
              ctx.shadowBlur = 3;
              ctx.fillText(wb.name, s.x, s.y);
              ctx.shadowBlur = 0;
              labelManager.add(s.x - 35, s.y - 7, 70, 14);
            }
          }
        }
      }
    }

    // 4. Static Road Network Overlays
    if (layerSettings.highways && zoom >= 6.0) {
      for (const seg of INDIAN_ROAD_SEGMENTS) {
        if (seg.path.length < 2) continue;
        ctx.beginPath();
        let sFirst = true;
        for (const p of seg.path) {
          const s = latLngToScreen(p.lat, p.lng, width, height);
          if (sFirst) {
            ctx.moveTo(s.x, s.y);
            sFirst = false;
          } else {
            ctx.lineTo(s.x, s.y);
          }
        }

        // High contrast dual-casing
        ctx.strokeStyle = "rgba(15, 23, 42, 0.85)";
        ctx.lineWidth = seg.roadType === "NATIONAL_HIGHWAY" ? 4.5 : 3.0;
        ctx.stroke();

        ctx.strokeStyle = seg.roadType === "NATIONAL_HIGHWAY" ? "#fbbf24" : "#38bdf8";
        ctx.lineWidth = seg.roadType === "NATIONAL_HIGHWAY" ? 2.2 : 1.4;
        ctx.stroke();

        // National Highway Shield Badge (NH 16, NH 44, NH 48, etc.)
        if (seg.roadType === "NATIONAL_HIGHWAY" && zoom >= 7.5 && seg.path.length >= 2) {
          const nhMatch = seg.roadName.match(/NH\s*\d+/i);
          if (nhMatch) {
            const shieldText = nhMatch[0].toUpperCase();
            const midPt = seg.path[Math.floor(seg.path.length / 2)];
            if (midPt) {
              const ms = latLngToScreen(midPt.lat, midPt.lng, width, height);
              if (ms.x > 30 && ms.x < width - 30 && ms.y > 20 && ms.y < height - 20) {
                if (labelManager.canPlace(ms.x - 20, ms.y - 8, 40, 16)) {
                  ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
                  ctx.beginPath();
                  ctx.roundRect(ms.x - 18, ms.y - 7, 36, 14, 3);
                  ctx.fill();
                  ctx.strokeStyle = "#fbbf24";
                  ctx.lineWidth = 1;
                  ctx.stroke();

                  ctx.font = "bold 8px system-ui, sans-serif";
                  ctx.fillStyle = "#fbbf24";
                  ctx.textAlign = "center";
                  ctx.textBaseline = "middle";
                  ctx.fillText(shieldText, ms.x, ms.y);
                  labelManager.add(ms.x - 20, ms.y - 8, 40, 16);
                }
              }
            }
          }
        }
      }
    }

    // 5. Hierarchical Place Names (Tier 1-4)
    if (layerSettings.labels) {
      for (const place of INDIAN_PLACES) {
        // Filter by semantic zoom tier
        if (place.tier === 1 && zoom < 4.5) continue;
        if (place.tier === 2 && zoom < 7.0) continue;
        if (place.tier === 3 && zoom < 10.0) continue;
        if (place.tier === 4 && zoom < 13.0) continue;

        const s = latLngToScreen(place.lat, place.lng, width, height);
        if (s.x < 10 || s.x > width - 10 || s.y < 10 || s.y > height - 10) continue;

        const textWidth = ctx.measureText(place.name).width;
        if (!labelManager.canPlace(s.x - textWidth / 2 - 2, s.y - 8, textWidth + 4, 16)) {
          continue;
        }

        // Dot indicator
        ctx.beginPath();
        ctx.arc(s.x, s.y, place.tier === 1 ? 3.5 : 2.5, 0, Math.PI * 2);
        ctx.fillStyle = place.tier === 1 ? "#ffffff" : "rgba(255, 255, 255, 0.8)";
        ctx.fill();
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Label text
        ctx.font =
          place.tier === 1 ? "bold 11px system-ui, sans-serif" : "500 10px system-ui, sans-serif";
        ctx.fillStyle = place.tier === 1 ? "#ffffff" : "rgba(241, 245, 249, 0.95)";
        ctx.textAlign = "center";
        ctx.shadowColor = "rgba(0,0,0,0.9)";
        ctx.shadowBlur = 4;
        ctx.fillText(place.name, s.x, s.y - 6);
        ctx.shadowBlur = 0;

        labelManager.add(s.x - textWidth / 2 - 2, s.y - 8, textWidth + 4, 16);
      }
    }

    // 6. Hazard & Risk Zones (Semi-transparent danger disks with pulsing rings)
    if (layerSettings.hazards) {
      for (const hazard of hazardPolygons) {
        if (hazard.points.length < 3) continue;
        ctx.beginPath();
        let hFirst = true;
        for (const pt of hazard.points) {
          const s = latLngToScreen(pt.lat, pt.lng, width, height);
          if (hFirst) {
            ctx.moveTo(s.x, s.y);
            hFirst = false;
          } else {
            ctx.lineTo(s.x, s.y);
          }
        }
        ctx.closePath();

        const color =
          hazard.severity === "CRITICAL" ? "rgba(239, 68, 68, 0.35)" : "rgba(245, 158, 11, 0.3)";
        const strokeColor =
          hazard.severity === "CRITICAL" ? "rgba(239, 68, 68, 0.8)" : "rgba(245, 158, 11, 0.8)";

        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // 7. Active Static Road Route Overlay
    if (activeRoute && activeRoute.path.length >= 2) {
      ctx.beginPath();
      let rFirst = true;
      for (const pt of activeRoute.path) {
        const s = latLngToScreen(pt.lat, pt.lng, width, height);
        if (rFirst) {
          ctx.moveTo(s.x, s.y);
          rFirst = false;
        } else {
          ctx.lineTo(s.x, s.y);
        }
      }

      // Outer glow & casing
      ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
      ctx.lineWidth = 6.5;
      ctx.stroke();

      ctx.strokeStyle = "#00f5ff";
      ctx.lineWidth = 3.8;
      ctx.stroke();

      // Route Start Pin (Green)
      const startPt = activeRoute.path[0]!;
      const startScreen = latLngToScreen(startPt.lat, startPt.lng, width, height);
      ctx.beginPath();
      ctx.arc(startScreen.x, startScreen.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#10b981";
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Route End Pin (Cyan/Red)
      const endPt = activeRoute.path[activeRoute.path.length - 1]!;
      const endScreen = latLngToScreen(endPt.lat, endPt.lng, width, height);
      ctx.beginPath();
      ctx.arc(endScreen.x, endScreen.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = "#ef4444";
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 8. Tactical Emergency Markers
    if (layerSettings.facilities) {
      for (const marker of markers) {
        if (!isValidCoordinate(marker.lat, marker.lng)) continue;
        const s = latLngToScreen(marker.lat, marker.lng, width, height);
        if (s.x < -30 || s.x > width + 30 || s.y < -30 || s.y > height + 30) continue;

        const isHovered = hoveredMarker?.id === marker.id;
        const isSelected = selectedMarker?.id === marker.id;
        const style = getMarkerVisual(marker);

        const radius = isSelected ? 14 : isHovered ? 12 : 9;

        // Outer pulsing ring
        ctx.beginPath();
        ctx.arc(s.x, s.y, radius + 4, 0, Math.PI * 2);
        ctx.fillStyle = style.ring;
        ctx.fill();

        // Core marker
        ctx.beginPath();
        ctx.arc(s.x, s.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = style.bg;
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Icon inside marker
        ctx.font = `bold ${radius > 10 ? 11 : 9}px system-ui, sans-serif`;
        ctx.fillStyle = style.text;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(style.icon, s.x, s.y);

        // Marker label at zoom >= 11
        if (zoom >= 11.5 || isSelected || isHovered) {
          ctx.font = "600 10px system-ui, sans-serif";
          ctx.fillStyle = "#ffffff";
          ctx.shadowColor = "rgba(0,0,0,0.9)";
          ctx.shadowBlur = 4;
          ctx.fillText(marker.label, s.x, s.y + radius + 10);
          ctx.shadowBlur = 0;
        }
      }
    }

    // 9. Precise User Location Pulse & True Accuracy Radius
    if (userLocation && isValidCoordinate(userLocation.lat, userLocation.lng)) {
      const s = latLngToScreen(userLocation.lat, userLocation.lng, width, height);

      // True Accuracy radius circle based on coords.accuracy
      if (accuracyM && accuracyM > 0) {
        const metersPerPixel =
          (156543.03392 * Math.cos((userLocation.lat * Math.PI) / 180)) / Math.pow(2, zoom);
        const radiusPixels = Math.max(8, accuracyM / metersPerPixel);

        const isLowAccuracy = accuracyM > 100;
        ctx.beginPath();
        ctx.arc(s.x, s.y, radiusPixels, 0, Math.PI * 2);
        ctx.fillStyle = isLowAccuracy ? "rgba(245, 158, 11, 0.12)" : "rgba(14, 165, 233, 0.15)";
        ctx.fill();
        ctx.strokeStyle = isLowAccuracy ? "rgba(245, 158, 11, 0.55)" : "rgba(56, 189, 248, 0.55)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      // Outer pulse ring
      ctx.beginPath();
      ctx.arc(s.x, s.y, 14, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0, 245, 255, 0.25)";
      ctx.fill();

      // Inner dot
      ctx.beginPath();
      ctx.arc(s.x, s.y, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = "#00f5ff";
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();

      // "YOU" badge
      ctx.font = "bold 9px system-ui, sans-serif";
      ctx.fillStyle = "#00f5ff";
      ctx.textAlign = "center";
      ctx.shadowColor = "rgba(0,0,0,0.9)";
      ctx.shadowBlur = 3;
      ctx.fillText("YOU", s.x, s.y - 12);

      // Honest accuracy readout
      if (accuracyM && accuracyM > 0) {
        ctx.font = "600 8px system-ui, sans-serif";
        ctx.fillStyle = accuracyM > 100 ? "#fbbf24" : "rgba(224, 242, 254, 0.9)";
        ctx.fillText(`±${Math.round(accuracyM)} m`, s.x, s.y + 16);
      }
      ctx.shadowBlur = 0;
    }

    // 10. Manual Drop Pin
    if (pinMode && pinLocation && isValidCoordinate(pinLocation.lat, pinLocation.lng)) {
      const s = latLngToScreen(pinLocation.lat, pinLocation.lng, width, height);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 9, 0, Math.PI * 2);
      ctx.fillStyle = "#ef4444";
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.font = "bold 10px system-ui, sans-serif";
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.fillText("📍", s.x, s.y - 14);
    }
  }, [
    basemap,
    layerSettings,
    markers,
    activeRoute,
    userLocation,
    accuracyM,
    hoveredMarker,
    selectedMarker,
    pinMode,
    pinLocation,
    hazardPolygons,
    latLngToScreen,
  ]);

  // Center on external coordinates if provided
  useEffect(() => {
    if (centerOn && isValidCoordinate(centerOn.lat, centerOn.lng)) {
      viewportRef.current.center = { ...centerOn };
      renderMap();
    }
  }, [centerOn, renderMap]);

  // Auto-fit route viewport
  useEffect(() => {
    if (activeRoute && activeRoute.bounds) {
      const { minLat, maxLat, minLng, maxLng } = activeRoute.bounds;
      const centerLat = (minLat + maxLat) / 2;
      const centerLng = (minLng + maxLng) / 2;
      const latDiff = Math.max(0.04, maxLat - minLat);
      const lngDiff = Math.max(0.04, maxLng - minLng);

      const maxDiff = Math.max(latDiff, lngDiff);
      let calculatedZoom = 11.5;
      if (maxDiff > 8.0) calculatedZoom = 5.5;
      else if (maxDiff > 4.0) calculatedZoom = 6.8;
      else if (maxDiff > 2.0) calculatedZoom = 8.0;
      else if (maxDiff > 1.0) calculatedZoom = 9.2;
      else if (maxDiff > 0.5) calculatedZoom = 10.5;
      else if (maxDiff > 0.2) calculatedZoom = 11.8;
      else calculatedZoom = 13.0;

      viewportRef.current = {
        center: { lat: centerLat, lng: centerLng },
        zoom: calculatedZoom,
      };
      renderMap();
    }
  }, [activeRoute, renderMap]);

  // Resize canvas to match display container
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = container.getBoundingClientRect();
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);

    if (w > 0 && h > 0) {
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.scale(dpr, dpr);
      }
      renderMap();
    }
  }, [renderMap]);

  useEffect(() => {
    resizeCanvas();
    const ro = new ResizeObserver(() => resizeCanvas());
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", resizeCanvas);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [resizeCanvas]);

  useEffect(() => {
    renderMap();
  }, [renderMap]);

  // Hit test for marker selection
  const findMarkerAtScreenPoint = (
    screenX: number,
    screenY: number,
    canvasW: number,
    canvasH: number,
  ): MapMarker | null => {
    const clickRadius = 16;
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

  // Pointer event handlers (POINTER STATE MACHINE - strictly only pans when left mouse button is pressed!)
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return; // Left click only
    const canvas = canvasRef.current;
    if (canvas) canvas.setPointerCapture(e.pointerId);

    pointerStateRef.current = {
      isDown: true,
      isDragging: false,
      startX: e.clientX,
      startY: e.clientY,
      startCenter: { ...viewportRef.current.center },
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // If pointer is not pressed, NEVER move the map! Only do hover detection
    if (!pointerStateRef.current.isDown) {
      const hit = findMarkerAtScreenPoint(mouseX, mouseY, rect.width, rect.height);
      if (hit !== hoveredMarker) {
        setHoveredMarker(hit);
        canvas.style.cursor = hit ? "pointer" : "default";
        renderMap();
      }
      return;
    }

    // Check if mouse button is actively held down
    if (e.pointerType === "mouse" && e.buttons !== 1) {
      pointerStateRef.current.isDown = false;
      pointerStateRef.current.isDragging = false;
      canvas.style.cursor = "default";
      return;
    }

    const dx = e.clientX - pointerStateRef.current.startX;
    const dy = e.clientY - pointerStateRef.current.startY;
    const dist = Math.hypot(dx, dy);

    if (dist > 3) {
      pointerStateRef.current.isDragging = true;
      canvas.style.cursor = "grabbing";

      const { zoom } = viewportRef.current;
      const startWorld = latLngToWorld(
        pointerStateRef.current.startCenter.lat,
        pointerStateRef.current.startCenter.lng,
        zoom,
      );
      const newCenterWorld = {
        x: startWorld.x - dx,
        y: startWorld.y - dy,
      };

      const newCenter = worldToLatLng(newCenterWorld.x, newCenterWorld.y, zoom);
      // Constrain camera position to India geographic bounds
      newCenter.lat = Math.max(INDIA_BOUNDS.minLat, Math.min(INDIA_BOUNDS.maxLat, newCenter.lat));
      newCenter.lng = Math.max(INDIA_BOUNDS.minLng, Math.min(INDIA_BOUNDS.maxLng, newCenter.lng));

      viewportRef.current.center = newCenter;
      renderMap();
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas && canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }

    if (!pointerStateRef.current.isDragging) {
      // Treat as click / tap
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
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
      }
    }

    pointerStateRef.current.isDown = false;
    pointerStateRef.current.isDragging = false;
    if (canvas) canvas.style.cursor = "default";
    renderMap();
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas && canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
    pointerStateRef.current.isDown = false;
    pointerStateRef.current.isDragging = false;
    if (canvas) canvas.style.cursor = "default";
    setHoveredMarker(null);
  };

  // Mobile pinch-to-zoom handlers
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 2 && e.touches[0] && e.touches[1]) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      pinchStartDistRef.current = dist;
      pinchStartZoomRef.current = viewportRef.current.zoom;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 2 && pinchStartDistRef.current && e.touches[0] && e.touches[1]) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      const zoomFactor = dist / pinchStartDistRef.current;
      const newZoom = Math.max(
        5.0,
        Math.min(19.0, pinchStartZoomRef.current + Math.log2(zoomFactor)),
      );
      viewportRef.current.zoom = newZoom;
      renderMap();
    }
  };

  const handleTouchEnd = () => {
    pinchStartDistRef.current = null;
  };

  // UI Control actions - smooth deep zoom from Z5 to Z19.0 (Native House/Building level)
  const zoomIn = () => {
    viewportRef.current.zoom = Math.min(19.0, viewportRef.current.zoom + 1.0);
    renderMap();
  };

  const zoomOut = () => {
    viewportRef.current.zoom = Math.max(5.0, viewportRef.current.zoom - 1.0);
    renderMap();
  };

  const resetIndiaView = () => {
    viewportRef.current = {
      center: { ...INDIA_CENTER },
      zoom: 5.0,
    };
    renderMap();
  };

  const locateUser = async () => {
    if (onRequestLocation) {
      try {
        await onRequestLocation();
      } catch (err) {
        console.warn("Location request in map panel failed:", err);
      }
    }
    if (userLocation && isValidCoordinate(userLocation.lat, userLocation.lng)) {
      viewportRef.current = {
        center: { ...userLocation },
        zoom: 17.0,
      };
      renderMap();
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current
        .requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch(() => {});
    } else {
      document
        .exitFullscreen()
        .then(() => setIsFullscreen(false))
        .catch(() => {});
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex h-full min-h-[380px] w-full flex-col overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950 shadow-2xl select-none",
        isFullscreen && "fixed inset-0 z-50 rounded-none border-none",
        className,
      )}
    >
      {/* Canvas rendering layer - Notice: Mouse wheel is NOT captured, page scrolls naturally! */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="absolute inset-0 h-full w-full"
      />

      {/* Top Bar: Clean mode indicator, GPS readout & Active route stats */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2">
        <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-950/90 px-3 py-1.5 shadow-lg backdrop-blur-md">
          <div className="h-2 w-2 rounded-full bg-emerald-400" />
          <span className="text-xs font-semibold text-white">{TILE_SOURCES[basemap].label}</span>
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-300">
            India Scope
          </span>
        </div>

        {userLocation && accuracyM !== null && (
          <div className="pointer-events-auto flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-950/90 px-2.5 py-1.5 text-xs text-slate-300 shadow-lg backdrop-blur-md">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                accuracyM > 100 ? "bg-amber-400 animate-pulse" : "bg-cyan-400",
              )}
            />
            <span>Accuracy: ±{Math.round(accuracyM)} m</span>
          </div>
        )}

        {activeRoute && (
          <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-slate-950/90 px-3 py-1.5 shadow-lg backdrop-blur-md">
            <RouteIcon className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-xs font-semibold text-white">{activeRoute.distanceText}</span>
            <span className="text-[10px] text-slate-400">({activeRoute.durationText})</span>
          </div>
        )}
      </div>

      {/* Right Controls Toolbar */}
      <div className="absolute right-3 top-3 z-10 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={zoomIn}
          title="Zoom In"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-900/90 text-slate-200 shadow-md backdrop-blur-md transition hover:bg-slate-800 hover:text-white"
        >
          <ZoomIn className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={zoomOut}
          title="Zoom Out"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-900/90 text-slate-200 shadow-md backdrop-blur-md transition hover:bg-slate-800 hover:text-white"
        >
          <ZoomOut className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={resetIndiaView}
          title="Reset India View"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-900/90 text-slate-200 shadow-md backdrop-blur-md transition hover:bg-slate-800 hover:text-cyan-300"
        >
          <RotateCcw className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={locateUser}
          title="My Location (High-Accuracy GPS)"
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg border shadow-md backdrop-blur-md transition",
            userLocation
              ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/25"
              : "border-slate-700/80 bg-slate-900/90 text-slate-400 hover:bg-slate-800 hover:text-cyan-300",
          )}
        >
          <Crosshair className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => setShowLayerDrawer(!showLayerDrawer)}
          title="Map Layers"
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg border shadow-md backdrop-blur-md transition",
            showLayerDrawer
              ? "border-cyan-400 bg-cyan-500/20 text-cyan-300"
              : "border-slate-700/80 bg-slate-900/90 text-slate-200 hover:bg-slate-800 hover:text-white",
          )}
        >
          <Layers className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={toggleFullscreen}
          title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-900/90 text-slate-200 shadow-md backdrop-blur-md transition hover:bg-slate-800 hover:text-white"
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>

      {/* Layer Control Drawer Popover */}
      {showLayerDrawer && (
        <div className="absolute right-14 top-3 z-20 w-64 rounded-xl border border-slate-800 bg-slate-950/95 p-4 shadow-2xl backdrop-blur-xl">
          <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-white">
              Map Layers
            </span>
            <button
              type="button"
              onClick={() => setShowLayerDrawer(false)}
              className="text-xs text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="mb-3 space-y-1.5">
            <span className="text-[11px] font-medium text-slate-400">Basemap Style</span>
            <div className="grid grid-cols-1 gap-1.5">
              <button
                type="button"
                onClick={() => setBasemap("hybrid")}
                className={cn(
                  "rounded-md border px-2.5 py-1.5 text-left text-xs font-medium transition",
                  basemap === "hybrid"
                    ? "border-cyan-500/60 bg-cyan-500/20 text-cyan-300 font-semibold"
                    : "border-slate-800 bg-slate-900 text-slate-400 hover:bg-slate-800",
                )}
              >
                Satellite + Labels
              </button>
              <button
                type="button"
                onClick={() => setBasemap("satellite")}
                className={cn(
                  "rounded-md border px-2.5 py-1.5 text-left text-xs font-medium transition",
                  basemap === "satellite"
                    ? "border-cyan-500/60 bg-cyan-500/20 text-cyan-300 font-semibold"
                    : "border-slate-800 bg-slate-900 text-slate-400 hover:bg-slate-800",
                )}
              >
                Satellite (Aerial Only)
              </button>
              <button
                type="button"
                onClick={() => setBasemap("street")}
                className={cn(
                  "rounded-md border px-2.5 py-1.5 text-left text-xs font-medium transition",
                  basemap === "street"
                    ? "border-cyan-500/60 bg-cyan-500/20 text-cyan-300 font-semibold"
                    : "border-slate-800 bg-slate-900 text-slate-400 hover:bg-slate-800",
                )}
              >
                Street / Roads
              </button>
            </div>
          </div>

          <div className="space-y-2 border-t border-slate-800 pt-3 text-xs">
            <span className="text-[11px] font-medium text-slate-400">Overlay Features</span>

            <label className="flex cursor-pointer items-center justify-between text-slate-200">
              <span>Disaster Hazard Zones</span>
              <input
                type="checkbox"
                checked={layerSettings.hazards}
                onChange={(e) => setLayerSettings((s) => ({ ...s, hazards: e.target.checked }))}
                className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-0"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between text-slate-200">
              <span>National & State Highways</span>
              <input
                type="checkbox"
                checked={layerSettings.highways}
                onChange={(e) => setLayerSettings((s) => ({ ...s, highways: e.target.checked }))}
                className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-0"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between text-slate-200">
              <span>District Boundaries</span>
              <input
                type="checkbox"
                checked={layerSettings.districts}
                onChange={(e) => setLayerSettings((s) => ({ ...s, districts: e.target.checked }))}
                className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-0"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between text-slate-200">
              <span>Rivers & Water Bodies</span>
              <input
                type="checkbox"
                checked={layerSettings.water}
                onChange={(e) => setLayerSettings((s) => ({ ...s, water: e.target.checked }))}
                className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-0"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between text-slate-200">
              <span>Emergency Facilities</span>
              <input
                type="checkbox"
                checked={layerSettings.facilities}
                onChange={(e) => setLayerSettings((s) => ({ ...s, facilities: e.target.checked }))}
                className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-0"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between text-slate-200">
              <span>Geographic Labels</span>
              <input
                type="checkbox"
                checked={layerSettings.labels}
                onChange={(e) => setLayerSettings((s) => ({ ...s, labels: e.target.checked }))}
                className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-0"
              />
            </label>
          </div>
        </div>
      )}

      {/* Floating Selected Marker Detail Card */}
      {selectedMarker && (
        <div className="absolute bottom-10 left-4 z-20 max-w-sm rounded-xl border border-slate-700/80 bg-slate-950/95 p-4 shadow-2xl backdrop-blur-xl">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span
                className="inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                style={{
                  backgroundColor:
                    KIND_STYLE[selectedMarker.kind]?.ring || "rgba(16, 185, 129, 0.3)",
                  color: KIND_STYLE[selectedMarker.kind]?.bg || "#10b981",
                }}
              >
                {KIND_STYLE[selectedMarker.kind]?.label || "Emergency Resource"}
              </span>
              <h4 className="mt-1 text-sm font-semibold text-white">{selectedMarker.label}</h4>
            </div>
            <button
              type="button"
              onClick={() => setSelectedMarker(null)}
              className="text-xs text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>

          {selectedMarker.address && (
            <p className="mt-1.5 text-xs text-slate-300">{selectedMarker.address}</p>
          )}

          {userLocation && (
            <div className="mt-2 text-xs font-medium text-cyan-400">
              Distance: {formatEmergencyDistance(haversineKm(userLocation, selectedMarker))}
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            {onRouteToMarker && (
              <button
                type="button"
                onClick={() => onRouteToMarker(selectedMarker)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 py-1.5 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-500/25"
              >
                <RouteIcon className="h-3.5 w-3.5" />
                Route Here
              </button>
            )}
            {selectedMarker.phone && (
              <a
                href={`tel:${selectedMarker.phone}`}
                className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-800"
              >
                <Phone className="h-3.5 w-3.5 text-emerald-400" />
                Call
              </a>
            )}
          </div>
        </div>
      )}

      {/* Bottom Attribution Bar (Required for Esri / OpenStreetMap compliance) */}
      <div className="pointer-events-none absolute bottom-1 right-2 z-10 flex items-center gap-2 rounded bg-slate-950/80 px-2 py-0.5 text-[9px] text-slate-400 backdrop-blur-sm">
        <span>{TILE_SOURCES[basemap].attribution}</span>
      </div>
    </div>
  );
}
