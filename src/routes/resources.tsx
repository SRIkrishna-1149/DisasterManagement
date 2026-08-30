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
  Shield,
  Truck,
  AlertTriangle,
} from "lucide-react";
import { OperationsMap, type MapMarker } from "@/components/map-panel";
import { Button, DataTag, EmptyState, ErrorState, Panel } from "@/components/kit";
import { PageFrame } from "@/components/portal";
import { AP_CENTER, formatTimeAgo, isInsideAndhraPradesh, type DataQuality } from "@/lib/domain";
import { haversineKm } from "@/lib/geo";
import { useEmergencyLocation } from "@/hooks/useEmergencyLocation";
import {
  searchNearbyGooglePlaces,
  type NearbyFacility,
  type FacilityType,
} from "@/lib/google-places";
import {
  calculateGoogleRoutes,
  getExternalNavigationUrl,
  type CalculatedRoute,
} from "@/lib/google-routes";
import { evaluateRouteHazards } from "@/lib/hazard-routing";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type ResourceRow = Tables<"emergency_resources">;
type ResourceStatus = ResourceRow["status"];

export const Route = createFileRoute("/resources")({ component: ResourcesRoute });

function ResourcesRoute() {
  const [kind, setKind] = useState<"ALL" | "shelter" | "hospital" | "police" | "fire_station">(
    "ALL",
  );
  const [selectedFacilityId, setSelectedFacilityId] = useState<string | null>(null);
  const [activeRoutes, setActiveRoutes] = useState<CalculatedRoute[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [routingBusy, setRoutingBusy] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  const { location, status: locStatus, request: requestLocation } = useEmergencyLocation();

  // 1. Fetch verified database records from Supabase
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

  // 2. Fetch nearby real-world facilities from Google Places when location is ready
  const placesQuery = useQuery({
    queryKey: ["google-places-nearby", location?.lat, location?.lng, kind],
    enabled: Boolean(location && isInsideAndhraPradesh(location.lat, location.lng)),
    queryFn: async () => {
      if (!location) return [];
      const facilityType: FacilityType =
        kind === "police"
          ? "police"
          : kind === "fire_station"
            ? "fire_station"
            : kind === "hospital"
              ? "hospital"
              : "shelter";

      const places = await searchNearbyGooglePlaces(
        { lat: location.lat, lng: location.lng },
        facilityType,
        25000,
      );
      return places;
    },
    staleTime: 5 * 60_000,
  });

  // 3. Fetch active risk assessments for route hazard evaluation
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

  // Combine DB resources & Places facilities
  const combinedFacilities = useMemo<NearbyFacility[]>(() => {
    const origin = location || AP_CENTER;
    const dbList: NearbyFacility[] = (dbResources.data ?? [])
      .filter((row) => kind === "ALL" || row.resource_type === kind)
      .map((row) => ({
        id: `db-${row.id}`,
        name: row.name,
        type: row.resource_type === "hospital" ? "hospital" : "shelter",
        categoryLabel:
          row.resource_type === "hospital" ? "Verified Hospital" : "Verified Emergency Shelter",
        lat: row.latitude,
        lng: row.longitude,
        address: row.address,
        distanceKm: Number(
          haversineKm(origin, { lat: row.latitude, lng: row.longitude }).toFixed(2),
        ),
        travelTimeMinutes: Math.round(
          haversineKm(origin, { lat: row.latitude, lng: row.longitude }) * 2.2,
        ),
        isOpen: row.status === "ACTIVE",
        phone: row.contact_phone,
        googleMapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${row.latitude},${row.longitude}`,
        source: "VERIFIED_DATABASE",
        retrievedAt: row.last_verified_at || row.updated_at,
      }));

    const placesList = (placesQuery.data ?? []).filter(
      (p) =>
        !dbList.some(
          (d) => haversineKm({ lat: d.lat, lng: d.lng }, { lat: p.lat, lng: p.lng }) < 0.2,
        ),
    );

    return [...dbList, ...placesList].sort((a, b) => a.distanceKm - b.distanceKm);
  }, [dbResources.data, placesQuery.data, location, kind]);

  const selectedFacility = useMemo(
    () => combinedFacilities.find((f) => f.id === selectedFacilityId) ?? null,
    [combinedFacilities, selectedFacilityId],
  );

  // Compute real road routes when target changes
  useEffect(() => {
    if (!selectedFacility) {
      setActiveRoutes([]);
      setRouteError(null);
      return;
    }

    let active = true;
    setRoutingBusy(true);
    setRouteError(null);

    const origin =
      location && isInsideAndhraPradesh(location.lat, location.lng)
        ? { lat: location.lat, lng: location.lng }
        : AP_CENTER;

    calculateGoogleRoutes(origin, { lat: selectedFacility.lat, lng: selectedFacility.lng })
      .then((routes) => {
        if (!active) return;
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
        setActiveRoutes(evaluated);
        setSelectedRouteIndex(0);
      })
      .catch((err) => {
        if (active) {
          console.warn("Route computation error:", err);
          setRouteError(
            "Road route calculation failed. Google Directions may be temporarily unavailable.",
          );
        }
      })
      .finally(() => {
        if (active) setRoutingBusy(false);
      });

    return () => {
      active = false;
    };
  }, [selectedFacility, location, riskQuery.data]);

  const markers: MapMarker[] = useMemo(
    () =>
      combinedFacilities.map((f) => ({
        id: f.id,
        kind: "resource" as const,
        label: f.name,
        detail: `${f.categoryLabel} · ${f.distanceKm} km away`,
        lat: f.lat,
        lng: f.lng,
        address: f.address,
        phone: f.phone,
        quality: f.source === "VERIFIED_DATABASE" ? "CACHED" : "LIVE",
      })),
    [combinedFacilities],
  );

  const activeRoute = activeRoutes[selectedRouteIndex] ?? null;

  return (
    <PageFrame
      eyebrow="Community / find help"
      title="Shelters, hospitals & stations"
      description="Real-time facility discovery around your location with actual road directions and disaster-aware route evaluations."
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
              message="Resource database is unavailable. Nearby Google Places information may still be loaded."
              onRetry={() => void dbResources.refetch()}
            />
          )}

          {/* Location prompt banner if GPS not active */}
          {!location && (
            <div className="mb-4 flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold text-primary">
                  Enable device location for nearby accuracy
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Sorts facilities by true distance and computes routes from where you are.
                </p>
              </div>
              <Button size="sm" onClick={requestLocation} disabled={locStatus === "locating"}>
                <Crosshair className="h-4 w-4" />
                {locStatus === "locating" ? "Locating…" : "Use my GPS"}
              </Button>
            </div>
          )}

          {dbResources.isLoading && combinedFacilities.length === 0 ? (
            <Panel>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Searching for emergency facilities…
              </p>
            </Panel>
          ) : combinedFacilities.length === 0 ? (
            <EmptyState message="No emergency facilities found matching this filter in Andhra Pradesh." />
          ) : (
            <div className="space-y-3">
              {combinedFacilities.map((facility) => (
                <FacilityCard
                  key={facility.id}
                  facility={facility}
                  isSelected={selectedFacility?.id === facility.id}
                  onSelect={() => setSelectedFacilityId(facility.id)}
                />
              ))}
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
              if (m) setSelectedFacilityId(m.id);
            }}
          />

          {/* Route Details Panel */}
          {selectedFacility && (
            <Panel title="Road Route & Safety Assessment">
              {routingBusy ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                  Calculating real road directions via Google Maps…
                </p>
              ) : routeError ? (
                <div className="rounded-lg border border-accent/40 bg-accent/10 p-3 text-xs text-accent">
                  <p className="font-semibold">{routeError}</p>
                  <a
                    href={selectedFacility.googleMapsUrl || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block font-bold underline"
                  >
                    Open directly in Google Maps ↗
                  </a>
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
                        {activeRoute.distanceText} · {activeRoute.durationText} road travel
                      </p>
                    </div>

                    {/* Route Alternatives */}
                    {activeRoutes.length > 1 && (
                      <div className="flex gap-1.5">
                        {activeRoutes.map((r, idx) => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => setSelectedRouteIndex(idx)}
                            className={`rounded px-2.5 py-1 text-xs font-semibold ${
                              selectedRouteIndex === idx
                                ? "bg-primary text-primary-foreground"
                                : "border border-border bg-surface hover:bg-surface-2 text-muted-foreground"
                            }`}
                          >
                            Route {idx + 1}
                          </button>
                        ))}
                      </div>
                    )}
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
                      <p className="font-semibold text-foreground mb-1">Key navigation turn:</p>
                      <p className="italic">"{activeRoute.steps[0]?.instruction}"</p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 pt-2">
                    <a
                      href={getExternalNavigationUrl(
                        { lat: selectedFacility.lat, lng: selectedFacility.lng },
                        location ? { lat: location.lat, lng: location.lng } : undefined,
                      )}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-bold text-primary-foreground hover:brightness-110"
                    >
                      <Navigation className="h-3.5 w-3.5" />
                      Navigate in Google Maps ↗
                    </a>
                    {selectedFacility.phone && (
                      <a
                        href={`tel:${selectedFacility.phone}`}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-semibold hover:bg-surface-2"
                      >
                        <Phone className="h-3.5 w-3.5" />
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
  isSelected,
  onSelect,
}: {
  facility: NearbyFacility;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const isHospital = facility.type === "hospital";
  const isPolice = facility.type === "police";
  const isFire = facility.type === "fire_station";

  return (
    <article
      className={`panel p-4 transition-all duration-150 ${
        isSelected ? "ring-2 ring-primary border-primary bg-primary/5" : "hover:border-primary/40"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            {isHospital ? (
              <Hospital className="h-5 w-5" />
            ) : isPolice ? (
              <Shield className="h-5 w-5" />
            ) : isFire ? (
              <Truck className="h-5 w-5" />
            ) : (
              <Building2 className="h-5 w-5" />
            )}
          </div>
          <div>
            <h2 className="font-semibold text-foreground text-sm sm:text-base">{facility.name}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{facility.categoryLabel}</p>
          </div>
        </div>
        <span className="rounded-md border border-border bg-surface px-2 py-1 font-mono text-[10px] font-bold text-primary">
          {facility.distanceKm} km
        </span>
      </div>

      <div className="mt-3 grid gap-1.5 text-xs text-muted-foreground">
        {facility.address && (
          <p className="flex items-center gap-1">
            <MapPinned className="h-3.5 w-3.5 shrink-0 text-primary" />
            {facility.address}
          </p>
        )}
        <p className="text-[11px]">
          Source:{" "}
          <span className="font-semibold text-foreground">
            {facility.source === "VERIFIED_DATABASE" ? "Official Database" : "Google Places"}
          </span>
          {" · "}
          {facility.travelTimeMinutes
            ? `~${facility.travelTimeMinutes} min travel`
            : "Travel time available"}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <DataTag
          quality={facility.source === "VERIFIED_DATABASE" ? "CACHED" : "LIVE"}
          at={facility.retrievedAt}
        />
        <div className="flex gap-2">
          {facility.phone && (
            <a
              href={`tel:${facility.phone}`}
              className="inline-flex min-h-8 items-center gap-1 rounded-md border border-border px-2 text-xs font-semibold hover:bg-surface-2"
            >
              <Phone className="h-3 w-3" />
              Call
            </a>
          )}
          <button
            type="button"
            onClick={onSelect}
            className={`inline-flex min-h-8 items-center gap-1.5 rounded-md px-3 text-xs font-bold ${
              isSelected
                ? "bg-primary text-primary-foreground"
                : "border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
            }`}
          >
            <RouteIcon className="h-3 w-3" />
            {isSelected ? "Routing..." : "Route here"}
          </button>
        </div>
      </div>
    </article>
  );
}
