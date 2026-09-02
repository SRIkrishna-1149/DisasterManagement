import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import {
  Activity,
  BarChart3,
  Camera,
  Clock3,
  MapPin,
  Send,
  ShieldCheck,
  TriangleAlert,
  UsersRound,
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
} from "@/components/kit";
import { useAuth } from "@/hooks/useAuth";
import { useEmergencyLocation } from "@/hooks/useEmergencyLocation";
import { isInsideIndia, REPORT_TYPES, type Severity, SEVERITIES, localTime } from "@/lib/domain";
import { calculateReportAnalytics, type ReportAnalytics } from "@/lib/reports";
import { newIdempotencyKey } from "@/lib/sos-service";
import { enqueue } from "@/lib/offline-queue";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type ReportRow = Tables<"community_reports">;

export const Route = createFileRoute("/reports")({ component: ReportsRoute });

function ReportsRoute() {
  return (
    <AuthGate>
      <ReportForm />
    </AuthGate>
  );
}

function ReportForm() {
  const { user, isOperator } = useAuth();
  const { location, request } = useEmergencyLocation();
  const client = useQueryClient();
  const [reportType, setReportType] = useState<string>(REPORT_TYPES[0]);
  const [severity, setSeverity] = useState<Severity>("MEDIUM");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ownReports = useQuery({
    queryKey: ["own-reports", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error: queryError } = await supabase
        .from("community_reports")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(8);
      if (queryError) throw queryError;
      return (data ?? []) as ReportRow[];
    },
  });
  const operatorSos = useQuery({
    queryKey: ["reports-analytics-sos"],
    enabled: isOperator,
    queryFn: async () => {
      const { data, error: queryError } = await supabase
        .from("sos_requests")
        .select("status, severity, category, created_at, validated_at")
        .limit(1000);
      if (queryError) throw queryError;
      return data ?? [];
    },
  });
  const operatorAlerts = useQuery({
    queryKey: ["reports-analytics-alerts"],
    enabled: isOperator,
    queryFn: async () => {
      const { data, error: queryError } = await supabase
        .from("alerts")
        .select("level, issued_at")
        .limit(1000);
      if (queryError) throw queryError;
      return data ?? [];
    },
  });
  const operatorReports = useQuery({
    queryKey: ["reports-analytics-community"],
    enabled: isOperator,
    queryFn: async () => {
      const { data, error: queryError } = await supabase
        .from("community_reports")
        .select("verification_status, created_at")
        .limit(1000);
      if (queryError) throw queryError;
      return data ?? [];
    },
  });
  const operatorTeams = useQuery({
    queryKey: ["reports-analytics-teams"],
    enabled: isOperator,
    queryFn: async () => {
      const { data, error: queryError } = await supabase.from("rescue_teams").select("status");
      if (queryError) throw queryError;
      return data ?? [];
    },
  });
  const analytics = useMemo<ReportAnalytics | null>(() => {
    if (!isOperator) return null;
    return calculateReportAnalytics({
      sos: operatorSos.data ?? [],
      alerts: operatorAlerts.data ?? [],
      reports: operatorReports.data ?? [],
      teams: operatorTeams.data ?? [],
    });
  }, [isOperator, operatorAlerts.data, operatorReports.data, operatorSos.data, operatorTeams.data]);
  const analyticsError =
    operatorSos.isError ||
    operatorAlerts.isError ||
    operatorReports.isError ||
    operatorTeams.isError;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    if (location && !isInsideIndia(location.lat, location.lng)) {
      setError("Attached location must be within the India operating area.");
      setBusy(false);
      return;
    }
    const payload = {
      user_id: user.id,
      report_type: reportType,
      description: description.trim() || null,
      latitude: location?.lat ?? null,
      longitude: location?.lng ?? null,
      severity,
    };
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await enqueue({
          id: newIdempotencyKey(),
          kind: "COMMUNITY_REPORT",
          priority: 3,
          payload,
          state: "QUEUED",
          attempts: 0,
          nextAttemptAt: Date.now(),
          createdAt: new Date().toISOString(),
        });
        setNotice("Report saved on this device. It will transmit when connectivity returns.");
        setDescription("");
        return;
      }
      const { error: insertError } = await supabase.from("community_reports").insert(payload);
      if (insertError) throw insertError;
      setNotice("Report submitted. Operators will see it as unverified until reviewed.");
      setDescription("");
      await client.invalidateQueries({ queryKey: ["own-reports", user.id] });
    } catch (caught) {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await enqueue({
          id: newIdempotencyKey(),
          kind: "COMMUNITY_REPORT",
          priority: 3,
          payload,
          state: "QUEUED",
          attempts: 0,
          nextAttemptAt: Date.now(),
          createdAt: new Date().toISOString(),
        });
        setNotice("Connection failed. Report queued on this device for retry.");
      } else setError(caught instanceof Error ? caught.message : "Report could not be submitted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageFrame
      eyebrow="Community / observations"
      title="Report a hazard"
      description="Share a useful observation with responders. This is not an SOS; use Send SOS for immediate rescue. Reports are unverified until an operator reviews them."
      actions={
        <Button type="button" onClick={request}>
          <MapPin className="h-4 w-4" />
          Add my location
        </Button>
      }
    >
      <div className="grid gap-5 xl:grid-cols-[1fr_0.8fr]">
        <form onSubmit={(event) => void submit(event)}>
          <Panel title="Observation">
            <div className="space-y-4">
              <Field label="What did you see?">
                <select
                  className={inputClass}
                  value={reportType}
                  onChange={(event) => setReportType(event.target.value)}
                >
                  {REPORT_TYPES.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </Field>
              <Field label="Impact level">
                <select
                  className={inputClass}
                  value={severity}
                  onChange={(event) => setSeverity(event.target.value as Severity)}
                >
                  {SEVERITIES.map((level) => (
                    <option key={level}>{level}</option>
                  ))}
                </select>
              </Field>
              <Field
                label="Details"
                hint="Mention direction, depth, blockage, or visible people if relevant."
              >
                <textarea
                  required
                  maxLength={1000}
                  className={`${inputClass} min-h-32 py-3`}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Describe what is happening and when you observed it…"
                />
              </Field>
              {location ? (
                <div className="flex items-center justify-between rounded-lg border border-primary/25 bg-primary/5 p-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    <span>
                      Location attached: {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={request}
                    className="text-[11px] font-semibold text-primary underline hover:text-primary/80"
                  >
                    Update GPS
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    No location attached (optional)
                  </span>
                  <Button type="button" size="sm" variant="outline" onClick={request}>
                    <MapPin className="h-3.5 w-3.5 mr-1" />
                    Attach My Location
                  </Button>
                </div>
              )}
              {error && <ErrorState message={error} />}
              {notice && (
                <p
                  role="status"
                  className="rounded-lg border border-safe/40 bg-safe/10 p-3 text-sm text-safe"
                >
                  {notice}
                </p>
              )}
              <Button type="submit" variant="primary" disabled={busy}>
                <Send className="h-4 w-4" />
                {busy ? "Submitting…" : "Submit observation"}
              </Button>
            </div>
          </Panel>
        </form>
        <aside className="space-y-5">
          <Panel title="Report scope">
            <div className="space-y-3 text-sm text-muted-foreground">
              <p className="flex gap-2">
                <TriangleAlert className="h-4 w-4 shrink-0 text-accent" />
                Do not wait for a report to send an SOS if someone needs immediate help.
              </p>
              <p className="flex gap-2">
                <Camera className="h-4 w-4 shrink-0 text-primary" />
                Photos and sensitive personal details are not required for triage.
              </p>
              <p className="flex gap-2">
                <MapPin className="h-4 w-4 shrink-0 text-safe" />
                Location is optional. If attached, it is visible to authorised operators.
              </p>
            </div>
          </Panel>
          <Panel title="My recent reports">
            {ownReports.isError ? (
              <ErrorState message="Your report history is unavailable." />
            ) : (ownReports.data ?? []).length === 0 ? (
              <EmptyState message="No reports submitted from this account." />
            ) : (
              <div className="space-y-3">
                {(ownReports.data ?? []).map((report) => (
                  <div key={report.id} className="border-b border-border pb-3 last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{report.report_type}</p>
                      <SeverityBadge severity={report.severity} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {report.verification_status} · {localTime(report.created_at)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </aside>
      </div>
      {isOperator && (
        <ReportsAnalytics
          analytics={analytics}
          loading={
            operatorSos.isLoading ||
            operatorAlerts.isLoading ||
            operatorReports.isLoading ||
            operatorTeams.isLoading
          }
          error={analyticsError}
        />
      )}
    </PageFrame>
  );
}

function ReportsAnalytics({
  analytics,
  loading,
  error,
}: {
  analytics: ReportAnalytics | null;
  loading: boolean;
  error: boolean;
}) {
  if (loading) {
    return (
      <Panel title="Response analytics">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <BarChart3 className="h-4 w-4" /> Loading reports analyticsâ€¦
        </p>
      </Panel>
    );
  }
  if (error || !analytics) {
    return (
      <ErrorState message="Reports analytics are unavailable. Existing report submissions remain available above." />
    );
  }

  const maxSeverity = Math.max(1, ...Object.values(analytics.severityDistribution));
  const maxTrend = Math.max(
    1,
    ...analytics.sevenDayTrend.map((day) => Math.max(day.sos, day.reports)),
  );
  const metricCards = [
    ["SOS requests", analytics.sosCount, "Persisted requests"],
    ["Active incidents", analytics.activeIncidents, "Open response states"],
    [
      "Validation time",
      analytics.averageValidationMinutes === null
        ? "—"
        : `${analytics.averageValidationMinutes} min`,
      "Average where recorded",
    ],
    ["Resolved SOS", analytics.resolvedCount, "Server status = resolved"],
    ["Community reports", analytics.communityReports, `${analytics.verifiedReports} verified`],
    ["Teams available", analytics.availableTeams, `${analytics.deployedTeams} deployed`],
  ] as const;

  return (
    <section className="space-y-4" aria-labelledby="reports-analytics-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] font-semibold tracking-[0.18em] text-primary uppercase">
            Authorised operations / analytics
          </p>
          <h2 id="reports-analytics-title" className="mt-1 text-2xl font-bold">
            Response reports
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Calculated from persisted SOS, alert, report, and team records. No unavailable metrics
            are invented.
          </p>
        </div>
        <DataTag quality="RECENT" />
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {metricCards.map(([label, value, hint]) => (
          <StatCard key={label} label={label} value={value} hint={hint} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Severity distribution">
          <div className="space-y-3">
            {(Object.entries(analytics.severityDistribution) as [Severity, number][]).map(
              ([severity, count]) => (
                <div key={severity}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold">{severity}</span>
                    <span className="font-mono text-muted-foreground">{count}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-surface-2">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{ width: `${(count / maxSeverity) * 100}%` }}
                    />
                  </div>
                </div>
              ),
            )}
          </div>
        </Panel>
        <Panel title="Seven-day activity trend">
          <div className="overflow-x-auto">
            <div className="grid min-w-[360px] grid-cols-7 gap-2">
              {analytics.sevenDayTrend.map((day) => (
                <div
                  key={day.label}
                  className="flex min-h-32 flex-col items-center justify-end gap-1"
                >
                  <div
                    className="flex h-24 items-end gap-1"
                    aria-label={`${day.label}: ${day.sos} SOS, ${day.reports} reports`}
                  >
                    <div
                      className="w-3 rounded-t bg-destructive/75"
                      style={{
                        height: `${Math.max(day.sos ? 8 : 2, (day.sos / maxTrend) * 100)}%`,
                      }}
                    />
                    <div
                      className="w-3 rounded-t bg-primary/75"
                      style={{
                        height: `${Math.max(day.reports ? 8 : 2, (day.reports / maxTrend) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{day.label}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            <span>
              <i className="mr-1 inline-block h-2 w-2 rounded-full bg-destructive/75" />
              SOS requests
            </span>
            <span>
              <i className="mr-1 inline-block h-2 w-2 rounded-full bg-primary/75" />
              Community reports
            </span>
          </p>
        </Panel>
      </div>

      <div className="md:hidden space-y-3">
        <Panel title="Mobile summary">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <p className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" /> {analytics.alertHistory} alerts logged
            </p>
            <p className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-safe" /> {analytics.validatedCount} validated
            </p>
            <p className="flex items-center gap-2">
              <UsersRound className="h-4 w-4 text-primary" /> {analytics.deployedTeams} teams
              deployed
            </p>
            <p className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-accent" />{" "}
              {analytics.averageValidationMinutes === null
                ? "No timing data"
                : `${analytics.averageValidationMinutes} min validation`}
            </p>
          </div>
        </Panel>
      </div>
    </section>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface/60 p-3">
      <p className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold">{value}</p>
      <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
}
