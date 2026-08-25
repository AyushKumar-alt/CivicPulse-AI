import type { Agency, CityConfig, DepartmentCategoryKey, GeoContext } from "@/src/modules/contracts";

export interface JurisdictionContext {
  corporationId?: string;
  zoneId?: string;
  wardId?: string;
}

export class JurisdictionResolver {
  /**
   * Resolves the target Agency for a GeoContext and category, decoupled from cityId.
   */
  public static resolveAgencyForGeoContext(
    allCities: CityConfig[],
    geoContext: GeoContext,
    categoryKey: DepartmentCategoryKey,
    context?: JurisdictionContext
  ): Agency | null {
    if (!allCities || !geoContext) return null;

    for (const cityConfig of allCities) {
      if (!Array.isArray(cityConfig.agencies)) continue;

      for (const agency of cityConfig.agencies) {
        if (agency.categoryKey !== categoryKey) continue;

        if (agency.jurisdiction) {
          const rules = agency.jurisdiction;

          // 1. Validate State match
          if (rules.state && !geoContext.state.toLowerCase().includes(rules.state.toLowerCase())) {
            continue;
          }

          // 2. Reject if district is explicitly excluded
          const districtLower = (geoContext.districtName || geoContext.countyName || geoContext.stateDistrictName || "").toLowerCase();
          if (rules.excludedDistricts && rules.excludedDistricts.some((ex) => districtLower.includes(ex.toLowerCase()))) {
            continue;
          }

          // 3. Match operational jurisdiction (supportedDistricts, supportedCities, supportedMunicipalities)
          const cityLower = (geoContext.cityName || "").toLowerCase();
          const municipalLower = (geoContext.municipalityName || "").toLowerCase();
          const localityLower = (geoContext.localityName || geoContext.villageName || geoContext.townName || "").toLowerCase();

          const hasDistrictMatch = rules.supportedDistricts?.some((d) => districtLower.includes(d.toLowerCase()));
          const hasCityMatch = rules.supportedCities?.some((c) => cityLower.includes(c.toLowerCase()) || localityLower.includes(c.toLowerCase()));
          const hasMunicipalMatch = rules.supportedMunicipalities?.some((m) => municipalLower.includes(m.toLowerCase()));
          const isPrimaryCityMatch = geoContext.cityId !== "unresolved_city" && geoContext.cityId === agency.cityId;

          if (hasDistrictMatch || hasCityMatch || hasMunicipalMatch || isPrimaryCityMatch) {
            return agency;
          }
        } else if (geoContext.cityId !== "unresolved_city" && geoContext.cityId === agency.cityId) {
          return agency;
        }
      }
    }

    return null;
  }

  /**
   * Resolves the target Agency for a specific CityConfig and category (Legacy compatibility).
   */
  public static resolveAgency(
    cityConfig: CityConfig,
    categoryKey: DepartmentCategoryKey,
    context?: JurisdictionContext
  ): Agency | null {
    if (!cityConfig || !Array.isArray(cityConfig.agencies)) {
      return null;
    }

    // 1. Check custom jurisdiction routing rules in CityConfig (e.g., zone/ward specific agency overrides)
    if (cityConfig.routingRules && cityConfig.routingRules.length > 0) {
      for (const rule of cityConfig.routingRules) {
        if (rule.categoryKey !== categoryKey) continue;

        const zoneMatch = !rule.zoneId || rule.zoneId === context?.zoneId;
        const wardMatch = !rule.wardId || rule.wardId === context?.wardId;

        if (zoneMatch && wardMatch) {
          const match = cityConfig.agencies.find((a) => a.agencyId === rule.assignedAgencyId);
          if (match) return match;
        }
      }
    }

    // 2. Default lookup by categoryKey in CityConfig.agencies
    const agencyMatch = cityConfig.agencies.find((a) => a.categoryKey === categoryKey);
    return agencyMatch ?? null;
  }
}
