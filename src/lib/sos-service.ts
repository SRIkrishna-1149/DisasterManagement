/**
 * SOS service — the only place that talks to the backend for emergency
 * requests. Idempotent, duplicate-aware and offline-safe.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  backoffMs,
  enqueue,
  listQueue,
  priorityFor,
  removeOperation,
  updateOperation,
  type QueuedOperation,
} from "./offline-queue";
import type { LocationSource, Severity } from "./domain";
import { haversineKm } from "./geo";

export interface SosDraft {
  reporter_name: string | null;
  people_count: number;
  category: string;
  severity: Severity;
  description: string | null;
  medical_needs: string | null;
  has_medical_emergency: boolean;
  has_vulnerable_people: boolean;
  latitude: number | null;
  longitude: number | null;
  location_source: LocationSource;
  location_accuracy_m: number | null;
  landmark: string | null;
}

export interface SosRow extends SosDraft {
  id: string;
  reference: number;
  user_id: string | null;
  status: string;
  assigned_team_id: string | null;
  validated_at: string | null;
  validation_notes: string | null;
  dismissed_reason: string | null;
  merged_into_id: string | null;
  created_at: string;
  updated_at: string;
  client_created_at: string | null;
  idempotency_key: string;
}

export function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const ACTIVE_STATUSES = [
  "UNVERIFIED",
  "NEEDS_MORE_INFORMATION",
  "VALIDATED",
  "ASSIGNED",
  "DISPATCHED",
  "EN_ROUTE",
  "ARRIVED",
  "RESCUE_IN_PROGRESS",
];

/** Client-side pre-check. The database unique idempotency key is the real guard. */
export async function findActiveSos(userId: string): Promise<SosRow[]> {
  const { data, error } = await supabase
    .from("sos_requests")
    .select("*")
    .eq("user_id", userId)
    .in("status", ACTIVE_STATUSES)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as SosRow[];
}

export function looksDuplicate(existing: SosRow[], draft: SosDraft): SosRow | null {
  for (const row of existing) {
    const withinTime = Date.now() - new Date(row.created_at).getTime() < 30 * 60_000;
    const sameCategory = row.category === draft.category;
    const near =
      row.latitude !== null &&
      row.longitude !== null &&
      draft.latitude !== null &&
      draft.longitude !== null &&
      haversineKm(
        { lat: row.latitude, lng: row.longitude },
        { lat: draft.latitude, lng: draft.longitude },
      ) < 0.15;
    if (withinTime && (sameCategory || near)) return row;
  }
  return null;
}

/** Queues the SOS locally first, then attempts transmission. */
export async function submitSos(draft: SosDraft, userId: string): Promise<QueuedOperation> {
  const op: QueuedOperation = {
    id: newIdempotencyKey(),
    kind: "SOS",
    priority: priorityFor("SOS", draft.severity),
    payload: { ...draft, user_id: userId },
    state: "QUEUED",
    attempts: 0,
    nextAttemptAt: Date.now(),
    createdAt: new Date().toISOString(),
  };
  await enqueue(op);
  await flushQueue();
  const [updated] = (await listQueue()).filter((q) => q.id === op.id);
  return updated ?? op;
}

async function transmit(op: QueuedOperation): Promise<void> {
  if (op.kind === "SOS") {
    const { data, error } = await supabase
      .from("sos_requests")
      .insert({
        ...(op.payload as Record<string, never>),
        idempotency_key: op.id,
        client_created_at: op.createdAt,
      })
      .select("id, reference")
      .single();

    if (error) {
      // Unique violation means the server already accepted this exact request.
      if (error.code === "23505") {
        await removeOperation(op.id);
        return;
      }
      throw error;
    }
    await updateOperation(op.id, { state: "TRANSMITTED", serverId: data.id });
    await removeOperation(op.id);
    return;
  }

  if (op.kind === "SOS_UPDATE") {
    const { sos_id, ...patch } = op.payload as { sos_id: string } & Record<string, unknown>;
    const { error } = await supabase.from("sos_requests").update(patch).eq("id", sos_id);
    if (error) throw error;
    await removeOperation(op.id);
    return;
  }

  const { error } = await supabase
    .from("community_reports")
    .insert(op.payload as Record<string, never>);
  if (error) throw error;
  await removeOperation(op.id);
}

let flushing = false;

/** Drains the queue in priority order. Safe to call repeatedly. */
export async function flushQueue(): Promise<void> {
  if (flushing) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  flushing = true;
  try {
    const queue = await listQueue();
    for (const op of queue) {
      if (op.nextAttemptAt > Date.now()) continue;
      await updateOperation(op.id, { state: "SYNCING" });
      try {
        await transmit(op);
      } catch (error) {
        const attempts = op.attempts + 1;
        await updateOperation(op.id, {
          state: attempts >= 8 ? "FAILED" : "FAILED_RETRYING",
          attempts,
          nextAttemptAt: Date.now() + backoffMs(attempts),
          lastError: error instanceof Error ? error.message : "Transmission failed",
        });
      }
    }
  } finally {
    flushing = false;
  }
}

export async function logAudit(params: {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  previousState?: unknown;
  newState?: unknown;
  reason?: string;
}): Promise<void> {
  await supabase.from("audit_logs").insert({
    actor_id: params.actorId,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId,
    previous_state: (params.previousState ?? null) as never,
    new_state: (params.newState ?? null) as never,
    reason: params.reason ?? null,
  });
}
