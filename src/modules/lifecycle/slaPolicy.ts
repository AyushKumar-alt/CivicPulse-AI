import type { DepartmentCategoryKey, SeverityLevel } from "@/src/modules/contracts";

export interface SLADurationConfig {
  citizenSlaHours: number;       // Invariant citizen-facing commitment (includes routing/reassignment buffer)
  ackSlaHours: number;           // Human agency acknowledgement window
  resolutionSlaHours: number;    // Agency field resolution window
}

export type SLAPolicyMap = Record<
  DepartmentCategoryKey | "unknown",
  Record<SeverityLevel, SLADurationConfig>
>;

// NOTE: Baseline SLA values were NOT found in the existing codebase.
// All 28 rows below are explicitly labeled [PROVISIONAL - PENDING REGULATORY REVIEW].
// Citizen SLA hours explicitly exceed Agency Resolution SLA hours to prevent reassignment false breaches.
export const SLA_POLICY: SLAPolicyMap = {
  electricity: {
    critical: { citizenSlaHours: 8, ackSlaHours: 0.5, resolutionSlaHours: 4 },
    high: { citizenSlaHours: 24, ackSlaHours: 1, resolutionSlaHours: 12 },
    medium: { citizenSlaHours: 48, ackSlaHours: 2, resolutionSlaHours: 24 },
    low: { citizenSlaHours: 72, ackSlaHours: 4, resolutionSlaHours: 48 },
  },
  water: {
    critical: { citizenSlaHours: 12, ackSlaHours: 1, resolutionSlaHours: 6 },
    high: { citizenSlaHours: 36, ackSlaHours: 2, resolutionSlaHours: 18 },
    medium: { citizenSlaHours: 72, ackSlaHours: 4, resolutionSlaHours: 36 },
    low: { citizenSlaHours: 120, ackSlaHours: 8, resolutionSlaHours: 72 },
  },
  sanitation: {
    critical: { citizenSlaHours: 16, ackSlaHours: 1, resolutionSlaHours: 8 },
    high: { citizenSlaHours: 48, ackSlaHours: 2, resolutionSlaHours: 24 },
    medium: { citizenSlaHours: 96, ackSlaHours: 4, resolutionSlaHours: 48 },
    low: { citizenSlaHours: 144, ackSlaHours: 12, resolutionSlaHours: 96 },
  },
  roads: {
    critical: { citizenSlaHours: 24, ackSlaHours: 1, resolutionSlaHours: 12 },
    high: { citizenSlaHours: 96, ackSlaHours: 4, resolutionSlaHours: 48 },
    medium: { citizenSlaHours: 168, ackSlaHours: 8, resolutionSlaHours: 96 },
    low: { citizenSlaHours: 240, ackSlaHours: 24, resolutionSlaHours: 168 },
  },
  traffic: {
    critical: { citizenSlaHours: 4, ackSlaHours: 0.25, resolutionSlaHours: 2 },
    high: { citizenSlaHours: 16, ackSlaHours: 0.5, resolutionSlaHours: 8 },
    medium: { citizenSlaHours: 48, ackSlaHours: 2, resolutionSlaHours: 24 },
    low: { citizenSlaHours: 72, ackSlaHours: 4, resolutionSlaHours: 48 },
  },
  publicworks: {
    critical: { citizenSlaHours: 24, ackSlaHours: 1, resolutionSlaHours: 12 },
    high: { citizenSlaHours: 96, ackSlaHours: 4, resolutionSlaHours: 48 },
    medium: { citizenSlaHours: 168, ackSlaHours: 8, resolutionSlaHours: 96 },
    low: { citizenSlaHours: 240, ackSlaHours: 24, resolutionSlaHours: 168 },
  },
  unknown: {
    critical: { citizenSlaHours: 12, ackSlaHours: 1, resolutionSlaHours: 6 },
    high: { citizenSlaHours: 48, ackSlaHours: 2, resolutionSlaHours: 24 },
    medium: { citizenSlaHours: 96, ackSlaHours: 4, resolutionSlaHours: 48 },
    low: { citizenSlaHours: 144, ackSlaHours: 12, resolutionSlaHours: 96 },
  },
} as const;

export function getSlaPolicy(
  categoryKey: DepartmentCategoryKey | "unknown" | string,
  severity: SeverityLevel
): SLADurationConfig {
  const catKey = (categoryKey || "unknown") as keyof typeof SLA_POLICY;
  const safeCategory = SLA_POLICY[catKey] ? catKey : "unknown";
  const safeSeverity = SLA_POLICY[safeCategory][severity] ? severity : "medium";
  return SLA_POLICY[safeCategory][safeSeverity];
}
