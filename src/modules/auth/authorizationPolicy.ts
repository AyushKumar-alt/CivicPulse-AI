import type { CanonicalCivicIssue, DepartmentStage, UserIdentity } from "@/src/modules/contracts";

export class AuthorizationPolicy {
  public static canSubmitIssue(user: UserIdentity): boolean {
    return !!user && !!user.uid && user.permissions.includes("issue:create");
  }

  public static canReadIssue(user: UserIdentity, issue: CanonicalCivicIssue): boolean {
    if (!user || !issue) return false;

    // 1. Command Center Admins & Super Admins can read all issues across all cities and agencies
    if (user.role === "command_center_admin" || user.role === "super_admin") {
      return true;
    }

    // 2. Citizens can read their own submitted issues
    if (user.role === "citizen" || issue.reporterUid === user.uid) {
      return true;
    }

    // 3. Department Officers and Department Admins can ONLY read issues assigned to their agency
    if (user.role === "department_officer" || user.role === "department_admin") {
      return !!user.agencyScope && issue.assignedAgencyId === user.agencyScope;
    }

    return false;
  }

  public static canUpdateLifecycle(
    user: UserIdentity,
    issue: CanonicalCivicIssue,
    _targetStage?: DepartmentStage
  ): boolean {
    if (!user || !issue) return false;

    if (user.role === "command_center_admin" || user.role === "super_admin") {
      return true;
    }

    if (user.role === "department_officer" || user.role === "department_admin") {
      return !!user.agencyScope && issue.assignedAgencyId === user.agencyScope;
    }

    return false;
  }

  public static canAssignIssue(
    user: UserIdentity,
    issue: CanonicalCivicIssue
  ): boolean {
    if (!user || !issue) return false;

    if (user.role === "command_center_admin" || user.role === "super_admin") {
      return true;
    }

    if (user.role === "department_admin") {
      return !!user.agencyScope && issue.assignedAgencyId === user.agencyScope;
    }

    return false;
  }

  public static canReRouteIssue(user: UserIdentity, _issue?: CanonicalCivicIssue): boolean {
    if (!user) return false;
    return user.role === "command_center_admin" || user.role === "super_admin";
  }
}
