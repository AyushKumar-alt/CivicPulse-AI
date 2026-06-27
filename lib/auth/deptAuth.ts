import type { DepartmentKey } from "@/lib/departments";

// Server-side utility: maps authenticated user email → DepartmentKey
// Reads NEXT_PUBLIC_DEPARTMENT_EMAILS (accessible in API routes via process.env)
// Format: "roads@demo.com:roads|electricity@demo.com:electricity|..."
export function getDeptKeyFromEmail(email: string): DepartmentKey | null {
  const raw = process.env.NEXT_PUBLIC_DEPARTMENT_EMAILS ?? "";
  if (!raw) return null;
  for (const pair of raw.split("|")) {
    const colonIdx = pair.indexOf(":");
    if (colonIdx === -1) continue;
    const pairEmail = pair.slice(0, colonIdx).trim().toLowerCase();
    const key = pair.slice(colonIdx + 1).trim();
    if (pairEmail === email.toLowerCase()) return key as DepartmentKey;
  }
  return null;
}

export function isCommandCenterEmail(email: string): boolean {
  const e = email.toLowerCase();
  const authorityEmail = process.env.AUTHORITY_EMAIL ?? "";
  const commandcenterEmail = process.env.NEXT_PUBLIC_COMMANDCENTER_EMAIL ?? "";
  return (
    (!!authorityEmail && e === authorityEmail.toLowerCase()) ||
    (!!commandcenterEmail && e === commandcenterEmail.toLowerCase())
  );
}
