import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronRight,
  ClipboardCheck,
  Flag,
  GitMerge,
  MapPin,
  Navigation,
  RefreshCw,
  Send,
  ShieldAlert,
  Truck,
  X,
  Crosshair,
} from "lucide-react";
import { AuthGate, LocationConfidence, PageFrame } from "@/components/portal";
import { Button, EmptyState, ErrorState, Panel, SeverityBadge, StatusPill } from "@/components/kit";
import { OperationsMap, type MapMarker } from "@/components/map-panel";
import { useAuth } from "@/hooks/useAuth";
import { useEmergencyLocation } from "@/hooks/useEmergencyLocation";
import { logAudit } from "@/lib/sos-service";
import {
  ALLOWED_TRANSITIONS,
  isInsideAndhraPradesh,
  localTime,
  type SosStatus,
} from "@/lib/domain";
import {
  calculateStaticRoadRoutes,
  getExternalNavigationUrl,
  type CalculatedRoute,
} from "@/lib/static-router";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type SosRow = Tables<"sos_requests">;
type TeamRow = Tables<"rescue_teams">;

const ACTIVE: SosStatus[] = [
  "UNVERIFIED",
  "NEEDS_MORE_INFORMATION",
  "VALIDATED",
  "ASSIGNED",
  "DISPATCHED",
  "EN_ROUTE",
  "ARRIVED",
  "RESCUE_IN_PROGRESS",
];

export const Route = createFileRoute("/rescue")({ component: RescueRoute });

function RescueRoute() {
  return (
    <AuthGate role="operator">
      <RescueContent />
    </AuthGate>
  );
}

function RescueContent() {
  const { user, isAdmin } = useAuth();
  const client = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [teamId, setTeamId] = useState("");
  const [mergeTarget, setMergeTarget] = useState("");
  const [override, setOverride] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<"QUEUE" | "ALL">("QUEUE");
  const [incidentRoute, setIncidentRoute] = useState<CalculatedRoute | null>(null);
  const [shareLocation, setShareLocation] = useState(false);

  const {
    location: rescuerLoc,
    status: rescuerLocStatus,
    startWatching,
    stopWatching,
  } = useEmergencyLocation(false);

  const sosQuery = useQuery({
    queryKey: ["operations-sos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sos_requests")
        .select("*")
        .order("priority_score", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SosRow[];
    },
    refetchInterval: 20_000,
  });

  const teamsQuery = useQuery({
    queryKey: ["operations-teams"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rescue_teams")
        .select("*")
        .order("status")
        .order("name");
      if (error) throw error;
      return (data ?? []) as TeamRow[];
    },
    refetchInterval: 20_000,
  });

  const rows = sosQuery.data ?? [];
  const visible = rows.filter((row) => filter === "ALL" || ACTIVE.includes(row.status));
  const selected = rows.find((row) => row.id === selectedId) ?? visible[0] ?? null;
  const availableTeams = (teamsQuery.data ?? []).filter(
    (team) => team.status === "AVAILABLE" || (isAdmin && team.id === selected?.assigned_team_id),
  );
  const activeCount = rows.filter((row) => ACTIVE.includes(row.status)).length;
  const unverifiedCount = rows.filter(
    (row) => row.status === "UNVERIFIED" || row.status === "NEEDS_MORE_INFORMATION",
  ).length;
  const deployedCount = (teamsQuery.data ?? []).filter((team) => team.status === "DEPLOYED").length;

  useEffect(() => {
    if (selected) {
      setSelectedId(selected.id);
      setNotes(selected.validation_notes ?? "");
      setTeamId(selected.assigned_team_id ?? "");
    }
  }, [selected]);

  // Handle live rescuer location sharing
  useEffect(() => {
    if (shareLocation) {
      startWatching();
    } else {
      stopWatching();
    }
  }, [shareLocation, startWatching, stopWatching]);

  // Calculate road route from rescuer to incident when selected
  useEffect(() => {
    if (!selected?.latitude || !selected?.longitude || !rescuerLoc) {
      setIncidentRoute(null);
      return;
    }

    let active = true;
    calculateStaticRoadRoutes(
      { lat: rescuerLoc.lat, lng: rescuerLoc.lng },
      { lat: selected.latitude, lng: selected.longitude },
    )
      .then((routes: CalculatedRoute[]) => {
        if (active && routes.length > 0) {
          setIncidentRoute(routes[0] ?? null);
        }
      })
      .catch((err: unknown) => {
        console.warn("Rescuer to incident route error:", err);
      });

    return () => {
      active = false;
    };
  }, [selected?.latitude, selected?.longitude, rescuerLoc]);

  useEffect(() => {
    const channel = supabase
      .channel("operations-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sos_requests" },
        () => void client.invalidateQueries({ queryKey: ["operations-sos"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rescue_teams" },
        () => void client.invalidateQueries({ queryKey: ["operations-teams"] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [client]);

  async function transition(next: SosStatus, extra: Record<string, unknown> = {}) {
    if (!selected || !user || !ALLOWED_TRANSITIONS[selected.status].includes(next)) {
      setNotice(
        `The server state machine does not allow this transition from ${selected?.status ?? "unknown"}.`,
      );
      return;
    }
    setBusy(true);
    setNotice(null);
    const { error } = await supabase
      .from("sos_requests")
      .update({ status: next, ...extra })
      .eq("id", selected.id)
      .eq("status", selected.status);
    if (error) setNotice(error.message);
    else {
      await logAudit({
        actorId: user.id,
        action: `SOS_${next}`,
        entityType: "sos_request",
        entityId: selected.id,
        previousState: { status: selected.status },
        newState: { status: next },
        reason: notes || "Operator state transition",
      });
      setNotice(`SOS #${selected.reference} updated to ${next}.`);
      await client.invalidateQueries({ queryKey: ["operations-sos"] });
    }
    setBusy(false);
  }

  async function validate(next: "VALIDATED" | "NEEDS_MORE_INFORMATION" | "REJECTED") {
    await transition(next, {
      validation_notes: notes.trim() || null,
      validated_by: next === "VALIDATED" ? (user?.id ?? null) : null,
      validated_at: next === "VALIDATED" ? new Date().toISOString() : null,
    });
  }

  async function assign() {
    if (!selected || !teamId || !user) return;
    setBusy(true);
    setNotice(null);
    const { error } = await supabase.rpc("assign_team_to_sos", {
      _sos_id: selected.id,
      _team_id: teamId,
      _override: override && isAdmin,
    });
    if (error) setNotice(error.message);
    else {
      setNotice(`Team assignment requested for SOS #${selected.reference}.`);
      await client.invalidateQueries({ queryKey: ["operations-sos"] });
      await client.invalidateQueries({ queryKey: ["operations-teams"] });
    }
    setBusy(false);
  }

  async function merge() {
    if (!selected || !mergeTarget || !user || selected.id === mergeTarget) return;
    setBusy(true);
    const { error } = await supabase
      .from("sos_requests")
      .update({
        status: "DUPLICATE",
        merged_into_id: mergeTarget,
        dismissed_reason: `Merged by operator ${user.id}`,
      })
      .eq("id", selected.id)
      .eq("status", selected.status);
    if (error) setNotice(error.message);
    else {
      setNotice("Duplicate SOS merged into the selected primary request.");
      await client.invalidateQueries({ queryKey: ["operations-sos"] });
    }
    setBusy(false);
  }

  const missionActions = selected
    ? (
        ["DISPATCHED", "EN_ROUTE", "ARRIVED", "RESCUE_IN_PROGRESS", "RESOLVED"] as SosStatus[]
      ).filter((next) => ALLOWED_TRANSITIONS[selected.status].includes(next))
    : [];

  const incidentMarkers: MapMarker[] = useMemo(() => {
    const list: MapMarker[] = [];
    if (selected?.latitude && selected?.longitude) {
      list.push({
        id: `incident-${selected.id}`,
        kind: "sos",
        label: `Incident SOS #${selected.reference}`,
        detail: `${selected.category} · ${selected.people_count} people`,
        lat: selected.latitude,
        lng: selected.longitude,
        quality: "LIVE",
      });
    }
    (teamsQuery.data ?? [])
      .filter((t) => t.latitude && t.longitude)
      .forEach((t) => {
        list.push({
          id: `team-${t.id}`,
          kind: "team",
          label: t.name,
          detail: `Team ${t.status} · cap ${t.capacity}`,
          lat: t.latitude!,
          lng: t.longitude!,
          quality: "LIVE",
        });
      });
    return list;
  }, [selected, teamsQuery.data]);

  return (
    <PageFrame
      eyebrow="Rescue / operations"
      title="Response queue"
      description="Validate first, prioritize transparently, then assign through the concurrency-safe server function. Full spatial routing and verified audit logging."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShareLocation((prev) => !prev)}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold ${
              shareLocation
                ? "border-safe bg-safe/15 text-safe"
                : "border-border text-muted-foreground hover:bg-surface-2"
            }`}
          >
            <Crosshair className="h-3.5 w-3.5" />
            {shareLocation ? "Sharing live location" : "Share my location"}
          </button>
          <Button
            size="sm"
            onClick={() => {
              void sosQuery.refetch();
              void teamsQuery.refetch();
            }}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      }
    >
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-accent/40 bg-accent/10 p-4">
          <p className="text-xs text-muted-foreground">Needs review</p>
          <p className="mt-1 text-3xl font-bold text-accent">{unverifiedCount}</p>
          <p className="text-xs text-muted-foreground">Manual validation queue</p>
        </div>
        <div className="rounded-lg border border-destructive/35 bg-destructive/5 p-4">
          <p className="text-xs text-muted-foreground">Active missions</p>
          <p className="mt-1 text-3xl font-bold text-destructive">{activeCount}</p>
          <p className="text-xs text-muted-foreground">Server status is authoritative</p>
        </div>
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
          <p className="text-xs text-muted-foreground">Teams deployed</p>
          <p className="mt-1 text-3xl font-bold text-primary">{deployedCount}</p>
          <p className="text-xs text-muted-foreground">Availability locked on assignment</p>
        </div>
      </section>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          onClick={() => setFilter("QUEUE")}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
            filter === "QUEUE"
              ? "border-primary bg-primary/15 text-primary"
              : "border-border text-muted-foreground"
          }`}
        >
          Active queue ({activeCount})
        </button>
        <button
          onClick={() => setFilter("ALL")}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
            filter === "ALL"
              ? "border-primary bg-primary/15 text-primary"
              : "border-border text-muted-foreground"
          }`}
        >
          All history ({rows.length})
        </button>
      </div>

      {sosQuery.isError && (
        <ErrorState
          message="Operations data could not be loaded. Do not dispatch from stale information."
          onRetry={() => void sosQuery.refetch()}
        />
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-[420px_1fr]">
        <Panel title="Prioritized SOS queue">
          <div className="space-y-2">
            {sosQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading operations queue…</p>
            ) : visible.length === 0 ? (
              <EmptyState message="No SOS requests in this view." />
            ) : (
              visible.map((row) => (
                <button
                  type="button"
                  key={row.id}
                  onClick={() => setSelectedId(row.id)}
                  className={`w-full rounded-lg border p-3 text-left ${
                    selected?.id === row.id
                      ? "border-primary bg-primary/10"
                      : "border-border bg-surface/50 hover:bg-surface-2"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-bold">SOS #{row.reference}</span>
                    <span className="rounded border border-high/40 bg-high/10 px-1.5 py-0.5 font-mono text-[10px] text-high">
                      P{row.priority_score}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={row.severity} />
                    <StatusPill status={row.status} />
                  </div>
                  <p className="mt-2 text-xs capitalize text-muted-foreground">
                    {row.category.replaceAll("_", " ")} · {row.people_count} people ·{" "}
                    {localTime(row.created_at)}
                  </p>
                </button>
              ))
            )}
          </div>
        </Panel>

        <div className="space-y-5">
          {selected ? (
            <>
              <Panel
                title={`SOS #${selected.reference}`}
                action={
                  <div className="flex gap-2">
                    <SeverityBadge severity={selected.severity} />
                    <StatusPill status={selected.status} />
                  </div>
                }
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Reporter context</p>
                    <p className="mt-1 text-sm">
                      {selected.description || "No description provided"}
                    </p>
                    {selected.medical_needs && (
                      <p className="mt-2 text-sm font-semibold text-destructive">
                        Medical: {selected.medical_needs}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Priority breakdown</p>
                    <p className="mt-1 font-mono text-2xl font-bold text-high">
                      {selected.priority_score}/100
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Severity · people · medical · risk · wait · vulnerability · distance ·
                      verification
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs text-muted-foreground">Location confidence</p>
                    <div className="mt-1">
                      {selected.location_source ? (
                        <LocationConfidence
                          source={selected.location_source}
                          accuracyM={selected.location_accuracy_m}
                          updatedAt={selected.created_at}
                        />
                      ) : (
                        <p className="text-sm text-accent">
                          Approximate / unavailable · {selected.landmark ?? "no landmark"}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Tactical Incident Map */}
                {selected.latitude && selected.longitude && (
                  <div className="mt-5 border-t border-border pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-primary">
                        Incident Tactical Location
                      </p>
                      <a
                        href={getExternalNavigationUrl(
                          { lat: selected.latitude, lng: selected.longitude },
                          rescuerLoc ? { lat: rescuerLoc.lat, lng: rescuerLoc.lng } : undefined,
                        )}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                      >
                        <Navigation className="h-3 w-3" />
                        Navigate in Google Maps ↗
                      </a>
                    </div>
                    <OperationsMap
                      markers={incidentMarkers}
                      title={`Incident #${selected.reference} Map`}
                      userLocation={
                        rescuerLoc ? { lat: rescuerLoc.lat, lng: rescuerLoc.lng } : null
                      }
                      userAccuracyM={rescuerLoc?.accuracyM ?? null}
                      calculatedRoute={incidentRoute}
                      centerOn={{ lat: selected.latitude, lng: selected.longitude }}
                      className="min-h-[300px]"
                    />
                  </div>
                )}

                {(selected.status === "UNVERIFIED" ||
                  selected.status === "NEEDS_MORE_INFORMATION") && (
                  <div className="mt-5 border-t border-border pt-5">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <ClipboardCheck className="h-4 w-4 text-primary" />
                      Manual validation
                    </p>
                    <textarea
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      maxLength={1000}
                      className="mt-3 min-h-20 w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm"
                      placeholder="Record what was confirmed or what is still needed…"
                    />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="success"
                        onClick={() => void validate("VALIDATED")}
                        disabled={busy}
                      >
                        <Check className="h-4 w-4" />
                        Validate
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => void validate("NEEDS_MORE_INFORMATION")}
                        disabled={busy}
                      >
                        Need more info
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => void validate("REJECTED")}
                        disabled={busy}
                      >
                        <X className="h-4 w-4" />
                        Reject
                      </Button>
                    </div>
                  </div>
                )}

                {selected.status === "VALIDATED" && (
                  <div className="mt-5 border-t border-border pt-5">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <Truck className="h-4 w-4 text-primary" />
                      Assign available team
                    </p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <select
                        value={teamId}
                        onChange={(event) => setTeamId(event.target.value)}
                        className="min-h-11 flex-1 rounded-lg border border-input bg-surface px-3 text-sm"
                      >
                        <option value="">Choose available team</option>
                        {availableTeams.map((team) => (
                          <option key={team.id} value={team.id}>
                            {team.name} · cap {team.capacity} · {team.equipment.join(", ")}
                          </option>
                        ))}
                      </select>
                      <Button
                        variant="primary"
                        onClick={() => void assign()}
                        disabled={busy || !teamId}
                      >
                        <Send className="h-4 w-4" />
                        Assign
                      </Button>
                    </div>
                    {isAdmin && (
                      <label className="mt-3 flex items-center gap-2 text-xs text-accent">
                        <input
                          type="checkbox"
                          checked={override}
                          onChange={(event) => setOverride(event.target.checked)}
                        />
                        Allow configured admin override (audited)
                      </label>
                    )}
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Assignment locks the team atomically. Two operators cannot reserve the same
                      team.
                    </p>
                  </div>
                )}

                {missionActions.length > 0 && (
                  <div className="mt-5 border-t border-border pt-5">
                    <p className="text-sm font-semibold">Mission lifecycle</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {missionActions.map((next) => (
                        <Button
                          key={next}
                          size="sm"
                          variant={next === "RESOLVED" ? "success" : "primary"}
                          onClick={() => void transition(next)}
                          disabled={busy}
                        >
                          <ChevronRight className="h-4 w-4" />
                          {next.replaceAll("_", " ")}
                        </Button>
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Only server-allowed next steps are shown. Resolve or cancel releases the
                      assigned team.
                    </p>
                  </div>
                )}

                {notice && (
                  <p
                    role="status"
                    className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-primary"
                  >
                    {notice}
                  </p>
                )}
              </Panel>

              <Panel title="Merge duplicate request">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <select
                    value={mergeTarget}
                    onChange={(event) => setMergeTarget(event.target.value)}
                    className="min-h-11 flex-1 rounded-lg border border-input bg-surface px-3 text-sm"
                  >
                    <option value="">Select primary SOS</option>
                    {rows
                      .filter((row) => row.id !== selected.id && ACTIVE.includes(row.status))
                      .map((row) => (
                        <option key={row.id} value={row.id}>
                          SOS #{row.reference} · {row.status}
                        </option>
                      ))}
                  </select>
                  <Button size="sm" onClick={() => void merge()} disabled={busy || !mergeTarget}>
                    <GitMerge className="h-4 w-4" />
                    Merge
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Merging marks this record DUPLICATE and preserves its history. Operators should
                  confirm with the requester before merging.
                </p>
              </Panel>
            </>
          ) : (
            <EmptyState message="Select an SOS to review." />
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="Team readiness">
          {teamsQuery.isError ? (
            <ErrorState message="Team availability unavailable." />
          ) : (
            <div className="space-y-2">
              {(teamsQuery.data ?? []).map((team) => (
                <div
                  key={team.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface/50 p-3"
                >
                  <div>
                    <p className="text-sm font-semibold">{team.name}</p>
                    <p className="text-xs text-muted-foreground">
                      cap {team.capacity} · {team.equipment.join(", ")} · location{" "}
                      {localTime(team.location_updated_at)}
                    </p>
                  </div>
                  <span
                    className={`rounded border px-2 py-1 text-[10px] font-bold uppercase ${
                      team.status === "AVAILABLE"
                        ? "border-safe/40 bg-safe/10 text-safe"
                        : team.status === "DEPLOYED"
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border bg-muted text-muted-foreground"
                    }`}
                  >
                    {team.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Operator guardrails">
          <p className="flex gap-2 text-sm text-muted-foreground">
            <ShieldAlert className="h-4 w-4 shrink-0 text-accent" />
            Location source, accuracy, and capture time stay visible through validation and
            dispatch.
          </p>
          <p className="mt-3 flex gap-2 text-sm text-muted-foreground">
            <Flag className="h-4 w-4 shrink-0 text-primary" />
            Every manual action creates an audit record; ordinary operators cannot edit or delete
            audit history.
          </p>
          <p className="mt-3 flex gap-2 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 shrink-0 text-safe" />
            Use the map workspace for spatial context; do not infer route safety from distance
            alone.
          </p>
        </Panel>
      </div>
    </PageFrame>
  );
}
