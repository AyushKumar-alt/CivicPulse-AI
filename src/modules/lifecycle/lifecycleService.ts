import { getAdminDb } from "@/lib/firebase/admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  type LifecycleState,
  type OperationalEventTarget,
  type PermittedActorRole,
} from "./transitionPolicy";
import { canTransition } from "./lifecycleStateMachine";
import {
  computeDueDates,
  pauseResolutionClock,
  resumeResolutionClock,
} from "./slaCalculator";
import {
  ConflictError,
  ForbiddenError,
  ValidationError,
  TransitionNotAllowedError,
} from "./lifecycleErrors";
import { ExclusionRoutingAdapter } from "../routing/routingEngine";
import type { DepartmentCategoryKey, SeverityLevel } from "../contracts";
import { CityRegistry } from "@/config/cityRegistry";

export interface ActorContext {
  actorId: string;
  actorRole: PermittedActorRole;
  assignedAgencyId?: string | null;
}

export interface CreateAndRouteDTO {
  issueId: string;
  photoUrl: string;
  userDescription: string;
  geoContext: any;
  classification: any;
  jurisdiction?: any;
  reporterUid?: string;
  now?: Date;
}

export interface ReassignDTO {
  issueId: string;
  reasonCode: string;
  note?: string;
  now?: Date;
}

export interface FieldAssignDTO {
  issueId: string;
  unitId: string;
  crewId: string;
  leadOfficerId: string;
  note?: string;
}

export interface DeferDTO {
  issueId: string;
  reasonCode: string;
  resumeBy: Date;
  note?: string;
}

export interface SubmitResolutionDTO {
  issueId: string;
  afterEvidenceUrl: string;
  resolutionNotes: string;
}

export interface MarkDuplicateDTO {
  issueId: string;
  targetParentId: string;
  note?: string;
}

export interface ReasonCodeDTO {
  issueId: string;
  reasonCode: string;
  note?: string;
}

export class LifecycleService {
  private static getDb() {
    return getAdminDb();
  }

  /**
   * Helper to write an immutable case_event atomically inside a transaction.
   */
  private static recordCaseEvent(
    transaction: FirebaseFirestore.Transaction,
    issueId: string,
    eventData: {
      fromState: OperationalEventTarget | null;
      toState: OperationalEventTarget;
      actorId: string;
      actorRole: PermittedActorRole;
      timestamp: Date;
      note: string;
      evidenceUrl?: string;
      reasonCode?: string;
      previousAgencyId?: string;
      newAgencyId?: string;
    }
  ) {
    const db = this.getDb();
    const eventRef = db.collection("issues").doc(issueId).collection("case_events").doc();
    transaction.set(eventRef, {
      eventId: eventRef.id,
      fromState: eventData.fromState,
      toState: eventData.toState,
      actorId: eventData.actorId,
      actorRole: eventData.actorRole,
      timestamp: Timestamp.fromDate(eventData.timestamp),
      note: eventData.note || "",
      ...(eventData.evidenceUrl ? { evidenceUrl: eventData.evidenceUrl } : {}),
      ...(eventData.reasonCode ? { reasonCode: eventData.reasonCode } : {}),
      ...(eventData.previousAgencyId ? { previousAgencyId: eventData.previousAgencyId } : {}),
      ...(eventData.newAgencyId ? { newAgencyId: eventData.newAgencyId } : {}),
    });
  }

  /**
   * 1. CREATE_AND_ROUTE: Single atomic transaction writing state = ROUTED.
   * Merges creation and deterministic routing. CREATED is never observably persisted as a resting state.
   */
  public static async createAndRoute(dto: CreateAndRouteDTO): Promise<{ issueId: string; assignedAgencyId: string }> {
    const db = this.getDb();
    const now = dto.now || new Date();

    // Pre-transaction: Load static city config & execute deterministic routing in memory
    const categoryKey: DepartmentCategoryKey = dto.classification?.categoryKey || "unknown";
    const severity: SeverityLevel = dto.classification?.severity || "medium";
    
    // Execute routing
    const routingDecision = ExclusionRoutingAdapter.routeWithExclusions(
      dto.geoContext,
      dto.classification,
      [],
      dto.jurisdiction
    );

    const assignedAgencyId = routingDecision.agencyId || "UNRESOLVED";
    const assignedAgencyName = routingDecision.agencyName || "Unresolved Manual Review Queue";
    const routingMethod = routingDecision.routingMethod || "UNRESOLVED_AI_FAILURE";

    // Compute SLA due dates using frozen policy
    const dueDates = computeDueDates(categoryKey, severity, now);

    const issueRef = db.collection("issues").doc(dto.issueId);

    await db.runTransaction(async (transaction) => {
      const issueDoc = await transaction.get(issueRef);
      if (issueDoc.exists) {
        throw new ConflictError(`Issue document '${dto.issueId}' already exists.`);
      }

      const newIssueData: Record<string, any> = {
        issueId: dto.issueId,
        state: "ROUTED",
        assignedAgencyId,
        assigned_agency_id: assignedAgencyId,
        assignedAgencyName,
        assigned_department_name: assignedAgencyName,
        routingMethod,
        categoryKey,
        severity,
        userDescription: dto.userDescription || "",
        beforeEvidenceUrl: dto.photoUrl,
        afterEvidenceUrl: null,
        resolutionNotes: null,
        resolutionSubmittedBy: null,
        resolutionSubmittedAt: null,
        acknowledgedAt: null,
        acknowledgedBy: null,
        closedAt: null,
        closedBy: null,
        resumeBy: null,
        lastReasonCode: null,
        unitId: null,
        crewId: null,
        leadOfficerId: null,
        parentIssueId: null,
        childIssueIds: [],
        excludedAgencies: [],
        reassignmentCount: 0,
        citizenSlaDueAt: Timestamp.fromDate(dueDates.citizenSlaDueAt),
        ackDueAt: Timestamp.fromDate(dueDates.ackDueAt),
        slaDueAt: Timestamp.fromDate(dueDates.slaDueAt),
        slaRemainingMs: null,
        createdAt: Timestamp.fromDate(now),
        updatedAt: Timestamp.fromDate(now),
        // Additional UI Compatibility Fields
        reporter_uid: dto.reporterUid || "unknown_reporter",
        reporterUid: dto.reporterUid || "unknown_reporter",
        submitted_at: Timestamp.fromDate(now),
        confirmation_count: 1,
        image_url: dto.photoUrl,
        raw_description: dto.userDescription || "",
        status: "analyzed",
        geoContext: dto.geoContext,
        aiObservations: dto.classification,
        location: dto.geoContext ? {
          lat: dto.geoContext.coordinates?.latitude ?? dto.geoContext.lat ?? 0,
          lng: dto.geoContext.coordinates?.longitude ?? dto.geoContext.lng ?? 0,
          address: dto.geoContext.fullAddress || dto.geoContext.localityName || "Location captured",
          zone_type: dto.geoContext.zone_type || dto.geoContext.area_category || "City Area",
        } : null,
        ai: dto.classification ? {
          issue_type: dto.classification.issueTypeDisplayName || dto.classification.subcategoryKey || "Civic Issue Report",
          severity: dto.classification.visualSeverity || dto.classification.severity || severity,
          confidence: dto.classification.confidence ?? 0.95,
          summary: dto.classification.summary || dto.classification.safetyRiskDescription || dto.classification.issueTypeDisplayName || "Civic Infrastructure Issue",
          safety_risk: dto.classification.safetyRiskDescription || dto.classification.safety_risk || "Public safety hazard identified.",
          responsible_authority: assignedAgencyName,
          category: categoryKey,
          generated_at: Timestamp.fromDate(now),
          visualObservations: dto.classification.visualObservations || [],
          priority_score: dto.classification.priorityScore ?? 8.5,
          priority_reasoning: dto.classification.priorityReasoning || "",
        } : null,
      };

      transaction.set(issueRef, newIssueData);

      // Record atomic creation and routing event pair
      this.recordCaseEvent(transaction, dto.issueId, {
        fromState: null,
        toState: "CREATED",
        actorId: "system",
        actorRole: "SYSTEM",
        timestamp: now,
        note: "Issue report submitted by citizen",
        evidenceUrl: dto.photoUrl,
      });

      this.recordCaseEvent(transaction, dto.issueId, {
        fromState: "CREATED",
        toState: "ROUTED",
        actorId: "system",
        actorRole: "SYSTEM",
        timestamp: now,
        note: `Deterministic routing assigned issue to agency '${assignedAgencyId}' via ${routingMethod}`,
      });
    });

    return { issueId: dto.issueId, assignedAgencyId };
  }

  /**
   * Generic transition executor for lifecycle state operations.
   */
  private static async executeTransition(
    issueId: string,
    expectedFromState: LifecycleState | LifecycleState[],
    targetState: OperationalEventTarget,
    actor: ActorContext,
    payload: Record<string, unknown>,
    note: string,
    mutationFn: (issue: any, now: Date) => Record<string, any>
  ): Promise<void> {
    const db = this.getDb();
    const issueRef = db.collection("issues").doc(issueId);

    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(issueRef);
      if (!doc.exists) {
        throw new ValidationError(`Issue '${issueId}' not found.`);
      }

      const issue = doc.data() as any;
      const expectedStates = Array.isArray(expectedFromState) ? expectedFromState : [expectedFromState];

      // 1. Verify expected currentState
      if (!expectedStates.includes(issue.state)) {
        throw new ConflictError(
          `State conflict: expected issue '${issueId}' in state [${expectedStates.join(", ")}], but current state is '${issue.state}'.`
        );
      }

      // 2. Agency scope guard for non-system/non-Command Center actors
      if (actor.actorRole !== "SYSTEM" && actor.actorRole !== "COMMAND_CENTER") {
        if (actor.assignedAgencyId && issue.assignedAgencyId && actor.assignedAgencyId !== issue.assignedAgencyId) {
          throw new ForbiddenError(
            `Actor agency '${actor.assignedAgencyId}' is not authorized to transition issue assigned to agency '${issue.assignedAgencyId}'.`
          );
        }
      }

      // 3. Evaluate state machine guard
      const guardResult = canTransition(issue.state, targetState, actor.actorRole, payload);
      if (!guardResult.ok) {
        throw new TransitionNotAllowedError(guardResult.message, guardResult.reason);
      }

      const now = new Date();
      const updates = mutationFn(issue, now);
      updates.updatedAt = Timestamp.fromDate(now);

      transaction.update(issueRef, updates);

      this.recordCaseEvent(transaction, issueId, {
        fromState: issue.state,
        toState: targetState,
        actorId: actor.actorId,
        actorRole: actor.actorRole,
        timestamp: now,
        note,
        evidenceUrl: payload.afterEvidenceUrl as string | undefined,
        reasonCode: (payload.reasonCode || payload.lastReasonCode) as string | undefined,
      });
    });
  }

  /**
   * 2. ACKNOWLEDGE: ROUTED -> ACKNOWLEDGED
   */
  public static async acknowledge(issueId: string, actor: ActorContext): Promise<void> {
    await this.executeTransition(
      issueId,
      "ROUTED",
      "ACKNOWLEDGED",
      actor,
      {},
      "Department accepted operational accountability for issue.",
      (issue, now) => ({
        state: "ACKNOWLEDGED",
        acknowledgedAt: Timestamp.fromDate(now),
        acknowledgedBy: actor.actorId,
      })
    );
  }

  /**
   * 3. REASSIGN: ROUTED / ACKNOWLEDGED / UNDER_INVESTIGATION -> REASSIGNED -> ROUTED
   * Single atomic transaction with agency exclusion and re-routing.
   */
  public static async reassign(
    dto: ReassignDTO,
    actor: ActorContext,
    geoContext: any,
    classification: any,
    jurisdiction?: any
  ): Promise<{ receivingAgencyId: string }> {
    const db = this.getDb();
    const issueRef = db.collection("issues").doc(dto.issueId);
    let receivingAgencyId = "UNRESOLVED";

    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(issueRef);
      if (!doc.exists) throw new ValidationError(`Issue '${dto.issueId}' not found.`);

      const issue = doc.data() as any;
      const permittedFromStates: LifecycleState[] = ["ROUTED", "ACKNOWLEDGED", "UNDER_INVESTIGATION"];
      if (!permittedFromStates.includes(issue.state)) {
        throw new ConflictError(`Cannot reassign issue in state '${issue.state}'.`);
      }

      // Guard: ROUTED -> REASSIGNED is restricted to COMMAND_CENTER
      if (issue.state === "ROUTED" && actor.actorRole !== "COMMAND_CENTER") {
        throw new ForbiddenError("Department officers cannot reassign an issue while it is still merely ROUTED.");
      }

      // Agency scope check
      if (actor.actorRole !== "SYSTEM" && actor.actorRole !== "COMMAND_CENTER") {
        if (actor.assignedAgencyId && issue.assignedAgencyId && actor.assignedAgencyId !== issue.assignedAgencyId) {
          throw new ForbiddenError("Not authorized to reassign an issue belonging to another agency.");
        }
      }

      const now = dto.now || new Date();
      const previousAgencyId = issue.assignedAgencyId;
      const updatedExclusions = Array.from(new Set([...(issue.excludedAgencies || []), previousAgencyId]));

      // Pure in-memory routing execution with exclusion
      const routingDecision = ExclusionRoutingAdapter.routeWithExclusions(
        geoContext,
        classification,
        updatedExclusions,
        jurisdiction
      );

      receivingAgencyId = routingDecision.agencyId || "UNRESOLVED";
      const routingMethod = receivingAgencyId === "UNRESOLVED"
        ? "UNRESOLVED_ALL_AGENCIES_EXCLUDED"
        : routingDecision.routingMethod || "JURISDICTION_FALLBACK";

      // Recompute agency SLAs for receiving agency (citizenSlaDueAt stays immutable)
      const categoryKey: DepartmentCategoryKey = classification?.categoryKey || issue.categoryKey || "unknown";
      const severity: SeverityLevel = classification?.severity || issue.severity || "medium";
      const dueDates = computeDueDates(categoryKey, severity, now);

      transaction.update(issueRef, {
        state: "ROUTED",
        assignedAgencyId: routingDecision.agencyId || "UNRESOLVED",
        assignedAgencyName: routingDecision.agencyName || "Unresolved Manual Review Queue",
        routingMethod,
        excludedAgencies: updatedExclusions,
        reassignmentCount: (issue.reassignmentCount || 0) + 1,
        ackDueAt: Timestamp.fromDate(dueDates.ackDueAt),
        slaDueAt: Timestamp.fromDate(dueDates.slaDueAt),
        lastReasonCode: dto.reasonCode,
        updatedAt: Timestamp.fromDate(now),
      });

      // Write paired events: ROUTED/ACK/INVEST -> REASSIGNED and REASSIGNED -> ROUTED
      this.recordCaseEvent(transaction, dto.issueId, {
        fromState: issue.state,
        toState: "REASSIGNED",
        actorId: actor.actorId,
        actorRole: actor.actorRole,
        timestamp: now,
        note: dto.note || `Issue reassigned from '${previousAgencyId}' to '${receivingAgencyId}'. Reason: ${dto.reasonCode}`,
        reasonCode: dto.reasonCode,
        previousAgencyId,
        newAgencyId: receivingAgencyId,
      });

      this.recordCaseEvent(transaction, dto.issueId, {
        fromState: "REASSIGNED",
        toState: "ROUTED",
        actorId: "system",
        actorRole: "SYSTEM",
        timestamp: now,
        note: `Deterministic reassignment placed issue in ROUTED state for agency '${receivingAgencyId}'`,
        previousAgencyId,
        newAgencyId: receivingAgencyId,
      });
    });

    return { receivingAgencyId };
  }

  /**
   * 4. START_INVESTIGATION: ACKNOWLEDGED -> UNDER_INVESTIGATION
   */
  public static async startInvestigation(issueId: string, actor: ActorContext): Promise<void> {
    await this.executeTransition(
      issueId,
      "ACKNOWLEDGED",
      "UNDER_INVESTIGATION",
      actor,
      {},
      "Officer initiated field verification inspection.",
      () => ({ state: "UNDER_INVESTIGATION" })
    );
  }

  /**
   * 5. VALIDATE: UNDER_INVESTIGATION -> VALIDATED
   */
  public static async validate(issueId: string, actor: ActorContext): Promise<void> {
    await this.executeTransition(
      issueId,
      "UNDER_INVESTIGATION",
      "VALIDATED",
      actor,
      {},
      "Field investigation confirmed valid civic issue.",
      () => ({ state: "VALIDATED" })
    );
  }

  /**
   * 6. FIELD_ASSIGN: VALIDATED -> FIELD_ASSIGNED
   */
  public static async fieldAssign(dto: FieldAssignDTO, actor: ActorContext): Promise<void> {
    await this.executeTransition(
      dto.issueId,
      "VALIDATED",
      "FIELD_ASSIGNED",
      actor,
      { unitId: dto.unitId, crewId: dto.crewId, leadOfficerId: dto.leadOfficerId },
      dto.note || `Assigned to Unit '${dto.unitId}', Crew '${dto.crewId}', Lead '${dto.leadOfficerId}'`,
      () => ({
        state: "FIELD_ASSIGNED",
        unitId: dto.unitId,
        crewId: dto.crewId,
        leadOfficerId: dto.leadOfficerId,
      })
    );
  }

  /**
   * 7. START_WORK: FIELD_ASSIGNED / REOPENED -> IN_PROGRESS
   */
  public static async startWork(issueId: string, actor: ActorContext): Promise<void> {
    const db = this.getDb();
    const doc = await db.collection("issues").doc(issueId).get();
    if (!doc.exists) throw new ValidationError(`Issue '${issueId}' not found.`);
    const currentState = doc.data()?.state;

    await this.executeTransition(
      issueId,
      currentState === "REOPENED" ? "REOPENED" : "FIELD_ASSIGNED",
      "IN_PROGRESS",
      actor,
      {},
      "Field crew arrived on site and initiated physical repair work.",
      () => ({ state: "IN_PROGRESS" })
    );
  }

  /**
   * 8. DEFER: IN_PROGRESS -> DEFERRED (Pauses resolution SLA)
   */
  public static async defer(dto: DeferDTO, actor: ActorContext): Promise<void> {
    await this.executeTransition(
      dto.issueId,
      "IN_PROGRESS",
      "DEFERRED",
      actor,
      { reasonCode: dto.reasonCode, resumeBy: dto.resumeBy },
      dto.note || `Work deferred until ${dto.resumeBy.toISOString()}. Reason: ${dto.reasonCode}`,
      (issue, now) => {
        const slaDueAt = issue.slaDueAt ? (issue.slaDueAt.toDate ? issue.slaDueAt.toDate() : new Date(issue.slaDueAt)) : null;
        const paused = pauseResolutionClock(slaDueAt, now);
        return {
          state: "DEFERRED",
          slaRemainingMs: paused.slaRemainingMs,
          slaDueAt: null,
          resumeBy: Timestamp.fromDate(dto.resumeBy),
          lastReasonCode: dto.reasonCode,
        };
      }
    );
  }

  /**
   * 9. RESUME: DEFERRED -> IN_PROGRESS (Restores resolution SLA)
   */
  public static async resume(issueId: string, actor: ActorContext): Promise<void> {
    await this.executeTransition(
      issueId,
      "DEFERRED",
      "IN_PROGRESS",
      actor,
      {},
      "Work resumed from deferral state.",
      (issue, now) => {
        const remainingMs = issue.slaRemainingMs || 0;
        const resumed = resumeResolutionClock(remainingMs, now);
        return {
          state: "IN_PROGRESS",
          slaDueAt: Timestamp.fromDate(resumed.slaDueAt),
          slaRemainingMs: null,
          resumeBy: null,
        };
      }
    );
  }

  /**
   * 10. SUBMIT_RESOLUTION: IN_PROGRESS -> RESOLUTION_SUBMITTED
   */
  public static async submitResolution(dto: SubmitResolutionDTO, actor: ActorContext): Promise<void> {
    await this.executeTransition(
      dto.issueId,
      "IN_PROGRESS",
      "RESOLUTION_SUBMITTED",
      actor,
      { afterEvidenceUrl: dto.afterEvidenceUrl, resolutionNotes: dto.resolutionNotes },
      "Field crew submitted repair resolution and after-evidence photo.",
      (_issue, now) => ({
        state: "RESOLUTION_SUBMITTED",
        afterEvidenceUrl: dto.afterEvidenceUrl,
        resolutionNotes: dto.resolutionNotes,
        resolutionSubmittedBy: actor.actorId,
        resolutionSubmittedAt: Timestamp.fromDate(now),
      })
    );
  }

  /**
   * 11. CLOSE: RESOLUTION_SUBMITTED -> CLOSED (Supervisor Verification Guard)
   */
  public static async close(issueId: string, actor: ActorContext): Promise<void> {
    const db = this.getDb();
    const issueRef = db.collection("issues").doc(issueId);

    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(issueRef);
      if (!doc.exists) throw new ValidationError(`Issue '${issueId}' not found.`);
      const issue = doc.data() as any;

      if (issue.state !== "RESOLUTION_SUBMITTED") {
        throw new ConflictError(`Cannot close issue in state '${issue.state}'. Must be RESOLUTION_SUBMITTED.`);
      }

      // Guard 1: Requires visual after evidence
      if (!issue.afterEvidenceUrl) {
        throw new ValidationError("Cannot close issue without submitted resolution after-evidence photo.");
      }

      // Guard 2: Verification Separation — Submitting actor cannot be closing actor
      if (issue.resolutionSubmittedBy === actor.actorId) {
        throw new ForbiddenError(
          `Supervisor verification guard failed: Submitter '${issue.resolutionSubmittedBy}' cannot verify and close their own resolution.`
        );
      }

      const now = new Date();
      transaction.update(issueRef, {
        state: "CLOSED",
        closedAt: Timestamp.fromDate(now),
        closedBy: actor.actorId,
        updatedAt: Timestamp.fromDate(now),
      });

      this.recordCaseEvent(transaction, issueId, {
        fromState: "RESOLUTION_SUBMITTED",
        toState: "CLOSED",
        actorId: actor.actorId,
        actorRole: actor.actorRole,
        timestamp: now,
        note: "Independent supervisor verified repair evidence and closed issue.",
        evidenceUrl: issue.afterEvidenceUrl,
      });
    });
  }

  /**
   * 12. REOPEN: RESOLUTION_SUBMITTED -> REOPENED
   */
  public static async reopen(dto: ReasonCodeDTO, actor: ActorContext): Promise<void> {
    await this.executeTransition(
      dto.issueId,
      "RESOLUTION_SUBMITTED",
      "REOPENED",
      actor,
      { reasonCode: dto.reasonCode },
      dto.note || `Resolution rejected during verification. Reason: ${dto.reasonCode}`,
      () => ({
        state: "REOPENED",
        lastReasonCode: dto.reasonCode,
      })
    );
  }

  /**
   * 13. MARK_DUPLICATE: UNDER_INVESTIGATION -> DUPLICATE (Auto-links to root parent)
   */
  public static async markDuplicate(dto: MarkDuplicateDTO, actor: ActorContext): Promise<{ rootParentId: string }> {
    const db = this.getDb();
    const issueRef = db.collection("issues").doc(dto.issueId);
    const targetParentRef = db.collection("issues").doc(dto.targetParentId);
    let rootParentId = dto.targetParentId;

    await db.runTransaction(async (transaction) => {
      const docB = await transaction.get(issueRef);
      const docA = await transaction.get(targetParentRef);

      if (!docB.exists) throw new ValidationError(`Child issue '${dto.issueId}' not found.`);
      if (!docA.exists) throw new ValidationError(`Target parent issue '${dto.targetParentId}' not found.`);

      const issueB = docB.data() as any;
      const issueA = docA.data() as any;

      if (issueB.state !== "UNDER_INVESTIGATION") {
        throw new ConflictError(`Cannot mark issue as duplicate while in state '${issueB.state}'.`);
      }

      // Resolve root parent so duplicate chains never nest (A -> ROOT, B -> ROOT)
      rootParentId = issueA.parentIssueId || issueA.issueId;

      const rootRef = db.collection("issues").doc(rootParentId);
      const now = new Date();

      transaction.update(issueRef, {
        state: "DUPLICATE",
        parentIssueId: rootParentId,
        updatedAt: Timestamp.fromDate(now),
      });

      // Append child ID to root parent's childIssueIds array
      transaction.update(rootRef, {
        childIssueIds: FieldValue.arrayUnion(dto.issueId),
        updatedAt: Timestamp.fromDate(now),
      });

      this.recordCaseEvent(transaction, dto.issueId, {
        fromState: "UNDER_INVESTIGATION",
        toState: "DUPLICATE",
        actorId: actor.actorId,
        actorRole: actor.actorRole,
        timestamp: now,
        note: dto.note || `Issue marked as duplicate of root parent issue '${rootParentId}'`,
      });
    });

    return { rootParentId };
  }

  /**
   * 14. REJECT: UNDER_INVESTIGATION -> REJECTED
   */
  public static async reject(dto: ReasonCodeDTO, actor: ActorContext): Promise<void> {
    await this.executeTransition(
      dto.issueId,
      "UNDER_INVESTIGATION",
      "REJECTED",
      actor,
      { reasonCode: dto.reasonCode },
      dto.note || `Report rejected by supervisor. Reason: ${dto.reasonCode}`,
      () => ({
        state: "REJECTED",
        lastReasonCode: dto.reasonCode,
      })
    );
  }
}
