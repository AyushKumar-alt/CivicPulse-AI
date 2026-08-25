import { TRANSITIONS, TERMINAL_STATES } from "../../src/modules/lifecycle/transitionPolicy";
import { SLA_POLICY, getSlaPolicy } from "../../src/modules/lifecycle/slaPolicy";
import { computeDueDates, pauseResolutionClock, resumeResolutionClock } from "../../src/modules/lifecycle/slaCalculator";
import { canTransition } from "../../src/modules/lifecycle/lifecycleStateMachine";
import { ConflictError, ForbiddenError, ValidationError, TransitionNotAllowedError } from "../../src/modules/lifecycle/lifecycleErrors";

async function runPhase1Tests() {
  console.log("🧪 Starting Phase 1 Lifecycle Unit Tests...");

  // 1. Verify Errors
  const conflict = new ConflictError("Conflict");
  const forbidden = new ForbiddenError("Forbidden");
  const validation = new ValidationError("Invalid");
  const transitionNotAllowed = new TransitionNotAllowedError("Not allowed", "TERMINAL_STATE");
  
  if (conflict.statusCode !== 409 || forbidden.statusCode !== 403 || validation.statusCode !== 400 || transitionNotAllowed.statusCode !== 422) {
    throw new Error("❌ Error status code verification failed");
  }
  console.log("  ✅ Typed error classes verified (409, 403, 400, 422)");

  // 2. Structural Test: Only CLOSED, REJECTED, DUPLICATE have empty outgoing transitions
  const canonicalStates = Object.keys(TRANSITIONS);
  for (const state of canonicalStates) {
    const rules = TRANSITIONS[state as keyof typeof TRANSITIONS];
    if (TERMINAL_STATES.includes(state as any)) {
      if (rules.length !== 0) {
        throw new Error(`❌ Terminal state ${state} must have 0 outgoing transitions, found ${rules.length}`);
      }
    } else {
      if (rules.length === 0) {
        throw new Error(`❌ Non-terminal state ${state} must have >0 outgoing transitions`);
      }
    }
  }
  console.log("  ✅ Structural assertion passed: CLOSED, REJECTED, DUPLICATE are the only 3 terminal states");

  // 3. Test canTransition Guard
  const validAck = canTransition("ROUTED", "ACKNOWLEDGED", "DEPARTMENT_OFFICER");
  if (!validAck.ok) throw new Error("❌ Failed valid ROUTED -> ACKNOWLEDGED transition");

  const terminalFail = canTransition("CLOSED", "REOPENED" as any, "SUPERVISOR");
  if (terminalFail.ok || terminalFail.reason !== "TERMINAL_STATE") {
    throw new Error("❌ Terminal state check failed for CLOSED");
  }

  const roleFail = canTransition("ROUTED", "REASSIGNED", "DEPARTMENT_OFFICER", { reasonCode: "wrong" });
  if (roleFail.ok || roleFail.reason !== "ROLE_NOT_PERMITTED") {
    throw new Error("❌ Role authorization check failed for ROUTED -> REASSIGNED");
  }

  const missingPayloadFail = canTransition("ROUTED", "REASSIGNED", "COMMAND_CENTER", {});
  if (missingPayloadFail.ok || missingPayloadFail.reason !== "MISSING_PAYLOAD_FIELD") {
    throw new Error("❌ Missing payload field check failed for ROUTED -> REASSIGNED");
  }
  console.log("  ✅ canTransition guard checks passed (valid, terminal, role, payload)");

  // 4. Test SLA Calculator
  const now = new Date("2026-08-24T10:00:00Z");
  const dueDates = computeDueDates("electricity", "critical", now);
  
  // Electricity critical policy: citizen: 8h, ack: 0.5h, resolution: 4h
  const expectedAckMs = now.getTime() + 0.5 * 3600 * 1000;
  const expectedResMs = now.getTime() + 4 * 3600 * 1000;
  const expectedCitizenMs = now.getTime() + 8 * 3600 * 1000;

  if (dueDates.ackDueAt.getTime() !== expectedAckMs || dueDates.slaDueAt.getTime() !== expectedResMs || dueDates.citizenSlaDueAt.getTime() !== expectedCitizenMs) {
    throw new Error("❌ SLA computeDueDates calculation mismatch");
  }

  // Pause clock
  const paused = pauseResolutionClock(dueDates.slaDueAt, new Date("2026-08-24T11:00:00Z")); // 1h passed, 3h (10800000ms) remaining
  if (paused.slaRemainingMs !== 3 * 3600 * 1000 || paused.slaDueAt !== null) {
    throw new Error("❌ pauseResolutionClock calculation mismatch");
  }

  // Resume clock 5 hours later
  const resumeNow = new Date("2026-08-24T16:00:00Z");
  const resumed = resumeResolutionClock(paused.slaRemainingMs, resumeNow);
  if (resumed.slaDueAt.getTime() !== resumeNow.getTime() + 3 * 3600 * 1000 || resumed.slaRemainingMs !== null) {
    throw new Error("❌ resumeResolutionClock calculation mismatch");
  }
  console.log("  ✅ SLA Calculator functions verified (computeDueDates, pauseResolutionClock, resumeResolutionClock)");

  console.log("🎉 ALL PHASE 1 TESTS PASSED SUCCESSFULLY!");
}

runPhase1Tests().catch((err) => {
  console.error("❌ Phase 1 Test Failed:", err);
  process.exit(1);
});
