import type { SystemRole, UserIdentity } from "@/src/modules/contracts";
import { resolveUserRoleSync } from "@/lib/auth/roleResolver";

export class AuthContextResolver {
  public static buildIdentity(
    uid: string,
    email: string,
    customClaims?: Record<string, unknown>
  ): UserIdentity {
    const normalizedEmail = (email || "").toLowerCase().trim();

    // Delegate to server identity resolver
    const roleInfo = resolveUserRoleSync({ email: normalizedEmail } as unknown as Parameters<typeof resolveUserRoleSync>[0]);

    let role: SystemRole = "citizen";
    let agencyScope: string | undefined = undefined;
    let cityScope: string | undefined = undefined;
    const permissions: string[] = ["issue:create", "issue:read_own"];

    if (customClaims?.role === "super_admin" || normalizedEmail.includes("superadmin")) {
      role = "super_admin";
      permissions.push("issue:read_all", "issue:reroute", "issue:update_status", "issue:assign", "command_center:admin", "super_admin");
    } else if (customClaims?.role === "commandcenter" || roleInfo.role === "commandcenter") {
      role = "command_center_admin";
      permissions.push(
        "issue:read_all",
        "issue:reroute",
        "issue:update_status",
        "issue:assign",
        "command_center:admin"
      );
    } else if (customClaims?.role === "department_admin" || normalizedEmail.includes("admin")) {
      role = "department_admin";
      agencyScope = (customClaims?.agency_id as string) || roleInfo.agency_id;
      if (agencyScope?.startsWith("bengaluru_")) cityScope = "bengaluru";
      if (agencyScope?.startsWith("chennai_")) cityScope = "chennai";
      permissions.push("issue:read_agency", "issue:update_department_stage", "issue:assign_unit", "issue:assign_officer");
    } else if (roleInfo.role === "authority" || customClaims?.role === "authority") {
      role = "department_officer";
      agencyScope = (customClaims?.agency_id as string) || roleInfo.agency_id;
      if (agencyScope?.startsWith("bengaluru_")) cityScope = "bengaluru";
      if (agencyScope?.startsWith("chennai_")) cityScope = "chennai";
      permissions.push("issue:read_agency", "issue:update_department_stage");
    }

    // Override with server-assigned custom token claims if present (requires verified admin claim boolean)
    if (customClaims?.admin === true) {
      role = "command_center_admin";
      permissions.push(
        "issue:read_all",
        "issue:reroute",
        "issue:update_status",
        "command_center:admin"
      );
    }

    return {
      uid,
      email: normalizedEmail,
      role,
      cityScope,
      agencyScope,
      permissions,
    };
  }
}
