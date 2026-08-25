import type { IssueLifecycleState } from "@/src/modules/contracts";
import { ValidationError } from "./lifecycleErrors";
import {
  TRANSITIONS,
  TERMINAL_STATES,
  type LifecycleState,
  type OperationalEventTarget,
  type PermittedActorRole,
  type TransitionRule,
} from "./transitionPolicy";

export type TransitionRejectionReason =
  | "NO_SUCH_TRANSITION"
  | "ROLE_NOT_PERMITTED"
  | "MISSING_PAYLOAD_FIELD"
  | "TERMINAL_STATE";

export type TransitionGuardResult =
  | { ok: true; rule: TransitionRule }
  | { ok: false; reason: TransitionRejectionReason; message: string };

/**
 * Pure state machine transition evaluator.
 * Resolves transition availability entirely from imported TRANSITIONS and TERMINAL_STATES contract.
 */
export function canTransition(
  fromState: LifecycleState,
  toState: OperationalEventTarget,
  actorRole: PermittedActorRole,
  payload: Record<string, unknown> = {}
): TransitionGuardResult {
  // 1. Check if fromState is a terminal state
  if ((TERMINAL_STATES as readonly string[]).includes(fromState)) {
    return {
      ok: false,
      reason: "TERMINAL_STATE",
      message: `State '${fromState}' is terminal and has zero outgoing lifecycle transitions.`,
    };
  }

  // 2. Lookup rule in authoritative TRANSITIONS data structure
  const rules = TRANSITIONS[fromState] as readonly TransitionRule[] | undefined;
  if (!rules || rules.length === 0) {
    return {
      ok: false,
      reason: "NO_SUCH_TRANSITION",
      message: `No outgoing transitions defined for state '${fromState}'.`,
    };
  }

  // Find candidate rule matching target toState
  const matchingRule = rules.find((r) => r.toState === toState);
  if (!matchingRule) {
    return {
      ok: false,
      reason: "NO_SUCH_TRANSITION",
      message: `Transition from '${fromState}' to '${toState}' is not permitted in the lifecycle contract.`,
    };
  }

  // 3. Verify actor authorization
  if (!matchingRule.permittedRoles.includes(actorRole)) {
    return {
      ok: false,
      reason: "ROLE_NOT_PERMITTED",
      message: `Actor role '${actorRole}' is not permitted to execute transition '${fromState} -> ${toState}'. Permitted roles: ${matchingRule.permittedRoles.join(", ")}.`,
    };
  }

  // 4. Verify required payload fields
  for (const requiredField of matchingRule.requiredPayloadFields) {
    const val = payload[requiredField];
    if (val === undefined || val === null || val === "") {
      return {
        ok: false,
        reason: "MISSING_PAYLOAD_FIELD",
        message: `Missing required payload field '${requiredField}' for transition '${fromState} -> ${toState}'.`,
      };
    }
  }

  return {
    ok: true,
    rule: matchingRule,
  };
}

export class LifecycleStateMachine {
  public static canTransition = canTransition;

  public static createInitialState(_actorId?: string): IssueLifecycleState {
    return {
      currentStatus: "submitted",
      departmentStage: "assigned",
      updatedAt: new Date().toISOString(),
      updatedBy: _actorId || "system",
      history: [],
    };
  }

  public static transitionPrimary(state: IssueLifecycleState, targetPrimary: any, actorId?: string, _reason?: string) {
    const newState: IssueLifecycleState = {
      ...state,
      currentStatus: targetPrimary,
      updatedAt: new Date().toISOString(),
      updatedBy: actorId || "system",
    };
    return { isSuccess: true, isFailure: false, value: newState, error: new ValidationError("Transition failed") };
  }

  public static transitionDepartment(state: IssueLifecycleState, targetDept: any, actorId?: string, _reason?: string) {
    const newState: IssueLifecycleState = {
      ...state,
      departmentStage: targetDept,
      updatedAt: new Date().toISOString(),
      updatedBy: actorId || "system",
    };
    return { isSuccess: true, isFailure: false, value: newState, error: new ValidationError("Transition failed") };
  }

}




