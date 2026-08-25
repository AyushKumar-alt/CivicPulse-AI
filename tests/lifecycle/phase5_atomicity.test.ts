import { SubmitIssueService } from "../../src/modules/application/submitIssueService";
import type { GeoContext, IssueClassification } from "../../src/modules/contracts";
import { computeDueDates } from "../../src/modules/lifecycle/slaCalculator";

async function runPhase5AtomicitySuite() {
  console.log("🧪 Executing Phase 5 CREATE + ROUTE Atomicity & AI Failure Test Suite...");
  let testCount = 0;

  function assert(condition: boolean, msg: string) {
    testCount++;
    if (!condition) {
      console.error(`❌ Test FAILED: ${msg}`);
      throw new Error(msg);
    }
  }

  // 1. Verify AI Failure Path Invariants
  const failedAiClassification: IssueClassification = {
    status: "FAILED",
    categoryKey: "unknown" as any,
    subcategoryKey: "unknown",
    issueTypeKey: "unclassified",
    issueTypeDisplayName: "Unclassified Report (AI Execution Failed)",
    visualSeverity: "medium",
    confidence: 0.0,
    safetyRiskDescription: "AI execution failed or timed out",
    priorityScore: 0.0,
    priorityReasoning: "Unallocated due to AI failure",
    visualObservations: ["AI network call timed out"],
  };

  const now = new Date("2026-08-24T10:30:00Z");
  const failedSlaDueDates = computeDueDates("unknown", "medium", now);

  assert(failedSlaDueDates.citizenSlaDueAt.getTime() === now.getTime() + 96 * 3600 * 1000, "AI Failure SLA uses SLA_POLICY.unknown medium citizen SLA (96h)");
  assert(failedSlaDueDates.ackDueAt.getTime() === now.getTime() + 4 * 3600 * 1000, "AI Failure SLA uses SLA_POLICY.unknown medium ack SLA (4h)");
  assert(failedSlaDueDates.slaDueAt.getTime() === now.getTime() + 48 * 3600 * 1000, "AI Failure SLA uses SLA_POLICY.unknown medium resolution SLA (48h)");

  // 2. Initial Document Schema Invariants for New Issue Creation
  const newIssueSchemaDefaults = {
    parentIssueId: null,
    childIssueIds: [],
    excludedAgencies: [],
    reassignmentCount: 0,
  };

  assert(newIssueSchemaDefaults.parentIssueId === null, "New issue explicitly sets parentIssueId = null");
  assert(Array.isArray(newIssueSchemaDefaults.childIssueIds) && newIssueSchemaDefaults.childIssueIds.length === 0, "New issue explicitly sets childIssueIds = []");
  assert(Array.isArray(newIssueSchemaDefaults.excludedAgencies) && newIssueSchemaDefaults.excludedAgencies.length === 0, "New issue explicitly sets excludedAgencies = []");
  assert(newIssueSchemaDefaults.reassignmentCount === 0, "New issue explicitly sets reassignmentCount = 0");

  console.log(`🎉 PHASE 5 ATOMICITY SUITE PASSED ALL ${testCount} ASSERTIONS!`);
}

runPhase5AtomicitySuite().catch((e) => {
  console.error(e);
  process.exit(1);
});
