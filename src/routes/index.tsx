import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CloudRain,
  HeartPulse,
  Radio,
  ShieldCheck,
  Siren,
  Users,
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
import { useAuth } from "@/hooks/useAuth";
import { FEATURE_FLAGS, localTime } from "@/lib/domain";
import type { Tables } from "@/integrations/supabase/types";
import { ruleBasedEngine, simulatedReading } from "@/lib/risk-engine";
import { supabase } from "@/integrations/supabase/client";

type AlertRow = Tables<"alerts">;
type SosRow = Tables<"sos_requests">;
type RiskRow = Tables<"risk_assessments">;

export const Route = createFileRoute("/")({ component: HomeRoute });

function HomeRoute() {
  const { user } = useAuth();
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

  const reading = simulatedReading();
  const assessment = ruleBasedEngine.assess(
    { ...reading, communityReports: alerts.data?.length ?? 0, sosDensity: mySos.data?.length ?? 0 },
    "flood",
  );
  const visibleAlerts = alerts.data ?? [];
  const activeSos = (mySos.data ?? []).filter(
    (item) => !["RESOLVED", "CANCELLED", "REJECTED", "DUPLICATE"].includes(item.status),
  );
  const markers: MapMarker[] = [
    {
      id: "risk-center",
      kind: "risk",
      label: "Central response zone",
      detail: "Rule-based area assessment",
      lat: 12.9716,
      lng: 77.5946,
      score: assessment.score,
      quality: "SIMULATED",
    },
    {
      id: "shelter",
      kind: "resource",
      label: "Central Community Shelter",
      detail: "ACTIVE · 280 spaces estimated",
      lat: 12.9716,
      lng: 77.5946,
      quality: "CACHED",
    },
    {
      id: "hospital",
      kind: "resource",
      label: "City General Hospital",
      detail: "ACTIVE · verify capacity before travel",
      lat: 12.965,
      lng: 77.59,
      quality: "CACHED",
    },
  ];

  return (
    <AppShell>
      <div className="space-y-5">
        <section className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/15 via-surface to-surface p-5 sm:p-8">
          <div className="absolute -right-10 -top-24 h-64 w-64 rounded-full border border-primary/20" />
          <div className="absolute -right-2 -top-16 h-48 w-48 rounded-full border border-primary/15" />
          <div className="relative max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 font-mono text-[10px] font-bold tracking-wider text-primary uppercase">
                Predict · Alert · Respond
              </span>
              <DataTag quality="SIMULATED" />
            </div>
            <h1 className="mt-5 text-4xl leading-[1.05] font-bold tracking-tight sm:text-6xl">
              A calmer signal in a crisis.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
              One place to read the current risk, find verified help, and get a request to
              responders—even when connectivity is unreliable.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/sos">
                <button className="inline-flex min-h-13 items-center gap-2 rounded-lg bg-destructive px-5 text-base font-bold text-destructive-foreground shadow-lg shadow-destructive/15 hover:brightness-110">
                  <Siren className="h-5 w-5" />
                  Send emergency SOS
                </button>
              </Link>
              <Link to="/resources">
                <button className="inline-flex min-h-13 items-center gap-2 rounded-lg border border-border bg-surface px-5 text-sm font-semibold hover:bg-surface-2">
                  Find shelter or hospital <ArrowUpRight className="h-4 w-4" />
                </button>
              </Link>
            </div>
          </div>
        </section>

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
            label="Active alerts"
            value={visibleAlerts.length}
            hint="Approved notices in the area"
          />
          <Stat
            label="My active SOS"
            value={activeSos.length}
            hint={user ? "Track response progress" : "Sign in to track your requests"}
          />
          <Stat label="Data status" value="SIMULATED" hint="Demo feed · never live" />
        </section>

        {assessment.score > 60 && (
          <section className="pulse-critical rounded-xl border border-destructive/50 bg-destructive/10 p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-mono text-xs font-bold tracking-[0.18em] text-destructive uppercase">
                  ⚠ {assessment.level} flood risk
                </p>
                <h2 className="mt-1 text-xl font-bold">
                  Move to higher ground if water is rising.
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This is a simulated assessment from transparent rules. Treat it as guidance, not
                  certainty.
                </p>
              </div>
              <Link to="/resources">
                <button className="min-h-11 rounded-lg bg-destructive px-4 text-sm font-bold text-destructive-foreground">
                  View nearby help
                </button>
              </Link>
            </div>
          </section>
        )}

        <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
          <OperationsMap markers={markers} title="Area overview" />
          <div className="space-y-5">
            <Panel
              title="Latest alerts"
              action={
                <Link to="/alerts" className="text-xs font-semibold text-primary">
                  View all
                </Link>
              }
            >
              {alerts.isError ? (
                <ErrorState message="Alert feed unavailable. Check the connection status before relying on this view." />
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
                      <p className="mt-1 text-xs text-muted-foreground">
                        {alert.recommended_action ?? alert.message}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
            <Panel title="Signal health">
              <div className="space-y-3">
                {[
                  [CloudRain, "Weather API", "SIMULATED"],
                  [Radio, "Ground sensors", "UNAVAILABLE"],
                  [ShieldCheck, "Risk engine", "CONNECTED"],
                ].map(([Icon, label, status]) => {
                  const Component = Icon as typeof CloudRain;
                  return (
                    <div key={String(label)} className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 text-sm">
                        <Component className="h-4 w-4 text-muted-foreground" />
                        {String(label)}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {String(status)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
                {FEATURE_FLAGS.ENABLE_DEMO_MODE
                  ? "DEMO MODE · environmental data is simulated"
                  : "Only connected sources are shown"}
              </p>
            </Panel>
          </div>
        </div>

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
                  Send a request with your location or landmark.
                </p>
              </Link>
              <Link
                to="/resources"
                className="rounded-lg border border-safe/30 bg-safe/5 p-3 hover:bg-safe/10"
              >
                <Users className="h-5 w-5 text-safe" />
                <p className="mt-2 text-sm font-semibold">Find help</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Check shelter, hospital, and availability status.
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
    </AppShell>
  );
}
