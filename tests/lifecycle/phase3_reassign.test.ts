import { DeterministicRoutingEngine, ExclusionRoutingAdapter } from "../../src/modules/routing/routingEngine";
import type { GeoContext, IssueClassification } from "../../src/modules/contracts";
import { computeDueDates } from "../../src/modules/lifecycle/slaCalculator";

async function runPhase3ReassignmentSuite() {
  console.log("🧪 Executing Phase 3 Exclusion Routing & Reassignment Test Suite...");
  let testCount = 0;

  function assert(condition: boolean, msg: string) {
    testCount++;
    if (!condition) {
      console.error(`❌ Test FAILED: ${msg}`);
      throw new Error(msg);
    }
  }

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
    issueTypeDisplayName: "Downed Line",
    visualSeverity: "critical",
    confidence: 0.98,
    status: "SUCCESS",
    safetyRiskDescription: "High voltage hazard",
    priorityScore: 0.95,
    priorityReasoning: "High voltage hazard",
    visualObservations: ["Sparking line"],
  };

  // 1. Initial Routing
  const decision1 = DeterministicRoutingEngine.route(mockGeo, mockClassification);
  assert(decision1.agencyId === "bengaluru_bescom", "Initial routing assigns BESCOM");

  // 2. Exclusion Routing (Exclude BESCOM)
  const decision2 = ExclusionRoutingAdapter.routeWithExclusions(mockGeo, mockClassification, ["bengaluru_bescom"]);
  assert(decision2.agencyId === "UNRESOLVED", "Excluding BESCOM results in UNRESOLVED");
  assert((decision2.routingMethod as string) === "UNRESOLVED_ALL_AGENCIES_EXCLUDED", "routingMethod is UNRESOLVED_ALL_AGENCIES_EXCLUDED");

  // 3. Reassignment Clock Math Invariants
  const initialTime = new Date("2026-08-24T10:00:00Z");
  const reassignTime = new Date("2026-08-24T14:00:00Z");

  const initialClocks = computeDueDates("electricity", "critical", initialTime);
  const reassignClocks = computeDueDates("electricity", "critical", reassignTime);

  // citizenSlaDueAt MUST remain immutable during reassignment
  const immutableCitizenSla = initialClocks.citizenSlaDueAt;
  assert(immutableCitizenSla.getTime() === initialTime.getTime() + 8 * 3600 * 1000, "Citizen SLA set at creation time");

  // ackDueAt and slaDueAt MUST be recomputed from reassignTime
  assert(reassignClocks.ackDueAt.getTime() === reassignTime.getTime() + 0.5 * 3600 * 1000, "ackDueAt recomputed from reassignment time");
  assert(reassignClocks.slaDueAt.getTime() === reassignTime.getTime() + 4 * 3600 * 1000, "slaDueAt recomputed from reassignment time");

  console.log(`🎉 PHASE 3 REASSIGNMENT SUITE PASSED ALL ${testCount} ASSERTIONS!`);
}

runPhase3ReassignmentSuite().catch((e) => {
  console.error(e);
  process.exit(1);
});
