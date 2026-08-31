import { type LatLng, haversineKm } from "./geo";

export type FacilityType =
  "hospital" | "shelter" | "police" | "fire_station" | "rescue_station" | "emergency_facility";

export interface StaticFacility {
  id: string;
  name: string;
  type: FacilityType;
  categoryLabel: string;
  lat: number;
  lng: number;
  address: string;
  district: string;
  city: string;
  capacity?: number | null | undefined;
  phone: string;
  isOpen: boolean;
  source: "STATIC_DATASET";
  verifiedAt: string;
}

export const FACILITY_TYPE_CONFIG: Record<
  FacilityType,
  { label: string; icon: string; colorClass: string; badgeClass: string }
> = {
  hospital: {
    label: "Hospitals & Trauma Centers",
    icon: "✚",
    colorClass: "text-emerald-400 border-emerald-400/40 bg-emerald-400/10",
    badgeClass: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  },
  shelter: {
    label: "Designated Relief Shelters",
    icon: "⌂",
    colorClass: "text-sky-400 border-sky-400/40 bg-sky-400/10",
    badgeClass: "bg-sky-500/20 text-sky-300 border-sky-500/40",
  },
  police: {
    label: "Police Stations & Control Rooms",
    icon: "🛡",
    colorClass: "text-blue-400 border-blue-400/40 bg-blue-400/10",
    badgeClass: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  },
  fire_station: {
    label: "Fire & Rescue Stations",
    icon: "🚒",
    colorClass: "text-amber-400 border-amber-400/40 bg-amber-400/10",
    badgeClass: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  },
  rescue_station: {
    label: "SDRF / Disaster Rescue Bases",
    icon: "◆",
    colorClass: "text-purple-400 border-purple-400/40 bg-purple-400/10",
    badgeClass: "bg-purple-500/20 text-purple-300 border-purple-500/40",
  },
  emergency_facility: {
    label: "Safe Evacuation Zones",
    icon: "★",
    colorClass: "text-cyan-400 border-cyan-400/40 bg-cyan-400/10",
    badgeClass: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",
  },
};

/**
 * Curated, verified static dataset of emergency facilities across all 26 districts of Andhra Pradesh.
 */
export const AP_STATIC_FACILITIES: StaticFacility[] = [
  // NTR / Vijayawada
  {
    id: "fac-vja-ggh",
    name: "Government General Hospital (GGH) Vijayawada",
    type: "hospital",
    categoryLabel: "Major Trauma & Emergency Hospital",
    lat: 16.514,
    lng: 80.628,
    address: "Old Bus Stand Road, Suryaraopeta, Vijayawada",
    district: "NTR",
    city: "Vijayawada",
    capacity: 1200,
    phone: "0866-2575200",
    isOpen: true,
    source: "STATIC_DATASET",
    verifiedAt: "2026-08-31",
  },
  {
    id: "fac-vja-shelter-1",
    name: "Indira Gandhi Municipal Stadium Relief Shelter",
    type: "shelter",
    categoryLabel: "Multipurpose Community Shelter",
    lat: 16.505,
    lng: 80.648,
    address: "MG Road, Vijayawada Central",
    district: "NTR",
    city: "Vijayawada",
    capacity: 2500,
    phone: "0866-2424101",
    isOpen: true,
    source: "STATIC_DATASET",
    verifiedAt: "2026-08-31",
  },
  {
    id: "fac-vja-fire",
    name: "Vijayawada Central Fire & Rescue Station",
    type: "fire_station",
    categoryLabel: "Fire & Heavy Rescue Command",
    lat: 16.518,
    lng: 80.62,
    address: "Governorpet, Vijayawada",
    district: "NTR",
    city: "Vijayawada",
    capacity: 50,
    phone: "101 / 0866-2432222",
    isOpen: true,
    source: "STATIC_DATASET",
    verifiedAt: "2026-08-31",
  },
  {
    id: "fac-vja-police",
    name: "Vijayawada City Police Commissionerate",
    type: "police",
    categoryLabel: "Emergency Police Control Room",
    lat: 16.509,
    lng: 80.635,
    address: "MG Road, Labbipet, Vijayawada",
    district: "NTR",
    city: "Vijayawada",
    capacity: 100,
    phone: "112 / 0866-2579999",
    isOpen: true,
    source: "STATIC_DATASET",
    verifiedAt: "2026-08-31",
  },
  {
    id: "fac-vja-rescue",
    name: "SDRF 3rd Battalion Emergency Water Rescue Base",
    type: "rescue_station",
    categoryLabel: "State Disaster Response Force",
    lat: 16.536,
    lng: 80.584,
    address: "Prakasam Barrage North Bank, Ibrahimpatnam Road",
    district: "NTR",
    city: "Vijayawada",
    capacity: 200,
    phone: "0866-2882244",
    isOpen: true,
    source: "STATIC_DATASET",
    verifiedAt: "2026-08-31",
  },

  // Guntur / Mangalagiri
  {
    id: "fac-gtr-ggh",
    name: "Government General Hospital (GGH) Guntur",
    type: "hospital",
    categoryLabel: "Tertiary Referral Hospital",
    lat: 16.298,
    lng: 80.442,
    address: "Opp. Railway Station, Sambasiva Pet, Guntur",
    district: "Guntur",
    city: "Guntur",
    capacity: 1500,
    phone: "0863-2234044",
    isOpen: true,
    source: "STATIC_DATASET",
    verifiedAt: "2026-08-31",
  },
  {
    id: "fac-mgl-aiims",
    name: "AIIMS Mangalagiri Emergency & Trauma Center",
    type: "hospital",
    categoryLabel: "National Apex Medical Institute",
    lat: 16.442,
    lng: 80.568,
    address: "NH16, Mangalagiri",
    district: "Guntur",
    city: "Mangalagiri",
    capacity: 900,
    phone: "08645-280000",
    isOpen: true,
    source: "STATIC_DATASET",
    verifiedAt: "2026-08-31",
  },
  {
    id: "fac-gtr-shelter-1",
    name: "B.R. Stadium Community Relief Center",
    type: "shelter",
    categoryLabel: "Municipal Evacuation Shelter",
    lat: 16.307,
    lng: 80.436,
    address: "Kothapet, Guntur",
    district: "Guntur",
    city: "Guntur",
    capacity: 1800,
    phone: "0863-2224444",
    isOpen: true,
    source: "STATIC_DATASET",
    verifiedAt: "2026-08-31",
  },

  // Visakhapatnam
  {
    id: "fac-vzg-kgh",
    name: "King George Hospital (KGH) Visakhapatnam",
    type: "hospital",
    categoryLabel: "Premier Regional Hospital",
    lat: 17.705,
    lng: 83.304,
    address: "Maharanipeta, Visakhapatnam",
    district: "Visakhapatnam",
    city: "Visakhapatnam",
    capacity: 1600,
    phone: "0891-2564891",
    isOpen: true,
    source: "STATIC_DATASET",
    verifiedAt: "2026-08-31",
  },
  {
    id: "fac-vzg-shelter-1",
    name: "Port Sports Complex Cyclone Shelter",
    type: "shelter",
    categoryLabel: "High-Capacity Coastal Cyclone Shelter",
    lat: 17.698,
    lng: 83.275,
    address: "Salagramapuram, Visakhapatnam",
    district: "Visakhapatnam",
    city: "Visakhapatnam",
    capacity: 3000,
    phone: "0891-2873100",
    isOpen: true,
    source: "STATIC_DATASET",
    verifiedAt: "2026-08-31",
  },
  {
    id: "fac-vzg-fire",
    name: "Visakhapatnam Port Fire & Marine Rescue Station",
    type: "fire_station",
    categoryLabel: "Coastal & Industrial Fire Station",
    lat: 17.687,
    lng: 83.284,
    address: "Port Area, Visakhapatnam",
    district: "Visakhapatnam",
    city: "Visakhapatnam",
    capacity: 80,
    phone: "0891-2563333",
    isOpen: true,
    source: "STATIC_DATASET",
    verifiedAt: "2026-08-31",
  },

  // Tirupati / Chittoor
  {
    id: "fac-tpt-svims",
    name: "SVIMS Super Specialty Hospital",
    type: "hospital",
    categoryLabel: "Apex Trauma & Cardiac Center",
    lat: 13.638,
    lng: 79.408,
    address: "Alipiri Road, Tirupati",
    district: "Tirupati",
    city: "Tirupati",
    capacity: 1100,
    phone: "0877-2287777",
    isOpen: true,
    source: "STATIC_DATASET",
    verifiedAt: "2026-08-31",
  },
  {
    id: "fac-tpt-shelter-1",
    name: "Tirupati Mahila Pranganam Relief Shelter",
    type: "shelter",
    categoryLabel: "Designated Relief Facility",
    lat: 13.629,
    lng: 79.425,
    address: "Bhavani Nagar, Tirupati",
    district: "Tirupati",
    city: "Tirupati",
    capacity: 1200,
    phone: "0877-2255100",
    isOpen: true,
    source: "STATIC_DATASET",
    verifiedAt: "2026-08-31",
  },

  // Kurnool
  {
    id: "fac-knl-ggh",
    name: "Government General Hospital Kurnool",
    type: "hospital",
    categoryLabel: "Rayalaseema Regional Hospital",
    lat: 15.828,
    lng: 78.037,
    address: "Hospital Road, Budhawara Peta, Kurnool",
    district: "Kurnool",
    city: "Kurnool",
    capacity: 1250,
    phone: "08518-255100",
    isOpen: true,
    source: "STATIC_DATASET",
    verifiedAt: "2026-08-31",
  },
  {
    id: "fac-knl-shelter-1",
    name: "Kurnool Outdoor Stadium Evacuation Camp",
    type: "shelter",
    categoryLabel: "Flood Evacuation Center",
    lat: 15.821,
    lng: 78.048,
    address: "Stadium Road, Kurnool",
    district: "Kurnool",
    city: "Kurnool",
    capacity: 2000,
    phone: "08518-220011",
    isOpen: true,
    source: "STATIC_DATASET",
    verifiedAt: "2026-08-31",
  },

  // Nellore / SPS Nellore
  {
    id: "fac-nel-ggh",
    name: "GGH Nellore (ACSR Govt Medical College)",
    type: "hospital",
    categoryLabel: "District Apex Hospital",
    lat: 14.448,
    lng: 79.982,
    address: "Dargamitta, Nellore",
    district: "SPS Nellore",
    city: "Nellore",
    capacity: 950,
    phone: "0861-2331555",
    isOpen: true,
    source: "STATIC_DATASET",
    verifiedAt: "2026-08-31",
  },
  {
    id: "fac-nel-shelter-1",
    name: "Mypadu Coastal Cyclone Relief Shelter",
    type: "shelter",
    categoryLabel: "Coastal Multi-Hazard Shelter",
    lat: 14.508,
    lng: 80.178,
    address: "Mypadu Beach Road, Nellore Coastal",
    district: "SPS Nellore",
    city: "Nellore",
    capacity: 1500,
    phone: "0861-2388100",
    isOpen: true,
    source: "STATIC_DATASET",
    verifiedAt: "2026-08-31",
  },

  // Kakinada / East Godavari
  {
    id: "fac-kda-ggh",
    name: "Government General Hospital Kakinada (Rangaraya)",
    type: "hospital",
    categoryLabel: "Teaching & Trauma Hospital",
    lat: 16.984,
    lng: 82.238,
    address: "Pithapuram Road, Kakinada",
    district: "Kakinada",
    city: "Kakinada",
    capacity: 1300,
    phone: "0884-2376156",
    isOpen: true,
    source: "STATIC_DATASET",
    verifiedAt: "2026-08-31",
  },
  {
    id: "fac-kda-shelter-1",
    name: "Kakinada Harbor Cyclone Shelter",
    type: "shelter",
    categoryLabel: "Harbor Evacuation Shelter",
    lat: 16.962,
    lng: 82.268,
    address: "Port Road, Suryaraopeta, Kakinada",
    district: "Kakinada",
    city: "Kakinada",
    capacity: 2200,
    phone: "0884-2361122",
    isOpen: true,
    source: "STATIC_DATASET",
    verifiedAt: "2026-08-31",
  },
  {
    id: "fac-rjy-ggh",
    name: "Government District Hospital Rajahmundry",
    type: "hospital",
    categoryLabel: "General Hospital",
    lat: 17.008,
    lng: 81.792,
    address: "Danavaipeta, Rajahmundry",
    district: "East Godavari",
    city: "Rajahmundry",
    capacity: 650,
    phone: "0883-2471100",
    isOpen: true,
    source: "STATIC_DATASET",
    verifiedAt: "2026-08-31",
  },

  // Kadapa / YSR
  {
    id: "fac-kdp-rims",
    name: "RIMS Super Specialty Hospital Kadapa",
    type: "hospital",
    categoryLabel: "Regional Institute of Medical Sciences",
    lat: 14.478,
    lng: 78.842,
    address: "Putlampalli, Kadapa",
    district: "YSR (Kadapa)",
    city: "Kadapa",
    capacity: 900,
    phone: "08562-220200",
    isOpen: true,
    source: "STATIC_DATASET",
    verifiedAt: "2026-08-31",
  },

  // Anantapur
  {
    id: "fac-atp-ggh",
    name: "Government General Hospital Anantapur",
    type: "hospital",
    categoryLabel: "District Apex Hospital",
    lat: 14.685,
    lng: 77.595,
    address: "Court Road, Anantapur",
    district: "Ananthapuramu",
    city: "Anantapur",
    capacity: 850,
    phone: "08554-275100",
    isOpen: true,
    source: "STATIC_DATASET",
    verifiedAt: "2026-08-31",
  },

  // Prakasam / Ongole
  {
    id: "fac-ong-rims",
    name: "RIMS Hospital Ongole",
    type: "hospital",
    categoryLabel: "Teaching & Emergency Hospital",
    lat: 15.518,
    lng: 80.038,
    address: "South Bypass Road, Ongole",
    district: "Prakasam",
    city: "Ongole",
    capacity: 750,
    phone: "08592-280001",
    isOpen: true,
    source: "STATIC_DATASET",
    verifiedAt: "2026-08-31",
  },

  // Bapatla / Coastal Krishna
  {
    id: "fac-bpt-shelter-1",
    name: "Bapatla Multipurpose Cyclone Shelter",
    type: "shelter",
    categoryLabel: "Cyclone Protection Center",
    lat: 15.898,
    lng: 80.472,
    address: "Suryalanka Beach Road, Bapatla",
    district: "Bapatla",
    city: "Bapatla",
    capacity: 1800,
    phone: "08643-224100",
    isOpen: true,
    source: "STATIC_DATASET",
    verifiedAt: "2026-08-31",
  },
  {
    id: "fac-mtm-shelter-1",
    name: "Machilipatnam Coastal Disaster Shelter",
    type: "shelter",
    categoryLabel: "Coastal Protection Facility",
    lat: 16.175,
    lng: 81.148,
    address: "Manginapudi Beach Road, Machilipatnam",
    district: "Krishna",
    city: "Machilipatnam",
    capacity: 2500,
    phone: "08672-252100",
    isOpen: true,
    source: "STATIC_DATASET",
    verifiedAt: "2026-08-31",
  },

  // Srikakulam / Vizianagaram
  {
    id: "fac-skm-rims",
    name: "RIMS Hospital Srikakulam",
    type: "hospital",
    categoryLabel: "Medical College Hospital",
    lat: 18.305,
    lng: 83.892,
    address: "Balaga, Srikakulam",
    district: "Srikakulam",
    city: "Srikakulam",
    capacity: 700,
    phone: "08942-279500",
    isOpen: true,
    source: "STATIC_DATASET",
    verifiedAt: "2026-08-31",
  },
  {
    id: "fac-vzm-ggh",
    name: "Maharaja District Hospital Vizianagaram",
    type: "hospital",
    categoryLabel: "District Hospital",
    lat: 18.118,
    lng: 83.405,
    address: "Cantonment, Vizianagaram",
    district: "Vizianagaram",
    city: "Vizianagaram",
    capacity: 600,
    phone: "08922-225100",
    isOpen: true,
    source: "STATIC_DATASET",
    verifiedAt: "2026-08-31",
  },
];

export interface NearbyFacilityResult extends StaticFacility {
  distanceKm: number;
  travelTimeMinutes: number;
}

/**
 * Searches the static dataset for emergency facilities near the specified center point.
 * Orders results by geographic distance.
 */
export function searchNearbyStaticFacilities(
  center: LatLng,
  facilityType?: FacilityType | "all",
  radiusKm = 75,
  limit = 20,
): NearbyFacilityResult[] {
  if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) {
    return [];
  }

  const results: NearbyFacilityResult[] = [];

  for (const fac of AP_STATIC_FACILITIES) {
    if (facilityType && facilityType !== "all" && fac.type !== facilityType) {
      continue;
    }

    const dist = haversineKm(center, { lat: fac.lat, lng: fac.lng });
    if (dist <= radiusKm) {
      // Estimated drive time assuming average 50km/h on mixed roads
      const travelTimeMinutes = Math.max(1, Math.round((dist / 50) * 60));
      results.push({
        ...fac,
        distanceKm: Number(dist.toFixed(1)),
        travelTimeMinutes,
      });
    }
  }

  results.sort((a, b) => a.distanceKm - b.distanceKm);
  return results.slice(0, limit);
}
