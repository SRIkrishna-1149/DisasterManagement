import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Building2,
  Crosshair,
  Hospital,
  MapPinned,
  Navigation,
  Phone,
  RefreshCw,
  Route as RouteIcon,
  Shield,
  Truck,
  AlertTriangle,
  Compass,
} from "lucide-react";
import { OperationsMap, type MapMarker } from "@/components/map-panel";
import { Button, DataTag, EmptyState, ErrorState, Panel } from "@/components/kit";
import { PageFrame } from "@/components/portal";
import { AP_CENTER, isInsideAndhraPradesh } from "@/lib/domain";
import { haversineKm, isValidCoordinate, type LatLng } from "@/lib/geo";
import { useEmergencyLocation } from "@/hooks/useEmergencyLocation";
import {
  searchNearbyStaticFacilities,
  AP_STATIC_FACILITIES,
  type StaticFacility,
  type FacilityType,
} from "@/lib/static-facilities";
import {
  calculateStaticRoadRoutes,
  getExternalNavigationUrl,
  type CalculatedRoute,
} from "@/lib/static-router";
import { evaluateRouteHazards } from "@/lib/hazard-routing";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type ResourceRow = Tables<"emergency_resources">;

export type RoutingState =
  "idle" | "requesting-location" | "calculating-route" | "success" | "error" | "cancelled";

export const Route = createFileRoute("/resources")({ component: ResourcesRoute });

function ResourcesRoute() {
  const [kind, setKind] = useState<"ALL" | "shelter" | "hospital" | "police" | "fire_station">(
    "ALL",
  );
  const [selectedFacilityId, setSelectedFacilityId] = useState<string | null>(null);
  const [activeRoutes, setActiveRoutes] = useState<CalculatedRoute[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [routingState, setRoutingState] = useState<RoutingState>("idle");
  const [routeError, setRouteError] = useState<string | null>(null);
  const activeRequestIdRef = useRef(0);

  const {
    location,
    status: locStatus,
    request: requestLocation,
    getCurrentLocation,
  } = useEmergencyLocation();

  // 1. Fetch database emergency resource records from Supabase
  const dbResources = useQuery({
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

  // 2. Fetch active risk assessments for route hazard evaluation
  const riskQuery = useQuery({
    queryKey: ["resources-risks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("risk_assessments")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  // Combine DB resources & Static Facilities dataset
  const combinedFacilities = useMemo<StaticFacility[]>(() => {
    const origin = location || AP_CENTER;
    const dbList: StaticFacility[] = (dbResources.data ?? [])
      .filter((row) => kind === "ALL" || row.resource_type === kind)
      .map((row) => ({
        id: `db-${row.id}`,
        name: row.name,
        type: (row.resource_type === "hospital" ? "hospital" : "shelter") as FacilityType,
        categoryLabel:
          row.resource_type === "hospital" ? "Verified Hospital" : "Verified Emergency Shelter",
        lat: row.latitude,
        lng: row.longitude,
        address: row.address || "Andhra Pradesh, India",
        district: "Andhra Pradesh",
        city: "Andhra Pradesh",
        capacity: row.capacity,
        phone: row.contact_phone || "112",
        isOpen: row.status === "ACTIVE",
        source: "STATIC_DATASET" as const,
        verifiedAt: row.last_verified_at || row.updated_at,
      }));

    const staticList = searchNearbyStaticFacilities(
      origin,
      kind === "ALL" ? "all" : kind,
      120,
      30,
    ).filter(
      (p) =>
        !dbList.some(
          (d) => haversineKm({ lat: d.lat, lng: d.lng }, { lat: p.lat, lng: p.lng }) < 0.2,
        ),
    );

    const merged = [...dbList, ...staticList];
    return merged.sort(
      (a, b) =>
        haversineKm(origin, { lat: a.lat, lng: a.lng }) -
        haversineKm(origin, { lat: b.lat, lng: b.lng }),
    );
  }, [dbResources.data, location, kind]);

  const selectedFacility = useMemo(
    () => combinedFacilities.find((f) => f.id === selectedFacilityId) ?? null,
    [combinedFacilities, selectedFacilityId],
  );

  // Compute static road routes locally with state machine and GPS acquisition
  const handleRouteHere = useCallback(
    async (facility: StaticFacility) => {
      setSelectedFacilityId(facility.id);
      setSelectedRouteIndex(0);
      setActiveRoutes([]);
      setRouteError(null);

      // Validate destination coordinates
      if (!isValidCoordinate(facility.lat, facility.lng)) {
        setRouteError("Selected destination contains invalid geographic coordinates.");
        setRoutingState("error");
        return;
      }
      if (!isInsideAndhraPradesh(facility.lat, facility.lng)) {
        setRouteError("Selected facility is located outside the Andhra Pradesh operating area.");
        setRoutingState("error");
        return;
      }

      const reqId = ++activeRequestIdRef.current;

      try {
        let originCoord: LatLng | null = null;
        if (
          location &&
          isValidCoordinate(location.lat, location.lng) &&
          isInsideAndhraPradesh(location.lat, location.lng)
        ) {
          originCoord = { lat: location.lat, lng: location.lng };
        } else {
          // Request fresh high-accuracy device location
          setRoutingState("requesting-location");
          try {
            const freshLoc = await getCurrentLocation(8000);
            if (activeRequestIdRef.current !== reqId) return; // Stale request
            originCoord = { lat: freshLoc.lat, lng: freshLoc.lng };
          } catch {
            if (activeRequestIdRef.current !== reqId) return;
            // Fall back to default Andhra Pradesh center if GPS permission is not granted
            originCoord = AP_CENTER;
          }
        }

        if (!originCoord) {
          originCoord = AP_CENTER;
        }

        setRoutingState("calculating-route");
        const routes = await calculateStaticRoadRoutes(
          originCoord,
          { lat: facility.lat, lng: facility.lng },
          "DRIVING",
        );

        if (activeRequestIdRef.current !== reqId) return; // Stale response protection

        if (!routes || routes.length === 0) {
          setRoutingState("error");
          setRouteError("No road routes found in the Andhra Pradesh static road network.");
          return;
        }

        const hazardZones = (riskQuery.data ?? []).map((r) => ({
          id: r.id,
          title: r.area_name,
          lat: r.latitude,
          lng: r.longitude,
          radiusKm: 2,
          severity: (r.risk_score >= 80
            ? "CRITICAL"
            : r.risk_score >= 60
              ? "HIGH"
              : "MEDIUM") as "HIGH",
          disasterType: r.disaster_type,
          source: "Persisted Risk Assessment",
        }));

        const evaluated = evaluateRouteHazards(routes, hazardZones);
        if (activeRequestIdRef.current !== reqId) return;

        setActiveRoutes(evaluated);
        setSelectedRouteIndex(0);
        setRoutingState("success");
        setRouteError(null);
      } catch (err) {
        if (activeRequestIdRef.current !== reqId) return;
        setRoutingState("error");
        setRouteError(err instanceof Error ? err.message : "Static road route calculation failed.");
      }
    },
    [location, getCurrentLocation, riskQuery.data],
  );

  const markers: MapMarker[] = useMemo(() => {
    const origin = location || AP_CENTER;
    return combinedFacilities.map((f) => {
      const dist = haversineKm(origin, { lat: f.lat, lng: f.lng });
      return {
        id: f.id,
        kind: "resource" as const,
        label: f.name,
        detail: `${f.categoryLabel} · ${dist.toFixed(1)} km away`,
        lat: f.lat,
        lng: f.lng,
        address: f.address,
        phone: f.phone,
        quality: "CACHED" as const,
      };
    });
  }, [combinedFacilities, location]);

  const activeRoute = activeRoutes[selectedRouteIndex] ?? null;
  const isRoutingBusy =
    routingState === "requesting-location" || routingState === "calculating-route";

  return (
    <PageFrame
      eyebrow="Community / find help"
      title="Shelters, hospitals & stations"
      description="Static emergency facility discovery across Andhra Pradesh with local road network routing and disaster hazard assessment."
      actions={
        <Link to="/map">
          <Button>
            <MapPinned className="h-4 w-4" />
            Full map view
          </Button>
        </Link>
      }
    >
      {/* Category Filter Pills */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          ["ALL", "All resources"],
          ["shelter", "Shelters"],
          ["hospital", "Hospitals"],
          ["police", "Police stations"],
          ["fire_station", "Fire stations"],
        ].map(([value, label]) => (
          <button
            key={value}
            onClick={() => {
              setKind(value as typeof kind);
              setSelectedFacilityId(null);
              setActiveRoutes([]);
              setRoutingState("idle");
              setRouteError(null);
            }}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              kind === value
                ? "border-primary bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:bg-surface-2"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_1.25fr]">
        {/* Left Column: Facility List */}
        <div>
          {dbResources.isError && (
            <ErrorState
              message="Online resource database is unreachable. Static Andhra Pradesh emergency facility dataset is loaded."
              onRetry={() => void dbResources.refetch()}
            />
          )}

          {/* Location prompt banner if GPS not active */}
          {!location && (
            <div className="mb-4 flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold text-primary">
                  Enable device location for nearest facility sorting
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Sorts facilities by exact road distance from your coordinates.
                </p>
              </div>
              <Button size="sm" onClick={requestLocation} disabled={locStatus === "locating"}>
                <Crosshair className="h-4 w-4" />
                {locStatus === "locating" ? "Locating…" : "Use my GPS"}
              </Button>
            </div>
          )}

          {combinedFacilities.length === 0 ? (
            <EmptyState message="No emergency facilities found matching this filter in Andhra Pradesh." />
          ) : (
            <div className="space-y-3">
              {combinedFacilities.map((facility) => {
                const origin = location || AP_CENTER;
                const distanceKm = Number(
                  haversineKm(origin, { lat: facility.lat, lng: facility.lng }).toFixed(1),
                );
                return (
                  <FacilityCard
                    key={facility.id}
                    facility={facility}
                    distanceKm={distanceKm}
                    isSelected={selectedFacility?.id === facility.id}
                    isRoutingBusy={selectedFacility?.id === facility.id && isRoutingBusy}
                    onSelect={() => handleRouteHere(facility)}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Interactive Map & Route Preview */}
        <div className="space-y-4">
          <OperationsMap
            markers={markers}
            calculatedRoute={activeRoute}
            userLocation={location ? { lat: location.lat, lng: location.lng } : null}
            userAccuracyM={location?.accuracyM ?? null}
            title={
              selectedFacility ? `Route to ${selectedFacility.name}` : "Emergency facilities map"
            }
            onSelectMarker={(m) => {
              if (m) {
                const fac = combinedFacilities.find((f) => f.id === m.id);
                if (fac) handleRouteHere(fac);
              }
            }}
            onRouteToMarker={(m) => {
              const fac = combinedFacilities.find((f) => f.id === m.id);
              if (fac) handleRouteHere(fac);
            }}
          />

          {/* Route Details Panel */}
          {selectedFacility && (
            <Panel title="Static Road Route & Safety Assessment">
              {routingState === "requesting-location" ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Crosshair className="h-4 w-4 animate-spin text-primary" />
                  Acquiring device GPS coordinates…
                </p>
              ) : routingState === "calculating-route" ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                  Calculating static road route…
                </p>
              ) : routingState === "error" || routeError ? (
                <div className="rounded-lg border border-accent/40 bg-accent/10 p-3.5 text-xs text-accent space-y-2">
                  <p className="font-semibold">{routeError}</p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRouteHere(selectedFacility)}
                    >
                      <RefreshCw className="h-3 w-3" />
                      Retry local route calculation
                    </Button>
                  </div>
                </div>
              ) : activeRoute ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
                    <div>
                      <p className="text-sm font-bold flex items-center gap-1.5">
                        <RouteIcon className="h-4 w-4 text-primary" />
                        {activeRoute.summary}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {activeRoute.distanceText} · {activeRoute.durationText} estimated travel
                      </p>
                    </div>
                  </div>

                  {/* Hazard Assessment Banner */}
                  <div
                    className={`rounded-lg border p-3 text-xs ${
                      activeRoute.hazardRisk === "CRITICAL" || activeRoute.hazardRisk === "HIGH"
                        ? "border-destructive/40 bg-destructive/10 text-destructive-foreground"
                        : "border-safe/40 bg-safe/10 text-safe"
                    }`}
                  >
                    <p className="font-semibold flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      {activeRoute.hazardRisk === "LOW"
                        ? "Lower-risk route based on available hazard data"
                        : "Potential hazard intersection detected"}
                    </p>
                    <p className="mt-1 text-muted-foreground">{activeRoute.hazardReason}</p>
                  </div>

                  {/* Step Guidance Snippet */}
                  {activeRoute.steps.length > 0 && (
                    <div className="border-t border-border/60 pt-2 text-xs text-muted-foreground">
                      <p className="font-semibold text-foreground mb-1">Key highway segments:</p>
                      <div className="space-y-1 mt-1">
                        {activeRoute.steps.slice(0, 4).map((step, sIdx) => (
                          <p key={sIdx} className="flex items-center justify-between">
                            <span>• {step.instruction}</span>
                            <span className="font-mono text-[10px]">{step.distanceText}</span>
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 pt-2">
                    {selectedFacility.phone && (
                      <a
                        href={`tel:${selectedFacility.phone}`}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-semibold hover:bg-surface-2"
                      >
                        <Phone className="h-3.5 w-3.5 text-emerald-400" />
                        Call {selectedFacility.phone}
                      </a>
                    )}
                  </div>
                </div>
              ) : null}
            </Panel>
          )}
        </div>
      </div>
    </PageFrame>
  );
}

function FacilityCard({
  facility,
  distanceKm,
  isSelected,
  isRoutingBusy,
  onSelect,
}: {
  facility: StaticFacility;
  distanceKm: number;
  isSelected: boolean;
  isRoutingBusy: boolean;
  onSelect: () => void;
}) {
  const icon =
    facility.type === "hospital" ? (
      <Hospital className="h-5 w-5 text-emerald-400" />
    ) : facility.type === "police" ? (
      <Shield className="h-5 w-5 text-blue-400" />
    ) : facility.type === "fire_station" ? (
      <Truck className="h-5 w-5 text-amber-400" />
    ) : (
      <Building2 className="h-5 w-5 text-sky-400" />
    );

  return (
    <div
      onClick={onSelect}
      className={`group relative cursor-pointer rounded-xl border p-4 transition-all ${
        isSelected
          ? "border-primary bg-primary/10 shadow-md ring-1 ring-primary/40"
          : "border-border bg-surface hover:border-primary/50 hover:bg-surface-2"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg border border-border bg-surface-2 p-2">{icon}</div>
          <div>
            <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
              {facility.name}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground flex items-center gap-2">
              <span>{facility.categoryLabel}</span>
              <span>•</span>
              <span className="font-semibold text-foreground">{facility.district}</span>
            </p>
            {facility.address && (
              <p className="mt-1 text-[11px] text-muted-foreground/80 line-clamp-1">
                {facility.address}
              </p>
            )}
          </div>
        </div>

        <div className="text-right shrink-0">
          <span className="font-mono text-sm font-bold text-primary">{distanceKm} km</span>
          <p className="text-[10px] text-muted-foreground">road access</p>
        </div>
      </div>

      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-2.5">
        <div className="flex items-center gap-2">
          <DataTag quality="CACHED" />
          {facility.phone && (
            <span className="font-mono text-[11px] text-muted-foreground flex items-center gap-1">
              <Phone className="h-3 w-3 text-emerald-400" /> {facility.phone}
            </span>
          )}
        </div>

        <Button size="sm" variant={isSelected ? "primary" : "outline"} disabled={isRoutingBusy}>
          {isRoutingBusy ? (
            <>
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Routing…
            </>
          ) : (
            <>
              <Navigation className="h-3.5 w-3.5" />
              Route here
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
