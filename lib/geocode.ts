import { resolveCityFromLocation } from "@/lib/municipal-authorities";

interface NominatimAddress {
  road?: string;
  neighbourhood?: string;
  suburb?: string;
  city_district?: string;
  city?: string;
  town?: string;
  village?: string;
  state?: string;
}

interface NominatimResult {
  display_name: string;
  address: NominatimAddress;
}

export interface GeocodedLocation {
  address: string;
  area_name: string;
  city: string;
  state: string;
  zone_type: string;
}

const ZONE_KEYWORDS: [string, string[]][] = [
  ["school_zone", ["school", "primary school", "secondary school", "college", "university", "academy", "kindergarten"]],
  ["hospital", ["hospital", "clinic", "medical centre", "medical center", "dispensary", "healthcare"]],
  ["highway", ["highway", "expressway", "freeway", "motorway", "national highway", "nh-", "sh-"]],
  ["commercial", ["market", "mall", "plaza", "commercial", "bazaar", "shopping centre", "shopping center"]],
];

function detectZoneType(displayName: string): string {
  const lower = displayName.toLowerCase();
  for (const [zone, keywords] of ZONE_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k))) return zone;
  }
  return "residential";
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeocodedLocation | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1&zoom=18`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "CivicPulseAI/1.0 (hackathon demo)",
        "Accept-Language": "en",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as NominatimResult;
    const a = data.address;

    const street = a.road ?? "";
    const area = a.neighbourhood ?? a.suburb ?? a.city_district ?? "";
    const rawCity = a.city ?? a.town ?? a.village ?? "";
    const state = a.state ?? "";

    const detectedCity = resolveCityFromLocation(data.display_name, lat, lng) || rawCity;
    const finalCity = detectedCity || rawCity;

    let formatted =
      [street, area, rawCity].filter(Boolean).join(", ") ||
      data.display_name.split(",").slice(0, 3).join(",").trim();

    if (detectedCity && !formatted.toLowerCase().includes(detectedCity.toLowerCase())) {
      formatted = `${formatted}, ${detectedCity}`;
    }

    return {
      address: formatted,
      area_name: area || finalCity,
      city: finalCity,
      state,
      zone_type: detectZoneType(data.display_name),
    };
  } catch {
    return null;
  }
}
