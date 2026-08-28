/**
 * Central domain definitions. All emergency status vocabulary, thresholds and
 * scoring weights live here so no business rule is duplicated inside the UI.
 */

export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type SosStatus =
  | "UNVERIFIED"
  | "VALIDATED"
  | "REJECTED"
  | "NEEDS_MORE_INFORMATION"
  | "ASSIGNED"
  | "DISPATCHED"
  | "EN_ROUTE"
  | "ARRIVED"
  | "RESCUE_IN_PROGRESS"
  | "RESOLVED"
  | "CANCELLED"
  | "DUPLICATE";

export type TransmissionState =
  | "QUEUED"
  | "SYNCING"
  | "TRANSMITTED"
  | "FAILED_RETRYING"
  | "FAILED";

export type DataQuality = "LIVE" | "RECENT" | "STALE" | "CACHED" | "SIMULATED" | "UNAVAILABLE";

export type LocationSource = "GPS" | "MANUAL_PIN" | "LANDMARK";

export type AlertLevel = "INFO" | "WATCH" | "WARNING" | "CRITICAL";

export const SOS_CATEGORIES = [
  { value: "trapped", label: "Trapped" },
  { value: "flooded_home", label: "Flooded home" },
  { value: "medical", label: "Medical emergency" },
  { value: "injury", label: "Injury" },
  { value: "missing_person", label: "Missing person" },
  { value: "supplies", label: "Food / water shortage" },
  { value: "evacuation", label: "Evacuation required" },
  { value: "assistance", label: "Elderly / child assistance" },
  { value: "other", label: "Other" },
] as const;

export const REPORT_TYPES = [
  "Flooding",
  "Blocked road",
  "Fallen tree",
  "Rising water",
  "Infrastructure damage",
  "Missing people",
  "Unsafe area",
  "Resource shortage",
] as const;

export const SEVERITIES: Severity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export const SOS_STATUS_LABEL: Record<SosStatus, string> = {
  UNVERIFIED: "Awaiting validation",
  VALIDATED: "Validated",
  REJECTED: "Rejected",
  NEEDS_MORE_INFORMATION: "More information needed",
  ASSIGNED: "Team assigned",
  DISPATCHED: "Dispatched",
  EN_ROUTE: "Team en route",
  ARRIVED: "Team arrived",
  RESCUE_IN_PROGRESS: "Rescue in progress",
  RESOLVED: "Resolved",
  CANCELLED: "Cancelled",
  DUPLICATE: "Merged duplicate",
};

/** Ordered community-facing progress track. */
export const SOS_TRACK: SosStatus[] = [
  "UNVERIFIED",
  "VALIDATED",
  "ASSIGNED",
  "DISPATCHED",
  "EN_ROUTE",
  "ARRIVED",
  "RESCUE_IN_PROGRESS",
  "RESOLVED",
];

export const ALLOWED_TRANSITIONS: Record<SosStatus, SosStatus[]> = {
  UNVERIFIED: ["VALIDATED", "REJECTED", "NEEDS_MORE_INFORMATION", "DUPLICATE", "CANCELLED"],
  NEEDS_MORE_INFORMATION: ["UNVERIFIED", "VALIDATED", "REJECTED", "CANCELLED", "DUPLICATE"],
  VALIDATED: ["ASSIGNED", "REJECTED", "DUPLICATE", "CANCELLED"],
  ASSIGNED: ["DISPATCHED", "VALIDATED", "CANCELLED"],
  DISPATCHED: ["EN_ROUTE", "CANCELLED"],
  EN_ROUTE: ["ARRIVED", "CANCELLED"],
  ARRIVED: ["RESCUE_IN_PROGRESS", "CANCELLED"],
  RESCUE_IN_PROGRESS: ["RESOLVED", "CANCELLED"],
  RESOLVED: [],
  REJECTED: [],
  CANCELLED: [],
  DUPLICATE: [],
};

/* ------------------------------------------------------------------ */
/* Risk thresholds — centrally configurable                            */
/* ------------------------------------------------------------------ */

export const RISK_THRESHOLDS = { low: 30, moderate: 60, high: 80 } as const;

export type RiskLevel = "LOW" | "MODERATE" | "HIGH" | "EXTREME";

export function riskLevel(score: number): RiskLevel {
  if (score <= RISK_THRESHOLDS.low) return "LOW";
  if (score <= RISK_THRESHOLDS.moderate) return "MODERATE";
  if (score <= RISK_THRESHOLDS.high) return "HIGH";
  return "EXTREME";
}

/* ------------------------------------------------------------------ */
/* Rescue prioritisation — explainable, weighted, configurable         */
/* ------------------------------------------------------------------ */

export const PRIORITY_WEIGHTS = {
  severity: 30,
  peopleAffected: 20,
  medical: 20,
  locationRisk: 10,
  waitingTime: 5,
  vulnerability: 5,
  distance: 5,
  verification: 5,
} as const;

export interface PriorityInput {
  severity: Severity;
  peopleCount: number;
  hasMedicalEmergency: boolean;
  hasVulnerablePeople: boolean;
  areaRiskScore: number | null;
  createdAt: string;
  distanceKm: number | null;
  verified: boolean;
}

export interface PriorityFactor {
  label: string;
  points: number;
  max: number;
  detail: string;
}

export interface PriorityResult {
  score: number;
  factors: PriorityFactor[];
}

const SEVERITY_FRACTION: Record<Severity, number> = {
  CRITICAL: 1,
  HIGH: 0.72,
  MEDIUM: 0.4,
  LOW: 0.15,
};

export function calculatePriority(input: PriorityInput): PriorityResult {
  const w = PRIORITY_WEIGHTS;
  const waitedHours = Math.max(0, (Date.now() - new Date(input.createdAt).getTime()) / 3_600_000);

  const factors: PriorityFactor[] = [
    {
      label: "Severity",
      max: w.severity,
      points: Math.round(w.severity * SEVERITY_FRACTION[input.severity]),
      detail: input.severity,
    },
    {
      label: "People affected",
      max: w.peopleAffected,
      points: Math.round(w.peopleAffected * Math.min(1, input.peopleCount / 8)),
      detail: `${input.peopleCount} ${input.peopleCount === 1 ? "person" : "people"}`,
    },
    {
      label: "Medical emergency",
      max: w.medical,
      points: input.hasMedicalEmergency ? w.medical : 0,
      detail: input.hasMedicalEmergency ? "Reported" : "Not reported",
    },
    {
      label: "Location risk",
      max: w.locationRisk,
      points:
        input.areaRiskScore === null
          ? 0
          : Math.round(w.locationRisk * Math.min(1, input.areaRiskScore / 100)),
      detail: input.areaRiskScore === null ? "No area assessment" : `Area risk ${input.areaRiskScore}`,
    },
    {
      label: "Waiting time",
      max: w.waitingTime,
      points: Math.round(w.waitingTime * Math.min(1, waitedHours / 3)),
      detail: `${waitedHours < 1 ? `${Math.round(waitedHours * 60)} min` : `${waitedHours.toFixed(1)} h`} waiting`,
    },
    {
      label: "Vulnerability",
      max: w.vulnerability,
      points: input.hasVulnerablePeople ? w.vulnerability : 0,
      detail: input.hasVulnerablePeople ? "Children / elderly present" : "None reported",
    },
    {
      label: "Distance",
      max: w.distance,
      points:
        input.distanceKm === null
          ? 0
          : Math.round(w.distance * Math.max(0, 1 - Math.min(1, input.distanceKm / 20))),
      detail: input.distanceKm === null ? "Distance unknown" : `${input.distanceKm.toFixed(1)} km away`,
    },
    {
      label: "Verification",
      max: w.verification,
      points: input.verified ? w.verification : 0,
      detail: input.verified ? "Validated by operator" : "Not yet validated",
    },
  ];

  const score = Math.min(100, factors.reduce((sum, f) => sum + f.points, 0));
  return { score, factors };
}

export const LOCATION_CONFIDENCE: Record<LocationSource, { label: string; confidence: string }> = {
  GPS: { label: "GPS", confidence: "HIGH" },
  MANUAL_PIN: { label: "Manual pin", confidence: "MEDIUM" },
  LANDMARK: { label: "Landmark", confidence: "APPROXIMATE" },
};

export const LANDMARKS = [
  { name: "Central Community School", lat: 12.9738, lng: 77.5975 },
  { name: "City General Hospital", lat: 12.965, lng: 77.59 },
  { name: "Main Bus Station", lat: 12.9772, lng: 77.5721 },
  { name: "District Government Office", lat: 12.9698, lng: 77.5865 },
  { name: "Riverside Temple", lat: 12.9805, lng: 77.6088 },
  { name: "Hilltop Park Safe Zone", lat: 13.005, lng: 77.605 },
  { name: "North Ring Road Junction", lat: 12.995, lng: 77.58 },
] as const;

export const FEATURE_FLAGS = {
  ENABLE_LIVE_WEATHER: false,
  ENABLE_PUSH_NOTIFICATIONS: false,
  ENABLE_AI_RISK_MODEL: false,
  ENABLE_OFFLINE_QUEUE: true,
  ENABLE_DEMO_MODE: true,
} as const;

export function formatTimeAgo(iso: string | null | undefined): string {
  if (!iso) return "unknown";
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

export function localTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
  });
}
