import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Bell, Check, Clock3, MapPinned, ShieldAlert, CloudRain, ExternalLink } from "lucide-react";
import { PageFrame } from "@/components/portal";
import { Button, DataTag, EmptyState, ErrorState, Panel, SeverityBadge } from "@/components/kit";
import { useAuth } from "@/hooks/useAuth";
import { localTime, type AlertLevel, type Severity } from "@/lib/domain";
import { getDemoAlerts, type DemoAlert } from "@/lib/demo-data";
import { getImdAmaravatiAlerts, type ImdWeatherWarning } from "@/lib/weather-service";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type AlertRow = Tables<"alerts">;
type DisplayAlert = AlertRow | DemoAlert;

export const Route = createFileRoute("/alerts")({ component: AlertsRoute });

function AlertsRoute() {
  return <AlertsContent />;
}

function AlertsContent() {
  const { user, isOperator } = useAuth();
  const client = useQueryClient();
  const [filter, setFilter] = useState<"ALL" | AlertLevel>("ALL");

  const alerts = useQuery({
    queryKey: ["alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alerts")
        .select("*")
        .is("cancelled_at", null)
        .order("issued_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AlertRow[];
    },
    refetchInterval: 30_000,
  });

  const acknowledgements = useQuery({
    queryKey: ["alert-ack", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alert_acknowledgements")
        .select("alert_id")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const acked = useMemo(
    () => new Set((acknowledgements.data ?? []).map((item) => item.alert_id)),
    [acknowledgements.data],
  );

  const imdAlerts = useMemo<ImdWeatherWarning[]>(() => getImdAmaravatiAlerts(), []);

  const persistedRows = alerts.data ?? [];
  const rows: DisplayAlert[] = (persistedRows.length > 0 ? persistedRows : getDemoAlerts()).filter(
    (alert) => filter === "ALL" || alert.level === filter,
  );

  function isDemoAlert(alert: DisplayAlert): alert is DemoAlert {
    return "simulated" in alert;
  }

  async function acknowledge(alertId: string) {
    if (!user) return;
    const { error } = await supabase
      .from("alert_acknowledgements")
      .insert({ alert_id: alertId, user_id: user.id });
    if (!error || error.code === "23505")
      await client.invalidateQueries({ queryKey: ["alert-ack", user.id] });
  }

  function severity(level: AlertLevel): Severity {
    return level === "CRITICAL"
      ? "CRITICAL"
      : level === "WARNING"
        ? "HIGH"
        : level === "WATCH"
          ? "MEDIUM"
          : "LOW";
  }

  return (
    <PageFrame
      eyebrow="Public safety / alerts"
      title="Emergency alerts & IMD bulletins"
      description="Approved disaster notices, official IMD Amaravati weather bulletins, and heavy-rainfall alerts for Andhra Pradesh."
      actions={
        <Link to="/map">
          <Button>
            <MapPinned className="h-4 w-4" />
            Open live map
          </Button>
        </Link>
      }
    >
      {/* Official IMD Amaravati Feed Section */}
      <Panel
        title="Official IMD Amaravati Weather Bulletins"
        className="border-primary/30 bg-primary/5"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-3">
          <div>
            <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
              <CloudRain className="h-4 w-4" />
              India Meteorological Department · Met Centre Amaravati
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Official heavy-rainfall and thunderstorm warnings across Andhra Pradesh river basins.
            </p>
          </div>
          <a
            href="https://mausam.imd.gov.in/amaravati/aphrw.php/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
          >
            Visit IMD Amaravati portal <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {imdAlerts.map((warning) => (
            <div
              key={warning.id}
              className="rounded-lg border border-border bg-surface/70 p-3.5 shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-sm text-foreground">
                  {warning.districtName} District
                </span>
                <span
                  className={`rounded px-2 py-0.5 font-mono text-[9px] font-bold uppercase ${
                    warning.warningLevel === "ALERT"
                      ? "border border-destructive/40 bg-destructive/15 text-destructive"
                      : "border border-accent/40 bg-accent/15 text-accent"
                  }`}
                >
                  {warning.warningLevel}
                </span>
              </div>
              <p className="mt-1.5 text-xs font-semibold text-primary">{warning.hazardType}</p>
              <p className="mt-1 text-xs text-muted-foreground leading-5">{warning.description}</p>
              <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2 text-[10px] text-muted-foreground">
                <span>{warning.source}</span>
                <DataTag quality="LIVE" />
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 mt-2">
        {(["ALL", "CRITICAL", "WARNING", "WATCH", "INFO"] as const).map((item) => (
          <button
            key={item}
            onClick={() => setFilter(item)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              filter === item
                ? "border-primary bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:bg-surface-2"
            }`}
          >
            {item === "ALL" ? "All notices" : item}
          </button>
        ))}
      </div>

      {alerts.isError && (
        <ErrorState
          message="The alert feed is unavailable. Reconnect before relying on the information shown."
          onRetry={() => void alerts.refetch()}
        />
      )}

      {alerts.isLoading ? (
        <Panel>
          <p className="text-sm text-muted-foreground">Loading approved notices…</p>
        </Panel>
      ) : rows.length === 0 ? (
        <EmptyState message="No approved notices match this filter." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((alert) => (
            <article
              key={alert.id}
              className={`panel p-5 ${alert.level === "CRITICAL" ? "border-destructive/55 bg-destructive/5" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div
                    className={`rounded-lg p-2 ${
                      alert.level === "CRITICAL"
                        ? "bg-destructive/15 text-destructive"
                        : "bg-primary/10 text-primary"
                    }`}
                  >
                    <Bell className="h-5 w-5" />
                  </div>
                  <SeverityBadge severity={severity(alert.level)} />
                </div>
                <DataTag
                  quality={
                    isDemoAlert(alert)
                      ? "SIMULATED"
                      : alert.delivery_status === "FAILED"
                        ? "UNAVAILABLE"
                        : "RECENT"
                  }
                />
              </div>

              <h2 className="mt-4 text-xl font-bold">{alert.title}</h2>
              {isDemoAlert(alert) && (
                <p className="mt-2 font-mono text-[10px] font-bold tracking-wider text-accent uppercase">
                  Simulated demo notice · not a live emergency alert
                </p>
              )}
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{alert.message}</p>
              {alert.recommended_action && (
                <div className="mt-4 rounded-lg border border-accent/30 bg-accent/10 p-3 text-sm">
                  <p className="font-semibold text-accent">Recommended action</p>
                  <p className="mt-1">{alert.recommended_action}</p>
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>
                  <Clock3 className="mr-1 inline h-3.5 w-3.5" />
                  Issued {localTime(alert.issued_at)}
                </span>
                {alert.area_name && (
                  <span>
                    <MapPinned className="mr-1 inline h-3.5 w-3.5" />
                    {alert.area_name} · {alert.radius_km ?? "—"} km zone
                  </span>
                )}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                  {isDemoAlert(alert)
                    ? "Source: SIMULATED DEMO"
                    : `Notification: ${alert.delivery_status}`}
                </span>
                {isOperator && !isDemoAlert(alert) && (
                  <Button
                    size="sm"
                    variant={acked.has(alert.id) ? "success" : "outline"}
                    onClick={() => void acknowledge(alert.id)}
                    disabled={acked.has(alert.id)}
                  >
                    <Check className="h-4 w-4" />
                    {acked.has(alert.id) ? "Acknowledged" : "Acknowledge"}
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {!user && (
        <Panel className="border-primary/25">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold">
                <ShieldAlert className="h-4 w-4 text-primary" />
                Responder acknowledgement is restricted
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Sign in with an authorised response role to acknowledge critical notices.
              </p>
            </div>
            <Link to="/auth">
              <Button size="sm">Sign in</Button>
            </Link>
          </div>
        </Panel>
      )}
    </PageFrame>
  );
}
