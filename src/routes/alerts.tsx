import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Bell, Check, Clock3, MapPinned, ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AuthGate, PageFrame } from "@/components/portal";
import { Button, DataTag, EmptyState, ErrorState, Panel, SeverityBadge } from "@/components/kit";
import { useAuth } from "@/hooks/useAuth";
import { localTime, type AlertLevel, type Severity } from "@/lib/domain";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type AlertRow = Tables<"alerts">;

export const Route = createFileRoute("/alerts")({ component: AlertsRoute });

function AlertsRoute() {
  return (
    <AppShell>
      <AlertsContent />
    </AppShell>
  );
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
  const rows = (alerts.data ?? []).filter((alert) => filter === "ALL" || alert.level === filter);

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
      title="Emergency alerts"
      description="Approved notices for the response area. Delivery state is shown as recorded; creation never means a notification was delivered."
      actions={
        <Link to="/map">
          <Button>
            <MapPinned className="h-4 w-4" />
            Open live map
          </Button>
        </Link>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {(["ALL", "CRITICAL", "WARNING", "WATCH", "INFO"] as const).map((item) => (
          <button
            key={item}
            onClick={() => setFilter(item)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${filter === item ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:bg-surface-2"}`}
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
                    className={`rounded-lg p-2 ${alert.level === "CRITICAL" ? "bg-destructive/15 text-destructive" : "bg-primary/10 text-primary"}`}
                  >
                    <Bell className="h-5 w-5" />
                  </div>
                  <SeverityBadge severity={severity(alert.level)} />
                </div>
                <DataTag
                  quality={
                    alert.delivery_status === "DELIVERED"
                      ? "LIVE"
                      : alert.delivery_status === "FAILED"
                        ? "UNAVAILABLE"
                        : "RECENT"
                  }
                />
              </div>
              <h2 className="mt-4 text-xl font-bold">{alert.title}</h2>
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
                  Notification: {alert.delivery_status}
                </span>
                {isOperator && (
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
