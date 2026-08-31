import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Filter, MapPinned, Radio, ShieldAlert, Navigation } from "lucide-react";
import { OperationsMap, type MapMarker } from "@/components/map-panel";
import {
  Button,
  DataTag,
  Panel,
  RiskBadge,
  SeverityBadge,
  Stat,
  StatusPill,
} from "@/components/kit";
import { PageFrame } from "@/components/portal";
import { useAuth } from "@/hooks/useAuth";
import { useEmergencyLocation } from "@/hooks/useEmergencyLocation";
import { clusterIncidents } from "@/lib/geo";
import { localTime, type AlertLevel, type DataQuality } from "@/lib/domain";
import { getImdAmaravatiAlerts } from "@/lib/weather-service";
import { calculateStaticRoadRoutes, type CalculatedRoute } from "@/lib/static-router";
import { evaluateRouteHazards } from "@/lib/hazard-routing";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type RiskRow = Tables<"risk_assessments">;
type ResourceRow = Tables<"emergency_resources">;
type AlertRow = Tables<"alerts">;
type SosRow = Tables<"sos_requests">;
type TeamRow = Tables<"rescue_teams">;
type ReportRow = Tables<"community_reports">;

export const Route = createFileRoute("/map")({ component: MapRoute });

function MapRoute() {
  const { user, isOperator } = useAuth();
  const { location: userLoc, getCurrentLocation } = useEmergencyLocation();
  const [activeRoute, setActiveRoute] = useState<CalculatedRoute | null>(null);
  const [routingTarget, setRoutingTarget] = useState<MapMarker | null>(null);

  const resources = useQuery({
    queryKey: ["map-resources"],
    queryFn: async () => {
      const { data, error } = await supabase.from("emergency_resources").select("*");
      if (error) throw error;
      return (data ?? []) as ResourceRow[];
    },
    staleTime: 60_000,
  });

  const risks = useQuery({
    queryKey: ["map-risks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("risk_assessments")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as RiskRow[];
    },
    staleTime: 60_000,
  });

  const alerts = useQuery({
    queryKey: ["map-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alerts")
        .select("*")
        .is("cancelled_at", null)
        .order("issued_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as AlertRow[];
    },
    staleTime: 30_000,
  });

  const sos = useQuery({
    queryKey: ["map-sos", isOperator],
    enabled: isOperator,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sos_requests")
        .select("*")
        .not("latitude", "is", null)
        .not("longitude", "is", null)
        .in("status", [
          "UNVERIFIED",
          "NEEDS_MORE_INFORMATION",
          "VALIDATED",
          "ASSIGNED",
          "DISPATCHED",
          "EN_ROUTE",
          "ARRIVED",
          "RESCUE_IN_PROGRESS",
        ]);
      if (error) throw error;
      return (data ?? []) as SosRow[];
    },
  });

  const teams = useQuery({
    queryKey: ["map-teams", isOperator],
    enabled: isOperator,
    queryFn: async () => {
      const { data, error } = await supabase.from("rescue_teams").select("*");
      if (error) throw error;
      return (data ?? []) as TeamRow[];
    },
  });

  const reports = useQuery({
    queryKey: ["map-reports", user?.id, isOperator],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as ReportRow[];
    },
    staleTime: 60_000,
  });

  // Authoritative IMD weather warnings
  const imdAlerts = useMemo(() => getImdAmaravatiAlerts(), []);

  const markers = useMemo<MapMarker[]>(
    () => [
      ...(risks.data ?? [])
        .filter((row) => row.risk_score >= 60)
        .map((row) => ({
          id: `risk-${row.id}`,
          kind: "risk" as const,
          label: row.area_name,
          detail: `${row.disaster_type} · ${row.risk_level}`,
          lat: row.latitude,
          lng: row.longitude,
          score: row.risk_score,
          quality: row.data_quality as DataQuality,
        })),
      ...(resources.data ?? []).map((row) => ({
        id: `resource-${row.id}`,
        kind: "resource" as const,
        label: row.name,
        detail: `${row.status.replaceAll("_", " ")} · ${row.resource_type}`,
        lat: row.latitude,
        lng: row.longitude,
        phone: row.contact_phone,
        address: row.address,
        quality: "CACHED" as const,
      })),
      ...(alerts.data ?? [])
        .filter((row) => row.latitude !== null && row.longitude !== null)
        .map((row) => ({
          id: `alert-${row.id}`,
          kind: "alert" as const,
          label: row.title,
          detail: `${row.level} · ${row.area_name ?? "targeted zone"}`,
          lat: row.latitude!,
          lng: row.longitude!,
          quality: "RECENT" as const,
        })),
      ...(sos.data ?? [])
        .filter((row) => row.latitude !== null && row.longitude !== null)
        .map((row) => ({
          id: `sos-${row.id}`,
          kind: "sos" as const,
          label: `SOS #${row.reference}`,
          detail: `${row.status} · ${row.category}`,
          lat: row.latitude!,
          lng: row.longitude!,
          quality: "LIVE" as const,
        })),
      ...(teams.data ?? [])
        .filter((row) => row.latitude !== null && row.longitude !== null)
        .map((row) => ({
          id: `team-${row.id}`,
          kind: "team" as const,
          label: row.name,
          detail: `${row.status} · last update ${localTime(row.location_updated_at)}`,
          lat: row.latitude!,
          lng: row.longitude!,
          quality:
            row.location_updated_at &&
            Date.now() - new Date(row.location_updated_at).getTime() < 5 * 60_000
              ? ("LIVE" as const)
              : ("STALE" as const),
        })),
      ...(reports.data ?? [])
        .filter(
          (row) =>
            row.verification_status === "VERIFIED" &&
            row.latitude !== null &&
            row.longitude !== null,
        )
        .map((row) => ({
          id: `report-${row.id}`,
          kind: "report" as const,
          label: row.report_type,
          detail: `${row.severity} · verified community observation`,
          lat: row.latitude!,
          lng: row.longitude!,
          quality: "RECENT" as const,
        })),
    ],
    [alerts.data, reports.data, resources.data, risks.data, sos.data, teams.data],
  );

  const incidentPoints = useMemo(
    () =>
      (sos.data ?? [])
        .filter((row) => row.latitude !== null && row.longitude !== null)
        .map((row) => ({ ...row, lat: row.latitude!, lng: row.longitude! })),
    [sos.data],
  );

  const incidentGroups = useMemo(() => clusterIncidents(incidentPoints, 0.5, 90), [incidentPoints]);
  const highRisks = (risks.data ?? []).filter((row) => row.risk_score >= 60);
  const activeAlerts = (alerts.data ?? []).filter((row) => row.approval_status === "APPROVED");

  const mapRouteReqIdRef = useRef(0);

  const handleRouteToMarker = async (marker: MapMarker) => {
    const reqId = ++mapRouteReqIdRef.current;
    setRoutingTarget(marker);

    let origin = userLoc ? { lat: userLoc.lat, lng: userLoc.lng } : null;
    if (!origin) {
      try {
        const fresh = await getCurrentLocation(10000);
        if (mapRouteReqIdRef.current !== reqId) return;
        origin = { lat: fresh.lat, lng: fresh.lng };
      } catch (e) {
        if (mapRouteReqIdRef.current !== reqId) return;
        console.warn("Could not acquire GPS for map routing:", e);
        return;
      }
    }

    try {
      const calculated = await calculateStaticRoadRoutes(
        origin,
        { lat: marker.lat, lng: marker.lng },
        "DRIVING",
      );
      if (mapRouteReqIdRef.current !== reqId) return;

      if (calculated.length > 0) {
        const evaluated = evaluateRouteHazards(calculated, [
          ...highRisks.map((r) => ({
            id: r.id,
            title: r.area_name,
            lat: r.latitude,
            lng: r.longitude,
            radiusKm: 2,
            severity: "HIGH" as const,
            disasterType: r.disaster_type,
            source: "Risk assessment",
          })),
        ]);
        if (mapRouteReqIdRef.current === reqId) {
          setActiveRoute(evaluated[0] ?? null);
        }
      }
    } catch (err) {
      if (mapRouteReqIdRef.current === reqId) {
        console.warn("Failed to calculate route on map:", err);
      }
    }
  };

  return (
    <PageFrame
      eyebrow="Situational awareness / map"
      title="Live response map"
      description="A canonical Google Maps viewport of public resources, risk assessments, approved alert zones, and—when authorised—mission locations. Real road routes and live device GPS."
      actions={
        <div className="flex flex-wrap gap-2">
          {activeRoute && (
            <Button size="sm" variant="outline" onClick={() => setActiveRoute(null)}>
              Clear active route
            </Button>
          )}
          <Link to="/resources">
            <Button>
              <MapPinned className="h-4 w-4" />
              Find resources
            </Button>
          </Link>
        </div>
      }
    >
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Risk zones" value={highRisks.length} hint="Score 60 or higher" />
        <Stat label="Public alerts" value={activeAlerts.length} hint="Approved and active" />
        <Stat
          label="Help locations"
          value={(resources.data ?? []).length}
          hint="Verify before travel"
        />
        <Stat
          label={isOperator ? "SOS clusters" : "IMD Warnings"}
          value={isOperator ? incidentGroups.length : imdAlerts.length}
          hint={isOperator ? "90-minute / 500 m grouping" : "IMD Amaravati active notices"}
        />
      </section>

      <OperationsMap
        markers={markers}
        className="mt-5"
        title="Response area · Canonical Operations Map"
        userLocation={userLoc ? { lat: userLoc.lat, lng: userLoc.lng } : null}
        userAccuracyM={userLoc?.accuracyM ?? null}
        calculatedRoute={activeRoute}
        onRouteToMarker={handleRouteToMarker}
      />

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Panel title="Map layers & sources">
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <i className="h-3 w-3 rounded-full bg-high" />
                Risk assessment
              </span>
              <DataTag quality="RECENT" />
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <i className="h-3 w-3 rounded-full bg-safe" />
                Shelter / hospital
              </span>
              <DataTag quality="CACHED" />
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <i className="h-3 w-3 rounded-full bg-accent" />
                Alert zone (IMD / Govt)
              </span>
              <DataTag quality="LIVE" />
            </div>
            {isOperator && (
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <i className="h-3 w-3 rounded-full bg-destructive" />
                  SOS incident
                </span>
                <DataTag quality="LIVE" />
              </div>
            )}
          </div>
          <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
            Routes represent actual road networks via Google Directions. Follow current official
            guidance.
          </p>
        </Panel>

        <Panel title="Risk overview">
          {highRisks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No persisted high-risk assessments are available.
            </p>
          ) : (
            <div className="space-y-3">
              {highRisks.slice(0, 5).map((risk) => (
                <div key={risk.id} className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{risk.area_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {risk.disaster_type} · {localTime(risk.created_at)}
                    </p>
                  </div>
                  <RiskBadge score={risk.risk_score} />
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Current warnings">
          {activeAlerts.length === 0 && imdAlerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active approved warnings in the feed.
            </p>
          ) : (
            <div className="space-y-3">
              {activeAlerts.slice(0, 3).map((alert) => (
                <div key={alert.id} className="flex gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <div>
                    <p className="text-sm font-semibold">{alert.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {alert.level as AlertLevel} · {localTime(alert.issued_at)}
                    </p>
                  </div>
                </div>
              ))}
              {imdAlerts.slice(0, 2).map((alert) => (
                <div key={alert.id} className="flex gap-2 border-t border-border/40 pt-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-semibold">
                      {alert.hazardType} · {alert.districtName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {alert.source} · {alert.warningLevel}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {!isOperator && (
        <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldAlert className="h-4 w-4 text-primary" />
          Private SOS coordinates and team positions are available only to authorised response
          operators.
        </p>
      )}
      {isOperator && (
        <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Filter className="h-4 w-4" />
          {incidentGroups.length} clustered SOS groups · {sos.data?.length ?? 0} active request
          locations · <Radio className="h-4 w-4 text-safe" />
          Realtime refreshes on the operations workspace.
        </p>
      )}
    </PageFrame>
  );
}
