import { useMemo, useState } from "react";
import { Crosshair, Layers, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { clusterPoints, type LatLng } from "@/lib/geo";
import { DataTag, Panel } from "./kit";

export interface MapMarker extends LatLng {
  id: string;
  label: string;
  kind: "risk" | "resource" | "sos" | "team" | "alert";
  detail?: string;
  quality?: "LIVE" | "RECENT" | "STALE" | "CACHED" | "SIMULATED" | "UNAVAILABLE";
  score?: number;
}

const BOUNDS = { minLat: 12.94, maxLat: 13.025, minLng: 77.55, maxLng: 77.64 };

const KIND_STYLE: Record<MapMarker["kind"], string> = {
  risk: "bg-high text-background ring-high/30",
  resource: "bg-safe text-background ring-safe/30",
  sos: "bg-destructive text-destructive-foreground ring-destructive/30",
  team: "bg-primary text-background ring-primary/30",
  alert: "bg-accent text-background ring-accent/30",
};

function toPosition(marker: LatLng) {
  const left = ((marker.lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * 100;
  const top = (1 - (marker.lat - BOUNDS.minLat) / (BOUNDS.maxLat - BOUNDS.minLat)) * 100;
  return { left: `${Math.max(3, Math.min(97, left))}%`, top: `${Math.max(4, Math.min(96, top))}%` };
}

export function OperationsMap({
  markers,
  className,
  title = "Operational map",
}: {
  markers: MapMarker[];
  className?: string;
  title?: string;
}) {
  const [selected, setSelected] = useState<MapMarker | null>(null);
  const [showLegend, setShowLegend] = useState(true);
  const groups = useMemo(() => clusterPoints(markers, 0.008), [markers]);

  return (
    <Panel
      title={title}
      className={cn("overflow-hidden", className)}
      action={
        <button
          aria-label="Toggle map legend"
          onClick={() => setShowLegend((value) => !value)}
          className="rounded-md p-2 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
        >
          <Layers className="h-4 w-4" />
        </button>
      }
    >
      <div
        className="relative min-h-[420px] overflow-hidden rounded-xl border border-border bg-[#12232a]"
        aria-label="Map view of the monitored response area"
      >
        <div
          className="absolute inset-0 opacity-35"
          style={{
            backgroundImage:
              "linear-gradient(28deg, transparent 48%, #62a6a9 49%, transparent 51%), linear-gradient(112deg, transparent 48%, #62a6a9 49%, transparent 51%), linear-gradient(#39747a 1px, transparent 1px), linear-gradient(90deg, #39747a 1px, transparent 1px)",
            backgroundSize: "180px 140px, 220px 180px, 42px 42px, 42px 42px",
          }}
        />
        <div className="absolute inset-x-[13%] top-[47%] h-5 -rotate-12 rounded-full bg-cyan-300/10 blur-md" />
        <div className="absolute left-[6%] top-[12%] font-mono text-[10px] tracking-widest text-cyan-100/50 uppercase">
          North response sector
        </div>
        <div className="absolute bottom-[10%] right-[8%] font-mono text-[10px] tracking-widest text-cyan-100/50 uppercase">
          Grid 12.97 / 77.59
        </div>
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
              onClick={() => setSelected(marker)}
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
        <div className="absolute left-3 top-3 flex items-center gap-2 rounded-lg border border-cyan-100/20 bg-[#12232a]/85 px-3 py-2 text-xs text-cyan-50 backdrop-blur">
          <Crosshair className="h-3.5 w-3.5 text-primary" aria-hidden />
          <span>Viewport 12.94–13.02 N · 77.55–77.64 E</span>
        </div>
        {showLegend && (
          <div className="absolute bottom-3 left-3 rounded-lg border border-cyan-100/20 bg-[#12232a]/90 p-3 text-xs text-cyan-50 backdrop-blur">
            <p className="mb-2 font-semibold">Layers</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {Object.entries(KIND_STYLE).map(([kind, style]) => (
                <span key={kind} className="flex items-center gap-2 capitalize">
                  <i className={cn("h-2.5 w-2.5 rounded-full", style.split(" ")[0])} />
                  {kind}
                </span>
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
        Map markers are clustered for performance. Route safety is not verified by this view; follow
        current official guidance.
      </p>
    </Panel>
  );
}
