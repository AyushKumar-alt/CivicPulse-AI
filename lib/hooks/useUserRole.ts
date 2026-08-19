"use client";

import { useMemo } from "react";
import type { User } from "firebase/auth";
import type { DepartmentKey } from "@/lib/departments";
import { resolveUserRoleSync } from "@/lib/auth";

export interface UserRoleInfo {
  role: "citizen" | "commandcenter" | "department";
  department?: DepartmentKey;
  isOfficial?: boolean;
}

export function useUserRole(user: User | null): UserRoleInfo {
  return useMemo<UserRoleInfo>(() => {
    const res = resolveUserRoleSync(user);
    return {
      role: res.role === "authority" ? "department" : res.role,
      department: res.department,
      isOfficial: res.isOfficial,
    };
  }, [user]);
}
