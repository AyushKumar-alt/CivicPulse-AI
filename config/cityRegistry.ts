import type { CityConfig } from "@/src/modules/contracts";
import { ConfigurationError } from "@/src/modules/core";
import { BENGALURU_CITY_CONFIG } from "./cities/bengaluru";
import { CHENNAI_CITY_CONFIG } from "./cities/chennai";

const VALID_CATEGORIES = new Set([
  "electricity",
  "water",
  "sanitation",
  "roads",
  "traffic",
  "publicworks",
]);

export class CityRegistry {
  private static cities: Map<string, CityConfig> = new Map();
  private static initialized = false;

  public static initialize(): void {
    if (this.initialized) return;

    this.registerCity(BENGALURU_CITY_CONFIG);
    this.registerCity(CHENNAI_CITY_CONFIG);

    this.initialized = true;
  }

  public static registerCity(config: CityConfig): void {
    this.validateConfig(config);

    if (this.cities.has(config.cityId)) {
      throw new ConfigurationError(
        `Duplicate city registration attempted for cityId '${config.cityId}'`,
        config.cityId
      );
    }

    this.cities.set(config.cityId, config);
  }

  public static getCity(cityId: string): CityConfig | null {
    this.ensureInitialized();
    return this.cities.get(cityId) ?? null;
  }

  public static getAllCities(): CityConfig[] {
    this.ensureInitialized();
    return Array.from(this.cities.values());
  }

  public static hasCity(cityId: string): boolean {
    this.ensureInitialized();
    return this.cities.has(cityId);
  }

  public static validateConfig(config: CityConfig): void {
    if (!config.cityId || typeof config.cityId !== "string" || !config.cityId.trim()) {
      throw new ConfigurationError("CityConfig cityId must be a non-empty string");
    }

    if (!config.name || !config.state || !config.country) {
      throw new ConfigurationError(
        `CityConfig for '${config.cityId}' must specify name, state, and country`,
        config.cityId
      );
    }

    const bbox = config.boundingBox;
    if (
      !bbox ||
      typeof bbox.minLat !== "number" ||
      typeof bbox.maxLat !== "number" ||
      typeof bbox.minLng !== "number" ||
      typeof bbox.maxLng !== "number" ||
      bbox.minLat > bbox.maxLat ||
      bbox.minLng > bbox.maxLng
    ) {
      throw new ConfigurationError(
        `CityConfig for '${config.cityId}' contains invalid boundingBox coordinates`,
        config.cityId
      );
    }

    if (!Array.isArray(config.agencies) || config.agencies.length === 0) {
      throw new ConfigurationError(
        `CityConfig for '${config.cityId}' must contain at least one registered Agency`,
        config.cityId
      );
    }

    const agencyIds = new Set<string>();

    for (const agency of config.agencies) {
      if (!agency.agencyId || agencyIds.has(agency.agencyId)) {
        throw new ConfigurationError(
          `CityConfig for '${config.cityId}' contains duplicate or empty agencyId '${agency.agencyId}'`,
          config.cityId
        );
      }
      agencyIds.add(agency.agencyId);

      if (agency.cityId !== config.cityId) {
        throw new ConfigurationError(
          `Agency '${agency.agencyId}' cityId '${agency.cityId}' does not match parent CityConfig cityId '${config.cityId}'`,
          config.cityId
        );
      }

      if (!VALID_CATEGORIES.has(agency.categoryKey)) {
        throw new ConfigurationError(
          `Agency '${agency.agencyId}' has invalid categoryKey '${agency.categoryKey}'`,
          config.cityId
        );
      }
    }

    if (config.routingRules) {
      for (const rule of config.routingRules) {
        if (!VALID_CATEGORIES.has(rule.categoryKey)) {
          throw new ConfigurationError(
            `CityConfig routing rule contains invalid categoryKey '${rule.categoryKey}'`,
            config.cityId
          );
        }

        if (!agencyIds.has(rule.assignedAgencyId)) {
          throw new ConfigurationError(
            `Routing rule in '${config.cityId}' references unknown agencyId '${rule.assignedAgencyId}'`,
            config.cityId
          );
        }
      }
    }

    if (!config.version) {
      throw new ConfigurationError(
        `CityConfig for '${config.cityId}' must declare a configuration version`,
        config.cityId
      );
    }
  }

  private static ensureInitialized(): void {
    if (!this.initialized) {
      this.initialize();
    }
  }

  /** For testing only — resets internal registry state */
  public static _reset(): void {
    this.cities.clear();
    this.initialized = false;
  }
}

// Auto-initialize default cities at module load
CityRegistry.initialize();
