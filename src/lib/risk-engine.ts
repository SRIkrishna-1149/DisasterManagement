/**
 * Replaceable risk-engine interface.
 *
 * The active implementation is a TRANSPARENT RULE-BASED engine — it is not a
 * trained machine-learning model and never reports a fabricated confidence.
 * A future model can implement `RiskEngine` without touching the UI.
 */
import { riskLevel, type DataQuality, type RiskLevel } from "./domain";

export interface RiskFactorContribution {
  label: string;
  value: string;
  points: number;
  weight: number;
}

export interface RiskAssessment {
  score: number;
  level: RiskLevel;
  factors: RiskFactorContribution[];
  engine: string;
  confidence: string | null;
  dataQuality: DataQuality;
  generatedAt: string;
  disasterType: string;
}

export interface EnvironmentReading {
  rainfallMmPerHour: number;
  rainfall24hMm: number;
  windKph: number;
  temperatureC: number;
  humidityPct: number;
  waterLevelM: number;
  terrainVulnerability: number; // 0..1
  historicalEventCount: number;
  communityReports: number;
  sosDensity: number;
  quality: DataQuality;
  observedAt: string;
  sources: string[];
}

export interface RiskEngine {
  readonly id: string;
  assess(reading: EnvironmentReading, disasterType: string): RiskAssessment;
  forecast(reading: EnvironmentReading, disasterType: string): { offsetHours: number; assessment: RiskAssessment }[];
}

const WEIGHTS = {
  rainfall: 25,
  accumulation: 15,
  water: 20,
  wind: 10,
  terrain: 10,
  history: 5,
  community: 8,
  sos: 7,
} as const;

function scale(value: number, max: number): number {
  return Math.max(0, Math.min(1, value / max));
}

export const ruleBasedEngine: RiskEngine = {
  id: "rule-based-v1",

  assess(reading, disasterType) {
    const factors: RiskFactorContribution[] = [
      {
        label: "Rainfall intensity",
        value: `${reading.rainfallMmPerHour.toFixed(1)} mm/h`,
        weight: WEIGHTS.rainfall,
        points: Math.round(WEIGHTS.rainfall * scale(reading.rainfallMmPerHour, 30)),
      },
      {
        label: "24-hour accumulation",
        value: `${reading.rainfall24hMm.toFixed(0)} mm`,
        weight: WEIGHTS.accumulation,
        points: Math.round(WEIGHTS.accumulation * scale(reading.rainfall24hMm, 220)),
      },
      {
        label: "Water level",
        value: `${reading.waterLevelM.toFixed(2)} m`,
        weight: WEIGHTS.water,
        points: Math.round(WEIGHTS.water * scale(reading.waterLevelM, 4)),
      },
      {
        label: "Wind speed",
        value: `${reading.windKph.toFixed(0)} km/h`,
        weight: WEIGHTS.wind,
        points: Math.round(WEIGHTS.wind * scale(reading.windKph, 120)),
      },
      {
        label: "Terrain vulnerability",
        value: `${Math.round(reading.terrainVulnerability * 100)}%`,
        weight: WEIGHTS.terrain,
        points: Math.round(WEIGHTS.terrain * reading.terrainVulnerability),
      },
      {
        label: "Historical events",
        value: `${reading.historicalEventCount} recorded`,
        weight: WEIGHTS.history,
        points: Math.round(WEIGHTS.history * scale(reading.historicalEventCount, 6)),
      },
      {
        label: "Community reports",
        value: `${reading.communityReports} in area`,
        weight: WEIGHTS.community,
        points: Math.round(WEIGHTS.community * scale(reading.communityReports, 10)),
      },
      {
        label: "SOS density",
        value: `${reading.sosDensity} active`,
        weight: WEIGHTS.sos,
        points: Math.round(WEIGHTS.sos * scale(reading.sosDensity, 8)),
      },
    ];

    const score = Math.min(100, factors.reduce((s, f) => s + f.points, 0));
    return {
      score,
      level: riskLevel(score),
      factors,
      engine: ruleBasedEngine.id,
      // Rule-based engine produces no statistical confidence. Never fabricate one.
      confidence: null,
      dataQuality: reading.quality,
      generatedAt: new Date().toISOString(),
      disasterType,
    };
  },

  forecast(reading, disasterType) {
    const offsets = [0, 3, 6, 12, 24];
    return offsets.map((offsetHours) => {
      // Deterministic projection of the same rules over the forecast horizon.
      const decay = offsetHours === 0 ? 1 : 1 + Math.sin(offsetHours / 5) * 0.35;
      const projected: EnvironmentReading = {
        ...reading,
        rainfallMmPerHour: Math.max(0, reading.rainfallMmPerHour * decay),
        rainfall24hMm: reading.rainfall24hMm + reading.rainfallMmPerHour * offsetHours * 0.6,
        waterLevelM: Math.max(0, reading.waterLevelM * (1 + offsetHours * 0.02 * (decay - 0.6))),
      };
      return { offsetHours, assessment: ruleBasedEngine.assess(projected, disasterType) };
    });
  },
};

/**
 * DEMO reading generator. Always tagged SIMULATED so the UI can never present
 * it as live observed data.
 */
export function simulatedReading(seedMinutes = 0): EnvironmentReading {
  const t = (Date.now() / 600_000 + seedMinutes) % 24;
  const wave = (Math.sin(t) + 1) / 2;
  return {
    rainfallMmPerHour: 4 + wave * 18,
    rainfall24hMm: 60 + wave * 120,
    windKph: 18 + wave * 40,
    temperatureC: 27 - wave * 3,
    humidityPct: 74 + wave * 20,
    waterLevelM: 1.1 + wave * 2.1,
    terrainVulnerability: 0.55,
    historicalEventCount: 4,
    communityReports: 0,
    sosDensity: 0,
    quality: "SIMULATED",
    observedAt: new Date().toISOString(),
    sources: ["Demo generator"],
  };
}
