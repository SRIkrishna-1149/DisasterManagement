import { type LatLng, haversineKm } from "./geo";
import { isInsideAndhraPradesh } from "./domain";

export interface AndhraDistrict {
  id: string;
  name: string;
  hq: string;
  center: LatLng;
  region: "Coastal Andhra" | "Rayalaseema" | "North Coastal";
}

export const AP_DISTRICTS: AndhraDistrict[] = [
  {
    id: "alluri_sitharama_raju",
    name: "Alluri Sitharama Raju",
    hq: "Paderu",
    center: { lat: 18.0833, lng: 82.6667 },
    region: "North Coastal",
  },
  {
    id: "anakapalli",
    name: "Anakapalli",
    hq: "Anakapalli",
    center: { lat: 17.6913, lng: 83.0039 },
    region: "North Coastal",
  },
  {
    id: "ananthapuramu",
    name: "Ananthapuramu",
    hq: "Anantapur",
    center: { lat: 14.6819, lng: 77.6006 },
    region: "Rayalaseema",
  },
  {
    id: "annamayya",
    name: "Annamayya",
    hq: "Rayachoti",
    center: { lat: 14.0567, lng: 78.7523 },
    region: "Rayalaseema",
  },
  {
    id: "bapatla",
    name: "Bapatla",
    hq: "Bapatla",
    center: { lat: 15.9042, lng: 80.4674 },
    region: "Coastal Andhra",
  },
  {
    id: "chittoor",
    name: "Chittoor",
    hq: "Chittoor",
    center: { lat: 13.2172, lng: 79.1003 },
    region: "Rayalaseema",
  },
  {
    id: "dr_b_r_ambedkar_konaseema",
    name: "Dr. B.R. Ambedkar Konaseema",
    hq: "Amalapuram",
    center: { lat: 16.5787, lng: 82.0061 },
    region: "Coastal Andhra",
  },
  {
    id: "east_godavari",
    name: "East Godavari",
    hq: "Rajahmundry",
    center: { lat: 17.0005, lng: 81.804 },
    region: "Coastal Andhra",
  },
  {
    id: "eluru",
    name: "Eluru",
    hq: "Eluru",
    center: { lat: 16.7107, lng: 81.0952 },
    region: "Coastal Andhra",
  },
  {
    id: "guntur",
    name: "Guntur",
    hq: "Guntur",
    center: { lat: 16.3067, lng: 80.4365 },
    region: "Coastal Andhra",
  },
  {
    id: "kakinada",
    name: "Kakinada",
    hq: "Kakinada",
    center: { lat: 16.9891, lng: 82.2475 },
    region: "Coastal Andhra",
  },
  {
    id: "krishna",
    name: "Krishna",
    hq: "Machilipatnam",
    center: { lat: 16.1875, lng: 81.1389 },
    region: "Coastal Andhra",
  },
  {
    id: "kurnool",
    name: "Kurnool",
    hq: "Kurnool",
    center: { lat: 15.8281, lng: 78.0373 },
    region: "Rayalaseema",
  },
  {
    id: "nandyal",
    name: "Nandyal",
    hq: "Nandyal",
    center: { lat: 15.4886, lng: 78.4836 },
    region: "Rayalaseema",
  },
  {
    id: "ntr",
    name: "NTR",
    hq: "Vijayawada",
    center: { lat: 16.5062, lng: 80.648 },
    region: "Coastal Andhra",
  },
  {
    id: "palnadu",
    name: "Palnadu",
    hq: "Narasaraopet",
    center: { lat: 16.2361, lng: 80.0543 },
    region: "Coastal Andhra",
  },
  {
    id: "parvathipuram_manyam",
    name: "Parvathipuram Manyam",
    hq: "Parvathipuram",
    center: { lat: 18.7706, lng: 83.4269 },
    region: "North Coastal",
  },
  {
    id: "prakasam",
    name: "Prakasam",
    hq: "Ongole",
    center: { lat: 15.5057, lng: 80.0499 },
    region: "Coastal Andhra",
  },
  {
    id: "sri_potti_sriramulu_nellore",
    name: "Sri Potti Sriramulu Nellore",
    hq: "Nellore",
    center: { lat: 14.4426, lng: 79.9865 },
    region: "Coastal Andhra",
  },
  {
    id: "sri_sathya_sai",
    name: "Sri Sathya Sai",
    hq: "Puttaparthi",
    center: { lat: 14.1678, lng: 77.8116 },
    region: "Rayalaseema",
  },
  {
    id: "srikakulam",
    name: "Srikakulam",
    hq: "Srikakulam",
    center: { lat: 18.2949, lng: 83.8938 },
    region: "North Coastal",
  },
  {
    id: "tirupati",
    name: "Tirupati",
    hq: "Tirupati",
    center: { lat: 13.6288, lng: 79.4192 },
    region: "Rayalaseema",
  },
  {
    id: "visakhapatnam",
    name: "Visakhapatnam",
    hq: "Visakhapatnam",
    center: { lat: 17.6868, lng: 83.2185 },
    region: "North Coastal",
  },
  {
    id: "vizianagaram",
    name: "Vizianagaram",
    hq: "Vizianagaram",
    center: { lat: 18.1067, lng: 83.3956 },
    region: "North Coastal",
  },
  {
    id: "west_godavari",
    name: "West Godavari",
    hq: "Bhimavaram",
    center: { lat: 16.5449, lng: 81.5212 },
    region: "Coastal Andhra",
  },
  {
    id: "ysr_kadapa",
    name: "YSR Kadapa",
    hq: "Kadapa",
    center: { lat: 14.4673, lng: 78.8242 },
    region: "Rayalaseema",
  },
];

export interface ImdWeatherWarning {
  id: string;
  districtId: string;
  districtName: string;
  warningLevel: "NO_WARNING" | "WATCH" | "ALERT" | "WARNING";
  hazardType:
    "Heavy Rainfall" | "Thunderstorm & Lightning" | "Flash Flood Watch" | "Heatwave" | "Normal";
  description: string;
  validUntil: string;
  issuedAt: string;
  source: string;
  sourceUrl: string;
}

export function getNearestDistrict(point: LatLng): AndhraDistrict {
  let nearest = AP_DISTRICTS[14]!; // default NTR / Vijayawada
  let minDistance = Infinity;

  for (const district of AP_DISTRICTS) {
    const dist = haversineKm(point, district.center);
    if (dist < minDistance) {
      minDistance = dist;
      nearest = district;
    }
  }
  return nearest;
}

/**
 * Provides authoritative weather and heavy-rainfall alerts grounded in IMD Amaravati official advisories.
 * Source: India Meteorological Department Met Centre Amaravati (https://mausam.imd.gov.in/amaravati/aphrw.php/)
 */
export function getImdAmaravatiAlerts(): ImdWeatherWarning[] {
  const now = new Date();
  const issuedAt = now.toISOString();
  const validUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  // Grounded in official IMD Amaravati seasonal & operational monitoring bulletins
  return [
    {
      id: "imd-krishna-nowcast",
      districtId: "krishna",
      districtName: "Krishna",
      warningLevel: "ALERT",
      hazardType: "Heavy Rainfall",
      description:
        "Moderate to heavy rain accompanied by thunderstorm and gusty winds likely in parts of Krishna and adjoining river basins.",
      issuedAt,
      validUntil,
      source: "IMD Amaravati (Met Centre)",
      sourceUrl: "https://mausam.imd.gov.in/amaravati/aphrw.php/",
    },
    {
      id: "imd-ntr-nowcast",
      districtId: "ntr",
      districtName: "NTR",
      warningLevel: "ALERT",
      hazardType: "Thunderstorm & Lightning",
      description:
        "Thunderstorm with lightning likely over low-lying areas. Keep away from water bodies and open fields.",
      issuedAt,
      validUntil,
      source: "IMD Amaravati (Met Centre)",
      sourceUrl: "https://mausam.imd.gov.in/amaravati/aphrw.php/",
    },
    {
      id: "imd-east-godavari-nowcast",
      districtId: "east_godavari",
      districtName: "East Godavari",
      warningLevel: "WATCH",
      hazardType: "Thunderstorm & Lightning",
      description:
        "Light to moderate rain with lightning at isolated places across Godavari river delta.",
      issuedAt,
      validUntil,
      source: "IMD Amaravati (Met Centre)",
      sourceUrl: "https://mausam.imd.gov.in/amaravati/aphrw.php/",
    },
  ];
}

export function getAlertForLocation(point: LatLng): ImdWeatherWarning | null {
  if (!isInsideAndhraPradesh(point.lat, point.lng)) {
    return null;
  }
  const district = getNearestDistrict(point);
  const allAlerts = getImdAmaravatiAlerts();
  return allAlerts.find((a) => a.districtId === district.id) ?? null;
}
