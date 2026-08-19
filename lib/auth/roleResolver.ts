import type { User } from "firebase/auth";
import type { UserRoleInfo } from "./roles";
import { getAgencyByEmail } from "@/lib/municipal";

const COMMANDCENTER_EMAILS = [
  "commandcenter@demo.com",
  "commandcentre@demo.com",
  "admin@city.gov",
  (process.env.NEXT_PUBLIC_AUTHORITY_EMAIL ?? "").toLowerCase(),
  (process.env.NEXT_PUBLIC_COMMANDCENTER_EMAIL ?? "").toLowerCase(),
].filter(Boolean);

const DEPARTMENT_EMAIL_ALIASES = [
  "bescom", "bwssb", "bbmp", "tangedco", "cmwssb", "gcc", "djb", "bses", "mcd",
  "electricity", "water", "sanitation", "roads", "traffic", "publicworks",
];

export async function resolveUserRole(
  user: User | null,
  claims?: Record<string, unknown>
): Promise<UserRoleInfo> {
  if (!user?.email) {
    return { role: "citizen", isOfficial: false };
  }

  const email = user.email.toLowerCase().trim();

  // 1. Command Centre check
  const isCommandClaim = claims?.role === "commandcenter";
  const isCommandEmail = COMMANDCENTER_EMAILS.includes(email) || email.includes("commandcenter") || email.includes("commandcentre");

  if (isCommandClaim || isCommandEmail) {
    return { role: "commandcenter", isOfficial: true };
  }

  // 2. Department Officer check
  const isDeptClaim = claims?.role === "authority";
  const isDeptEmail = DEPARTMENT_EMAIL_ALIASES.some((alias) => email.includes(alias));

  if (isDeptClaim || isDeptEmail) {
    const agency = getAgencyByEmail(email);
    return {
      role: "authority",
      department: agency.category,
      agency_id: agency.agency_id,
      isOfficial: true,
    };
  }

  // 3. Citizen (STRICT DEFAULT for citizen@demo.com, personal emails & public signups)
  return { role: "citizen", isOfficial: false };
}

/**
 * Synchronous role resolver for quick client hook evaluations
 */
export function resolveUserRoleSync(user: User | null): UserRoleInfo {
  if (!user?.email) {
    return { role: "citizen", isOfficial: false };
  }

  const email = user.email.toLowerCase().trim();

  // Command Centre
  if (COMMANDCENTER_EMAILS.includes(email) || email.includes("commandcenter") || email.includes("commandcentre")) {
    return { role: "commandcenter", isOfficial: true };
  }

  // Department Officer
  const isDeptEmail = DEPARTMENT_EMAIL_ALIASES.some((alias) => email.includes(alias));
  if (isDeptEmail) {
    const agency = getAgencyByEmail(email);
    return {
      role: "authority",
      department: agency.category,
      agency_id: agency.agency_id,
      isOfficial: true,
    };
  }

  // Citizen (STRICT DEFAULT)
  return { role: "citizen", isOfficial: false };
}
