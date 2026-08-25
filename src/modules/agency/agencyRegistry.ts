import type { Agency, DepartmentCategoryKey, GeoContext } from "@/src/modules/contracts";
import { CityRegistry } from "@/config/cityRegistry";
import { JurisdictionResolver, type JurisdictionContext } from "./jurisdictionResolver";

export class DomainAgencyRegistry {
  public static resolveAgencyForGeoContext(
    geoContext: GeoContext,
    categoryKey: DepartmentCategoryKey,
    context?: JurisdictionContext
  ): Agency | null {
    const allCities = CityRegistry.getAllCities();
    return JurisdictionResolver.resolveAgencyForGeoContext(allCities, geoContext, categoryKey, context);
  }

  public static getAgency(
    cityId: string,
    categoryKey: DepartmentCategoryKey,
    context?: JurisdictionContext
  ): Agency | null {
    const cityConfig = CityRegistry.getCity(cityId);
    if (!cityConfig) return null;
    return JurisdictionResolver.resolveAgency(cityConfig, categoryKey, context);
  }

  public static getAgenciesForCity(cityId: string): Agency[] {
    const cityConfig = CityRegistry.getCity(cityId);
    return cityConfig?.agencies ?? [];
  }
}
