import type { DepartmentCategoryKey, SeverityLevel } from "@/src/modules/contracts";
import { getSlaPolicy } from "./slaPolicy";

export interface ComputedSLADueDates {
  citizenSlaDueAt: Date;
  ackDueAt: Date;
  slaDueAt: Date;
}

export interface PausedResolutionClock {
  slaRemainingMs: number;
  slaDueAt: null;
}

export interface ResumedResolutionClock {
  slaDueAt: Date;
  slaRemainingMs: null;
}

/**
 * Computes all three SLA due dates based on categoryKey and severity.
 * All duration policies are imported directly from the frozen slaPolicy.ts.
 */
export function computeDueDates(
  categoryKey: DepartmentCategoryKey | "unknown" | string,
  severity: SeverityLevel,
  now: Date = new Date()
): ComputedSLADueDates {
  const policy = getSlaPolicy(categoryKey, severity);
  const nowMs = now.getTime();

  const citizenSlaDueAt = new Date(nowMs + policy.citizenSlaHours * 60 * 60 * 1000);
  const ackDueAt = new Date(nowMs + policy.ackSlaHours * 60 * 60 * 1000);
  const slaDueAt = new Date(nowMs + policy.resolutionSlaHours * 60 * 60 * 1000);

  return {
    citizenSlaDueAt,
    ackDueAt,
    slaDueAt,
  };
}

/**
 * Pauses the resolution clock during DEFERRED state.
 * Computes slaRemainingMs = max(slaDueAt - now, 0) and sets slaDueAt = null.
 */
export function pauseResolutionClock(
  slaDueAt: Date | string | number | null,
  now: Date = new Date()
): PausedResolutionClock {
  if (!slaDueAt) {
    return {
      slaRemainingMs: 0,
      slaDueAt: null,
    };
  }

  const dueMs = slaDueAt instanceof Date ? slaDueAt.getTime() : new Date(slaDueAt).getTime();
  const nowMs = now.getTime();
  const slaRemainingMs = Math.max(dueMs - nowMs, 0);

  return {
    slaRemainingMs,
    slaDueAt: null,
  };
}

/**
 * Resumes the resolution clock when transitioning from DEFERRED to IN_PROGRESS.
 * Recomputes slaDueAt = now + slaRemainingMs and sets slaRemainingMs = null.
 */
export function resumeResolutionClock(
  slaRemainingMs: number,
  now: Date = new Date()
): ResumedResolutionClock {
  const safeRemainingMs = Math.max(slaRemainingMs || 0, 0);
  const nowMs = now.getTime();
  const slaDueAt = new Date(nowMs + safeRemainingMs);

  return {
    slaDueAt,
    slaRemainingMs: null,
  };
}
