import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  formatTimeAgo,
  riskLevel,
  type DataQuality,
  type RiskLevel,
  type Severity,
  type SosStatus,
  SOS_STATUS_LABEL,
} from "@/lib/domain";

/* ---------------- Buttons ---------------- */

type ButtonVariant = "primary" | "danger" | "ghost" | "outline" | "success";
type ButtonSize = "sm" | "md" | "lg" | "xl";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:brightness-110",
  danger: "bg-destructive text-destructive-foreground hover:brightness-110",
  success: "bg-safe text-primary-foreground hover:brightness-110",
  outline: "border border-border bg-surface text-foreground hover:bg-surface-2",
  ghost: "text-muted-foreground hover:bg-surface hover:text-foreground",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 text-xs",
  md: "min-h-11 px-4 text-sm",
  lg: "min-h-13 px-5 text-base",
  xl: "min-h-16 px-6 text-lg",
};

export function Button({
  variant = "outline",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-[filter,background-color] disabled:cursor-not-allowed disabled:opacity-55",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
    />
  );
}

/* ---------------- Layout ---------------- */

export function Panel({
  title,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("panel p-4 sm:p-5", className)}>
      {(title || action) && (
        <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {typeof title === "string" ? (
            <h2 className="text-sm font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              {title}
            </h2>
          ) : (
            title
          )}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface/60 p-3">
      <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      <p className="font-display mt-1 text-2xl leading-none font-bold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/* ---------------- Status indicators (never colour-only) ---------------- */

const RISK_STYLE: Record<RiskLevel, { bg: string; icon: string }> = {
  LOW: { bg: "bg-low/15 text-low border-low/40", icon: "●" },
  MODERATE: { bg: "bg-moderate/15 text-moderate border-moderate/40", icon: "▲" },
  HIGH: { bg: "bg-high/15 text-high border-high/40", icon: "▲▲" },
  EXTREME: { bg: "bg-destructive/20 text-destructive border-destructive/50", icon: "✖" },
};

export function RiskBadge({ score, showScore = true }: { score: number; showScore?: boolean }) {
  const level = riskLevel(score);
  const style = RISK_STYLE[level];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-bold tracking-wide",
        style.bg,
      )}
      aria-label={`Risk level ${level}${showScore ? `, score ${score} of 100` : ""}`}
    >
      <span aria-hidden>{style.icon}</span>
      {level}
      {showScore && <span className="font-mono opacity-80">{score}</span>}
    </span>
  );
}

const SEVERITY_STYLE: Record<Severity, string> = {
  LOW: "bg-low/15 text-low border-low/40",
  MEDIUM: "bg-moderate/15 text-moderate border-moderate/40",
  HIGH: "bg-high/15 text-high border-high/40",
  CRITICAL: "bg-destructive/20 text-destructive border-destructive/50",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={cn(
        "rounded-md border px-2 py-0.5 text-[11px] font-bold",
        SEVERITY_STYLE[severity],
      )}
    >
      {severity}
    </span>
  );
}

export function StatusPill({ status }: { status: SosStatus }) {
  const closed = ["RESOLVED", "REJECTED", "CANCELLED", "DUPLICATE"].includes(status);
  const active = ["DISPATCHED", "EN_ROUTE", "ARRIVED", "RESCUE_IN_PROGRESS"].includes(status);
  return (
    <span
      className={cn(
        "rounded-md border px-2 py-0.5 text-[11px] font-semibold",
        closed && "border-border bg-muted text-muted-foreground",
        active && "border-primary/50 bg-primary/15 text-primary",
        !closed && !active && "border-moderate/40 bg-moderate/15 text-moderate",
      )}
    >
      {SOS_STATUS_LABEL[status]}
    </span>
  );
}

const QUALITY_STYLE: Record<DataQuality, { label: string; className: string; icon: string }> = {
  LIVE: { label: "Live", className: "border-safe/50 bg-safe/15 text-safe", icon: "◉" },
  RECENT: { label: "Recent", className: "border-primary/40 bg-primary/10 text-primary", icon: "◎" },
  STALE: {
    label: "Stale",
    className: "border-moderate/40 bg-moderate/10 text-moderate",
    icon: "◔",
  },
  CACHED: {
    label: "Cached",
    className: "border-stale/40 bg-muted text-muted-foreground",
    icon: "▣",
  },
  SIMULATED: {
    label: "Simulated",
    className: "border-accent/50 bg-accent/15 text-accent",
    icon: "⚠",
  },
  UNAVAILABLE: {
    label: "Unavailable",
    className: "border-border bg-muted text-muted-foreground",
    icon: "—",
  },
};

export function DataTag({ quality, at }: { quality: DataQuality; at?: string | null }) {
  const style = QUALITY_STYLE[quality];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wide uppercase",
        style.className,
      )}
      title={at ? `Updated ${formatTimeAgo(at)}` : undefined}
    >
      <span aria-hidden>{style.icon}</span>
      {style.label}
      {at && <span className="opacity-70">· {formatTimeAgo(at)}</span>}
    </span>
  );
}

/* ---------------- Async states ---------------- */

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
      <span
        className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"
        aria-hidden
      />
      {label}…
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
    >
      <p className="font-semibold text-destructive">Something went wrong</p>
      <p className="mt-1 text-muted-foreground">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
      {message}
    </p>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block font-medium text-foreground">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full min-h-11 rounded-lg border border-input bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring";
