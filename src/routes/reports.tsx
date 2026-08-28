import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Camera, MapPin, Send, TriangleAlert } from "lucide-react";
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
import { REPORT_TYPES, type Severity, SEVERITIES, localTime } from "@/lib/domain";
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
  const { user } = useAuth();
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setNotice(null);
    setError(null);
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
              {location && (
                <div className="flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 p-3 text-xs text-muted-foreground">
                  <MapPin className="h-4 w-4 text-primary" />
                  Location attached: {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
                  <DataTag quality="RECENT" />
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
    </PageFrame>
  );
}
