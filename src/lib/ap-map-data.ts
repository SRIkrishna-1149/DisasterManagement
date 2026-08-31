import { type LatLng } from "./geo";
import { AP_BOUNDS, AP_CENTER } from "./domain";

export interface DistrictInfo {
  id: string;
  name: string;
  headquarters: string;
  centroid: LatLng;
  polygon: LatLng[];
}

export interface CityInfo {
  id: string;
  name: string;
  district: string;
  lat: number;
  lng: number;
  tier: 1 | 2 | 3;
}

export interface RiverFeature {
  name: string;
  path: LatLng[];
}

/**
 * Geometric outline of Andhra Pradesh (simplified polygon for vector rendering).
 */
export const AP_STATE_BOUNDARY: LatLng[] = [
  { lat: 19.15, lng: 84.75 }, // Ichchapuram (North-East tip)
  { lat: 18.78, lng: 84.42 }, // Sompeta
  { lat: 18.29, lng: 83.9 }, // Srikakulam coast
  { lat: 17.72, lng: 83.3 }, // Visakhapatnam
  { lat: 17.35, lng: 82.55 }, // Payakaraopeta
  { lat: 16.98, lng: 82.24 }, // Kakinada coast
  { lat: 16.42, lng: 81.88 }, // Yanam / Godavari mouth
  { lat: 15.82, lng: 81.0 }, // Machilipatnam / Krishna delta
  { lat: 15.75, lng: 80.65 }, // Nizampatnam
  { lat: 15.5, lng: 80.05 }, // Ongole coast
  { lat: 14.9, lng: 80.03 }, // Kavali coast
  { lat: 14.45, lng: 80.18 }, // Nellore / Mypadu
  { lat: 13.68, lng: 80.15 }, // Sriharikota / Pulicat Lake
  { lat: 13.55, lng: 80.02 }, // Tada (South-East tip)
  { lat: 13.25, lng: 79.5 }, // Nagari / Satyavedu
  { lat: 13.22, lng: 79.1 }, // Chittoor south
  { lat: 12.8, lng: 78.4 }, // Kuppam (Southern tip)
  { lat: 13.4, lng: 78.2 }, // Madanapalle border
  { lat: 13.75, lng: 77.6 }, // Hindupur border
  { lat: 14.2, lng: 77.15 }, // Madakasira / Pavagada border
  { lat: 14.68, lng: 77.05 }, // Kalyandurg west
  { lat: 15.15, lng: 76.9 }, // Uravakonda / Bellary border
  { lat: 15.8, lng: 77.0 }, // Adoni / Alur border
  { lat: 15.95, lng: 77.4 }, // Mantralayam / Tungabhadra border
  { lat: 16.15, lng: 77.85 }, // Kurnool North / Krishna River confluence
  { lat: 16.05, lng: 78.85 }, // Srisailam / Nallamala forest border
  { lat: 16.52, lng: 79.35 }, // Nagarjuna Sagar border
  { lat: 16.85, lng: 80.05 }, // Jaggaiahpet / Khammam border
  { lat: 17.05, lng: 80.62 }, // Tiruvuru / Krishna-Telangana border
  { lat: 17.2, lng: 81.1 }, // Aswaraopeta border
  { lat: 17.65, lng: 81.35 }, // Bhadrachalam / Chintoor border
  { lat: 18.15, lng: 81.9 }, // Motu / Sileru border
  { lat: 18.4, lng: 82.85 }, // Araku / Koraput border
  { lat: 18.7, lng: 83.45 }, // Parvathipuram border
  { lat: 19.05, lng: 83.82 }, // Palakonda / Odisha border
  { lat: 19.15, lng: 84.75 }, // Loop back to Ichchapuram
];

/**
 * 26 Districts of Andhra Pradesh with district centroids and bounding polygons.
 */
export const AP_DISTRICTS: DistrictInfo[] = [
  {
    id: "srikakulam",
    name: "Srikakulam",
    headquarters: "Srikakulam",
    centroid: { lat: 18.3, lng: 83.9 },
    polygon: [
      { lat: 19.15, lng: 84.75 },
      { lat: 18.78, lng: 84.42 },
      { lat: 18.29, lng: 83.9 },
      { lat: 18.15, lng: 83.6 },
      { lat: 18.6, lng: 83.7 },
      { lat: 19.05, lng: 83.82 },
      { lat: 19.15, lng: 84.75 },
    ],
  },
  {
    id: "vizianagaram",
    name: "Vizianagaram",
    headquarters: "Vizianagaram",
    centroid: { lat: 18.12, lng: 83.4 },
    polygon: [
      { lat: 18.35, lng: 83.65 },
      { lat: 18.05, lng: 83.55 },
      { lat: 17.95, lng: 83.35 },
      { lat: 18.25, lng: 83.15 },
      { lat: 18.5, lng: 83.35 },
      { lat: 18.35, lng: 83.65 },
    ],
  },
  {
    id: "visakhapatnam",
    name: "Visakhapatnam",
    headquarters: "Visakhapatnam",
    centroid: { lat: 17.73, lng: 83.3 },
    polygon: [
      { lat: 17.95, lng: 83.35 },
      { lat: 17.65, lng: 83.25 },
      { lat: 17.6, lng: 83.05 },
      { lat: 17.85, lng: 83.1 },
      { lat: 17.95, lng: 83.35 },
    ],
  },
  {
    id: "anakapalli",
    name: "Anakapalli",
    headquarters: "Anakapalli",
    centroid: { lat: 17.69, lng: 82.98 },
    polygon: [
      { lat: 17.85, lng: 83.1 },
      { lat: 17.45, lng: 82.85 },
      { lat: 17.35, lng: 82.55 },
      { lat: 17.75, lng: 82.6 },
      { lat: 17.85, lng: 83.1 },
    ],
  },
  {
    id: "kakinada",
    name: "Kakinada",
    headquarters: "Kakinada",
    centroid: { lat: 16.98, lng: 82.24 },
    polygon: [
      { lat: 17.35, lng: 82.55 },
      { lat: 16.9, lng: 82.25 },
      { lat: 16.85, lng: 82.0 },
      { lat: 17.2, lng: 82.05 },
      { lat: 17.35, lng: 82.55 },
    ],
  },
  {
    id: "konaseema",
    name: "Dr. B.R. Ambedkar Konaseema",
    headquarters: "Amalapuram",
    centroid: { lat: 16.58, lng: 81.9 },
    polygon: [
      { lat: 16.85, lng: 82.0 },
      { lat: 16.42, lng: 81.88 },
      { lat: 16.35, lng: 81.65 },
      { lat: 16.7, lng: 81.75 },
      { lat: 16.85, lng: 82.0 },
    ],
  },
  {
    id: "east_godavari",
    name: "East Godavari",
    headquarters: "Rajahmundry",
    centroid: { lat: 17.0, lng: 81.8 },
    polygon: [
      { lat: 17.25, lng: 81.95 },
      { lat: 16.85, lng: 81.85 },
      { lat: 16.8, lng: 81.6 },
      { lat: 17.2, lng: 81.5 },
      { lat: 17.25, lng: 81.95 },
    ],
  },
  {
    id: "west_godavari",
    name: "West Godavari",
    headquarters: "Bhimavaram",
    centroid: { lat: 16.54, lng: 81.52 },
    polygon: [
      { lat: 16.8, lng: 81.6 },
      { lat: 16.35, lng: 81.65 },
      { lat: 16.38, lng: 81.35 },
      { lat: 16.75, lng: 81.35 },
      { lat: 16.8, lng: 81.6 },
    ],
  },
  {
    id: "eluru",
    name: "Eluru",
    headquarters: "Eluru",
    centroid: { lat: 16.71, lng: 81.1 },
    polygon: [
      { lat: 17.2, lng: 81.35 },
      { lat: 16.75, lng: 81.35 },
      { lat: 16.6, lng: 80.95 },
      { lat: 17.05, lng: 80.9 },
      { lat: 17.2, lng: 81.35 },
    ],
  },
  {
    id: "krishna",
    name: "Krishna",
    headquarters: "Machilipatnam",
    centroid: { lat: 16.18, lng: 81.13 },
    polygon: [
      { lat: 16.6, lng: 80.95 },
      { lat: 16.38, lng: 81.35 },
      { lat: 15.82, lng: 81.0 },
      { lat: 16.15, lng: 80.75 },
      { lat: 16.6, lng: 80.95 },
    ],
  },
  {
    id: "ntr",
    name: "NTR (Vijayawada)",
    headquarters: "Vijayawada",
    centroid: { lat: 16.51, lng: 80.65 },
    polygon: [
      { lat: 17.05, lng: 80.62 },
      { lat: 16.6, lng: 80.95 },
      { lat: 16.45, lng: 80.55 },
      { lat: 16.85, lng: 80.05 },
      { lat: 17.05, lng: 80.62 },
    ],
  },
  {
    id: "guntur",
    name: "Guntur",
    headquarters: "Guntur",
    centroid: { lat: 16.3, lng: 80.44 },
    polygon: [
      { lat: 16.45, lng: 80.55 },
      { lat: 16.15, lng: 80.75 },
      { lat: 15.95, lng: 80.45 },
      { lat: 16.15, lng: 80.15 },
      { lat: 16.45, lng: 80.55 },
    ],
  },
  {
    id: "bapatla",
    name: "Bapatla",
    headquarters: "Bapatla",
    centroid: { lat: 15.9, lng: 80.47 },
    polygon: [
      { lat: 16.15, lng: 80.75 },
      { lat: 15.75, lng: 80.65 },
      { lat: 15.65, lng: 80.25 },
      { lat: 15.95, lng: 80.45 },
      { lat: 16.15, lng: 80.75 },
    ],
  },
  {
    id: "palnadu",
    name: "Palnadu",
    headquarters: "Narasaraopet",
    centroid: { lat: 16.23, lng: 79.88 },
    polygon: [
      { lat: 16.65, lng: 80.0 },
      { lat: 16.15, lng: 80.15 },
      { lat: 15.85, lng: 79.6 },
      { lat: 16.45, lng: 79.4 },
      { lat: 16.65, lng: 80.0 },
    ],
  },
  {
    id: "prakasam",
    name: "Prakasam",
    headquarters: "Ongole",
    centroid: { lat: 15.51, lng: 80.05 },
    polygon: [
      { lat: 15.95, lng: 80.45 },
      { lat: 15.5, lng: 80.05 },
      { lat: 15.1, lng: 79.7 },
      { lat: 15.35, lng: 79.2 },
      { lat: 15.85, lng: 79.6 },
      { lat: 15.95, lng: 80.45 },
    ],
  },
  {
    id: "nellore",
    name: "SPS Nellore",
    headquarters: "Nellore",
    centroid: { lat: 14.45, lng: 79.99 },
    polygon: [
      { lat: 15.1, lng: 79.7 },
      { lat: 14.9, lng: 80.03 },
      { lat: 14.45, lng: 80.18 },
      { lat: 14.05, lng: 80.0 },
      { lat: 14.25, lng: 79.45 },
      { lat: 14.85, lng: 79.35 },
      { lat: 15.1, lng: 79.7 },
    ],
  },
  {
    id: "tirupati",
    name: "Tirupati",
    headquarters: "Tirupati",
    centroid: { lat: 13.63, lng: 79.42 },
    polygon: [
      { lat: 14.05, lng: 80.0 },
      { lat: 13.68, lng: 80.15 },
      { lat: 13.55, lng: 80.02 },
      { lat: 13.25, lng: 79.5 },
      { lat: 13.7, lng: 79.15 },
      { lat: 14.05, lng: 79.6 },
      { lat: 14.05, lng: 80.0 },
    ],
  },
  {
    id: "chittoor",
    name: "Chittoor",
    headquarters: "Chittoor",
    centroid: { lat: 13.22, lng: 79.1 },
    polygon: [
      { lat: 13.7, lng: 79.15 },
      { lat: 13.25, lng: 79.5 },
      { lat: 13.22, lng: 79.1 },
      { lat: 12.8, lng: 78.4 },
      { lat: 13.35, lng: 78.65 },
      { lat: 13.7, lng: 79.15 },
    ],
  },
  {
    id: "annamayya",
    name: "Annamayya",
    headquarters: "Rayachoti",
    centroid: { lat: 14.05, lng: 78.75 },
    polygon: [
      { lat: 14.35, lng: 79.1 },
      { lat: 14.05, lng: 79.6 },
      { lat: 13.7, lng: 79.15 },
      { lat: 13.35, lng: 78.65 },
      { lat: 13.85, lng: 78.4 },
      { lat: 14.25, lng: 78.6 },
      { lat: 14.35, lng: 79.1 },
    ],
  },
  {
    id: "kadapa",
    name: "YSR (Kadapa)",
    headquarters: "Kadapa",
    centroid: { lat: 14.47, lng: 78.82 },
    polygon: [
      { lat: 15.0, lng: 78.95 },
      { lat: 14.85, lng: 79.35 },
      { lat: 14.25, lng: 79.45 },
      { lat: 14.35, lng: 79.1 },
      { lat: 14.25, lng: 78.6 },
      { lat: 14.7, lng: 78.2 },
      { lat: 15.0, lng: 78.95 },
    ],
  },
  {
    id: "kurnool",
    name: "Kurnool",
    headquarters: "Kurnool",
    centroid: { lat: 15.83, lng: 78.03 },
    polygon: [
      { lat: 16.15, lng: 77.85 },
      { lat: 15.8, lng: 78.4 },
      { lat: 15.35, lng: 77.8 },
      { lat: 15.35, lng: 77.15 },
      { lat: 15.8, lng: 77.0 },
      { lat: 15.95, lng: 77.4 },
      { lat: 16.15, lng: 77.85 },
    ],
  },
  {
    id: "nandyal",
    name: "Nandyal",
    headquarters: "Nandyal",
    centroid: { lat: 15.48, lng: 78.48 },
    polygon: [
      { lat: 16.05, lng: 78.85 },
      { lat: 15.65, lng: 79.05 },
      { lat: 15.0, lng: 78.95 },
      { lat: 15.15, lng: 78.2 },
      { lat: 15.8, lng: 78.4 },
      { lat: 16.05, lng: 78.85 },
    ],
  },
  {
    id: "anantapur",
    name: "Ananthapuramu",
    headquarters: "Anantapur",
    centroid: { lat: 14.68, lng: 77.6 },
    polygon: [
      { lat: 15.35, lng: 77.8 },
      { lat: 15.15, lng: 78.2 },
      { lat: 14.6, lng: 77.95 },
      { lat: 14.45, lng: 77.25 },
      { lat: 14.68, lng: 77.05 },
      { lat: 15.15, lng: 76.9 },
      { lat: 15.35, lng: 77.15 },
      { lat: 15.35, lng: 77.8 },
    ],
  },
  {
    id: "sri_sathya_sai",
    name: "Sri Sathya Sai",
    headquarters: "Puttaparthi",
    centroid: { lat: 14.17, lng: 77.81 },
    polygon: [
      { lat: 14.6, lng: 77.95 },
      { lat: 14.25, lng: 78.4 },
      { lat: 13.85, lng: 78.4 },
      { lat: 13.75, lng: 77.6 },
      { lat: 14.2, lng: 77.15 },
      { lat: 14.45, lng: 77.25 },
      { lat: 14.6, lng: 77.95 },
    ],
  },
  {
    id: "alluri",
    name: "Alluri Sitharama Raju",
    headquarters: "Paderu",
    centroid: { lat: 18.08, lng: 82.66 },
    polygon: [
      { lat: 18.4, lng: 82.85 },
      { lat: 18.0, lng: 82.8 },
      { lat: 17.5, lng: 81.8 },
      { lat: 17.65, lng: 81.35 },
      { lat: 18.15, lng: 81.9 },
      { lat: 18.4, lng: 82.85 },
    ],
  },
  {
    id: "parvathipuram",
    name: "Parvathipuram Manyam",
    headquarters: "Parvathipuram",
    centroid: { lat: 18.78, lng: 83.42 },
    polygon: [
      { lat: 19.05, lng: 83.82 },
      { lat: 18.6, lng: 83.7 },
      { lat: 18.5, lng: 83.35 },
      { lat: 18.7, lng: 83.45 },
      { lat: 19.05, lng: 83.82 },
    ],
  },
];

/**
 * Major rivers in Andhra Pradesh for vector overlay.
 */
export const AP_RIVERS: RiverFeature[] = [
  {
    name: "Krishna River",
    path: [
      { lat: 16.15, lng: 77.85 }, // Confluence near Kurnool
      { lat: 16.05, lng: 78.85 }, // Srisailam Dam
      { lat: 16.52, lng: 79.35 }, // Nagarjuna Sagar Dam
      { lat: 16.75, lng: 80.05 }, // Pulichintala
      { lat: 16.51, lng: 80.62 }, // Prakasam Barrage / Vijayawada
      { lat: 16.25, lng: 80.85 }, // Hamsaladeevi / Avanigadda
      { lat: 15.82, lng: 81.0 }, // Bay of Bengal Delta mouth
    ],
  },
  {
    name: "Godavari River",
    path: [
      { lat: 17.65, lng: 81.35 }, // Bhadrachalam / Kunavaram
      { lat: 17.4, lng: 81.55 }, // Polavaram Dam
      { lat: 17.0, lng: 81.78 }, // Rajahmundry / Dowleswaram Barrage
      { lat: 16.7, lng: 81.85 }, // Ravulapalem
      { lat: 16.42, lng: 81.88 }, // Antarvedi / Bay of Bengal mouth
    ],
  },
  {
    name: "Penna River",
    path: [
      { lat: 15.1, lng: 77.3 }, // Anantapur border
      { lat: 14.85, lng: 78.3 }, // Gandikota gorge / Kadapa
      { lat: 14.55, lng: 78.75 }, // Kadapa basin
      { lat: 14.5, lng: 79.6 }, // Somasila Dam
      { lat: 14.45, lng: 79.99 }, // Nellore city
      { lat: 14.45, lng: 80.18 }, // Utukuru / Bay of Bengal mouth
    ],
  },
];

/**
 * Key cities across Andhra Pradesh with coordinates and population tiers.
 */
export const AP_CITIES: CityInfo[] = [
  { id: "vja", name: "Vijayawada", district: "NTR", lat: 16.5062, lng: 80.648, tier: 1 },
  {
    id: "vzg",
    name: "Visakhapatnam",
    district: "Visakhapatnam",
    lat: 17.6868,
    lng: 83.2185,
    tier: 1,
  },
  { id: "gtr", name: "Guntur", district: "Guntur", lat: 16.3067, lng: 80.4365, tier: 1 },
  { id: "tpt", name: "Tirupati", district: "Tirupati", lat: 13.6288, lng: 79.4192, tier: 1 },
  { id: "knl", name: "Kurnool", district: "Kurnool", lat: 15.8281, lng: 78.0373, tier: 1 },
  { id: "nel", name: "Nellore", district: "SPS Nellore", lat: 14.4426, lng: 79.9865, tier: 1 },
  { id: "rjy", name: "Rajahmundry", district: "East Godavari", lat: 17.0005, lng: 81.804, tier: 1 },
  { id: "kda", name: "Kakinada", district: "Kakinada", lat: 16.9891, lng: 82.2475, tier: 1 },
  { id: "kdp", name: "Kadapa", district: "YSR (Kadapa)", lat: 14.4673, lng: 78.8242, tier: 1 },
  { id: "atp", name: "Anantapur", district: "Ananthapuramu", lat: 14.6819, lng: 77.6006, tier: 1 },
  { id: "ong", name: "Ongole", district: "Prakasam", lat: 15.5057, lng: 80.0499, tier: 2 },
  { id: "elr", name: "Eluru", district: "Eluru", lat: 16.7107, lng: 81.0952, tier: 2 },
  {
    id: "vzm",
    name: "Vizianagaram",
    district: "Vizianagaram",
    lat: 18.1124,
    lng: 83.3978,
    tier: 2,
  },
  { id: "skm", name: "Srikakulam", district: "Srikakulam", lat: 18.2969, lng: 83.8968, tier: 2 },
  { id: "mtm", name: "Machilipatnam", district: "Krishna", lat: 16.1875, lng: 81.1389, tier: 2 },
  { id: "ndl", name: "Nandyal", district: "Nandyal", lat: 15.4786, lng: 78.4836, tier: 2 },
  { id: "bvm", name: "Bhimavaram", district: "West Godavari", lat: 16.5449, lng: 81.5212, tier: 2 },
  { id: "nrp", name: "Narasaraopet", district: "Palnadu", lat: 16.2361, lng: 80.0494, tier: 2 },
  { id: "bpt", name: "Bapatla", district: "Bapatla", lat: 15.9042, lng: 80.4676, tier: 2 },
  { id: "ctr", name: "Chittoor", district: "Chittoor", lat: 13.2172, lng: 79.1003, tier: 2 },
  { id: "ryc", name: "Rayachoti", district: "Annamayya", lat: 14.0567, lng: 78.7512, tier: 2 },
  {
    id: "amp",
    name: "Amalapuram",
    district: "Dr. B.R. Ambedkar Konaseema",
    lat: 16.5787,
    lng: 82.0061,
    tier: 2,
  },
  {
    id: "ptp",
    name: "Puttaparthi",
    district: "Sri Sathya Sai",
    lat: 14.1672,
    lng: 77.8117,
    tier: 2,
  },
  {
    id: "pdr",
    name: "Paderu",
    district: "Alluri Sitharama Raju",
    lat: 18.0833,
    lng: 82.6667,
    tier: 3,
  },
  {
    id: "pvm",
    name: "Parvathipuram",
    district: "Parvathipuram Manyam",
    lat: 18.7833,
    lng: 83.4333,
    tier: 3,
  },
  { id: "akp", name: "Anakapalli", district: "Anakapalli", lat: 17.6897, lng: 83.0033, tier: 2 },
];

/**
 * Converts a geographic (lat, lng) to normalized projection space [0..1, 0..1]
 * using the configured Andhra Pradesh bounds.
 */
export function projectLatLngToNormalized(lat: number, lng: number): { x: number; y: number } {
  const minLat = AP_BOUNDS.minLat;
  const maxLat = AP_BOUNDS.maxLat;
  const minLng = AP_BOUNDS.minLng;
  const maxLng = AP_BOUNDS.maxLng;

  const x = (lng - minLng) / (maxLng - minLng);
  // Invert Y because canvas/SVG top-left is (0,0) and latitude increases northward
  const y = 1 - (lat - minLat) / (maxLat - minLat);

  return { x, y };
}

/**
 * Converts normalized projection space [0..1, 0..1] back to geographic (lat, lng).
 */
export function projectNormalizedToLatLng(x: number, y: number): LatLng {
  const minLat = AP_BOUNDS.minLat;
  const maxLat = AP_BOUNDS.maxLat;
  const minLng = AP_BOUNDS.minLng;
  const maxLng = AP_BOUNDS.maxLng;

  const lng = minLng + x * (maxLng - minLng);
  const lat = minLat + (1 - y) * (maxLat - minLat);

  return { lat, lng };
}
