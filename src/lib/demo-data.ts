import { AP_CENTER } from "./domain";
import type { AlertLevel } from "./domain";

/**
 * Central, deterministic demo scenario. The phase advances every ten minutes,
 * but record IDs and locations remain stable throughout the scenario lifecycle.
 * This data is never presented as live or persisted as a real emergency.
 */
export interface DemoAlert {
  id: string;
  title: string;
  message: string;
  level: AlertLevel;
  disaster_type: string;
  area_name: string;
  latitude: number;
  longitude: number;
  radius_km: number;
  recommended_action: string;
  reason: string;
  risk_score: number;
  approval_required: boolean;
  approval_status: "DEMO";
  delivery_status: "SIMULATED";
  issued_at: string;
  expires_at: string;
  simulated: true;
}

const DEMO_CYCLE_MS = 10 * 60_000;
const PHASES = [
  {
    level: "WATCH" as const,
    score: 58,
    title: "Heavy rainfall near Vijayawada",
    message:
      "Rainfall is increasing across low-lying Krishna district areas in this simulated scenario.",
    action: "Monitor official guidance and keep essential items ready.",
  },
  {
    level: "WARNING" as const,
    score: 72,
    title: "Flood risk increasing near low-lying areas",
    message: "The simulated water-level trend is rising around the Vijayawada river corridor.",
    action: "Move valuables higher and identify the nearest verified shelter.",
  },
  {
    level: "CRITICAL" as const,
    score: 86,
    title: "Simulated water level alert",
    message: "A high-impact flood scenario is active for the Vijayawada response zone.",
    action: "Follow current official evacuation instructions; do not enter floodwater.",
  },
  {
    level: "WARNING" as const,
    score: 74,
    title: "Road blockage reported in the demo scenario",
    message: "A simulated blockage may affect travel near the Krishna river approach.",
    action: "Verify road conditions before travelling and keep an alternate destination ready.",
  },
] as const;

export function getDemoAlerts(now = Date.now()): DemoAlert[] {
  const cycleStart = Math.floor(now / DEMO_CYCLE_MS) * DEMO_CYCLE_MS;
  const phase = PHASES[Math.floor(now / DEMO_CYCLE_MS) % PHASES.length]!;
  const issuedAt = new Date(cycleStart).toISOString();
  const expiresAt = new Date(cycleStart + DEMO_CYCLE_MS * 2).toISOString();

  return [
    {
      id: "demo-vijayawada-risk",
      title: phase.title,
      message: phase.message,
      level: phase.level,
      disaster_type: "Flood",
      area_name: "Vijayawada · Krishna district",
      latitude: AP_CENTER.lat,
      longitude: AP_CENTER.lng,
      radius_km: 12,
      recommended_action: phase.action,
      reason: "Transparent rule-based demo scenario; no live weather or sensor feed is connected.",
      risk_score: phase.score,
      approval_required: false,
      approval_status: "DEMO",
      delivery_status: "SIMULATED",
      issued_at: issuedAt,
      expires_at: expiresAt,
      simulated: true,
    },
  ];
}
