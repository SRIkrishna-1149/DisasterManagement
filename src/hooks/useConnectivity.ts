import { useEffect, useState } from "react";
import { listQueue, subscribeQueue, type QueuedOperation } from "@/lib/offline-queue";
import { flushQueue } from "@/lib/sos-service";

export type ConnectionState = "LIVE" | "RECONNECTING" | "OFFLINE";

export function useConnection(): ConnectionState {
  const [state, setState] = useState<ConnectionState>("LIVE");

  useEffect(() => {
    const update = () => setState(navigator.onLine ? "LIVE" : "OFFLINE");
    update();
    const onOnline = () => {
      setState("RECONNECTING");
      void flushQueue().finally(() => setState(navigator.onLine ? "LIVE" : "OFFLINE"));
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", update);
    };
  }, []);

  return state;
}

export function useOfflineQueue() {
  const [queue, setQueue] = useState<QueuedOperation[]>([]);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void listQueue().then((items) => {
        if (active) setQueue(items);
      });
    };
    refresh();
    const unsubscribe = subscribeQueue(refresh);
    const interval = window.setInterval(() => {
      void flushQueue().then(refresh);
    }, 15_000);
    return () => {
      active = false;
      unsubscribe();
      window.clearInterval(interval);
    };
  }, []);

  return queue;
}
