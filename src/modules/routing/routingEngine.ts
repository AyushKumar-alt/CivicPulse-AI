import type {
  DepartmentCategoryKey,
  GeoContext,
  IssueClassification,
  RoutingDecision,
  RoutingMethod,
} from "@/src/modules/contracts";
import { CityRegistry } from "@/config/cityRegistry";
import { TaxonomyEngine } from "@/src/modules/taxonomy";
import { DomainAgencyRegistry, type JurisdictionContext } from "@/src/modules/agency";

export class DeterministicRoutingEngine {
  public static route(
    geoContext: GeoContext,
    classification: IssueClassification,
    jurisdiction?: JurisdictionContext
  ): RoutingDecision {
    const timestamp = new Date().toISOString();
    const routingId = `rt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // 0. Enforce Unresolved routing if AI classification failed or confidence is zero
    if (!classification || classification.status === "FAILED" || classification.confidence === 0 || (classification.categoryKey as string) === "unknown") {
      return this.createUnresolvedDecision(
        routingId,
        timestamp,
        geoContext?.cityId ?? "unresolved_city",
        "unknown" as DepartmentCategoryKey,
        classification?.subcategoryKey ?? "unknown",
        classification?.issueTypeKey ?? "unknown",
        "UNRESOLVED_AI_FAILURE: AI execution failed or returned 0 confidence",
        jurisdiction
      );
    }

    // 1. Validate Taxonomy Category
    if (!TaxonomyEngine.isSupportedCategory(classification.categoryKey)) {
      return this.createUnresolvedDecision(
        routingId,
        timestamp,
        geoContext?.cityId ?? "unresolved_city",
        classification?.categoryKey ?? "unknown" as DepartmentCategoryKey,
        classification?.subcategoryKey ?? "unknown",
        classification?.issueTypeKey ?? "unknown",
        "UNRESOLVED_TAXONOMY: Unsupported or invalid civic category key",
        jurisdiction
      );
    }

    // 2. Validate GeoContext Presence
    if (!geoContext) {
      return this.createUnresolvedDecision(
        routingId,
        timestamp,
        "unresolved_city",
        classification.categoryKey,
        classification.subcategoryKey,
        classification.issueTypeKey,
        "UNRESOLVED_GEOGRAPHY: Missing geographic context",
        jurisdiction
      );
    }

    // 3. Resolve Authoritative Agency across Operational Jurisdictions
    const agency = DomainAgencyRegistry.resolveAgencyForGeoContext(
      geoContext,
      classification.categoryKey,
      jurisdiction
    );

    if (!agency) {
      return this.createUnresolvedDecision(
        routingId,
        timestamp,
        geoContext.cityId || "unresolved_city",
        classification.categoryKey,
        classification.subcategoryKey,
        classification.issueTypeKey,
        `UNRESOLVED_AGENCY: No registered authority for category '${classification.categoryKey}' at location '${geoContext.localityName}' (${geoContext.districtName || "Unknown District"})`,
        jurisdiction
      );
    }

    // 4. Successful Deterministic Routing Decision
    const method: RoutingMethod = jurisdiction?.zoneId || jurisdiction?.wardId
      ? "JURISDICTION_FALLBACK"
      : "DETERMINISTIC_EXACT";

    const cityIdValue = (agency.cityId && agency.cityId !== "unresolved_city")
      ? agency.cityId
      : (geoContext.cityId && geoContext.cityId !== "unresolved_city")
      ? geoContext.cityId
      : null;

    return {
      routingId,
      timestamp,
      cityId: cityIdValue,
      corporationId: jurisdiction?.corporationId ?? geoContext.corporationId ?? null,
      zoneId: jurisdiction?.zoneId ?? geoContext.zoneId ?? null,
      wardId: jurisdiction?.wardId ?? geoContext.wardId ?? null,
      categoryKey: classification.categoryKey,
      subcategoryKey: classification.subcategoryKey,
      issueTypeKey: classification.issueTypeKey,
      agencyId: agency.agencyId,
      agencyName: agency.officialName,
      routingMethod: method,
      routingVersion: "1.0.0",
      confidence: 1.0,
      reason: `Deterministically assigned to ${agency.shortCode} (${agency.officialName}) for ${classification.categoryKey} at ${geoContext.localityName} (${geoContext.districtName || geoContext.state})`,
    };
  }

  public static routeWithExclusions(
    geoContext: GeoContext,
    classification: IssueClassification,
    excludedAgencies: string[] = [],
    jurisdiction?: JurisdictionContext
  ): RoutingDecision {
    const decision = this.route(geoContext, classification, jurisdiction);

    // If decision assigned an agency that is contained in excludedAgencies, reject assignment
    if (decision.agencyId && decision.agencyId !== "UNRESOLVED" && excludedAgencies.includes(decision.agencyId)) {
      return {
        ...decision,
        agencyId: "UNRESOLVED",
        agencyName: "Unresolved Manual Review Queue",
        routingMethod: "UNRESOLVED_ALL_AGENCIES_EXCLUDED" as RoutingMethod,
        confidence: 0.0,
        reason: `SAFE FAILURE: All eligible agencies (${excludedAgencies.join(", ")}) were previously excluded for this issue. Escalated to Command Centre manual review queue.`,
      };
    }

    return decision;
  }

  private static createUnresolvedDecision(
    routingId: string,
    timestamp: string,
    rawCityId: string,
    categoryKey: string,
    subcategoryKey: string,
    issueTypeKey: string,
    reason: string,
    jurisdiction?: JurisdictionContext
  ): RoutingDecision {
    const cityIdValue = (rawCityId && rawCityId !== "unresolved_city" && rawCityId !== "unknown")
      ? rawCityId
      : null;

    return {
      routingId,
      timestamp,
      cityId: cityIdValue,
      corporationId: jurisdiction?.corporationId ?? null,
      zoneId: jurisdiction?.zoneId ?? null,
      wardId: jurisdiction?.wardId ?? null,
      categoryKey: categoryKey as DepartmentCategoryKey,
      subcategoryKey: subcategoryKey || "unknown",
      issueTypeKey: issueTypeKey || "unknown",
      agencyId: "UNRESOLVED",
      agencyName: "Unresolved Manual Review Queue",
      routingMethod: "UNRESOLVED_MANUAL_REVIEW",
      routingVersion: "1.0.0",
      confidence: 0.0,
      reason: `SAFE FAILURE: ${reason}. Escalated to Command Centre manual review queue.`,
    };
  }
}

export class ExclusionRoutingAdapter {
  public static routeWithExclusions(
    geoContext: GeoContext,
    classification: IssueClassification,
    excludedAgencies: string[] = [],
    jurisdiction?: JurisdictionContext
  ): RoutingDecision {
    return DeterministicRoutingEngine.routeWithExclusions(geoContext, classification, excludedAgencies, jurisdiction);
  }
}

