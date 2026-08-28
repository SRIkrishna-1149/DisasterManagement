import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Clock3, History, RefreshCw, Send, X } from "lucide-react";
import { AuthGate, LocationConfidence, PageFrame } from "@/components/portal";
import { Button, EmptyState, ErrorState, Panel, SeverityBadge, StatusPill } from "@/components/kit";
import { useAuth } from "@/hooks/useAuth";
import { useOfflineQueue } from "@/hooks/useConnectivity";
import { SOS_STATUS_LABEL, SOS_TRACK, localTime, type SosStatus } from "@/lib/domain";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type SosRow = Tables<"sos_requests">;
type SosEvent = Tables<"sos_events">;

export const Route = createFileRoute("/my-sos")({ component: MySosRoute });

function MySosRoute() {
  return (
    <AuthGate>
      <MySosContent />
    </AuthGate>
  );
}

function MySosContent() {
  const { user } = useAuth();
  const queue = useOfflineQueue().filter((item) => item.payload["user_id"] === user?.id);
  const client = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editPeople, setEditPeople] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const queryKey = useMemo(() => ["my-sos", user?.id] as const, [user?.id]);
  const requests = useQuery({
    queryKey,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sos_requests")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SosRow[];
    },
    refetchInterval: 30_000,
  });
  const rows = requests.data ?? [];
  const selected = rows.find((row) => row.id === selectedId) ?? rows[0] ?? null;
  const events = useQuery({
    queryKey: ["sos-events", selected?.id],
    enabled: !!selected,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sos_events")
        .select("*")
        .eq("sos_id", selected!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SosEvent[];
    },
  });

  useEffect(() => {
    if (selected) {
      setSelectedId(selected.id);
      setEditDescription(selected.description ?? "");
      setEditPeople(selected.people_count);
    }
  }, [selected]);
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`private-sos-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sos_requests", filter: `user_id=eq.${user.id}` },
        () => {
          void client.invalidateQueries({ queryKey });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [client, queryKey, user]);

  async function saveUpdate() {
    if (!user || !selected) return;
    setBusy(true);
    setNotice(null);
    const { error } = await supabase
      .from("sos_requests")
      .update({
        description: editDescription.trim() || null,
        people_count: Math.max(1, Math.min(999, editPeople)),
      })
      .eq("id", selected.id)
      .eq("user_id", user.id);
    setBusy(false);
    if (error) setNotice(`Update failed: ${error.message}`);
    else {
      setNotice("Existing SOS context updated.");
      await client.invalidateQueries({ queryKey });
    }
  }

  async function cancelSos() {
    if (
      !user ||
      !selected ||
      !window.confirm("Cancel this SOS? Responders will see the server-authoritative cancellation.")
    )
      return;
    setBusy(true);
    setNotice(null);
    const { error } = await supabase
      .from("sos_requests")
      .update({ status: "CANCELLED" })
      .eq("id", selected.id)
      .eq("user_id", user.id);
    setBusy(false);
    if (error) setNotice(`Cancellation failed: ${error.message}`);
    else {
      setNotice("Cancellation submitted to the response system.");
      await client.invalidateQueries({ queryKey });
    }
  }

  const selectedStatus = selected?.status as SosStatus | undefined;
  const active =
    selected && !["RESOLVED", "CANCELLED", "REJECTED", "DUPLICATE"].includes(selected.status);
  const trackIndex = selectedStatus ? SOS_TRACK.indexOf(selectedStatus) : -1;
  const queueCards = useMemo(
    () =>
      queue.map((item) => ({
        item,
        label:
          item.kind === "SOS"
            ? "Emergency SOS"
            : item.kind === "RESPONDER_NOTIFICATION"
              ? "Responder email delivery"
              : "Emergency update",
      })),
    [queue],
  );

  return (
    <PageFrame
      eyebrow="Community / response tracking"
      title="My SOS"
      description="Private status, server updates, and device-queued transmissions for your account."
      actions={
        <Link to="/sos">
          <Button variant="danger">
            <Send className="h-4 w-4" />
            New SOS
          </Button>
        </Link>
      }
    >
      {queueCards.length > 0 && (
        <Panel className="border-accent/50 bg-accent/10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-accent">
                {queueCards.length} request{queueCards.length === 1 ? "" : "s"} waiting to transmit
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Only this device can see the protected queue. It will retry when connectivity
                returns; no item is marked transmitted without acknowledgement.
              </p>
            </div>
            <Link to="/sos">
              <Button size="sm">Review SOS form</Button>
            </Link>
          </div>
          <div className="mt-3 space-y-2">
            {queueCards.map(({ item, label }) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-accent/20 bg-surface/60 p-2 text-xs"
              >
                <span>
                  <span className="font-semibold">{label}</span> ·{" "}
                  {item.state.toLowerCase().replaceAll("_", " ")}
                </span>
                <span className="font-mono text-muted-foreground">attempt {item.attempts}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}
      {requests.isError && (
        <ErrorState
          message="Your SOS history could not be loaded. Retry while connected; queued requests remain on this device."
          onRetry={() => void requests.refetch()}
        />
      )}
      {requests.isLoading ? (
        <Panel>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading server status…
          </div>
        </Panel>
      ) : rows.length === 0 && queue.length === 0 ? (
        <EmptyState message="No SOS requests are associated with this account." />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[340px_1fr]">
          <Panel title="Request history" className="h-fit">
            <div className="space-y-2">
              {rows.map((row) => (
                <button
                  type="button"
                  key={row.id}
                  onClick={() => setSelectedId(row.id)}
                  className={`w-full rounded-lg border p-3 text-left ${selected?.id === row.id ? "border-primary bg-primary/10" : "border-border bg-surface/50 hover:bg-surface-2"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-bold">SOS #{row.reference}</span>
                    <StatusPill status={row.status} />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {row.category.replaceAll("_", " ")} · {row.people_count} people
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Created {localTime(row.created_at)}
                  </p>
                </button>
              ))}
            </div>
          </Panel>
          <div className="space-y-5">
            {selected ? (
              <>
                <Panel
                  title={`SOS #${selected.reference}`}
                  action={
                    <div className="flex items-center gap-2">
                      <SeverityBadge severity={selected.severity} />
                      <StatusPill status={selected.status} />
                    </div>
                  }
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Emergency</p>
                      <p className="mt-1 font-semibold capitalize">
                        {selected.category.replaceAll("_", " ")}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Priority</p>
                      <p className="mt-1 font-mono font-bold text-high">
                        {selected.priority_score}/100
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-xs text-muted-foreground">Location</p>
                      <div className="mt-1">
                        {selected.location_source ? (
                          <LocationConfidence
                            source={selected.location_source}
                            accuracyM={selected.location_accuracy_m}
                            updatedAt={selected.created_at}
                          />
                        ) : (
                          <p className="text-sm text-accent">
                            No coordinate captured · {selected.landmark ?? "landmark unavailable"}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  {active && (
                    <div className="mt-5 border-t border-border pt-5">
                      <p className="text-sm font-semibold">Update this request</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Use this when the same situation changes. It updates the existing emergency
                        context and avoids creating a duplicate.
                      </p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-[130px_1fr]">
                        <label className="text-sm">
                          People
                          <input
                            type="number"
                            min="1"
                            max="999"
                            value={editPeople}
                            onChange={(event) => setEditPeople(Number(event.target.value))}
                            className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2"
                          />
                        </label>
                        <label className="text-sm">
                          Latest information
                          <textarea
                            maxLength={1000}
                            value={editDescription}
                            onChange={(event) => setEditDescription(event.target.value)}
                            className="mt-1 min-h-20 w-full rounded-lg border border-input bg-surface px-3 py-2"
                          />
                        </label>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => void saveUpdate()}
                          disabled={busy}
                        >
                          Save update
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void cancelSos()}
                          disabled={busy}
                        >
                          <X className="h-4 w-4" />
                          No longer need rescue
                        </Button>
                      </div>
                    </div>
                  )}
                  {notice && (
                    <p role="status" className="mt-3 text-sm text-primary">
                      {notice}
                    </p>
                  )}
                </Panel>
                <Panel title="Response timeline">
                  <div className="space-y-0">
                    {SOS_TRACK.map((status, index) => {
                      const reached = trackIndex >= index && trackIndex !== -1;
                      const event = events.data?.find((item) => item.new_status === status);
                      return (
                        <div key={status} className="flex gap-3">
                          <div className="flex w-5 flex-col items-center">
                            <span
                              className={`mt-1 h-3 w-3 rounded-full border-2 ${reached ? "border-primary bg-primary" : "border-border bg-surface"}`}
                            />
                            {index < SOS_TRACK.length - 1 && (
                              <span
                                className={`h-8 w-px ${reached && trackIndex > index ? "bg-primary" : "bg-border"}`}
                              />
                            )}
                          </div>
                          <div className="pb-4">
                            <p
                              className={`text-sm font-semibold ${reached ? "text-foreground" : "text-muted-foreground"}`}
                            >
                              {SOS_STATUS_LABEL[status]}
                            </p>
                            {event && (
                              <p className="mt-0.5 text-[11px] text-muted-foreground">
                                {localTime(event.created_at)}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {selected.status === "DUPLICATE" && (
                    <p className="border-t border-border pt-3 text-sm text-accent">
                      This request was merged into another emergency so responders can coordinate
                      one dispatch.
                    </p>
                  )}
                  {selected.validation_notes && (
                    <p className="border-t border-border pt-3 text-sm text-muted-foreground">
                      Responder note: {selected.validation_notes}
                    </p>
                  )}
                  {selected.validated_at && (
                    <p className="mt-3 border-t border-border pt-3 text-sm font-semibold text-safe">
                      Request accepted by the response team · {localTime(selected.validated_at)}
                    </p>
                  )}
                </Panel>
              </>
            ) : (
              <EmptyState message="Select a request to view its response timeline." />
            )}
          </div>
        </div>
      )}
      <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Clock3 className="h-3.5 w-3.5" />
        Times are shown in your local timezone. Server timestamps remain canonical.
      </p>
    </PageFrame>
  );
}
