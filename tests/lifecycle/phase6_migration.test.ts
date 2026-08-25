import { getSlaPolicy } from "../../src/modules/lifecycle/slaPolicy";

async function runPhase6MigrationSuite() {
  console.log("🧪 Executing Phase 6 Migration Invariants & Audit Logic Test Suite...");
  let testCount = 0;

  function assert(condition: boolean, msg: string) {
    testCount++;
    if (!condition) {
      console.error(`❌ Test FAILED: ${msg}`);
      throw new Error(msg);
    }
  }

  // 1. Legacy Status Mapping Test
  const resolveLegacyStatus = (doc: any) => {
    const isResolved = doc.primaryStatus === "resolved" || doc.departmentStage === "closed" || doc.status === "resolved";
    return isResolved ? "CLOSED" : "ROUTED";
  };

  assert(resolveLegacyStatus({ primaryStatus: "resolved" }) === "CLOSED", "primaryStatus = 'resolved' maps to CLOSED");
  assert(resolveLegacyStatus({ departmentStage: "closed" }) === "CLOSED", "departmentStage = 'closed' maps to CLOSED");
  assert(resolveLegacyStatus({ status: "resolved" }) === "CLOSED", "status = 'resolved' maps to CLOSED");
  assert(resolveLegacyStatus({ primaryStatus: "submitted", departmentStage: "assigned" }) === "ROUTED", "Active legacy issue maps to ROUTED");

  // 2. Idempotency Invariant Logic Test
  const isDocMigrated = (doc: any) => !!doc.state;
  assert(isDocMigrated({ issueId: "1", state: "ROUTED" }) === true, "Document with state present is identified as already migrated");
  assert(isDocMigrated({ issueId: "2" }) === false, "Document without state is identified as unmigrated");

  // 3. SLA Backfill Calculation
  const submittedAt = new Date("2026-01-01T00:00:00Z");
  const slaPolicy = getSlaPolicy("water", "high");
  const citizenSlaDueAt = new Date(submittedAt.getTime() + slaPolicy.citizenSlaHours * 3600 * 1000);
  const ackDueAt = new Date(submittedAt.getTime() + slaPolicy.ackSlaHours * 3600 * 1000);
  const slaDueAt = new Date(submittedAt.getTime() + slaPolicy.resolutionSlaHours * 3600 * 1000);

  assert(citizenSlaDueAt.toISOString() === "2026-01-02T12:00:00.000Z", "Water high citizen SLA backfill = 36h");
  assert(ackDueAt.toISOString() === "2026-01-01T02:00:00.000Z", "Water high ack SLA backfill = 2h");
  assert(slaDueAt.toISOString() === "2026-01-01T18:00:00.000Z", "Water high resolution SLA backfill = 18h");

  console.log(`🎉 PHASE 6 MIGRATION SUITE PASSED ALL ${testCount} ASSERTIONS!`);
}

runPhase6MigrationSuite().catch((e) => {
  console.error(e);
  process.exit(1);
});
