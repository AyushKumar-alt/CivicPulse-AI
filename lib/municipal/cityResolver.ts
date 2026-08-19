import type { CityCode } from "./types";

export function resolveCityFromAddress(address: string | null | undefined): CityCode {
  if (!address) return "bengaluru"; // Default fallback
  const addr = address.toLowerCase();

  if (addr.includes("bengaluru") || addr.includes("bangalore") || addr.includes("karnataka") || addr.includes("kodagalahatti") || addr.includes("hunasamaranahalli")) {
    return "bengaluru";
  }
  if (addr.includes("chennai") || addr.includes("madras") || addr.includes("tamil nadu") || addr.includes("cmwssb") || addr.includes("ambika street")) {
    return "chennai";
  }
  if (addr.includes("delhi") || addr.includes("new delhi") || addr.includes("ncr")) {
    return "delhi";
  }
  if (addr.includes("mumbai") || addr.includes("bombay") || addr.includes("maharashtra")) {
    return "mumbai";
  }

  return "generic";
}

export function resolveCityFromCoords(lat: number, lng: number): CityCode {
  // Bengaluru approximate bounding box: 12.8°N - 13.2°N, 77.4°E - 77.8°E
  if (lat >= 12.7 && lat <= 13.3 && lng >= 77.3 && lng <= 77.9) {
    return "bengaluru";
  }
  // Chennai approximate bounding box: 12.8°N - 13.3°N, 80.0°E - 80.4°E
  if (lat >= 12.7 && lat <= 13.4 && lng >= 80.0 && lng <= 80.5) {
    return "chennai";
  }
  // Delhi approximate bounding box: 28.3°N - 28.9°N, 76.8°E - 77.4°E
  if (lat >= 28.2 && lat <= 29.0 && lng >= 76.7 && lng <= 77.6) {
    return "delhi";
  }

  return "bengaluru"; // Default city
}
