"use client";

import { useMemo } from "react";
import type { User } from "firebase/auth";
import type { DepartmentKey } from "@/lib/departments";

export interface UserRoleInfo {
  role: "citizen" | "commandcenter" | "department";
  department?: DepartmentKey;
}

// Backward-compat: old authority email + new commandcenter email both → commandcenter role
// Both env vars support comma/pipe-separated lists for multiple accounts
const AUTHORITY_EMAIL = process.env.NEXT_PUBLIC_AUTHORITY_EMAIL ?? "";
const COMMANDCENTER_EMAIL = process.env.NEXT_PUBLIC_COMMANDCENTER_EMAIL ?? "";

const COMMANDCENTER_EMAIL_LIST = [AUTHORITY_EMAIL, ...COMMANDCENTER_EMAIL.split(/[,|]/)]
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// "roads@demo.com:roads|electricity@demo.com:electricity|..."
const DEPT_EMAILS_RAW = process.env.NEXT_PUBLIC_DEPARTMENT_EMAILS ?? "";

function parseDeptEmails(raw: string): Record<string, DepartmentKey> {
  const map: Record<string, DepartmentKey> = {};
  if (!raw) return map;
  for (const pair of raw.split("|")) {
    const colonIdx = pair.indexOf(":");
    if (colonIdx === -1) continue;
    const email = pair.slice(0, colonIdx).trim().toLowerCase();
    const key = pair.slice(colonIdx + 1).trim() as DepartmentKey;
    if (email && key) map[email] = key;
  }
  return map;
}

// Parsed once at module load (env vars are static)
const DEPT_EMAIL_MAP = parseDeptEmails(DEPT_EMAILS_RAW);

export function useUserRole(user: User | null): UserRoleInfo {
  return useMemo<UserRoleInfo>(() => {
    if (!user?.email) return { role: "citizen" };
    const email = user.email.toLowerCase();

    // Command center — supports multiple emails via comma/pipe-separated env var
    if (COMMANDCENTER_EMAIL_LIST.includes(email)) {
      return { role: "commandcenter" };
    }

    // Department user
    const deptKey = DEPT_EMAIL_MAP[email];
    if (deptKey) return { role: "department", department: deptKey };

    return { role: "citizen" };
  }, [user]);
}
