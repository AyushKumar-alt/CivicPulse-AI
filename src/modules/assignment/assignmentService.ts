import type {
  CanonicalCivicIssue,
  IssueRepository,
  OperationalAssignment,
  UserIdentity,
} from "@/src/modules/contracts";
import { AuthorizationPolicy } from "@/src/modules/auth";
import { AuditLogger } from "@/src/modules/audit";
import { err, ok, Result, ValidationError } from "@/src/modules/core";

export class AssignmentService {
  constructor(
    private repo: IssueRepository,
    private auditLogger: AuditLogger
  ) {}

  public async assignIssue(
    issueId: string,
    assignment: OperationalAssignment,
    user: UserIdentity
  ): Promise<Result<CanonicalCivicIssue, ValidationError>> {
    const issue = await this.repo.getById(issueId);
    if (!issue) {
      return err(new ValidationError(`Issue '${issueId}' not found`, "issueId"));
    }

    if (!AuthorizationPolicy.canAssignIssue(user, issue)) {
      return err(
        new ValidationError(
          `User '${user.email}' is not authorized to assign issues for agency '${issue.assignedAgencyId}'`,
          "authorization"
        )
      );
    }

    const previousState = {
      assignment: issue.assignment ?? null,
      departmentStage: issue.departmentStage,
    };

    const now = new Date().toISOString();
    const updatedAssignment: OperationalAssignment = {
      agencyId: issue.assignedAgencyId,
      unitId: assignment.unitId ?? issue.assignment?.unitId ?? null,
      unitName: assignment.unitName ?? issue.assignment?.unitName ?? null,
      teamId: assignment.teamId ?? issue.assignment?.teamId ?? null,
      teamName: assignment.teamName ?? issue.assignment?.teamName ?? null,
      officerId: assignment.officerId ?? issue.assignment?.officerId ?? null,
      officerName: assignment.officerName ?? issue.assignment?.officerName ?? null,
      assignedAt: now,
      assignedBy: user.uid,
    };

    const updatedIssue: CanonicalCivicIssue = {
      ...issue,
      assignment: updatedAssignment,
      departmentStage: assignment.teamId || assignment.officerId ? "crew_assigned" : "accepted",
      updatedAt: now,
    };

    await this.repo.save(updatedIssue);

    await this.auditLogger.logEvent({
      issueId,
      actorId: user.uid,
      actorEmail: user.email,
      actorRole: user.role,
      action: "ISSUE_ASSIGNED",
      previousState,
      newState: {
        assignment: updatedAssignment,
        departmentStage: updatedIssue.departmentStage,
      },
      reason: `Assigned unit/crew to issue ${issueId}`,
      timestamp: now,
    });

    return ok(updatedIssue);
  }
}
