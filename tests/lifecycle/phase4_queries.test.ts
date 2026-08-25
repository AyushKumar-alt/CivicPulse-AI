import { ACTIVE_RESOLUTION_SLA_STATES, ACTIVE_BACKLOG_STATES, LifecycleQueries } from "../../src/modules/lifecycle/queries";
import * as fs from "fs";
import * as path from "path";

async function runPhase4QueriesSuite() {
  console.log("🧪 Executing Phase 4 Queries, Rules & Indexes Test Suite...");
  let testCount = 0;

  function assert(condition: boolean, msg: string) {
    testCount++;
    if (!condition) {
      console.error(`❌ Test FAILED: ${msg}`);
      throw new Error(msg);
    }
  }

  // 1. ACTIVE_RESOLUTION_SLA_STATES Invariants
  assert(ACTIVE_RESOLUTION_SLA_STATES.includes("ROUTED"), "ACTIVE_RESOLUTION_SLA_STATES includes ROUTED");
  assert(ACTIVE_RESOLUTION_SLA_STATES.includes("RESOLUTION_SUBMITTED"), "ACTIVE_RESOLUTION_SLA_STATES includes RESOLUTION_SUBMITTED");
  assert(!ACTIVE_RESOLUTION_SLA_STATES.includes("DEFERRED" as any), "ACTIVE_RESOLUTION_SLA_STATES excludes DEFERRED");
  assert(!ACTIVE_RESOLUTION_SLA_STATES.includes("CLOSED" as any), "ACTIVE_RESOLUTION_SLA_STATES excludes CLOSED");
  assert(!ACTIVE_RESOLUTION_SLA_STATES.includes("REJECTED" as any), "ACTIVE_RESOLUTION_SLA_STATES excludes REJECTED");
  assert(!ACTIVE_RESOLUTION_SLA_STATES.includes("DUPLICATE" as any), "ACTIVE_RESOLUTION_SLA_STATES excludes DUPLICATE");

  // 2. ACTIVE_BACKLOG_STATES Invariants
  assert(ACTIVE_BACKLOG_STATES.includes("DEFERRED"), "ACTIVE_BACKLOG_STATES includes DEFERRED");
  assert(!ACTIVE_BACKLOG_STATES.includes("CLOSED" as any), "ACTIVE_BACKLOG_STATES excludes CLOSED");

  // 3. Inspect firestore.rules for append-only case_events rules
  const rulesPath = path.resolve(__dirname, "../../firestore.rules");
  const rulesContent = fs.readFileSync(rulesPath, "utf-8");

  assert(rulesContent.includes("match /case_events/{eventId}"), "firestore.rules contains case_events subcollection rule");
  assert(rulesContent.includes("allow update, delete: if false;"), "firestore.rules enforces append-only immutability for case_events");

  // 4. Inspect firestore.indexes.json for required composite indexes
  const indexesPath = path.resolve(__dirname, "../../firestore.indexes.json");
  const indexesContent = fs.readFileSync(indexesPath, "utf-8");
  const indexesJson = JSON.parse(indexesContent);

  const hasAgencyParentStateSlaIndex = indexesJson.indexes.some((idx: any) => {
    const fields = idx.fields.map((f: any) => f.fieldPath);
    return fields.includes("assignedAgencyId") && fields.includes("parentIssueId") && fields.includes("state") && fields.includes("slaDueAt");
  });
  assert(hasAgencyParentStateSlaIndex, "firestore.indexes.json contains composite index for Query A");

  const hasCityStateSlaIndex = indexesJson.indexes.some((idx: any) => {
    const fields = idx.fields.map((f: any) => f.fieldPath);
    return fields.includes("cityId") && fields.includes("state") && fields.includes("slaDueAt");
  });
  assert(hasCityStateSlaIndex, "firestore.indexes.json contains composite index for Query C");

  console.log(`🎉 PHASE 4 QUERIES SUITE PASSED ALL ${testCount} ASSERTIONS!`);
}

runPhase4QueriesSuite().catch((e) => {
  console.error(e);
  process.exit(1);
});
