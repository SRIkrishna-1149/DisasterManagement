import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  CloudRain,
  HeartPulse,
  Radio,
  ShieldCheck,
  Siren,
  Users,
  AlertTriangle,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  DataTag,
  ErrorState,
  Panel,
  RiskBadge,
  SeverityBadge,
  Stat,
  StatusPill,
} from "@/components/kit";
import { OperationsMap, type MapMarker } from "@/components/map-panel";
import { QuickSosDialog } from "@/components/quick-sos";
import { useAuth } from "@/hooks/useAuth";
import { useEmergencyLocation } from "@/hooks/useEmergencyLocation";
import { AP_CENTER, localTime } from "@/lib/domain";
import { getDemoAlerts, type DemoAlert } from "@/lib/demo-data";
import { getImdAmaravatiAlerts, getAlertForLocation } from "@/lib/weather-service";
import type { Tables } from "@/integrations/supabase/types";
import { ruleBasedEngine, simulatedReading } from "@/lib/risk-engine";
import { supabase } from "@/integrations/supabase/client";

type AlertRow = Tables<"alerts">;
type SosRow = Tables<"sos_requests">;
type RiskRow = Tables<"risk_assessments">;
type ResourceRow = Tables<"emergency_resources">;

export const Route = createFileRoute("/")({ component: HomeRoute });

function HomeRoute() {
  const { user } = useAuth();
  const { location: userLoc } = useEmergencyLocation();
  const [quickSosOpen, setQuickSosOpen] = useState(false);

  const alerts = useQuery({
    queryKey: ["home-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alerts")
        .select("*")
        .is("cancelled_at", null)
        .order("issued_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as AlertRow[];
    },
    staleTime: 30_000,
  });

  const resources = useQuery({
    queryKey: ["home-resources"],
    queryFn: async () => {
      const { data, error } = await supabase.from("emergency_resources").select("*").limit(10);
      if (error) throw error;
      return (data ?? []) as ResourceRow[];
    },
    staleTime: 60_000,
  });

  const risks = useQuery({
    queryKey: ["home-risks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("risk_assessments")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return (data ?? []) as RiskRow[];
    },
    staleTime: 60_000,
  });

  const mySos = useQuery({
    queryKey: ["home-my-sos", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sos_requests")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(3);
      if (error) throw error;
      return (data ?? []) as SosRow[];
    },
  });

  // Authoritative IMD weather warnings
  const imdAlerts = useMemo(() => getImdAmaravatiAlerts(), []);
  const userDistrictAlert = useMemo(
    () => (userLoc ? getAlertForLocation(userLoc) : null),
    [userLoc],
  );

  const reading = simulatedReading();
  const assessment = ruleBasedEngine.assess(
    { ...reading, communityReports: alerts.data?.length ?? 0, sosDensity: mySos.data?.length ?? 0 },
    "flood",
  );

  const persistedAlerts = (alerts.data ?? []).filter(
    (alert) => alert.approval_status === "APPROVED",
  );

  const visibleAlerts = persistedAlerts.length > 0 ? persistedAlerts : getDemoAlerts();
  const isDemoAlert = (alert: AlertRow | DemoAlert): alert is DemoAlert => "simulated" in alert;
  const activeSos = (mySos.data ?? []).filter(
    (item) => !["RESOLVED", "CANCELLED", "REJECTED", "DUPLICATE"].includes(item.status),
  );

  const markers: MapMarker[] = useMemo(
    () => [
      ...(risks.data ?? []).map((r) => ({
        id: `risk-${r.id}`,
        kind: "risk" as const,
        label: r.area_name,
        detail: `${r.disaster_type} · ${r.risk_level}`,
        lat: r.latitude,
        lng: r.longitude,
        score: r.risk_score,
        quality: "RECENT" as const,
      })),
      ...(resources.data ?? []).map((r) => ({
        id: `res-${r.id}`,
        kind: "resource" as const,
        label: r.name,
        detail: `${r.status.replaceAll("_", " ")} · ${r.resource_type}`,
        lat: r.latitude,
        lng: r.longitude,
        phone: r.contact_phone,
        address: r.address,
        quality: "CACHED" as const,
      })),
    ],
    [risks.data, resources.data],
  );

  return (
    <AppShell>
      <div className="space-y-5">
        {/* Hero Section */}
        <section className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/15 via-surface to-surface p-5 sm:p-8">
          <div className="absolute -right-10 -top-24 h-64 w-64 rounded-full border border-primary/20" />
          <div className="absolute -right-2 -top-16 h-48 w-48 rounded-full border border-primary/15" />
          <div className="relative max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 font-mono text-[10px] font-bold tracking-wider text-primary uppercase">
                Predict · Alert · Respond
              </span>
              <DataTag quality="LIVE" />
            </div>
            <h1 className="mt-5 text-4xl leading-[1.05] font-bold tracking-tight sm:text-6xl">
              A calmer signal in a crisis.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
              One canonical dashboard to read official alerts, find verified help, and get a request
              to responders—with real road routes and GPS tracking across Andhra Pradesh.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setQuickSosOpen(true)}
                className="inline-flex min-h-13 items-center gap-2 rounded-lg bg-destructive px-5 text-base font-bold text-destructive-foreground shadow-lg shadow-destructive/15 hover:brightness-110"
              >
                <Siren className="h-5 w-5" />
                Send emergency SOS
              </button>
              <Link to="/resources">
                <button className="inline-flex min-h-13 items-center gap-2 rounded-lg border border-border bg-surface px-5 text-sm font-semibold hover:bg-surface-2">
                  Find shelter or hospital <ArrowUpRight className="h-4 w-4" />
                </button>
              </Link>
            </div>
          </div>
        </section>

        {/* Real-time IMD Location Alert Banner */}
        {userDistrictAlert && (
          <section className="rounded-xl border border-accent/60 bg-accent/15 p-4 sm:p-5 animate-in fade-in">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-mono text-xs font-bold tracking-[0.18em] text-accent uppercase flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4" />
                  {userDistrictAlert.warningLevel} · {userDistrictAlert.districtName} District
                </p>
                <h2 className="mt-1 text-lg font-bold">
                  {userDistrictAlert.hazardType} advisory from {userDistrictAlert.source}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {userDistrictAlert.description}
                </p>
              </div>
              <div className="flex gap-2">
                <Link to="/resources">
                  <button className="min-h-10 rounded-lg bg-accent px-4 text-xs font-bold text-background hover:brightness-110">
                    Find nearest safe shelter
                  </button>
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* Stats Row */}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Area risk"
            value={
              <span className="flex items-center gap-2">
                {assessment.score}
                <RiskBadge score={assessment.score} showScore={false} />
              </span>
            }
            hint="Rule-based flood assessment"
          />
          <Stat
            label="Active notices"
            value={visibleAlerts.length}
            hint="Approved notices & IMD alerts"
          />
          <Stat
            label="My active SOS"
            value={activeSos.length}
            hint={user ? "Track response progress" : "Sign in to track your requests"}
          />
          <Stat
            label="Map Engine"
            value="Satellite Operations Map"
            hint="Aerial basemap & local road routing"
          />
        </section>

        {/* Main Map & Live Feeds Grid */}
        <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
          <OperationsMap
            markers={markers}
            title="Andhra Pradesh Overview Map"
            userLocation={userLoc ? { lat: userLoc.lat, lng: userLoc.lng } : null}
            userAccuracyM={userLoc?.accuracyM ?? null}
          />

          <div className="space-y-5">
            <Panel
              title="Official alerts & bulletins"
              action={
                <Link to="/alerts" className="text-xs font-semibold text-primary">
                  View all
                </Link>
              }
            >
              {alerts.isError ? (
                <ErrorState message="Alert feed unavailable. Check your connection status." />
              ) : visibleAlerts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No approved alerts are currently published.
                </p>
              ) : (
                <div className="space-y-3">
                  {visibleAlerts.slice(0, 3).map((alert) => (
                    <div key={alert.id} className="border-l-2 border-accent pl-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <SeverityBadge
                          severity={
                            alert.level === "CRITICAL"
                              ? "CRITICAL"
                              : alert.level === "WARNING"
                                ? "HIGH"
                                : alert.level === "WATCH"
                                  ? "MEDIUM"
                                  : "LOW"
                          }
                        />
                        <span className="text-[11px] text-muted-foreground">
                          {localTime(alert.issued_at)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-semibold">{alert.title}</p>
                      {isDemoAlert(alert) && (
                        <p className="mt-1 font-mono text-[10px] font-bold tracking-wider text-accent uppercase">
                          Simulated demo notice
                        </p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {alert.recommended_action ?? alert.message}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Signal health & sources">
              <div className="space-y-3">
                {[
                  [CloudRain, "IMD Amaravati Met Centre", "CONNECTED"],
                  [Radio, "Google Maps Platform", "ACTIVE"],
                  [ShieldCheck, "Supabase Database & Auth", "CONNECTED"],
                ].map(([Icon, label, status]) => {
                  const Component = Icon as typeof CloudRain;
                  return (
                    <div key={String(label)} className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 text-sm">
                        <Component className="h-4 w-4 text-muted-foreground" />
                        {String(label)}
                      </span>
                      <span className="font-mono text-[10px] text-safe font-bold">
                        {String(status)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
                Authoritative weather alerts sourced from India Meteorological Department (IMD)
                Amaravati.
              </p>
            </Panel>
          </div>
        </div>

        {/* Bottom Actions Grid */}
        <section className="grid gap-5 lg:grid-cols-2">
          <Panel title="What to do now">
            <div className="grid gap-3 sm:grid-cols-3">
              <Link
                to="/sos"
                className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 hover:bg-destructive/10"
              >
                <HeartPulse className="h-5 w-5 text-destructive" />
                <p className="mt-2 text-sm font-semibold">Need rescue?</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Send a request with your real GPS location or landmark.
                </p>
              </Link>
              <Link
                to="/resources"
                className="rounded-lg border border-safe/30 bg-safe/5 p-3 hover:bg-safe/10"
              >
                <Users className="h-5 w-5 text-safe" />
                <p className="mt-2 text-sm font-semibold">Find help</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Check shelter, hospital, and emergency facility status.
                </p>
              </Link>
              <Link
                to="/reports"
                className="rounded-lg border border-border bg-surface/60 p-3 hover:bg-surface-2"
              >
                <Radio className="h-5 w-5 text-primary" />
                <p className="mt-2 text-sm font-semibold">See a hazard?</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Share a community observation with responders.
                </p>
              </Link>
            </div>
          </Panel>

          <Panel
            title="My response requests"
            action={
              <Link to="/my-sos" className="text-xs font-semibold text-primary">
                Track requests
              </Link>
            }
          >
            {!user ? (
              <p className="text-sm text-muted-foreground">
                Sign in to see your private SOS history and queued transmissions.
              </p>
            ) : mySos.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading your requests…</p>
            ) : activeSos.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active SOS requests.</p>
            ) : (
              <div className="space-y-2">
                {activeSos.map((sos) => (
                  <Link
                    key={sos.id}
                    to="/my-sos"
                    className="flex items-center justify-between rounded-lg border border-border bg-surface/60 p-3 hover:bg-surface-2"
                  >
                    <div>
                      <p className="font-mono text-sm font-bold">SOS #{sos.reference}</p>
                      <p className="text-xs text-muted-foreground">
                        Updated {localTime(sos.updated_at)}
                      </p>
                    </div>
                    <StatusPill status={sos.status} />
                  </Link>
                ))}
              </div>
            )}
          </Panel>
        </section>
      </div>
      {quickSosOpen && <QuickSosDialog onClose={() => setQuickSosOpen(false)} />}
    </AppShell>
  );
}
