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
  Flame,
  LifeBuoy,
  Info,
  CheckCircle2,
} from "lucide-react";
import { MapPanel, type MapMarker } from "@/components/map-panel";
import { Button, DataTag, EmptyState, ErrorState, Panel } from "@/components/kit";
import { PageFrame } from "@/components/portal";
import { INDIA_CENTER, isInsideIndia, formatEmergencyDistance } from "@/lib/domain";
import { haversineKm, isValidCoordinate, type LatLng } from "@/lib/geo";
import { useEmergencyLocation } from "@/hooks/useEmergencyLocation";
import {
  searchNearbyStaticFacilities,
  INDIAN_STATIC_FACILITIES,
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
  const [kind, setKind] = useState<"ALL" | FacilityType>("ALL");
  const [searchRadiusKm, setSearchRadiusKm] = useState<number>(25);
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

  // Combine DB resources & Static Facilities dataset sorted locally by GPS distance
  const combinedFacilities = useMemo<StaticFacility[]>(() => {
    const origin = location || INDIA_CENTER;
    const dbList: StaticFacility[] = (dbResources.data ?? [])
      .filter((row) => kind === "ALL" || row.resource_type === kind)
      .map((row) => ({
        id: `db-${row.id}`,
        name: row.name,
        type: (row.resource_type === "hospital" ? "hospital" : "shelter") as FacilityType,
        categoryLabel:
          row.resource_type === "hospital"
            ? "Hospital & Trauma Center"
            : "Designated Relief Shelter",
        lat: row.latitude,
        lng: row.longitude,
        address: row.address || "Andhra Pradesh, India",
        district: "Andhra Pradesh",
        city: "Andhra Pradesh",
        state: "Andhra Pradesh",
        capacity: row.capacity,
        phone: row.contact_phone || "112",
        isOpen: row.status === "ACTIVE",
        source: "State Emergency Resource Database",
        verified: true,
        lastUpdated: row.last_verified_at || row.updated_at,
      }));

    const staticList = searchNearbyStaticFacilities(
      origin,
      kind === "ALL" ? "all" : kind,
      searchRadiusKm,
      40,
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
  }, [dbResources.data, location, kind, searchRadiusKm]);

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
      if (!isInsideIndia(facility.lat, facility.lng)) {
        setRouteError("Selected facility is located outside the India operations area.");
        setRoutingState("error");
        return;
      }

      const reqId = ++activeRequestIdRef.current;

      try {
        let originCoord: LatLng | null = null;
        if (
          location &&
          isValidCoordinate(location.lat, location.lng) &&
          isInsideIndia(location.lat, location.lng)
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
            originCoord = INDIA_CENTER;
          }
        }

        if (!originCoord) {
          originCoord = INDIA_CENTER;
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
          setRouteError("No road routes found in the static road network for this connection.");
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
    const origin = location || INDIA_CENTER;
    return combinedFacilities.map((f) => {
      const dist = haversineKm(origin, { lat: f.lat, lng: f.lng });
      return {
        id: f.id,
        kind: "resource" as const,
        label: f.name,
        detail: `${f.categoryLabel} · ${formatEmergencyDistance(dist)} away`,
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
      eyebrow="Emergency Resources"
      title="Shelters, Hospitals & Rescue Stations"
      description="Localized emergency facility discovery with static road routing, proximity sorting in meters, and hazard assessment."
      actions={
        <Link to="/map">
          <Button>
            <MapPinned className="h-4 w-4" />
            Full Map View
          </Button>
        </Link>
      }
    >
      {/* Filter and Radius Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Category Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          {[
            ["ALL", "All Facilities"],
            ["shelter", "Shelters"],
            ["hospital", "Hospitals"],
            ["police", "Police Stations"],
            ["fire_station", "Fire Stations"],
            ["rescue_station", "Rescue Bases"],
            ["emergency_facility", "Evacuation Points"],
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
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                kind === value
                  ? "border-cyan-500 bg-cyan-500/15 text-cyan-300"
                  : "border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Search Radius Selection */}
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <span>Radius:</span>
          {[
            [10, "10 km"],
            [25, "25 km"],
            [75, "75 km"],
            [300, "All Region"],
          ].map(([rad, radLabel]) => (
            <button
              key={rad}
              onClick={() => setSearchRadiusKm(Number(rad))}
              className={`rounded px-2 py-0.5 text-[11px] font-medium transition ${
                searchRadiusKm === rad
                  ? "bg-cyan-500/20 text-cyan-300 font-bold"
                  : "bg-slate-900 text-slate-400 hover:text-white"
              }`}
            >
              {radLabel}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_1.35fr]">
        {/* Left Column: Facility List */}
        <div>
          {dbResources.isError && (
            <ErrorState
              message="Online resource database is unreachable. Verified static emergency facilities dataset is loaded."
              onRetry={() => void dbResources.refetch()}
            />
          )}

          {/* Location prompt banner if GPS not active */}
          {!location && (
            <div className="mb-4 flex flex-col gap-3 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold text-cyan-300">
                  Enable GPS location for localized proximity sorting
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  Ranks nearest emergency shelters, hospitals, and stations by road distance.
                </p>
              </div>
              <Button size="sm" onClick={requestLocation} disabled={locStatus === "locating"}>
                <Crosshair className="h-4 w-4" />
                {locStatus === "locating" ? "Locating…" : "Use My GPS"}
              </Button>
            </div>
          )}

          {combinedFacilities.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-6 text-center text-slate-400">
              <Building2 className="mx-auto mb-2 h-8 w-8 text-slate-500" />
              <p className="text-sm font-semibold text-slate-200">
                No verified emergency facility found within {searchRadiusKm} km.
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Try expanding the search radius or selecting a different category.
              </p>
              <button
                type="button"
                onClick={() => setSearchRadiusKm(75)}
                className="mt-3 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20"
              >
                Expand Search Radius to 75 km
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {combinedFacilities.map((facility) => {
                const origin = location || INDIA_CENTER;
                const distKm = haversineKm(origin, { lat: facility.lat, lng: facility.lng });
                return (
                  <FacilityCard
                    key={facility.id}
                    facility={facility}
                    distanceKm={distKm}
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
          <MapPanel
            markers={markers}
            activeRoute={activeRoute}
            userLocation={location ? { lat: location.lat, lng: location.lng } : null}
            accuracyM={location?.accuracyM ?? null}
            selectedMarkerId={selectedFacility?.id ?? null}
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
                <p className="flex items-center gap-2 text-sm text-slate-400 py-2">
                  <Crosshair className="h-4 w-4 animate-spin text-cyan-400" />
                  Acquiring device GPS coordinates…
                </p>
              ) : routingState === "calculating-route" ? (
                <p className="flex items-center gap-2 text-sm text-slate-400 py-2">
                  <RefreshCw className="h-4 w-4 animate-spin text-cyan-400" />
                  Calculating static road route…
                </p>
              ) : routingState === "error" || routeError ? (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs text-amber-300 space-y-2">
                  <p className="font-semibold">{routeError}</p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRouteHere(selectedFacility)}
                    >
                      <RefreshCw className="h-3 w-3" />
                      Retry Local Route Calculation
                    </Button>
                  </div>
                </div>
              ) : activeRoute ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                    <div>
                      <p className="text-sm font-bold text-white flex items-center gap-1.5">
                        <RouteIcon className="h-4 w-4 text-cyan-400" />
                        {activeRoute.summary}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {activeRoute.distanceText} · {activeRoute.durationText} estimated static
                        travel
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                          activeRoute.routeConfidence === "HIGH"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                            : activeRoute.routeConfidence === "MEDIUM"
                              ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                              : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                        }`}
                      >
                        Confidence: {activeRoute.routeConfidence}
                      </span>
                    </div>
                  </div>

                  {/* Hazard Assessment Banner */}
                  <div
                    className={`rounded-lg border p-3 text-xs ${
                      activeRoute.hazardRisk === "CRITICAL" || activeRoute.hazardRisk === "HIGH"
                        ? "border-red-500/40 bg-red-500/10 text-red-300"
                        : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    }`}
                  >
                    <p className="font-semibold flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      {activeRoute.hazardRisk === "LOW"
                        ? "Lower-risk route based on available static hazard data"
                        : "Potential hazard intersection detected"}
                    </p>
                    {activeRoute.hazardReason && (
                      <p className="mt-1 text-slate-400">{activeRoute.hazardReason}</p>
                    )}
                  </div>

                  {/* Safety Disclaimer */}
                  <p className="text-[11px] italic text-slate-500">
                    {activeRoute.safetyDisclaimer}
                  </p>

                  {/* Step Guidance Snippet */}
                  {activeRoute.steps.length > 0 && (
                    <div className="border-t border-slate-800 pt-2 text-xs text-slate-400">
                      <p className="font-semibold text-slate-200 mb-1">Key Road Segments:</p>
                      <div className="space-y-1 mt-1">
                        {activeRoute.steps.slice(0, 4).map((step, sIdx) => (
                          <p key={sIdx} className="flex items-center justify-between">
                            <span>• {step.instruction}</span>
                            <span className="font-mono text-[10px] text-slate-300">
                              {step.distanceText}
                            </span>
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
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs font-semibold text-slate-200 hover:bg-slate-800"
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
    ) : facility.type === "rescue_station" ? (
      <LifeBuoy className="h-5 w-5 text-purple-400" />
    ) : (
      <Building2 className="h-5 w-5 text-sky-400" />
    );

  return (
    <div
      onClick={onSelect}
      className={`group relative cursor-pointer rounded-xl border p-4 transition-all ${
        isSelected
          ? "border-cyan-500 bg-cyan-500/10 shadow-lg ring-1 ring-cyan-500/40"
          : "border-slate-800/80 bg-slate-900/60 hover:border-cyan-500/40 hover:bg-slate-900"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg border border-slate-800 bg-slate-950 p-2">{icon}</div>
          <div>
            <h3 className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors">
              {facility.name}
            </h3>
            <p className="mt-0.5 text-xs text-slate-400 flex items-center gap-2">
              <span>{facility.categoryLabel}</span>
              <span>•</span>
              <span className="font-semibold text-slate-300">{facility.district}</span>
            </p>
            {facility.address && (
              <p className="mt-1 text-[11px] text-slate-400 line-clamp-1">{facility.address}</p>
            )}
          </div>
        </div>

        <div className="text-right shrink-0">
          <span className="font-mono text-sm font-bold text-cyan-400">
            {formatEmergencyDistance(distanceKm)}
          </span>
          <p className="text-[10px] text-slate-500">proximity</p>
        </div>
      </div>

      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/60 pt-2.5">
        <div className="flex items-center gap-2">
          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/30">
            Verified
          </span>
          {facility.phone && (
            <span className="font-mono text-[11px] text-slate-400 flex items-center gap-1">
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
