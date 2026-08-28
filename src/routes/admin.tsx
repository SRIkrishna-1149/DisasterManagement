import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import {
  Activity,
  Check,
  Database,
  FileClock,
  Megaphone,
  Radio,
  Server,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { AuthGate, PageFrame } from "@/components/portal";
import {
  Button,
  DataTag,
  EmptyState,
  ErrorState,
  Field,
  inputClass,
  Panel,
  SeverityBadge,
  Stat,
} from "@/components/kit";
import { useAuth } from "@/hooks/useAuth";
import { logAudit } from "@/lib/sos-service";
import { localTime, type AlertLevel } from "@/lib/domain";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type SourceRow = Tables<"data_sources">;
type AlertRow = Tables<"alerts">;
type AuditRow = Tables<"audit_logs">;
type TeamRow = Tables<"rescue_teams">;
type RiskRow = Tables<"risk_assessments">;

export const Route = createFileRoute("/admin")({ component: AdminRoute });

function AdminRoute() {
  return (
    <AuthGate role="admin">
      <AdminContent />
    </AuthGate>
  );
}

function AdminContent() {
  const { user } = useAuth();
  const client = useQueryClient();
  const sources = useQuery({
    queryKey: ["admin-sources"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("data_sources")
        .select("*")
        .order("category")
        .order("name");
      if (error) throw error;
      return (data ?? []) as SourceRow[];
    },
    refetchInterval: 30_000,
  });
  const alerts = useQuery({
    queryKey: ["admin-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alerts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AlertRow[];
    },
  });
  const audits = useQuery({
    queryKey: ["admin-audit"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });
  const teams = useQuery({
    queryKey: ["admin-teams"],
    queryFn: async () => {
      const { data, error } = await supabase.from("rescue_teams").select("*");
      if (error) throw error;
      return (data ?? []) as TeamRow[];
    },
  });
  const risks = useQuery({
    queryKey: ["admin-risk"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("risk_assessments")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as RiskRow[];
    },
  });
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [level, setLevel] = useState<AlertLevel>("WATCH");
  const [action, setAction] = useState("");
  const [area, setArea] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = (alerts.data ?? []).filter(
    (alert) => alert.approval_status !== "APPROVED" && !alert.cancelled_at,
  );

  async function approve(alert: AlertRow, status: "APPROVED" | "REJECTED") {
    if (!user) return;
    setBusy(true);
    const { error: updateError } = await supabase
      .from("alerts")
      .update({
        approval_status: status,
        approved_by: status === "APPROVED" ? user.id : null,
        approved_at: status === "APPROVED" ? new Date().toISOString() : null,
      })
      .eq("id", alert.id)
      .eq("approval_status", alert.approval_status);
    if (updateError) setNotice(updateError.message);
    else {
      await logAudit({
        actorId: user.id,
        action: `ALERT_${status}`,
        entityType: "alert",
        entityId: alert.id,
        previousState: { approval_status: alert.approval_status },
        newState: { approval_status: status },
      });
      setNotice(`Alert ${status.toLowerCase()}.`);
      await client.invalidateQueries({ queryKey: ["admin-alerts"] });
      await client.invalidateQueries({ queryKey: ["admin-audit"] });
    }
    setBusy(false);
  }
  async function toggleSource(source: SourceRow) {
    setBusy(true);
    const next = !source.enabled;
    const { error: updateError } = await supabase
      .from("data_sources")
      .update({ enabled: next })
      .eq("id", source.id);
    if (updateError) setNotice(updateError.message);
    else {
      setNotice(`${source.name} ${next ? "enabled" : "disabled"}.`);
      await client.invalidateQueries({ queryKey: ["admin-sources"] });
    }
    setBusy(false);
  }
  async function createAlert(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !title.trim() || !message.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const requiresApproval = level === "CRITICAL";
    const { data, error: createError } = await supabase
      .from("alerts")
      .insert({
        title: title.trim(),
        message: message.trim(),
        level,
        recommended_action: action.trim() || null,
        area_name: area.trim() || null,
        approval_required: requiresApproval,
        approval_status: requiresApproval ? "PENDING" : "APPROVED",
        delivery_status: "CREATED",
        created_by: user.id,
      })
      .select("id")
      .single();
    if (createError) setError(createError.message);
    else {
      await logAudit({
        actorId: user.id,
        action: "CREATE_ALERT",
        entityType: "alert",
        entityId: data.id,
        newState: { level, approval_status: requiresApproval ? "PENDING" : "APPROVED" },
        reason: requiresApproval
          ? "Critical alert requires manual approval"
          : "Approved by admin policy",
      });
      setNotice(
        requiresApproval
          ? "Critical alert created pending approval. It is not publicly visible yet."
          : "Alert created as approved; delivery is still only CREATED until a notification provider acknowledges it.",
      );
      setTitle("");
      setMessage("");
      setAction("");
      setArea("");
      await client.invalidateQueries({ queryKey: ["admin-alerts"] });
      await client.invalidateQueries({ queryKey: ["admin-audit"] });
    }
    setBusy(false);
  }

  return (
    <PageFrame
      eyebrow="Admin / command center"
      title="System command center"
      description="Monitor source health, risk calculations, response capacity, alert approval, and immutable audit history. Administrative UI never replaces backend authorization."
      actions={
        <span className="flex items-center gap-2 rounded-full border border-safe/30 bg-safe/10 px-3 py-2 text-xs text-safe">
          <ShieldCheck className="h-4 w-4" />
          Admin controls active
        </span>
      }
    >
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Data sources"
          value={sources.data?.length ?? 0}
          hint={`${(sources.data ?? []).filter((source) => source.status === "CONNECTED").length} connected`}
        />
        <Stat label="Pending approvals" value={pending.length} hint="Extreme actions stay gated" />
        <Stat
          label="Teams deployed"
          value={(teams.data ?? []).filter((team) => team.status === "DEPLOYED").length}
          hint={`${(teams.data ?? []).filter((team) => team.status === "AVAILABLE").length} available`}
        />
        <Stat
          label="Risk assessments"
          value={risks.data?.length ?? 0}
          hint="Recent persisted assessments"
        />
      </section>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel title="Data-source diagnostics">
          <div className="space-y-2">
            {sources.isError && (
              <ErrorState
                message="Source diagnostics unavailable."
                onRetry={() => void sources.refetch()}
              />
            )}
            {(sources.data ?? []).map((source) => (
              <div
                key={source.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface/50 p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="rounded-md bg-primary/10 p-2 text-primary">
                    <Activity className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{source.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {source.category} · {source.mode} · retry {source.retry_count}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <DataTag
                    quality={
                      source.mode === "SIMULATED"
                        ? "SIMULATED"
                        : source.status === "CONNECTED"
                          ? "LIVE"
                          : "UNAVAILABLE"
                    }
                    at={source.last_successful_update}
                  />
                  <button
                    disabled={busy}
                    onClick={() => void toggleSource(source)}
                    className={`rounded border px-2 py-1 text-[10px] font-bold uppercase ${source.enabled ? "border-safe/40 text-safe" : "border-border text-muted-foreground"}`}
                  >
                    {source.enabled ? "Enabled" : "Disabled"}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            API credentials and private configuration are not shown here. Failover remains
            explicitly labelled as simulated, stale, or unavailable.
          </p>
        </Panel>
        <Panel title="Service health">
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              [Database, "Database", "HEALTHY"],
              [Radio, "Realtime", "HEALTHY"],
              [Server, "Risk engine", "HEALTHY"],
              [Megaphone, "Notifications", "DEGRADED"],
            ].map(([Icon, name, health]) => {
              const Component = Icon as typeof Database;
              return (
                <div
                  key={String(name)}
                  className="rounded-lg border border-border bg-surface/50 p-3"
                >
                  <Component className="h-4 w-4 text-primary" />
                  <p className="mt-2 text-sm font-semibold">{String(name)}</p>
                  <p
                    className={`mt-1 font-mono text-[10px] ${health === "DEGRADED" ? "text-accent" : "text-safe"}`}
                  >
                    {String(health)}
                  </p>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Health status describes the configured service path, not a guarantee that an external
            provider is delivering notifications.
          </p>
        </Panel>
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel title="Create emergency alert">
          <form onSubmit={(event) => void createAlert(event)} className="space-y-3">
            <Field label="Title">
              <input
                required
                className={inputClass}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Rising water advisory"
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Level">
                <select
                  className={inputClass}
                  value={level}
                  onChange={(event) => setLevel(event.target.value as AlertLevel)}
                >
                  {(["INFO", "WATCH", "WARNING", "CRITICAL"] as const).map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </Field>
              <Field label="Target area">
                <input
                  className={inputClass}
                  value={area}
                  onChange={(event) => setArea(event.target.value)}
                  placeholder="Ward or zone"
                />
              </Field>
            </div>
            <Field label="Public message">
              <textarea
                required
                maxLength={1200}
                className={`${inputClass} min-h-24 py-2`}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
            </Field>
            <Field label="Recommended action">
              <input
                className={inputClass}
                value={action}
                onChange={(event) => setAction(event.target.value)}
                placeholder="Move to higher ground"
              />
            </Field>
            {level === "CRITICAL" && (
              <p className="rounded-lg border border-accent/40 bg-accent/10 p-3 text-xs text-accent">
                CRITICAL alerts require manual approval before they become public. Delivery will
                still be tracked separately.
              </p>
            )}
            {error && <ErrorState message={error} />}
            {notice && (
              <p role="status" className="text-sm text-primary">
                {notice}
              </p>
            )}
            <Button type="submit" variant="primary" disabled={busy}>
              Create {level.toLowerCase()} alert
            </Button>
          </form>
        </Panel>
        <Panel
          title="Approval queue"
          action={<span className="font-mono text-xs text-accent">{pending.length} pending</span>}
        >
          {pending.length === 0 ? (
            <EmptyState message="No alerts need approval." />
          ) : (
            <div className="space-y-3">
              {pending.map((alert) => (
                <div key={alert.id} className="rounded-lg border border-accent/30 bg-accent/5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{alert.title}</p>
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
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {alert.message} · created {localTime(alert.created_at)}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      variant="success"
                      onClick={() => void approve(alert, "APPROVED")}
                      disabled={busy}
                    >
                      <Check className="h-4 w-4" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => void approve(alert, "REJECTED")}
                      disabled={busy}
                    >
                      <X className="h-4 w-4" />
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
      <Panel title="Immutable audit trail" className="mt-5">
        <div className="grid gap-2 md:grid-cols-2">
          {(audits.data ?? []).map((audit) => (
            <div
              key={audit.id}
              className="flex gap-3 rounded-lg border border-border bg-surface/40 p-3"
            >
              <FileClock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-xs font-semibold">
                  {audit.action} · {audit.entity_type}
                </p>
                <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                  {audit.entity_id ?? "system"} · {localTime(audit.created_at)}
                </p>
                {audit.reason && (
                  <p className="mt-1 text-xs text-muted-foreground">{audit.reason}</p>
                )}
              </div>
            </div>
          ))}
        </div>
        {(audits.data ?? []).length === 0 && <EmptyState message="No audit events available." />}
        <p className="mt-4 text-xs text-muted-foreground">
          Audit records are append-only in the database. Corrections should create a new corrective
          event rather than editing history.
        </p>
      </Panel>
      <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <Users className="h-4 w-4 text-primary" />
        Mass alerts, risk-policy changes, and destructive actions should use a configured second
        reviewer in production.
      </p>
    </PageFrame>
  );
}
