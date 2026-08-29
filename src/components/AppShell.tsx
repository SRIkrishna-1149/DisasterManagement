import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useConnection, useOfflineQueue } from "@/hooks/useConnectivity";
import { FEATURE_FLAGS } from "@/lib/domain";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "./kit";

interface NavItem {
  to: string;
  label: string;
  icon: string;
  operatorOnly?: boolean;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { to: "/", label: "Emergency", icon: "◈" },
  { to: "/map", label: "Live map", icon: "◎" },
  { to: "/alerts", label: "Alerts", icon: "⚠" },
  { to: "/sos", label: "Send SOS", icon: "✚" },
  { to: "/resources", label: "Shelters", icon: "⌂" },
  { to: "/reports", label: "Reports", icon: "✎" },
  { to: "/rescue", label: "Operations", icon: "⛑", operatorOnly: true },
  { to: "/admin", label: "Command", icon: "▦", adminOnly: true },
];

export function ConnectionStatus() {
  const connection = useConnection();
  const queue = useOfflineQueue();
  const map = {
    LIVE: { dot: "bg-safe", text: "Live" },
    RECONNECTING: { dot: "bg-moderate", text: "Reconnecting" },
    OFFLINE: { dot: "bg-destructive", text: "Offline" },
  } as const;
  const state = map[connection];
  return (
    <div className="flex items-center gap-2 text-xs" role="status" aria-live="polite">
      <span className={cn("h-2.5 w-2.5 rounded-full", state.dot)} aria-hidden />
      <span className="font-semibold">{state.text}</span>
      {queue.length > 0 && (
        <Link
          to="/my-sos"
          className="rounded border border-accent/50 bg-accent/15 px-1.5 py-0.5 text-accent"
        >
          {queue.length} waiting to transmit
        </Link>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, isOperator, isAdmin } = useAuth();
  const connection = useConnection();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const items = NAV.filter(
    (item) => (!item.operatorOnly || isOperator) && (!item.adminOnly || isAdmin),
  ).filter((item, index, all) => all.findIndex((candidate) => candidate.to === item.to) === index);
  // Keep every authorised destination reachable on mobile, including Reports
  // and operator/admin workspaces. The nav itself scrolls instead of hiding a
  // required destination at narrow widths.
  const mobileItems = items;

  return (
    <div className="flex min-h-screen w-full flex-col lg:flex-row">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-surface/60 p-4 lg:flex">
        <Link to="/" className="mb-6 block">
          <p className="font-display text-lg font-bold tracking-tight">SENTINEL</p>
          <p className="text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
            Predict · Alert · Respond
          </p>
        </Link>
        <nav className="flex flex-1 flex-col gap-1" aria-label="Main">
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                pathname === item.to && "bg-primary/15 text-primary",
              )}
            >
              <span aria-hidden className="w-4 text-center">
                {item.icon}
              </span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <ConnectionStatus />
          {FEATURE_FLAGS.ENABLE_DEMO_MODE && (
            <p className="rounded border border-accent/40 bg-accent/10 px-2 py-1.5 text-[11px] text-accent">
              ⚠ DEMO MODE — environmental data is simulated
            </p>
          )}
          {user ? (
            <div className="space-y-2 text-xs text-muted-foreground">
              <p className="truncate">{user.email}</p>
              <Button size="sm" variant="ghost" onClick={() => void supabase.auth.signOut()}>
                Sign out
              </Button>
            </div>
          ) : (
            <Link to="/auth" className="block">
              <Button size="sm" variant="primary" className="w-full">
                Sign in
              </Button>
            </Link>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur lg:hidden">
          <Link to="/" className="font-display text-base font-bold">
            SENTINEL
          </Link>
          <ConnectionStatus />
        </header>

        {connection === "OFFLINE" && (
          <div
            role="status"
            className="border-b border-accent/40 bg-accent/15 px-4 py-2 text-xs text-accent"
          >
            OFFLINE MODE — showing last known information. Emergency requests are stored on this
            device and retried automatically.
          </div>
        )}

        <main
          id="main"
          className="mx-auto w-full max-w-[1600px] flex-1 px-3 pt-4 pb-28 sm:px-5 lg:pb-8"
        >
          {children}
        </main>

        {/* Mobile bottom navigation — SOS always reachable */}
        <nav
          className="fixed inset-x-0 bottom-0 z-30 flex overflow-x-auto border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
          aria-label="Primary"
        >
          {mobileItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex min-h-16 min-w-16 flex-1 flex-col items-center justify-center gap-1 px-1 text-[10px] font-semibold",
                item.to === "/sos" ? "text-destructive" : "text-muted-foreground",
                pathname === item.to && "text-primary",
              )}
            >
              <span aria-hidden className="text-lg leading-none">
                {item.icon}
              </span>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
