import type { Severity } from "./domain";

export interface ReportSosRecord {
  status: string;
  severity: Severity;
  category: string;
  created_at: string;
  validated_at: string | null;
}

export interface ReportAlertRecord {
  level: string;
  issued_at: string;
}

export interface ReportCommunityRecord {
  verification_status: string;
  created_at: string;
}

export interface ReportTeamRecord {
  status: string;
}

export interface ReportAnalytics {
  sosCount: number;
  activeIncidents: number;
  validatedCount: number;
  resolvedCount: number;
  averageValidationMinutes: number | null;
  communityReports: number;
  verifiedReports: number;
  alertHistory: number;
  availableTeams: number;
  deployedTeams: number;
  severityDistribution: Record<Severity, number>;
  alertDistribution: Record<string, number>;
  sevenDayTrend: Array<{ label: string; sos: number; reports: number }>;
}

const CLOSED_SOS = new Set(["RESOLVED", "REJECTED", "CANCELLED", "DUPLICATE"]);

export function calculateReportAnalytics({
  sos,
  alerts,
  reports,
  teams,
  now = Date.now(),
}: {
  sos: ReportSosRecord[];
  alerts: ReportAlertRecord[];
  reports: ReportCommunityRecord[];
  teams: ReportTeamRecord[];
  now?: number;
}): ReportAnalytics {
  const validated = sos.filter((item) => item.validated_at);
  const validationMinutes = validated.map(
    (item) =>
      (new Date(item.validated_at!).getTime() - new Date(item.created_at).getTime()) / 60_000,
  );
  const severityDistribution: Record<Severity, number> = {
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
    CRITICAL: 0,
  };
  for (const item of sos) severityDistribution[item.severity] += 1;

  const alertDistribution: Record<string, number> = {};
  for (const alert of alerts)
    alertDistribution[alert.level] = (alertDistribution[alert.level] ?? 0) + 1;

  const sevenDayTrend = Array.from({ length: 7 }, (_, index) => {
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    dayStart.setDate(dayStart.getDate() - (6 - index));
    const nextDay = new Date(dayStart);
    nextDay.setDate(nextDay.getDate() + 1);
    const inDay = (createdAt: string) => {
      const timestamp = new Date(createdAt).getTime();
      return timestamp >= dayStart.getTime() && timestamp < nextDay.getTime();
    };
    return {
      label: dayStart.toLocaleDateString(undefined, { weekday: "short" }),
      sos: sos.filter((item) => inDay(item.created_at)).length,
      reports: reports.filter((item) => inDay(item.created_at)).length,
    };
  });

  return {
    sosCount: sos.length,
    activeIncidents: sos.filter((item) => !CLOSED_SOS.has(item.status)).length,
    validatedCount: validated.length,
    resolvedCount: sos.filter((item) => item.status === "RESOLVED").length,
    averageValidationMinutes:
      validationMinutes.length > 0
        ? Math.round(
            validationMinutes.reduce((sum, value) => sum + value, 0) / validationMinutes.length,
          )
        : null,
    communityReports: reports.length,
    verifiedReports: reports.filter((item) => item.verification_status === "VERIFIED").length,
    alertHistory: alerts.length,
    availableTeams: teams.filter((item) => item.status === "AVAILABLE").length,
    deployedTeams: teams.filter((item) => item.status === "DEPLOYED").length,
    severityDistribution,
    alertDistribution,
    sevenDayTrend,
  };
}
