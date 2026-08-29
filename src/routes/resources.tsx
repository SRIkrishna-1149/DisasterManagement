import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Crosshair,
  Hospital,
  MapPinned,
  Navigation,
  Phone,
  RefreshCw,
  Route as RouteIcon,
} from "lucide-react";
import { OperationsMap, type MapMarker } from "@/components/map-panel";
import { Button, DataTag, EmptyState, ErrorState, Panel } from "@/components/kit";
import { PageFrame } from "@/components/portal";
import { AP_CENTER, formatTimeAgo, isInsideAndhraPradesh, type DataQuality } from "@/lib/domain";
import { generateSimulatedRoute, nearbyToRoute } from "@/lib/geo";
import { useEmergencyLocation } from "@/hooks/useEmergencyLocation";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type ResourceRow = Tables<"emergency_resources">;
type ResourceStatus = ResourceRow["status"];

export const Route = createFileRoute("/resources")({ component: ResourcesRoute });

function ResourcesRoute() {
  const [kind, setKind] = useState<"ALL" | "shelter" | "hospital">("ALL");
  const [routeTargetId, setRouteTargetId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : window.sessionStorage.getItem("sentinel-route-target"),
  );
  const [routeVariant, setRouteVariant] = useState(() =>
    typeof window === "undefined"
      ? 0
      : Number(window.sessionStorage.getItem("sentinel-route-variant") ?? 0) || 0,
  );
  const { location, request } = useEmergencyLocation();
  useEffect(() => {
    if (routeTargetId) window.sessionStorage.setItem("sentinel-route-target", routeTargetId);
    else window.sessionStorage.removeItem("sentinel-route-target");
    window.sessionStorage.setItem("sentinel-route-variant", String(routeVariant));
  }, [routeTargetId, routeVariant]);
  const resources = useQuery({
    queryKey: ["resources"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("emergency_resources")
        .select("*")
        .order("resource_type")
        .order("name");
      if (error) throw error;
      return (data ?? []) as ResourceRow[];
    },
    staleTime: 60_000,
  });
  const rows = (resources.data ?? []).filter((row) => kind === "ALL" || row.resource_type === kind);
  const routeTarget = rows.find((row) => row.id === routeTargetId) ?? null;
  const simulatedRoute = useMemo(() => {
    const routeOrigin =
      location && isInsideAndhraPradesh(location.lat, location.lng)
        ? { lat: location.lat, lng: location.lng }
        : AP_CENTER;
    return routeTarget
      ? generateSimulatedRoute(
          routeOrigin,
          { lat: routeTarget.latitude, lng: routeTarget.longitude },
          routeVariant,
        )
      : null;
  }, [location, routeTarget, routeVariant]);
  const nearbyResources = useMemo(() => {
    if (!simulatedRoute) return [];
    return nearbyToRoute(
      (resources.data ?? [])
        .filter((resource) => resource.id !== routeTarget?.id)
        .map((resource) => ({ resource, lat: resource.latitude, lng: resource.longitude })),
      simulatedRoute.points,
      2.5,
    );
  }, [resources.data, routeTarget?.id, simulatedRoute]);
  const markers: MapMarker[] = rows.map((row) => ({
    id: row.id,
    kind: "resource",
    label: row.name,
    detail: `${row.status.replaceAll("_", " ")} · ${row.address ?? "address unavailable"}`,
    lat: row.latitude,
    lng: row.longitude,
    quality: qualityFor(row.last_verified_at),
  }));

  return (
    <PageFrame
      eyebrow="Community / find help"
      title="Shelters & hospitals"
      description="Availability can change quickly. Read each resource's status and last verification before travelling; route safety cannot be confirmed here."
      actions={
        <Link to="/map">
          <Button>
            <MapPinned className="h-4 w-4" />
            Map view
          </Button>
        </Link>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["ALL", "All resources"],
            ["shelter", "Shelters"],
            ["hospital", "Hospitals"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setKind(value)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${kind === value ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
        <div>
          {resources.isError && (
            <ErrorState
              message="Resource data is unavailable. Existing information may be stale."
              onRetry={() => void resources.refetch()}
            />
          )}
          {resources.isLoading ? (
            <Panel>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Loading resource status…
              </p>
            </Panel>
          ) : rows.length === 0 ? (
            <EmptyState message="No resources are available for this filter." />
          ) : (
            <div className="space-y-3">
              {rows.map((resource) => (
                <ResourceCard
                  key={resource.id}
                  resource={resource}
                  onPreviewRoute={() => {
                    setRouteTargetId(resource.id);
                    setRouteVariant(0);
                  }}
                />
              ))}
            </div>
          )}
        </div>
        <OperationsMap
          markers={markers}
          {...(simulatedRoute ? { route: simulatedRoute.points } : {})}
          routeLabel={simulatedRoute?.label ?? "SIMULATED ROUTE"}
          title="Help locations"
        />
      </div>
      {routeTarget && (
        <Panel title="Route preview" className="mt-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold">
                <RouteIcon className="h-4 w-4 text-primary" />
                {routeTarget.name}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Origin: {location ? "your recent GPS position" : "Vijayawada demo origin"} ·
                destination: AP-validated resource
              </p>
              {simulatedRoute ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {simulatedRoute.distanceKm.toFixed(1)} km estimated · route alternative{" "}
                  {routeVariant + 1}
                </p>
              ) : (
                <p className="mt-2 text-sm text-destructive">
                  Route unavailable inside the AP operating bounds.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {!location && (
                <Button size="sm" onClick={request}>
                  <Crosshair className="h-4 w-4" />
                  Use current GPS
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRouteVariant((variant) => (variant + 1) % 3)}
                disabled={!simulatedRoute}
              >
                Another simulated route
              </Button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <DataTag quality="SIMULATED" />
            <span className="text-xs text-muted-foreground">
              Available route preview only; safety and road conditions are not verified.
            </span>
          </div>
          {nearbyResources.length > 0 && (
            <div className="mt-4 border-t border-border pt-4">
              <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Nearby resources along preview
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {nearbyResources.map(({ resource }) => (
                  <span
                    key={resource.id}
                    className="rounded-md border border-border bg-surface/60 px-2 py-1 text-xs"
                  >
                    {resource.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Panel>
      )}
    </PageFrame>
  );
}

function qualityFor(lastVerified: string | null): DataQuality {
  if (!lastVerified) return "UNAVAILABLE";
  const age = Date.now() - new Date(lastVerified).getTime();
  return age < 6 * 60 * 60_000
    ? "LIVE"
    : age < 24 * 60 * 60_000
      ? "RECENT"
      : age < 7 * 24 * 60 * 60_000
        ? "STALE"
        : "CACHED";
}

function ResourceCard({
  resource,
  onPreviewRoute,
}: {
  resource: ResourceRow;
  onPreviewRoute: () => void;
}) {
  const statusTone: Record<ResourceStatus, string> = {
    ACTIVE: "text-safe border-safe/40 bg-safe/10",
    INACTIVE: "text-muted-foreground border-border bg-muted/40",
    FULL: "text-high border-high/40 bg-high/10",
    UNKNOWN: "text-accent border-accent/40 bg-accent/10",
    TEMPORARILY_UNAVAILABLE: "text-destructive border-destructive/40 bg-destructive/10",
  };
  const occupancy =
    resource.capacity && resource.occupancy !== null
      ? `${resource.occupancy}/${resource.capacity} occupied`
      : "Capacity not reported";
  return (
    <article className="panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            {resource.resource_type === "hospital" ? (
              <Hospital className="h-5 w-5" />
            ) : (
              <Building2 className="h-5 w-5" />
            )}
          </div>
          <div>
            <h2 className="font-semibold">{resource.name}</h2>
            <p className="mt-0.5 text-xs capitalize text-muted-foreground">
              {resource.resource_type.replaceAll("_", " ")}
            </p>
          </div>
        </div>
        <span
          className={`rounded-md border px-2 py-1 text-[10px] font-bold tracking-wide uppercase ${statusTone[resource.status]}`}
        >
          {resource.status.replaceAll("_", " ")}
        </span>
      </div>
      <div className="mt-4 grid gap-2 text-xs text-muted-foreground">
        <p>
          <MapPinned className="mr-1 inline h-3.5 w-3.5 text-primary" />
          {resource.address ?? "Address not available"}
        </p>
        <p>
          <span className="font-semibold text-foreground">{occupancy}</span> · verified{" "}
          {formatTimeAgo(resource.last_verified_at)}
        </p>
        {resource.verification_source && <p>Source: {resource.verification_source}</p>}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <DataTag quality={qualityFor(resource.last_verified_at)} at={resource.last_verified_at} />
        <div className="flex gap-2">
          {resource.contact_phone && (
            <a
              href={`tel:${resource.contact_phone}`}
              className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-2 text-xs font-semibold hover:bg-surface-2"
            >
              <Phone className="h-3.5 w-3.5" />
              Call
            </a>
          )}
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${resource.latitude},${resource.longitude}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-9 items-center gap-1 rounded-md bg-primary px-2 text-xs font-semibold text-primary-foreground"
          >
            <Navigation className="h-3.5 w-3.5" />
            Route available
          </a>
          <button
            type="button"
            onClick={onPreviewRoute}
            className="inline-flex min-h-9 items-center gap-1 rounded-md border border-primary/40 px-2 text-xs font-semibold text-primary hover:bg-primary/10"
          >
            <RouteIcon className="h-3.5 w-3.5" />
            Preview
          </button>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Safety status cannot be confirmed from the shortest route alone.
      </p>
    </article>
  );
}
