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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type LatLng, haversineKm, isValidCoordinate } from "@/lib/geo";
import { AP_BOUNDS, AP_CENTER, isInsideAndhraPradesh, type DataQuality } from "@/lib/domain";
import {
  AP_STATE_BOUNDARY,
  AP_DISTRICTS,
  AP_RIVERS,
  AP_CITIES,
  projectLatLngToNormalized,
  projectNormalizedToLatLng,
} from "@/lib/ap-map-data";
import { AP_ROAD_SEGMENTS } from "@/lib/static-road-network";
import type { CalculatedRoute } from "@/lib/static-router";
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
    ring: "rgba(16, 185, 129, 0.4)",
    icon: "✚",
    label: "Shelters & hospitals",
  },
  risk: {
    bg: "#f59e0b",
    text: "#000000",
    ring: "rgba(245, 158, 11, 0.4)",
    icon: "⚠",
    label: "Hazard & risk zones",
  },
  sos: {
    bg: "#ef4444",
    text: "#ffffff",
    ring: "rgba(239, 68, 68, 0.45)",
    icon: "⚡",
    label: "SOS requests",
  },
  team: {
    bg: "#0ea5e9",
    text: "#ffffff",
    ring: "rgba(14, 165, 233, 0.4)",
    icon: "◆",
    label: "Rescue teams",
  },
  alert: {
    bg: "#f97316",
    text: "#ffffff",
    ring: "rgba(249, 115, 22, 0.4)",
    icon: "!",
    label: "Official alerts",
  },
  report: {
    bg: "#8b5cf6",
    text: "#ffffff",
    ring: "rgba(139, 92, 246, 0.4)",
    icon: "✎",
    label: "Verified reports",
  },
};

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
  title = "Andhra Pradesh Operations Map",
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

  const [selectedMarker, setSelectedMarker] = useState<MapMarker | null>(null);
  const [hoveredMarker, setHoveredMarker] = useState<MapMarker | null>(null);
  const [showLayers, setShowLayers] = useState(false);
  const [hiddenKinds, setHiddenKinds] = useState<Record<string, boolean>>({});
  const [followUser, setFollowUser] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Map viewport state: center in normalized coordinates [0..1], zoom level [1..15]
  const viewportRef = useRef({
    centerNorm: projectLatLngToNormalized(AP_CENTER.lat, AP_CENTER.lng),
    zoom: 1.6,
  });

  const isDraggingRef = useRef(false);
  const dragStartPosRef = useRef({ x: 0, y: 0 });
  const pinchStartDistRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);

  // Store latest callbacks in refs to avoid stale closures
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;
  const onSelectMarkerRef = useRef(onSelectMarker);
  onSelectMarkerRef.current = onSelectMarker;

  // Convert (lat, lng) to canvas screen pixels (px, py)
  const latLngToScreen = useCallback((lat: number, lng: number, width: number, height: number) => {
    const { centerNorm, zoom } = viewportRef.current;
    const norm = projectLatLngToNormalized(lat, lng);

    const scale = Math.min(width, height) * zoom;
    const screenX = width / 2 + (norm.x - centerNorm.x) * scale;
    const screenY = height / 2 + (norm.y - centerNorm.y) * scale;

    return { x: screenX, y: screenY };
  }, []);

  // Convert canvas screen pixels (px, py) to (lat, lng)
  const screenToLatLng = useCallback(
    (screenX: number, screenY: number, width: number, height: number): LatLng => {
      const { centerNorm, zoom } = viewportRef.current;
      const scale = Math.min(width, height) * zoom;

      const normX = (screenX - width / 2) / scale + centerNorm.x;
      const normY = (screenY - height / 2) / scale + centerNorm.y;

      return projectNormalizedToLatLng(normX, normY);
    },
    [],
  );

  // Main canvas render loop
  const renderMap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width / (window.devicePixelRatio || 1);
    const height = canvas.height / (window.devicePixelRatio || 1);

    ctx.save();
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);

    // 1. Background / Ocean
    ctx.fillStyle = "#0a1219";
    ctx.fillRect(0, 0, width, height);

    // 2. Andhra Pradesh Landmass Polygon
    if (AP_STATE_BOUNDARY.length > 0) {
      ctx.beginPath();
      const first = latLngToScreen(
        AP_STATE_BOUNDARY[0]!.lat,
        AP_STATE_BOUNDARY[0]!.lng,
        width,
        height,
      );
      ctx.moveTo(first.x, first.y);

      for (let i = 1; i < AP_STATE_BOUNDARY.length; i++) {
        const pt = latLngToScreen(
          AP_STATE_BOUNDARY[i]!.lat,
          AP_STATE_BOUNDARY[i]!.lng,
          width,
          height,
        );
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.closePath();

      // Land fill with subtle gradient
      ctx.fillStyle = "#111c24";
      ctx.fill();

      // Outer boundary stroke
      ctx.strokeStyle = "rgba(56, 189, 248, 0.45)";
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }

    // 3. District Boundaries & Names
    for (const dist of AP_DISTRICTS) {
      if (dist.polygon && dist.polygon.length > 0) {
        ctx.beginPath();
        const start = latLngToScreen(dist.polygon[0]!.lat, dist.polygon[0]!.lng, width, height);
        ctx.moveTo(start.x, start.y);
        for (let i = 1; i < dist.polygon.length; i++) {
          const pt = latLngToScreen(dist.polygon[i]!.lat, dist.polygon[i]!.lng, width, height);
          ctx.lineTo(pt.x, pt.y);
        }
        ctx.closePath();
        ctx.strokeStyle = "rgba(56, 189, 248, 0.12)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // District label if sufficiently zoomed in
      if (viewportRef.current.zoom >= 2.0) {
        const cPt = latLngToScreen(dist.centroid.lat, dist.centroid.lng, width, height);
        if (cPt.x >= 0 && cPt.x <= width && cPt.y >= 0 && cPt.y <= height) {
          ctx.font = "600 10px Inter, system-ui, sans-serif";
          ctx.fillStyle = "rgba(148, 163, 184, 0.45)";
          ctx.textAlign = "center";
          ctx.fillText(dist.name.toUpperCase(), cPt.x, cPt.y);
        }
      }
    }

    // 4. Major Rivers (Krishna, Godavari, Penna)
    for (const river of AP_RIVERS) {
      if (river.path.length > 1) {
        ctx.beginPath();
        const p0 = latLngToScreen(river.path[0]!.lat, river.path[0]!.lng, width, height);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < river.path.length; i++) {
          const pt = latLngToScreen(river.path[i]!.lat, river.path[i]!.lng, width, height);
          ctx.lineTo(pt.x, pt.y);
        }
        ctx.strokeStyle = "rgba(14, 165, 233, 0.4)";
        ctx.lineWidth = 2.2;
        ctx.stroke();
      }
    }

    // 5. Static Road Network (National & State Highways)
    for (const seg of AP_ROAD_SEGMENTS) {
      if (seg.path.length > 1) {
        ctx.beginPath();
        const p0 = latLngToScreen(seg.path[0]!.lat, seg.path[0]!.lng, width, height);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < seg.path.length; i++) {
          const pt = latLngToScreen(seg.path[i]!.lat, seg.path[i]!.lng, width, height);
          ctx.lineTo(pt.x, pt.y);
        }
        ctx.strokeStyle =
          seg.roadType === "NATIONAL_HIGHWAY"
            ? "rgba(148, 163, 184, 0.28)"
            : "rgba(100, 116, 139, 0.16)";
        ctx.lineWidth = seg.roadType === "NATIONAL_HIGHWAY" ? 1.5 : 1;
        ctx.stroke();
      }
    }

    // 6. Major Cities
    for (const city of AP_CITIES) {
      const pt = latLngToScreen(city.lat, city.lng, width, height);
      if (pt.x >= -20 && pt.x <= width + 20 && pt.y >= -20 && pt.y <= height + 20) {
        // Dot
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, city.tier === 1 ? 3.5 : 2.5, 0, Math.PI * 2);
        ctx.fillStyle = city.tier === 1 ? "#38bdf8" : "#94a3b8";
        ctx.fill();

        // City Label
        if (viewportRef.current.zoom >= 1.4 || city.tier === 1) {
          ctx.font = `${city.tier === 1 ? "600 11px" : "500 10px"} Inter, system-ui, sans-serif`;
          ctx.fillStyle = city.tier === 1 ? "#e2e8f0" : "#94a3b8";
          ctx.textAlign = "left";
          ctx.fillText(city.name, pt.x + 6, pt.y + 3);
        }
      }
    }

    // 7. Active Calculated Road Route Polyline
    const activePath = calculatedRoute?.path || route;
    if (activePath && activePath.length > 1) {
      // Glow underlayer
      ctx.beginPath();
      const p0 = latLngToScreen(activePath[0]!.lat, activePath[0]!.lng, width, height);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < activePath.length; i++) {
        const pt = latLngToScreen(activePath[i]!.lat, activePath[i]!.lng, width, height);
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
      ctx.lineWidth = 8;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();

      // Main crisp line
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 3.5;
      ctx.stroke();

      // Origin Pin
      const originPt = latLngToScreen(activePath[0]!.lat, activePath[0]!.lng, width, height);
      ctx.beginPath();
      ctx.arc(originPt.x, originPt.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#38bdf8";
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Destination Pin
      const destPt = latLngToScreen(
        activePath[activePath.length - 1]!.lat,
        activePath[activePath.length - 1]!.lng,
        width,
        height,
      );
      ctx.beginPath();
      ctx.arc(destPt.x, destPt.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = "#10b981";
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 8. User Location Dot with Accuracy Ring
    if (userLocation && isValidCoordinate(userLocation.lat, userLocation.lng)) {
      const uPt = latLngToScreen(userLocation.lat, userLocation.lng, width, height);

      // Accuracy radius in pixels
      const accM = userAccuracyM || 30;
      const degLatM = 111320;
      const accDeg = accM / degLatM;
      const edgePt = latLngToScreen(userLocation.lat + accDeg, userLocation.lng, width, height);
      const accRadiusPx = Math.max(12, Math.abs(uPt.y - edgePt.y));

      // Accuracy circle
      ctx.beginPath();
      ctx.arc(uPt.x, uPt.y, accRadiusPx, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(14, 165, 233, 0.15)";
      ctx.fill();
      ctx.strokeStyle = "rgba(14, 165, 233, 0.5)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Center GPS Dot
      ctx.beginPath();
      ctx.arc(uPt.x, uPt.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#38bdf8";
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 9. Manual Pin if provided
    if (pin && isValidCoordinate(pin.lat, pin.lng)) {
      const pinPt = latLngToScreen(pin.lat, pin.lng, width, height);
      ctx.beginPath();
      ctx.arc(pinPt.x, pinPt.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = "#f59e0b";
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 10. Markers
    const visibleMarkers = markers.filter((m) => !hiddenKinds[m.kind]);
    for (const m of visibleMarkers) {
      const mPt = latLngToScreen(m.lat, m.lng, width, height);
      if (mPt.x >= -30 && mPt.x <= width + 30 && mPt.y >= -30 && mPt.y <= height + 30) {
        const style = KIND_STYLE[m.kind];
        const isSelected = selectedMarker?.id === m.id;
        const isHovered = hoveredMarker?.id === m.id;
        const radius = isSelected ? 11 : isHovered ? 9 : 7.5;

        // Outer glow ring for selected or hovered
        if (isSelected || isHovered) {
          ctx.beginPath();
          ctx.arc(mPt.x, mPt.y, radius + 4, 0, Math.PI * 2);
          ctx.fillStyle = style.ring;
          ctx.fill();
        }

        // Marker circle
        ctx.beginPath();
        ctx.arc(mPt.x, mPt.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = style.bg;
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Icon symbol inside marker
        ctx.font = `bold ${isSelected ? "11px" : "9px"} Inter, system-ui, sans-serif`;
        ctx.fillStyle = style.text;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(style.icon, mPt.x, mPt.y);
      }
    }

    ctx.restore();
  }, [
    latLngToScreen,
    markers,
    hiddenKinds,
    selectedMarker,
    hoveredMarker,
    route,
    calculatedRoute,
    userLocation,
    userAccuracyM,
    pin,
  ]);

  // Sync canvas size with high-DPI resolution
  const updateCanvasDimensions = useCallback(() => {
    const canvas = canvasRef.current;
    const container = outerContainerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    renderMap();
  }, [renderMap]);

  useEffect(() => {
    isMountedRef.current = true;
    updateCanvasDimensions();

    const handleResize = () => {
      if (isMountedRef.current) {
        updateCanvasDimensions();
      }
    };

    window.addEventListener("resize", handleResize);
    return () => {
      isMountedRef.current = false;
      window.removeEventListener("resize", handleResize);
    };
  }, [updateCanvasDimensions]);

  // Center map on centerOn coordinate or route bounds change
  useEffect(() => {
    if (centerOn && isValidCoordinate(centerOn.lat, centerOn.lng)) {
      viewportRef.current.centerNorm = projectLatLngToNormalized(centerOn.lat, centerOn.lng);
      viewportRef.current.zoom = Math.max(viewportRef.current.zoom, 2.5);
      renderMap();
    }
  }, [centerOn, renderMap]);

  // Auto-fit route bounds when a new calculated route arrives
  useEffect(() => {
    if (calculatedRoute && calculatedRoute.bounds) {
      const b = calculatedRoute.bounds;
      const centerLat = (b.minLat + b.maxLat) / 2;
      const centerLng = (b.minLng + b.maxLng) / 2;

      viewportRef.current.centerNorm = projectLatLngToNormalized(centerLat, centerLng);

      const dLat = Math.max(0.1, b.maxLat - b.minLat);
      const dLng = Math.max(0.1, b.maxLng - b.minLng);
      const span = Math.max(
        dLat / (AP_BOUNDS.maxLat - AP_BOUNDS.minLat),
        dLng / (AP_BOUNDS.maxLng - AP_BOUNDS.minLng),
      );
      const targetZoom = Math.min(8, Math.max(1.8, 0.85 / span));

      viewportRef.current.zoom = targetZoom;
      renderMap();
    }
  }, [calculatedRoute, renderMap]);

  // Mouse & Touch interaction handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true;
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    if (isDraggingRef.current) {
      const dx = e.clientX - dragStartPosRef.current.x;
      const dy = e.clientY - dragStartPosRef.current.y;
      dragStartPosRef.current = { x: e.clientX, y: e.clientY };

      const scale = Math.min(width, height) * viewportRef.current.zoom;
      viewportRef.current.centerNorm.x -= dx / scale;
      viewportRef.current.centerNorm.y -= dy / scale;

      // Clamp viewport within safe boundary
      viewportRef.current.centerNorm.x = Math.max(
        -0.2,
        Math.min(1.2, viewportRef.current.centerNorm.x),
      );
      viewportRef.current.centerNorm.y = Math.max(
        -0.2,
        Math.min(1.2, viewportRef.current.centerNorm.y),
      );

      setFollowUser(false);
      renderMap();
    } else {
      // Hover detection on markers
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const visibleMarkers = markers.filter((m) => !hiddenKinds[m.kind]);

      let foundHover: MapMarker | null = null;
      for (const m of visibleMarkers) {
        const pt = latLngToScreen(m.lat, m.lng, width, height);
        const dist = Math.hypot(pt.x - mouseX, pt.y - mouseY);
        if (dist <= 12) {
          foundHover = m;
          break;
        }
      }
      if (foundHover !== hoveredMarker) {
        setHoveredMarker(foundHover);
        renderMap();
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore pointer capture release error if already released
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    const newZoom = Math.max(1.0, Math.min(15.0, viewportRef.current.zoom * zoomFactor));

    viewportRef.current.zoom = newZoom;
    renderMap();
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const width = rect.width;
    const height = rect.height;

    // Check if clicked a marker
    const visibleMarkers = markers.filter((m) => !hiddenKinds[m.kind]);
    let clickedMarker: MapMarker | null = null;

    for (const m of visibleMarkers) {
      const pt = latLngToScreen(m.lat, m.lng, width, height);
      const dist = Math.hypot(pt.x - clickX, pt.y - clickY);
      if (dist <= 14) {
        clickedMarker = m;
        break;
      }
    }

    if (clickedMarker) {
      setSelectedMarker(clickedMarker);
      if (onSelectMarkerRef.current) {
        onSelectMarkerRef.current(clickedMarker);
      }
      renderMap();
    } else {
      setSelectedMarker(null);
      if (onSelectMarkerRef.current) {
        onSelectMarkerRef.current(null);
      }
      // Trigger onMapClick with geographic coordinate
      const clickedLatLng = screenToLatLng(clickX, clickY, width, height);
      if (isInsideAndhraPradesh(clickedLatLng.lat, clickedLatLng.lng) && onMapClickRef.current) {
        onMapClickRef.current(clickedLatLng);
      }
      renderMap();
    }
  };

  // Zoom buttons
  const zoomIn = () => {
    viewportRef.current.zoom = Math.min(15.0, viewportRef.current.zoom * 1.25);
    renderMap();
  };

  const zoomOut = () => {
    viewportRef.current.zoom = Math.max(1.0, viewportRef.current.zoom / 1.25);
    renderMap();
  };

  // Reset to default Andhra Pradesh corridor
  const resetMap = () => {
    viewportRef.current.centerNorm = projectLatLngToNormalized(AP_CENTER.lat, AP_CENTER.lng);
    viewportRef.current.zoom = 1.6;
    setSelectedMarker(null);
    setFollowUser(false);
    renderMap();
  };

  // Center on user GPS position
  const centerOnUser = () => {
    if (!userLocation) return;
    viewportRef.current.centerNorm = projectLatLngToNormalized(userLocation.lat, userLocation.lng);
    viewportRef.current.zoom = Math.max(viewportRef.current.zoom, 3.5);
    setFollowUser(true);
    renderMap();
  };

  const toggleFullscreen = () => {
    if (!outerContainerRef.current) return;
    if (!document.fullscreenElement) {
      outerContainerRef.current
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

  const toggleKind = (kind: string) => {
    setHiddenKinds((prev) => ({ ...prev, [kind]: !prev[kind] }));
  };

  useEffect(() => {
    renderMap();
  }, [renderMap]);

  return (
    <Panel
      title={title}
      action={
        <div className="flex items-center gap-2">
          {actions}
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
      {/* Outer React-managed Wrapper */}
      <div
        ref={outerContainerRef}
        role="application"
        aria-label="Static Andhra Pradesh Operations Map"
        className={cn(
          "relative h-[420px] w-full overflow-hidden rounded-xl border border-border bg-[#0a1219] sm:h-[480px] lg:h-[540px] select-none",
          className,
        )}
      >
        {/* Hardware-accelerated vector canvas */}
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onWheel={handleWheel}
          onClick={handleClick}
          className="absolute inset-0 h-full w-full cursor-grab active:cursor-grabbing touch-none"
        />

        {/* Top Left Static Map Badge */}
        <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-lg border border-cyan-500/25 bg-[#0f172a]/90 px-3 py-1.5 font-mono text-[10px] text-cyan-100 backdrop-blur-md shadow-lg pointer-events-none">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Andhra Pradesh · Static Operations Map</span>
        </div>

        {/* Top Right Zoom & Pan Controls */}
        <div className="absolute right-3 top-3 z-10 flex flex-col gap-1.5">
          <button
            type="button"
            title="Zoom In"
            aria-label="Zoom In"
            onClick={zoomIn}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-500/25 bg-[#0f172a]/90 text-cyan-100 backdrop-blur-md shadow-lg hover:bg-cyan-950 transition-colors"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Zoom Out"
            aria-label="Zoom Out"
            onClick={zoomOut}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-500/25 bg-[#0f172a]/90 text-cyan-100 backdrop-blur-md shadow-lg hover:bg-cyan-950 transition-colors"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Center on user location"
            aria-label="Center on user location"
            onClick={centerOnUser}
            disabled={!userLocation}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-500/25 bg-[#0f172a]/90 text-cyan-100 backdrop-blur-md shadow-lg hover:bg-cyan-950 disabled:opacity-40 transition-colors",
              followUser && "border-primary bg-primary/25 text-primary",
            )}
          >
            <Crosshair className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Reset map to Andhra Pradesh overview"
            aria-label="Reset map"
            onClick={resetMap}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-500/25 bg-[#0f172a]/90 text-cyan-100 backdrop-blur-md shadow-lg hover:bg-cyan-950 transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Map"}
            aria-label="Toggle Fullscreen"
            onClick={toggleFullscreen}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-500/25 bg-[#0f172a]/90 text-cyan-100 backdrop-blur-md shadow-lg hover:bg-cyan-950 transition-colors"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>

        {/* Layer Filter Drawer */}
        {showLayers && (
          <div className="absolute right-3 top-48 z-20 w-64 rounded-xl border border-cyan-500/30 bg-[#0f172a]/95 p-3 text-xs text-cyan-50 backdrop-blur-md shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <span className="font-mono font-bold tracking-wider uppercase text-[11px] text-cyan-200">
                Map Layers
              </span>
              <button
                type="button"
                onClick={() => setShowLayers(false)}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                ✕
              </button>
            </div>
            <div className="mt-2 space-y-1.5">
              {(Object.keys(KIND_STYLE) as MapMarker["kind"][]).map((kind) => {
                const style = KIND_STYLE[kind];
                const count = markers.filter((m) => m.kind === kind).length;
                const isHidden = hiddenKinds[kind];

                return (
                  <label
                    key={kind}
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 hover:bg-surface-2 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold"
                        style={{ backgroundColor: style.bg, color: style.text }}
                      >
                        {style.icon}
                      </span>
                      <span>{style.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground">{count}</span>
                      <input
                        type="checkbox"
                        checked={!isHidden}
                        onChange={() => toggleKind(kind)}
                        className="rounded border-border bg-surface text-primary focus:ring-primary h-3.5 w-3.5"
                      />
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Selected Marker Detail Card */}
        {selectedMarker && (
          <div className="absolute inset-x-3 bottom-3 z-20 rounded-xl border border-cyan-500/30 bg-[#0f172a]/95 p-4 text-xs text-cyan-50 backdrop-blur-md shadow-2xl sm:max-w-md sm:left-3 sm:right-auto animate-in slide-in-from-bottom-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold shadow"
                  style={{
                    backgroundColor: KIND_STYLE[selectedMarker.kind].bg,
                    color: KIND_STYLE[selectedMarker.kind].text,
                  }}
                >
                  {KIND_STYLE[selectedMarker.kind].icon}
                </span>
                <div>
                  <h3 className="font-bold text-sm text-foreground line-clamp-1">
                    {selectedMarker.label}
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    {selectedMarker.detail || KIND_STYLE[selectedMarker.kind].label}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedMarker(null);
                  if (onSelectMarkerRef.current) onSelectMarkerRef.current(null);
                }}
                className="text-muted-foreground hover:text-foreground p-1 text-xs"
              >
                ✕
              </button>
            </div>

            {selectedMarker.address && (
              <p className="mt-2 text-muted-foreground text-[11px] flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                <span className="line-clamp-1">{selectedMarker.address}</span>
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {onRouteToMarker && (
                <button
                  type="button"
                  onClick={() => onRouteToMarker(selectedMarker)}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground shadow hover:brightness-110"
                >
                  <Navigation className="h-3.5 w-3.5" />
                  Route here
                </button>
              )}
              {selectedMarker.phone && (
                <a
                  href={`tel:${selectedMarker.phone}`}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-semibold text-foreground hover:bg-surface-2"
                >
                  <Phone className="h-3.5 w-3.5 text-emerald-400" />
                  {selectedMarker.phone}
                </a>
              )}
            </div>
          </div>
        )}

        {/* Bottom Legend */}
        <div className="absolute left-3 bottom-3 z-10 hidden sm:flex items-center gap-3 rounded-lg border border-cyan-500/20 bg-[#0f172a]/80 px-2.5 py-1 text-[10px] text-muted-foreground backdrop-blur-md">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[#10b981]" /> Shelter / Hospital
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[#f59e0b]" /> Hazard Zone
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[#ef4444]" /> SOS
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[#0ea5e9]" /> Rescue Base
          </span>
        </div>
      </div>
    </Panel>
  );
}

/** Error boundary safeguarding map rendering */
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
          <h3 className="font-bold text-base">Static Map View</h3>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">
            {this.state.errorText || "Map rendering encountered an issue."}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, errorText: "" })}
            className="mt-4 rounded-lg bg-surface-2 border border-border px-4 py-2 text-xs font-semibold hover:bg-surface"
          >
            Reload Map View
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
