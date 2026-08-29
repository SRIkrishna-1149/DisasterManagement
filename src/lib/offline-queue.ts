/**
 * Priority-aware IndexedDB queue for emergency operations.
 * Nothing is ever marked TRANSMITTED without a server acknowledgement.
 */
import type { Severity, TransmissionState } from "./domain";

export type QueueKind = "SOS" | "RESPONDER_NOTIFICATION" | "SOS_UPDATE" | "COMMUNITY_REPORT";

export interface QueuedOperation {
  id: string; // idempotency key — server deduplicates on this
  kind: QueueKind;
  priority: number; // lower runs first
  payload: Record<string, unknown>;
  state: TransmissionState;
  attempts: number;
  nextAttemptAt: number;
  lastError?: string;
  createdAt: string;
  serverId?: string;
}

const DB_NAME = "sentinel-emergency";
const STORE = "queue";
const CACHE_STORE = "cache";

function isBrowser() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(CACHE_STORE)) db.createObjectStore(CACHE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const request = fn(db.transaction(store, mode).objectStore(store));
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error);
  });
}

export function priorityFor(kind: QueueKind, severity?: Severity): number {
  if (kind === "SOS") return severity === "CRITICAL" ? 0 : 1;
  if (kind === "RESPONDER_NOTIFICATION") return severity === "CRITICAL" ? 0 : 1;
  if (kind === "SOS_UPDATE") return 2;
  return 3;
}

export async function enqueue(op: QueuedOperation): Promise<void> {
  if (!isBrowser()) return;
  await tx(STORE, "readwrite", (s) => s.put(op));
  notify();
  requestBackgroundSync();
}

/** Ask the service worker to wake the app when the browser supports Background Sync. */
function requestBackgroundSync(): void {
  if (!("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.ready
    .then((registration) => {
      const sync = (
        registration as ServiceWorkerRegistration & {
          sync?: { register: (tag: string) => Promise<void> };
        }
      ).sync;
      return sync?.register("sentinel-emergency-sync");
    })
    .catch(() => {
      // Online/reconnect listeners remain the supported fallback when Background Sync is absent.
    });
}

export async function listQueue(): Promise<QueuedOperation[]> {
  if (!isBrowser()) return [];
  const all = await tx<QueuedOperation[]>(STORE, "readonly", (s) => s.getAll());
  return all.sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt));
}

export async function updateOperation(id: string, patch: Partial<QueuedOperation>): Promise<void> {
  if (!isBrowser()) return;
  const current = await tx<QueuedOperation | undefined>(STORE, "readonly", (s) => s.get(id));
  if (!current) return;
  await tx(STORE, "readwrite", (s) => s.put({ ...current, ...patch }));
  notify();
}

export async function removeOperation(id: string): Promise<void> {
  if (!isBrowser()) return;
  await tx(STORE, "readwrite", (s) => s.delete(id));
  notify();
}

export async function cacheSet(key: string, value: unknown): Promise<void> {
  if (!isBrowser()) return;
  await tx(CACHE_STORE, "readwrite", (s) => s.put({ value, cachedAt: Date.now() }, key));
}

export async function cacheGet<T>(key: string): Promise<{ value: T; cachedAt: number } | null> {
  if (!isBrowser()) return null;
  const result = await tx<{ value: T; cachedAt: number } | undefined>(
    CACHE_STORE,
    "readonly",
    (s) => s.get(key),
  );
  return result ?? null;
}

/** Exponential backoff with jitter, capped at 5 minutes. */
export function backoffMs(attempts: number): number {
  return Math.min(300_000, 2 ** attempts * 1000) + Math.floor(Math.random() * 500);
}

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeQueue(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  listeners.forEach((l) => l());
}
