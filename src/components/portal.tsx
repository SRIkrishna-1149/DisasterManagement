import { Link } from "@tanstack/react-router";
import { MapPin, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { LOCATION_CONFIDENCE, type LocationSource } from "@/lib/domain";
import { AppShell } from "./AppShell";
import { Button, LoadingState, Panel } from "./kit";

export function PageFrame({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <AppShell>
      <div className="space-y-5">
        <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-[11px] font-semibold tracking-[0.2em] text-primary uppercase">
              {eyebrow}
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
            {description && (
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </header>
        {children}
      </div>
    </AppShell>
  );
}

export function AuthGate({ children, role }: { children: ReactNode; role?: "operator" | "admin" }) {
  const { loading, user, isOperator, isAdmin } = useAuth();
  if (loading)
    return (
      <AppShell>
        <LoadingState label="Restoring secure session" />
      </AppShell>
    );
  const allowed = !!user && (!role || (role === "operator" ? isOperator : isAdmin));
  if (allowed) return <>{children}</>;
  return (
    <AppShell>
      <Panel className="mx-auto mt-10 max-w-lg text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-accent" aria-hidden />
        <h1 className="mt-4 text-2xl font-bold">Secure sign-in required</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {role
            ? "This workspace is limited to authorised response personnel."
            : "Sign in to manage your emergency requests."}
        </p>
        <Link to="/auth" className="mt-5 inline-block">
          <Button variant="primary">Sign in securely</Button>
        </Link>
      </Panel>
    </AppShell>
  );
}

export function LocationConfidence({
  source,
  accuracyM,
  updatedAt,
}: {
  source: LocationSource;
  accuracyM?: number | null;
  updatedAt?: string | null;
}) {
  const confidence = LOCATION_CONFIDENCE[source];
  return (
    <div className="flex items-start gap-2 text-xs text-muted-foreground">
      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
      <span>
        <span className="font-semibold text-foreground">{confidence.label}</span> · confidence{" "}
        {confidence.confidence}
        {accuracyM !== null && accuracyM !== undefined
          ? ` · accuracy ${Math.round(accuracyM)} m`
          : ""}
        {updatedAt
          ? ` · captured ${new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
          : ""}
      </span>
    </div>
  );
}

export function SectionIntro({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="font-mono text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{children}</p>
    </div>
  );
}
