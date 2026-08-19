import type { DepartmentKey } from "@/lib/departments";

export type UserRole = "citizen" | "authority" | "commandcenter";

export interface UserRoleInfo {
  role: UserRole;
  department?: DepartmentKey;
  agency_id?: string;
  isOfficial: boolean;
}
