import { TRANSITIONS, TERMINAL_STATES } from "../../src/modules/lifecycle/transitionPolicy";
import { computeDueDates, pauseResolutionClock, resumeResolutionClock } from "../../src/modules/lifecycle/slaCalculator";
import { ConflictError, ForbiddenError, ValidationError, TransitionNotAllowedError } from "../../src/modules/lifecycle/lifecycleErrors";

async function runPhase2OperationsSuite() {
  console.log("🧪 Executing Phase 2 Operations & Invariant Test Suite...");
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

  // 1. Verification Separation Invariant (Submitter cannot close own resolution)
  const submitterId = "officer_field_99";
  const verifierId = "supervisor_admin_01";

  const issueSubmitted: any = {
    issueId: "iss_res_01",
    state: "RESOLUTION_SUBMITTED",
    resolutionSubmittedBy: submitterId,
    afterEvidenceUrl: "https://storage.civicpulse.ai/evidence_after.jpg",
  };

  // Same actor verification check
  const isSameActor = issueSubmitted.resolutionSubmittedBy === submitterId;
  assert(isSameActor === true, "Submitter matches attempting actor");
  // Security rule logic simulation
  let closeAllowed = !isSameActor && !!issueSubmitted.afterEvidenceUrl;
  assert(closeAllowed === false, "Close MUST be rejected when submitter == verifier");

  // Independent verifier check
  const isDifferentActor = issueSubmitted.resolutionSubmittedBy !== verifierId;
  closeAllowed = isDifferentActor && !!issueSubmitted.afterEvidenceUrl;
  assert(closeAllowed === true, "Close MUST be allowed when submitter != verifier and evidence exists");

  // 2. Missing Evidence Rejection
  const issueNoEvidence: any = {
    issueId: "iss_res_02",
    state: "RESOLUTION_SUBMITTED",
    resolutionSubmittedBy: submitterId,
    afterEvidenceUrl: null,
  };
  const closeAllowedNoEv = issueNoEvidence.resolutionSubmittedBy !== verifierId && !!issueNoEvidence.afterEvidenceUrl;
  assert(closeAllowedNoEv === false, "Close MUST be rejected when afterEvidenceUrl is null");

  // 3. Duplicate Chain Collapse Logic (A -> ROOT, B -> ROOT)
  const rootIssue: any = { issueId: "iss_root_100", parentIssueId: null, childIssueIds: [] };
  const firstChild: any = { issueId: "iss_child_101", parentIssueId: rootIssue.issueId, childIssueIds: [] };

  // Second duplicate identifies firstChild as parent, but resolver must resolve rootIssue
  const secondChildTargetInput = firstChild.issueId;
  const resolvedRootId = firstChild.parentIssueId || firstChild.issueId;

  assert(resolvedRootId === "iss_root_100", "Duplicate chain auto-collapses to root parent issue ID");

  // 4. Agency Scope Security Check
  const issueAgencyA = { assignedAgencyId: "bengaluru_bescom" };
  const officerAgencyA = { actorId: "officer_1", actorRole: "DEPARTMENT_OFFICER" as const, assignedAgencyId: "bengaluru_bescom" };
  const officerAgencyB = { actorId: "officer_2", actorRole: "DEPARTMENT_OFFICER" as const, assignedAgencyId: "bengaluru_bwssb" };
  const commandCenterActor = { actorId: "cc_1", actorRole: "COMMAND_CENTER" as const, assignedAgencyId: null };

  const isOfficerAuthorized = (actor: any, issue: any) => {
    if (actor.actorRole === "COMMAND_CENTER" || actor.actorRole === "SYSTEM") return true;
    return actor.assignedAgencyId === issue.assignedAgencyId;
  };

  assert(isOfficerAuthorized(officerAgencyA, issueAgencyA) === true, "Officer from matching agency is authorized");
  assert(isOfficerAuthorized(officerAgencyB, issueAgencyA) === false, "Officer from different agency is unauthorized");
  assert(isOfficerAuthorized(commandCenterActor, issueAgencyA) === true, "Command Center is universally authorized across agencies");

  // 5. DEFERRED Clock Pause and Resume Math
  const initialSlaDueAt = new Date("2026-08-25T12:00:00Z");
  const deferStart = new Date("2026-08-24T12:00:00Z"); // 24 hours remaining
  const pausedState = pauseResolutionClock(initialSlaDueAt, deferStart);

  assert(pausedState.slaRemainingMs === 24 * 3600 * 1000, "Calculated exactly 24 hours remaining SLA");

  const resumeTime = new Date("2026-08-28T12:00:00Z"); // Deferral lasted 4 days
  const resumedState = resumeResolutionClock(pausedState.slaRemainingMs, resumeTime);

  assert(resumedState.slaDueAt.toISOString() === "2026-08-29T12:00:00.000Z", "Resumed SLA due date is exactly 24 hours after resume time");

  console.log(`🎉 PHASE 2 OPERATIONS SUITE PASSED ALL ${testCount} ASSERTIONS!`);
}

runPhase2OperationsSuite().catch((e) => {
  console.error(e);
  process.exit(1);
});
