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

/**
 * Operating region: Andhra Pradesh, India. All demo geography must stay inside
 * these bounds — nothing outside AP is generated or displayed.
 */
export const AP_BOUNDS = {
  minLat: 12.62,
  maxLat: 19.92,
  minLng: 76.75,
  maxLng: 84.8,
} as const;

/** Default operational focus — Krishna district / Vijayawada. */
export const AP_CENTER = { lat: 16.5062, lng: 80.648 } as const;

/** Default viewport for the operations map (Krishna–Guntur corridor). */
export const AP_DEFAULT_VIEWPORT = {
  minLat: 16.18,
  maxLat: 16.72,
  minLng: 80.28,
  maxLng: 80.86,
} as const;

export function isInsideAndhraPradesh(lat: number, lng: number): boolean {
  return (
    lat >= AP_BOUNDS.minLat &&
    lat <= AP_BOUNDS.maxLat &&
    lng >= AP_BOUNDS.minLng &&
    lng <= AP_BOUNDS.maxLng
  );
}

export const LANDMARKS = [
  { name: "Vijayawada Railway Station", lat: 16.5175, lng: 80.6194 },
  { name: "Government General Hospital, Vijayawada", lat: 16.515, lng: 80.63 },
  { name: "Kanaka Durga Temple, Indrakeeladri", lat: 16.5133, lng: 80.6083 },
  { name: "Pandit Nehru Bus Station, Vijayawada", lat: 16.5107, lng: 80.6255 },
  { name: "Krishna District Collectorate", lat: 16.5085, lng: 80.6205 },
  { name: "Prakasam Barrage, Krishna River", lat: 16.4993, lng: 80.6094 },
  { name: "Guntur Municipal Corporation Office", lat: 16.3067, lng: 80.4365 },
  { name: "Amaravati Secretariat Junction", lat: 16.573, lng: 80.358 },
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
