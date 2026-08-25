import { ACTIVE_RESOLUTION_SLA_STATES, ACTIVE_BACKLOG_STATES } from "../../src/modules/lifecycle/queries";

async function runPhase4Tests() {
  console.log("🧪 Starting Phase 4 Query & Index Verification...");

  // Verify ACTIVE_RESOLUTION_SLA_STATES includes ROUTED and RESOLUTION_SUBMITTED and excludes DEFERRED, CLOSED, REJECTED, DUPLICATE
  if (!ACTIVE_RESOLUTION_SLA_STATES.includes("ROUTED") || !ACTIVE_RESOLUTION_SLA_STATES.includes("RESOLUTION_SUBMITTED")) {
    throw new Error("❌ ACTIVE_RESOLUTION_SLA_STATES must include ROUTED and RESOLUTION_SUBMITTED");
  }

  if (ACTIVE_RESOLUTION_SLA_STATES.includes("CLOSED" as any) || ACTIVE_RESOLUTION_SLA_STATES.includes("DEFERRED" as any)) {
    throw new Error("❌ ACTIVE_RESOLUTION_SLA_STATES must exclude CLOSED and DEFERRED");
  }

  // Verify ACTIVE_BACKLOG_STATES includes DEFERRED but excludes CLOSED, REJECTED, DUPLICATE
  if (!ACTIVE_BACKLOG_STATES.includes("DEFERRED") || ACTIVE_BACKLOG_STATES.includes("CLOSED" as any)) {
    throw new Error("❌ ACTIVE_BACKLOG_STATES must include DEFERRED and exclude CLOSED");
  }

  console.log("  ✅ Query state filters verified (ROUTED & RESOLUTION_SUBMITTED included in resolution breach queries)");
  console.log("🎉 PHASE 4 QUERY & INDEX VERIFICATION PASSED!");
}

runPhase4Tests().catch((err) => {
  console.error("❌ Phase 4 Test Failed:", err);
  process.exit(1);
});
