import { DeterministicRoutingEngine, ExclusionRoutingAdapter } from "../../src/modules/routing/routingEngine";
import type { GeoContext, IssueClassification } from "../../src/modules/contracts";

async function runPhase2And3Tests() {
  console.log("🧪 Starting Phase 2 & 3 Routing Exclusion Unit Tests...");

  const mockGeo: GeoContext = {
    coordinates: { latitude: 13.14739, longitude: 77.62013 },
    country: "India",
    state: "Karnataka",
    districtName: "Bengaluru Urban",
    localityName: "Hunasamaranahalli",
    fullAddress: "Hunasamaranahalli, Bengaluru Urban, Karnataka",
    cityId: "bengaluru",
    provider: "NominatimGeoAdapter",
  };

  const mockClassification: IssueClassification = {
    categoryKey: "electricity",
    subcategoryKey: "power_outage",
    issueTypeKey: "downed_line",
    issueTypeDisplayName: "Downed High Voltage Line",
    visualSeverity: "critical",
    confidence: 0.98,
    status: "SUCCESS",
    safetyRiskDescription: "High voltage line hazard",
    priorityScore: 0.95,
    priorityReasoning: "High voltage line hazard",
    visualObservations: ["Fallen pole", "Sparking line"],
  };

  // 1. Initial Routing without exclusions
  const initialDecision = DeterministicRoutingEngine.route(mockGeo, mockClassification);
  console.log(`  Initial Routing Result: ${initialDecision.agencyId} (${initialDecision.routingMethod})`);
  if (initialDecision.agencyId !== "bengaluru_bescom") {
    throw new Error(`Expected 'bengaluru_bescom', got '${initialDecision.agencyId}'`);
  }

  // 2. Exclusion Adapter Routing excluding BESCOM
  const excludedDecision = ExclusionRoutingAdapter.routeWithExclusions(
    mockGeo,
    mockClassification,
    ["bengaluru_bescom"]
  );

  console.log(`  Exclusion Routing Result: ${excludedDecision.agencyId} (${excludedDecision.routingMethod})`);

  if (excludedDecision.agencyId !== "UNRESOLVED") {
    throw new Error(`Expected 'UNRESOLVED' after excluding BESCOM, got '${excludedDecision.agencyId}'`);
  }

  if ((excludedDecision.routingMethod as string) !== "UNRESOLVED_ALL_AGENCIES_EXCLUDED") {
    throw new Error(`Expected routingMethod 'UNRESOLVED_ALL_AGENCIES_EXCLUDED', got '${excludedDecision.routingMethod}'`);
  }

  console.log("🎉 PHASE 2 & 3 ROUTING EXCLUSION TESTS PASSED!");
}

runPhase2And3Tests().catch((err) => {
  console.error("❌ Phase 2 & 3 Test Failed:", err);
  process.exit(1);
});
