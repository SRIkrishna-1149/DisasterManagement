import { useCallback, useMemo, useRef, useState } from "react";
import { Crosshair, Layers, Minus, Plus, RotateCcw } from "lucide-react";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { clusterPoints, type LatLng } from "@/lib/geo";
import { AP_BOUNDS, AP_CENTER, AP_DEFAULT_VIEWPORT, isInsideAndhraPradesh } from "@/lib/domain";
import { DataTag, Panel } from "./kit";

export interface MapMarker extends LatLng {
  id: string;
  label: string;
  kind: "risk" | "resource" | "sos" | "team" | "alert" | "report";
  detail?: string;
  quality?: "LIVE" | "RECENT" | "STALE" | "CACHED" | "SIMULATED" | "UNAVAILABLE";
  score?: number;
}

/** Base viewport — Krishna–Guntur corridor, Andhra Pradesh. */
const BASE = AP_DEFAULT_VIEWPORT;
const BASE_LAT_SPAN = BASE.maxLat - BASE.minLat;
const BASE_LNG_SPAN = BASE.maxLng - BASE.minLng;

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 12;

const KIND_STYLE: Record<MapMarker["kind"], string> = {
  risk: "bg-high text-background ring-high/30",
  resource: "bg-safe text-background ring-safe/30",
  sos: "bg-destructive text-destructive-foreground ring-destructive/30",
  team: "bg-primary text-background ring-primary/30",
  alert: "bg-accent text-background ring-accent/30",
  report: "bg-moderate text-background ring-moderate/30",
};

const KIND_LABEL: Record<MapMarker["kind"], string> = {
  risk: "Risk zones",
  resource: "Shelters & hospitals",
  sos: "SOS requests",
  team: "Rescue teams",
  alert: "Alerts",
  report: "Verified community reports",
};

const UNAVAILABLE_LAYER_LABELS = ["Weather", "Rainfall", "Water level"] as const;

interface View {
  centerLat: number;
  centerLng: number;
  zoom: number;
}

const DEFAULT_VIEW: View = {
  centerLat: AP_CENTER.lat,
  centerLng: AP_CENTER.lng,
  zoom: 1,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Keep the visible operational viewport inside the configured AP operating bounds. */
function clampView(view: View): View {
  const latSpan = BASE_LAT_SPAN / view.zoom;
  const lngSpan = BASE_LNG_SPAN / view.zoom;
  const latHalf = Math.min(latSpan / 2, (AP_BOUNDS.maxLat - AP_BOUNDS.minLat) / 2);
  const lngHalf = Math.min(lngSpan / 2, (AP_BOUNDS.maxLng - AP_BOUNDS.minLng) / 2);
  return {
    ...view,
    centerLat: clamp(view.centerLat, AP_BOUNDS.minLat + latHalf, AP_BOUNDS.maxLat - latHalf),
    centerLng: clamp(view.centerLng, AP_BOUNDS.minLng + lngHalf, AP_BOUNDS.maxLng - lngHalf),
  };
}

function viewportOf(view: View) {
  const latSpan = BASE_LAT_SPAN / view.zoom;
  const lngSpan = BASE_LNG_SPAN / view.zoom;
  return {
    minLat: view.centerLat - latSpan / 2,
    maxLat: view.centerLat + latSpan / 2,
    minLng: view.centerLng - lngSpan / 2,
    maxLng: view.centerLng + lngSpan / 2,
    latSpan,
    lngSpan,
  };
}

export function OperationsMap({
  markers,
  className,
  title = "Andhra Pradesh operations map",
  route,
  routeLabel = "SIMULATED ROUTE",
  pin,
  onMapClick,
}: {
  markers: MapMarker[];
  className?: string;
  title?: string;
  route?: LatLng[];
  routeLabel?: string;
  pin?: LatLng;
  onMapClick?: (point: LatLng) => void;
}) {
  const [selected, setSelected] = useState<MapMarker | null>(null);
  const [showLegend, setShowLegend] = useState(true);
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const surface = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; y: number; view: View } | null>(null);
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);

  const vp = useMemo(() => viewportOf(view), [view]);

  const visible = useMemo(
    () =>
      markers.filter(
        (marker) =>
          !hidden[marker.kind] &&
          isInsideAndhraPradesh(marker.lat, marker.lng) &&
          // viewport culling — only render what the user can actually see
          marker.lat >= vp.minLat - vp.latSpan * 0.1 &&
          marker.lat <= vp.maxLat + vp.latSpan * 0.1 &&
          marker.lng >= vp.minLng - vp.lngSpan * 0.1 &&
          marker.lng <= vp.maxLng + vp.lngSpan * 0.1,
      ),
    [markers, hidden, vp],
  );

  const rejectedCount = useMemo(
    () => markers.filter((marker) => !isInsideAndhraPradesh(marker.lat, marker.lng)).length,
    [markers],
  );

  const groups = useMemo(
    () => clusterPoints(visible, Math.max(0.0015, vp.latSpan / 14)),
    [visible, vp.latSpan],
  );

  const toPercent = useCallback(
    (point: LatLng) => ({
      x: ((point.lng - vp.minLng) / vp.lngSpan) * 100,
      y: (1 - (point.lat - vp.minLat) / vp.latSpan) * 100,
    }),
    [vp],
  );
  const toPosition = useCallback(
    (point: LatLng) => {
      const position = toPercent(point);
      return { left: `${position.x}%`, top: `${position.y}%` };
    },
    [toPercent],
  );
  const routeIsValid =
    !!route &&
    route.length >= 2 &&
    route.every((point) => isInsideAndhraPradesh(point.lat, point.lng));
  const routePoints = routeIsValid
    ? route!
        .map((point) => {
          const position = toPercent(point);
          return `${position.x},${position.y}`;
        })
        .join(" ")
    : "";

  const zoomBy = useCallback((factor: number) => {
    setView((current) =>
      clampView({
        ...current,
        zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.zoom * factor)),
      }),
    );
  }, []);

  const panByPixels = useCallback((dx: number, dy: number, from: View) => {
    const rect = surface.current?.getBoundingClientRect();
    if (!rect) return;
    const active = viewportOf(from);
    setView(
      clampView({
        ...from,
        centerLng: from.centerLng - (dx / rect.width) * active.lngSpan,
        centerLat: from.centerLat + (dy / rect.height) * active.latSpan,
      }),
    );
  }, []);

  return (
    <Panel
      title={title}
      className={cn("overflow-hidden", className)}
      action={
        <button
          aria-label="Toggle map layers"
          onClick={() => setShowLegend((value) => !value)}
          className="rounded-md p-2 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
        >
          <Layers className="h-4 w-4" />
        </button>
      }
    >
      <div
        ref={surface}
        role="application"
        aria-label="Interactive map of the Andhra Pradesh response area. Drag to pan, use the zoom buttons or arrow keys."
        tabIndex={0}
        className="relative min-h-[360px] touch-none overflow-hidden rounded-xl border border-border bg-[#12232a] select-none focus-visible:ring-2 focus-visible:ring-primary sm:min-h-[420px]"
        onWheel={(event) => {
          event.preventDefault();
          zoomBy(event.deltaY < 0 ? 1.15 : 1 / 1.15);
        }}
        onPointerDown={(event) => {
          (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
          drag.current = { x: event.clientX, y: event.clientY, view };
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (!start || event.buttons === 0) return;
          panByPixels(event.clientX - start.x, event.clientY - start.y, start.view);
        }}
        onPointerUp={(event) => {
          const start = drag.current;
          if (start && onMapClick && surface.current) {
            const rect = surface.current.getBoundingClientRect();
            const moved = Math.hypot(start.x - event.clientX, start.y - event.clientY) > 6;
            const target = event.target as Node;
            if (!moved && target === surface.current && rect.width > 0 && rect.height > 0) {
              const x = (event.clientX - rect.left) / rect.width;
              const y = (event.clientY - rect.top) / rect.height;
              const point = {
                lng: vp.minLng + x * vp.lngSpan,
                lat: vp.minLat + (1 - y) * vp.latSpan,
              };
              if (isInsideAndhraPradesh(point.lat, point.lng)) onMapClick(point);
            }
          }
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onTouchStart={(event) => {
          if (event.touches.length === 2) {
            const [a, b] = [event.touches[0]!, event.touches[1]!];
            pinch.current = {
              distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
              zoom: view.zoom,
            };
          }
        }}
        onTouchMove={(event) => {
          if (event.touches.length === 2 && pinch.current) {
            const [a, b] = [event.touches[0]!, event.touches[1]!];
            const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
            const next = pinch.current.zoom * (distance / pinch.current.distance);
            setView((current) =>
              clampView({
                ...current,
                zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next)),
              }),
            );
          }
        }}
        onTouchEnd={() => {
          pinch.current = null;
        }}
        onKeyDown={(event) => {
          const step = 40;
          if (event.key === "ArrowLeft") panByPixels(step, 0, view);
          else if (event.key === "ArrowRight") panByPixels(-step, 0, view);
          else if (event.key === "ArrowUp") panByPixels(0, step, view);
          else if (event.key === "ArrowDown") panByPixels(0, -step, view);
          else if (event.key === "+" || event.key === "=") zoomBy(1.2);
          else if (event.key === "-") zoomBy(1 / 1.2);
          else return;
          event.preventDefault();
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-35"
          style={{
            backgroundImage:
              "linear-gradient(28deg, transparent 48%, #62a6a9 49%, transparent 51%), linear-gradient(112deg, transparent 48%, #62a6a9 49%, transparent 51%), linear-gradient(#39747a 1px, transparent 1px), linear-gradient(90deg, #39747a 1px, transparent 1px)",
            backgroundSize: `${180 * view.zoom}px ${140 * view.zoom}px, ${220 * view.zoom}px ${180 * view.zoom}px, ${42 * view.zoom}px ${42 * view.zoom}px, ${42 * view.zoom}px ${42 * view.zoom}px`,
          }}
        />
        <div className="pointer-events-none absolute inset-x-[10%] top-[52%] h-5 -rotate-6 rounded-full bg-cyan-300/10 blur-md" />
        <div className="pointer-events-none absolute bottom-[10%] right-[8%] font-mono text-[10px] tracking-widest text-cyan-100/50 uppercase">
          Krishna · Guntur · Andhra Pradesh
        </div>

        {routeIsValid && (
          <>
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-0 h-full w-full"
              aria-label={routeLabel}
            >
              <polyline
                points={routePoints}
                fill="none"
                stroke="var(--primary)"
                strokeWidth="0.8"
                strokeDasharray="2 1"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <span className="pointer-events-none absolute left-1/2 top-14 -translate-x-1/2 rounded-full border border-primary/40 bg-background/90 px-2 py-1 font-mono text-[10px] font-bold text-primary">
              {routeLabel}
            </span>
          </>
        )}

        {pin && isInsideAndhraPradesh(pin.lat, pin.lng) && (
          <span
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-full text-destructive drop-shadow-lg"
            style={toPosition(pin)}
            aria-label="Selected manual emergency pin"
          >
            <MapPin className="h-8 w-8 fill-destructive/30" />
          </span>
        )}

        {groups.map((group) => {
          const position = toPosition(group);
          const first = group.items[0]!;
          const marker =
            group.items.length === 1
              ? first
              : {
                  ...first,
                  label: `${group.items.length} clustered incidents`,
                  detail: group.items.map((item) => item.label).join(", "),
                };
          return (
            <button
              key={`${group.lat}-${group.lng}-${first.id}`}
              type="button"
              title={marker.label}
              onClick={() => {
                setSelected(marker);
                if (group.items.length > 1) {
                  setView((current) =>
                    clampView({
                      ...current,
                      centerLat: group.lat,
                      centerLng: group.lng,
                      zoom: Math.min(MAX_ZOOM, current.zoom * 2),
                    }),
                  );
                }
              }}
              className={cn(
                "absolute flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-xs font-black shadow-lg ring-8 transition-transform hover:scale-110",
                KIND_STYLE[marker.kind],
              )}
              style={position}
            >
              {group.items.length > 1
                ? group.items.length
                : marker.kind === "resource"
                  ? "＋"
                  : marker.kind === "team"
                    ? "◆"
                    : marker.kind === "risk"
                      ? "△"
                      : "!"}
            </button>
          );
        })}

        <div className="absolute left-3 top-3 flex items-center gap-2 rounded-lg border border-cyan-100/20 bg-[#12232a]/85 px-3 py-2 font-mono text-[10px] text-cyan-50 backdrop-blur">
          <Crosshair className="h-3.5 w-3.5 text-primary" aria-hidden />
          <span>
            {vp.minLat.toFixed(2)}–{vp.maxLat.toFixed(2)} N · {vp.minLng.toFixed(2)}–
            {vp.maxLng.toFixed(2)} E
          </span>
        </div>

        {rejectedCount > 0 && (
          <div className="absolute inset-x-3 bottom-3 rounded-lg border border-destructive/50 bg-destructive/15 px-3 py-2 text-xs text-destructive-foreground shadow-lg backdrop-blur sm:inset-x-auto sm:right-3 sm:max-w-sm">
            {rejectedCount} location record{rejectedCount === 1 ? "" : "s"} hidden: outside the
            Andhra Pradesh operating bounds.
          </div>
        )}

        <div className="absolute right-3 top-3 flex flex-col gap-1.5">
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => zoomBy(1.4)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-100/20 bg-[#12232a]/90 text-cyan-50 backdrop-blur hover:bg-[#1b333c]"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => zoomBy(1 / 1.4)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-100/20 bg-[#12232a]/90 text-cyan-50 backdrop-blur hover:bg-[#1b333c]"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Reset map view"
            onClick={() => setView(DEFAULT_VIEW)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-100/20 bg-[#12232a]/90 text-cyan-50 backdrop-blur hover:bg-[#1b333c]"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>

        {showLegend && (
          <div className="absolute bottom-3 left-3 rounded-lg border border-cyan-100/20 bg-[#12232a]/90 p-3 text-xs text-cyan-50 backdrop-blur">
            <p className="mb-2 font-semibold">Layers</p>
            <div className="grid gap-1.5">
              {(Object.keys(KIND_STYLE) as MapMarker["kind"][]).map((kind) => (
                <label key={kind} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={!hidden[kind]}
                    onChange={() => setHidden((prev) => ({ ...prev, [kind]: !prev[kind] }))}
                  />
                  <i className={cn("h-2.5 w-2.5 rounded-full", KIND_STYLE[kind].split(" ")[0])} />
                  {KIND_LABEL[kind]}
                </label>
              ))}
            </div>
            <div className="mt-3 border-t border-cyan-100/15 pt-2">
              <p className="mb-1 text-[10px] text-cyan-100/60 uppercase">No connected source</p>
              {UNAVAILABLE_LAYER_LABELS.map((label) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-2 py-0.5 text-cyan-100/60"
                >
                  <span>{label}</span>
                  <DataTag quality="UNAVAILABLE" />
                </div>
              ))}
            </div>
          </div>
        )}

        {selected && (
          <div className="absolute right-3 bottom-3 max-w-[min(280px,calc(100%-1.5rem))] rounded-lg border border-border bg-surface/95 p-3 shadow-xl backdrop-blur">
            <button
              className="float-right text-muted-foreground"
              onClick={() => setSelected(null)}
              aria-label="Close marker details"
            >
              ×
            </button>
            <p className="pr-5 text-sm font-semibold">{selected.label}</p>
            {selected.detail && (
              <p className="mt-1 text-xs text-muted-foreground">{selected.detail}</p>
            )}
            {selected.score !== undefined && (
              <p className="mt-2 font-mono text-xs text-high">Risk score {selected.score}/100</p>
            )}
            {selected.quality && (
              <div className="mt-2">
                <DataTag quality={selected.quality} />
              </div>
            )}
            <p className="mt-2 font-mono text-[10px] text-muted-foreground">
              <MapPin className="mr-1 inline h-3 w-3" />
              {selected.lat.toFixed(4)}, {selected.lng.toFixed(4)}
            </p>
          </div>
        )}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Drag to pan, scroll or pinch to zoom. Markers are clustered and loaded for the visible area
        only. Route safety is not verified by this view; follow current official guidance.
        {route &&
          !routeIsValid &&
          " The requested route is unavailable inside the AP operating bounds."}
      </p>
    </Panel>
  );
}
