export type LifecycleState =
  | "CREATED"
  | "ROUTED"
  | "ACKNOWLEDGED"
  | "UNDER_INVESTIGATION"
  | "VALIDATED"
  | "FIELD_ASSIGNED"
  | "IN_PROGRESS"
  | "DEFERRED"
  | "RESOLUTION_SUBMITTED"
  | "CLOSED"
  | "REOPENED"
  | "DUPLICATE"
  | "REJECTED";

export type OperationalEventTarget =
  | LifecycleState
  | "REASSIGNED";

export type PermittedActorRole =
  | "SYSTEM"
  | "DEPARTMENT_OFFICER"
  | "SUPERVISOR"
  | "FIELD_CREW"
  | "COMMAND_CENTER";

export interface TransitionRule {
  fromState: LifecycleState;
  toState: OperationalEventTarget;
  permittedRoles: readonly PermittedActorRole[];
  requiredPayloadFields: readonly string[];
  description: string;
}

export const TRANSITIONS: Record<LifecycleState, readonly TransitionRule[]> = {
  CREATED: [
    {
      fromState: "CREATED",
      toState: "ROUTED",
      permittedRoles: ["SYSTEM"],
      requiredPayloadFields: [],
      description: "Automated deterministic routing assigns canonical issue to authoritative regional agency.",
    },
  ],
  ROUTED: [
    {
      fromState: "ROUTED",
      toState: "ACKNOWLEDGED",
      permittedRoles: ["DEPARTMENT_OFFICER", "SUPERVISOR"],
      requiredPayloadFields: [],
      description: "Department officer or supervisor accepts operational accountability for routed issue.",
    },
    {
      fromState: "ROUTED",
      toState: "REASSIGNED",
      permittedRoles: ["COMMAND_CENTER"],
      requiredPayloadFields: ["reasonCode"],
      description: "Command Center overrides agency assignment and triggers deterministic reassignment with exclusion.",
    },
  ],
  ACKNOWLEDGED: [
    {
      fromState: "ACKNOWLEDGED",
      toState: "UNDER_INVESTIGATION",
      permittedRoles: ["DEPARTMENT_OFFICER", "SUPERVISOR"],
      requiredPayloadFields: [],
      description: "Officer initiates field verification or physical inspection.",
    },
    {
      fromState: "ACKNOWLEDGED",
      toState: "REASSIGNED",
      permittedRoles: ["DEPARTMENT_OFFICER", "SUPERVISOR", "COMMAND_CENTER"],
      requiredPayloadFields: ["reasonCode"],
      description: "Acknowledged issue is reassigned to another regional agency.",
    },
  ],
  UNDER_INVESTIGATION: [
    {
      fromState: "UNDER_INVESTIGATION",
      toState: "VALIDATED",
      permittedRoles: ["DEPARTMENT_OFFICER", "SUPERVISOR"],
      requiredPayloadFields: [],
      description: "Field investigation confirms legitimate civic issue requiring physical work.",
    },
    {
      fromState: "UNDER_INVESTIGATION",
      toState: "DUPLICATE",
      permittedRoles: ["DEPARTMENT_OFFICER", "SUPERVISOR"],
      requiredPayloadFields: ["parentIssueId"],
      description: "Investigation identifies report as duplicate of existing parent issue (auto-links to root parent).",
    },
    {
      fromState: "UNDER_INVESTIGATION",
      toState: "REJECTED",
      permittedRoles: ["SUPERVISOR"],
      requiredPayloadFields: ["reasonCode"],
      description: "Supervisor rejects report as invalid, non-civic, or private property.",
    },
    {
      fromState: "UNDER_INVESTIGATION",
      toState: "REASSIGNED",
      permittedRoles: ["DEPARTMENT_OFFICER", "SUPERVISOR", "COMMAND_CENTER"],
      requiredPayloadFields: ["reasonCode"],
      description: "Investigation determines issue belongs to another agency jurisdiction.",
    },
  ],
  VALIDATED: [
    {
      fromState: "VALIDATED",
      toState: "FIELD_ASSIGNED",
      permittedRoles: ["SUPERVISOR"],
      requiredPayloadFields: ["unitId", "crewId", "leadOfficerId"],
      description: "Supervisor assigns validated issue to operational unit, crew, and lead officer.",
    },
  ],
  FIELD_ASSIGNED: [
    {
      fromState: "FIELD_ASSIGNED",
      toState: "IN_PROGRESS",
      permittedRoles: ["FIELD_CREW", "SUPERVISOR"],
      requiredPayloadFields: [],
      description: "Field crew arrives on site and initiates physical repair or safety isolation.",
    },
  ],
  IN_PROGRESS: [
    {
      fromState: "IN_PROGRESS",
      toState: "DEFERRED",
      permittedRoles: ["SUPERVISOR"],
      requiredPayloadFields: ["reasonCode", "resumeBy"],
      description: "Work paused due to external constraints (sanction, weather, permit).",
    },
    {
      fromState: "IN_PROGRESS",
      toState: "RESOLUTION_SUBMITTED",
      permittedRoles: ["FIELD_CREW", "SUPERVISOR"],
      requiredPayloadFields: ["afterEvidenceUrl", "resolutionNotes"],
      description: "Field crew completes repair and submits visual after-evidence.",
    },
  ],
  DEFERRED: [
    {
      fromState: "DEFERRED",
      toState: "IN_PROGRESS",
      permittedRoles: ["SUPERVISOR", "FIELD_CREW"],
      requiredPayloadFields: [],
      description: "Work resumes after deferral period expires or constraint clears.",
    },
  ],
  RESOLUTION_SUBMITTED: [
    {
      fromState: "RESOLUTION_SUBMITTED",
      toState: "CLOSED",
      permittedRoles: ["SUPERVISOR", "COMMAND_CENTER"],
      requiredPayloadFields: [],
      description: "Independent supervisor or Command Center verifies repair evidence and closes issue.",
    },
    {
      fromState: "RESOLUTION_SUBMITTED",
      toState: "REOPENED",
      permittedRoles: ["SUPERVISOR", "COMMAND_CENTER"],
      requiredPayloadFields: ["reasonCode"],
      description: "Verification fails or repair inadequate; returned for remediation.",
    },
  ],
  CLOSED: [],
  REOPENED: [
    {
      fromState: "REOPENED",
      toState: "IN_PROGRESS",
      permittedRoles: ["SUPERVISOR"],
      requiredPayloadFields: [],
      description: "Supervisor dispatches field crew to re-perform failed repair work.",
    },
    {
      fromState: "REOPENED",
      toState: "UNDER_INVESTIGATION",
      permittedRoles: ["DEPARTMENT_OFFICER", "SUPERVISOR"],
      requiredPayloadFields: [],
      description: "Issue sent back for re-investigation.",
    },
  ],
  DUPLICATE: [],
  REJECTED: [],
} as const;

export const TERMINAL_STATES: readonly LifecycleState[] = [
  "CLOSED",
  "REJECTED",
  "DUPLICATE",
] as const;
