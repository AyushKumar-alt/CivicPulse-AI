import type { GeoContext, GeoCoordinates, GeoProvider } from "@/src/modules/contracts";
import { CoordinateValidator } from "./coordinateValidator";

interface NominatimAddress {
  road?: string;
  neighbourhood?: string;
  suburb?: string;
  city_district?: string;
  city?: string;
  town?: string;
  village?: string;
  county?: string;
  municipality?: string;
  municipality_district?: string;
  state_district?: string;
  state?: string;
  country?: string;
}

interface NominatimResponse {
  display_name?: string;
  address?: NominatimAddress;
}

export class NominatimGeoAdapter implements GeoProvider {
  readonly name = "NominatimGeoAdapter";

  constructor(
    private fetchImpl: typeof fetch = globalThis.fetch,
    private userAgent = "CivicPulseAI/1.0 (Civic Operating Platform)"
  ) {}

  public async reverseGeocode(coords: GeoCoordinates): Promise<GeoContext> {
    CoordinateValidator.validateCoordinates(coords);

    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.latitude}&lon=${coords.longitude}&addressdetails=1&zoom=18`;

    try {
      const res = await this.fetchImpl(url, {
        headers: {
          "User-Agent": this.userAgent,
          "Accept-Language": "en",
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        return this.createFallbackContext(coords, `HTTP Error ${res.status}`);
      }

      const data = (await res.json()) as NominatimResponse;
      if (!data || typeof data !== "object") {
        return this.createFallbackContext(coords, "Malformed Nominatim response");
      }

      const a = data.address ?? {};
      const villageName = a.village;
      const townName = a.town;
      const cityName = a.city;
      const suburbName = a.suburb;
      const neighbourhoodName = a.neighbourhood;
      const countyName = a.county;
      const stateDistrictName = a.state_district;
      const municipalityName = a.municipality || a.municipality_district;
      const districtName = a.county || a.state_district || a.city_district || a.city;
      const talukName = a.suburb || a.town;
      const state = a.state ?? "Unknown State";
      const country = a.country ?? "India";

      const localityName =
        neighbourhoodName ||
        villageName ||
        suburbName ||
        a.road ||
        townName ||
        cityName ||
        "Unknown Locality";

      const fullAddress =
        data.display_name ||
        [a.road, localityName, cityName, state, country].filter(Boolean).join(", ");

      // Municipal cityId determination based on city, county, district, or full address
      let cityId = "unresolved_city";
      const fullTextLower = `${cityName || ""} ${municipalityName || ""} ${countyName || ""} ${districtName || ""} ${stateDistrictName || ""} ${fullAddress || ""}`.toLowerCase();
      
      if (fullTextLower.includes("bengaluru") || fullTextLower.includes("bangalore")) {
        cityId = "bengaluru";
      } else if (fullTextLower.includes("chennai")) {
        cityId = "chennai";
      }

      return {
        coordinates: coords,
        country,
        state,
        countyName,
        districtName,
        stateDistrictName,
        talukName,
        municipalityName,
        cityName,
        townName,
        suburbName,
        neighbourhoodName,
        villageName,
        cityId,
        localityName,
        fullAddress: fullAddress || `${coords.latitude}, ${coords.longitude}`,
        provider: this.name,
        rawAddress: (a as Record<string, string>) ?? {},
      };
    } catch {
      return this.createFallbackContext(coords, "Network failure or timeout");
    }
  }

  private createFallbackContext(coords: GeoCoordinates, reason: string): GeoContext {
    return {
      coordinates: coords,
      country: "India",
      state: "Unknown State",
      cityId: "unresolved_city",
      cityName: "Unresolved Location",
      localityName: "Unknown Locality",
      fullAddress: `Location at (${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}) - [${reason}]`,
      provider: `${this.name} (Fallback)`,
    };
  }
}
