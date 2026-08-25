import { TRANSITIONS, TERMINAL_STATES, type LifecycleState, type PermittedActorRole } from "../../src/modules/lifecycle/transitionPolicy";
import { SLA_POLICY, getSlaPolicy } from "../../src/modules/lifecycle/slaPolicy";
import { canTransition } from "../../src/modules/lifecycle/lifecycleStateMachine";
import { computeDueDates, pauseResolutionClock, resumeResolutionClock } from "../../src/modules/lifecycle/slaCalculator";
import { ConflictError, ForbiddenError, ValidationError, TransitionNotAllowedError } from "../../src/modules/lifecycle/lifecycleErrors";

async function runPhase1TransitionSuite() {
  console.log("🧪 Executing Phase 1 State Machine Guard & SLA Calculator Test Suite...");
  let passCount = 0;
  let testCount = 0;

  function assert(condition: boolean, msg: string) {
    testCount++;
    if (!condition) {
      console.error(`❌ Test FAILED: ${msg}`);
      throw new Error(msg);
    }
    passCount++;
  }

  // 1. Error Classes
  const err409 = new ConflictError("Conflict");
  assert(err409.statusCode === 409, "ConflictError status 409");
  const err403 = new ForbiddenError("Forbidden");
  assert(err403.statusCode === 403, "ForbiddenError status 403");
  const err400 = new ValidationError("Invalid");
  assert(err400.statusCode === 400, "ValidationError status 400");
  const err422 = new TransitionNotAllowedError("Not allowed", "NO_SUCH_TRANSITION");
  assert(err422.statusCode === 422 && err422.rejectionReason === "NO_SUCH_TRANSITION", "TransitionNotAllowedError status 422");

  // 2. Terminal State Structural Invariant
  assert(TERMINAL_STATES.length === 3, "Exactly 3 terminal states");
  assert(TERMINAL_STATES.includes("CLOSED"), "CLOSED is terminal");
  assert(TERMINAL_STATES.includes("REJECTED"), "REJECTED is terminal");
  assert(TERMINAL_STATES.includes("DUPLICATE"), "DUPLICATE is terminal");

  for (const termState of TERMINAL_STATES) {
    assert(TRANSITIONS[termState].length === 0, `Terminal state '${termState}' must have zero outgoing transitions`);
    const res = canTransition(termState, "IN_PROGRESS", "SUPERVISOR", {});
    assert(!res.ok && res.reason === "TERMINAL_STATE", `Transition from terminal state '${termState}' must be rejected with TERMINAL_STATE`);
  }

  // 3. Every Valid Transition In Contract
  const validScenarios: Array<{
    from: LifecycleState;
    to: any;
    role: PermittedActorRole;
    payload: Record<string, any>;
  }> = [
    { from: "CREATED", to: "ROUTED", role: "SYSTEM", payload: {} },
    { from: "ROUTED", to: "ACKNOWLEDGED", role: "DEPARTMENT_OFFICER", payload: {} },
    { from: "ROUTED", to: "ACKNOWLEDGED", role: "SUPERVISOR", payload: {} },
    { from: "ROUTED", to: "REASSIGNED", role: "COMMAND_CENTER", payload: { reasonCode: "wrong_dept" } },
    { from: "ACKNOWLEDGED", to: "UNDER_INVESTIGATION", role: "DEPARTMENT_OFFICER", payload: {} },
    { from: "ACKNOWLEDGED", to: "REASSIGNED", role: "SUPERVISOR", payload: { reasonCode: "wrong_ward" } },
    { from: "UNDER_INVESTIGATION", to: "VALIDATED", role: "SUPERVISOR", payload: {} },
    { from: "UNDER_INVESTIGATION", to: "DUPLICATE", role: "SUPERVISOR", payload: { parentIssueId: "iss_root" } },
    { from: "UNDER_INVESTIGATION", to: "REJECTED", role: "SUPERVISOR", payload: { reasonCode: "invalid_report" } },
    { from: "UNDER_INVESTIGATION", to: "REASSIGNED", role: "SUPERVISOR", payload: { reasonCode: "boundary_issue" } },
    { from: "VALIDATED", to: "FIELD_ASSIGNED", role: "SUPERVISOR", payload: { unitId: "u1", crewId: "c1", leadOfficerId: "o1" } },
    { from: "FIELD_ASSIGNED", to: "IN_PROGRESS", role: "FIELD_CREW", payload: {} },
    { from: "FIELD_ASSIGNED", to: "IN_PROGRESS", role: "SUPERVISOR", payload: {} },
    { from: "IN_PROGRESS", to: "DEFERRED", role: "SUPERVISOR", payload: { reasonCode: "weather", resumeBy: new Date() } },
    { from: "IN_PROGRESS", to: "RESOLUTION_SUBMITTED", role: "FIELD_CREW", payload: { afterEvidenceUrl: "http://photo.jpg", resolutionNotes: "Done" } },
    { from: "DEFERRED", to: "IN_PROGRESS", role: "FIELD_CREW", payload: {} },
    { from: "RESOLUTION_SUBMITTED", to: "CLOSED", role: "SUPERVISOR", payload: {} },
    { from: "RESOLUTION_SUBMITTED", to: "REOPENED", role: "SUPERVISOR", payload: { reasonCode: "incomplete" } },
    { from: "REOPENED", to: "IN_PROGRESS", role: "SUPERVISOR", payload: {} },
    { from: "REOPENED", to: "UNDER_INVESTIGATION", role: "DEPARTMENT_OFFICER", payload: {} },
  ];

  for (const s of validScenarios) {
    const res = canTransition(s.from, s.to, s.role, s.payload);
    assert(res.ok === true, `Valid transition ${s.from} -> ${s.to} by ${s.role} must succeed`);
  }

  // 4. Invalid Transitions
  const invalidTransitions: Array<[LifecycleState, any]> = [
    ["CREATED", "IN_PROGRESS"],
    ["ROUTED", "CLOSED"],
    ["ACKNOWLEDGED", "CLOSED"],
    ["UNDER_INVESTIGATION", "IN_PROGRESS"],
    ["VALIDATED", "CLOSED"],
    ["FIELD_ASSIGNED", "CLOSED"],
    ["IN_PROGRESS", "CLOSED"],
    ["DEFERRED", "CLOSED"],
    ["REOPENED", "CLOSED"],
  ];

  for (const [from, to] of invalidTransitions) {
    const res = canTransition(from, to, "SUPERVISOR", {});
    assert(!res.ok && res.reason === "NO_SUCH_TRANSITION", `Invalid transition ${from} -> ${to} must be rejected with NO_SUCH_TRANSITION`);
  }

  // 5. Role Authorization Rejections
  const roleRejections: Array<{
    from: LifecycleState;
    to: any;
    role: PermittedActorRole;
    payload: Record<string, any>;
  }> = [
    { from: "CREATED", to: "ROUTED", role: "FIELD_CREW", payload: {} },
    { from: "ROUTED", to: "REASSIGNED", role: "DEPARTMENT_OFFICER", payload: { reasonCode: "r1" } },
    { from: "VALIDATED", to: "FIELD_ASSIGNED", role: "FIELD_CREW", payload: { unitId: "u1", crewId: "c1", leadOfficerId: "o1" } },
    { from: "IN_PROGRESS", to: "DEFERRED", role: "FIELD_CREW", payload: { reasonCode: "r1", resumeBy: new Date() } },
    { from: "UNDER_INVESTIGATION", to: "REJECTED", role: "FIELD_CREW", payload: { reasonCode: "r1" } },
  ];

  for (const r of roleRejections) {
    const res = canTransition(r.from, r.to, r.role, r.payload);
    assert(!res.ok && res.reason === "ROLE_NOT_PERMITTED", `Role rejection ${r.from} -> ${r.to} by ${r.role} must return ROLE_NOT_PERMITTED`);
  }

  // 6. Missing Payload Field Rejections
  const payloadRejections: Array<{
    from: LifecycleState;
    to: any;
    role: PermittedActorRole;
    payload: Record<string, any>;
  }> = [
    { from: "ROUTED", to: "REASSIGNED", role: "COMMAND_CENTER", payload: {} }, // missing reasonCode
    { from: "UNDER_INVESTIGATION", to: "DUPLICATE", role: "SUPERVISOR", payload: {} }, // missing parentIssueId
    { from: "UNDER_INVESTIGATION", to: "REJECTED", role: "SUPERVISOR", payload: {} }, // missing reasonCode
    { from: "VALIDATED", to: "FIELD_ASSIGNED", role: "SUPERVISOR", payload: { unitId: "u1" } }, // missing crewId, leadOfficerId
    { from: "IN_PROGRESS", to: "DEFERRED", role: "SUPERVISOR", payload: { reasonCode: "r1" } }, // missing resumeBy
    { from: "IN_PROGRESS", to: "RESOLUTION_SUBMITTED", role: "FIELD_CREW", payload: { afterEvidenceUrl: "url" } }, // missing resolutionNotes
    { from: "RESOLUTION_SUBMITTED", to: "REOPENED", role: "SUPERVISOR", payload: {} }, // missing reasonCode
  ];

  for (const pr of payloadRejections) {
    const res = canTransition(pr.from, pr.to, pr.role, pr.payload);
    assert(!res.ok && res.reason === "MISSING_PAYLOAD_FIELD", `Missing payload field ${pr.from} -> ${pr.to} must return MISSING_PAYLOAD_FIELD`);
  }

  // 7. SLA Policy & Calculator Invariants
  const electricitySla = getSlaPolicy("electricity", "critical");
  assert(electricitySla.citizenSlaHours === 8, "Electricity critical citizen SLA = 8h");
  assert(electricitySla.ackSlaHours === 0.5, "Electricity critical ack SLA = 0.5h");
  assert(electricitySla.resolutionSlaHours === 4, "Electricity critical resolution SLA = 4h");

  const unknownSla = getSlaPolicy("non_existent_category", "high");
  assert(unknownSla.citizenSlaHours === SLA_POLICY.unknown.high.citizenSlaHours, "Unknown category maps to SLA_POLICY.unknown");

  const now = new Date("2026-08-24T10:00:00Z");
  const dueDates = computeDueDates("electricity", "critical", now);
  assert(dueDates.citizenSlaDueAt.getTime() === now.getTime() + 8 * 3600 * 1000, "computeDueDates citizenSlaDueAt math");
  assert(dueDates.ackDueAt.getTime() === now.getTime() + 0.5 * 3600 * 1000, "computeDueDates ackDueAt math");
  assert(dueDates.slaDueAt.getTime() === now.getTime() + 4 * 3600 * 1000, "computeDueDates slaDueAt math");

  const targetSlaDueAt = new Date(now.getTime() + 10 * 3600 * 1000);
  const pauseTime = new Date(now.getTime() + 2 * 3600 * 1000);
  const paused = pauseResolutionClock(targetSlaDueAt, pauseTime);
  assert(paused.slaRemainingMs === 8 * 3600 * 1000, "pauseResolutionClock computes 8h remaining");

  const resumeTime = new Date("2026-08-25T10:00:00Z");
  const resumed = resumeResolutionClock(paused.slaRemainingMs, resumeTime);
  assert(resumed.slaDueAt.getTime() === resumeTime.getTime() + 8 * 3600 * 1000, "resumeResolutionClock adds remaining ms to resume time");

  console.log(`🎉 PHASE 1 TRANSITION SUITE PASSED ALL ${testCount} ASSERTIONS!`);
}

runPhase1TransitionSuite().catch((e) => {
  console.error(e);
  process.exit(1);
});
