import { GoogleGenAI } from "@google/genai";
import type { IssueIntelligenceReport, ActionPlanSummary } from "./types";
import type { VerificationResult } from "./generateVerification";

// ── Public types ─────────────────────────────────────────────────────────────

export type GovernanceDecision =
  | "APPROVE_RESOLUTION"
  | "RETURN_FOR_REWORK"
  | "REQUEST_DEPARTMENT_EXPLANATION"
  | "ESCALATE_TO_HIGHER_AUTHORITY"
  | "REQUIRES_MANUAL_INSPECTION"
  | "INVALID_CITIZEN_REPORT";

export interface GovernanceReport {
  executive_summary: string;
  decision: GovernanceDecision;
  decision_confidence: number;
  department_performance: "excellent" | "satisfactory" | "needs_improvement" | "unsatisfactory";
  completion_quality: "complete" | "partial" | "incomplete" | "unacceptable";
  citizen_risk: "none" | "low" | "medium" | "high" | "critical";
  accountability_required: boolean;
  accountability_reason: string | null;
  rework_required: boolean;
  rework_priority: "low" | "medium" | "high" | "critical" | null;
  reasoning: string;
  officer_notes: string;
  department_feedback: string;
  required_actions: string[];
  deadline_recommendation: string;
  escalation_required: boolean;
  executive_recommendation: string;
}

export interface ReworkOrder {
  department: string;
  issue_type: string;
  previous_action_plan_summary: string;
  verification_findings: string;
  failed_checkpoints: string[];
  reasons: string[];
  required_corrections: string[];
  expected_deliverables: string[];
  suggested_deadline: string;
  priority: "low" | "medium" | "high" | "critical";
  ai_reasoning: string;
}

export interface AccountabilityReport {
  observed_deficiencies: string[];
  missed_execution_steps: string[];
  ignored_operational_constraints: string[];
  quality_concerns: string[];
  recommendations: string[];
  supervisor_review_required: boolean;
}

export interface GovernanceOutput {
  report: GovernanceReport;
  accountability: AccountabilityReport | null;
  rework_order: ReworkOrder | null;
}

export interface DepartmentProgressEntry {
  stage: string;
  timestamp: unknown;
  notes: string | null;
  updated_by: string;
}

export interface GovernanceInput {
  iir: IssueIntelligenceReport;
  actionPlan: ActionPlanSummary | null;
  verification: VerificationResult | null;
  departmentName: string;
  departmentProgress: DepartmentProgressEntry[];
  address: string | null;
}

// ── Deterministic fallback ───────────────────────────────────────────────────

function deadlineForSeverity(severity: string): string {
  if (severity === "critical") return "Immediate action required within 24 hours";
  if (severity === "high") return "Action required within 48 hours";
  if (severity === "medium") return "Action required within 72 hours";
  return "Action required within 5 business days";
}

function reworkDeadlineForSeverity(severity: string): string {
  if (severity === "critical") return "24 hours";
  if (severity === "high") return "48 hours";
  if (severity === "medium") return "72 hours";
  return "5 business days";
}

function deterministicGovernanceReview(input: GovernanceInput): GovernanceOutput {
  const { iir, verification: v, actionPlan, departmentName } = input;
  const severity = iir.severity ?? "medium";

  const reworkCycles = input.departmentProgress.filter(
    (p) => p.stage === "needs_rework" || p.stage === "command_center_rejected",
  ).length;

  // ── Determine decision ────────────────────────────────────────────────────

  let decision: GovernanceDecision;
  let confidence: number;

  if (!v) {
    decision = "REQUIRES_MANUAL_INSPECTION";
    confidence = 40;
  } else if (v.recommendation === "approve" && v.confidence >= 70) {
    decision = "APPROVE_RESOLUTION";
    confidence = Math.min(v.confidence, 92);
  } else if (v.recommendation === "needs_inspection") {
    decision = "REQUIRES_MANUAL_INSPECTION";
    confidence = 62;
  } else if (v.recommendation === "needs_rework") {
    if (reworkCycles >= 2) {
      decision = "REQUEST_DEPARTMENT_EXPLANATION";
      confidence = 78;
    } else {
      decision = "RETURN_FOR_REWORK";
      confidence = 72;
    }
  } else if (v.confidence < 40) {
    decision = reworkCycles >= 1 ? "REQUEST_DEPARTMENT_EXPLANATION" : "RETURN_FOR_REWORK";
    confidence = 60;
  } else {
    decision = "REQUIRES_MANUAL_INSPECTION";
    confidence = 55;
  }

  // Critical + low verification confidence → escalate
  if (severity === "critical" && (v?.confidence ?? 0) < 55 && decision !== "APPROVE_RESOLUTION") {
    decision = "ESCALATE_TO_HIGHER_AUTHORITY";
    confidence = 80;
  }

  // ── Department performance ────────────────────────────────────────────────

  let deptPerformance: GovernanceReport["department_performance"];
  if (reworkCycles === 0 && (v?.confidence ?? 0) >= 75) deptPerformance = "excellent";
  else if (reworkCycles === 0) deptPerformance = "satisfactory";
  else if (reworkCycles === 1) deptPerformance = "needs_improvement";
  else deptPerformance = "unsatisfactory";

  // ── Quality and risk ──────────────────────────────────────────────────────

  const completionQuality: GovernanceReport["completion_quality"] =
    decision === "APPROVE_RESOLUTION" ? "complete" :
    decision === "REQUIRES_MANUAL_INSPECTION" ? "partial" :
    reworkCycles >= 2 ? "unacceptable" : "incomplete";

  const citizenRisk: GovernanceReport["citizen_risk"] =
    decision === "APPROVE_RESOLUTION" ? "none" :
    decision === "ESCALATE_TO_HIGHER_AUTHORITY" ? "high" :
    severity === "critical" ? "high" :
    severity === "high" ? "medium" : "low";

  // ── Accountability ────────────────────────────────────────────────────────

  const accountabilityRequired =
    reworkCycles >= 2 ||
    (severity === "critical" && (v?.confidence ?? 0) < 50) ||
    deptPerformance === "unsatisfactory";

  // ── Build rework order ────────────────────────────────────────────────────

  let reworkOrder: ReworkOrder | null = null;
  if (decision === "RETURN_FOR_REWORK" || decision === "REQUEST_DEPARTMENT_EXPLANATION") {
    const failedCheckpoints = v?.remaining_issues
      ? v.remaining_issues.split("; ").filter(Boolean)
      : iir.verification_checkpoints?.slice(0, 3) ?? [];

    reworkOrder = {
      department: departmentName,
      issue_type: iir.issue_type ?? "Unknown",
      previous_action_plan_summary: actionPlan
        ? `${actionPlan.crew_required}, ${actionPlan.estimated_duration}`
        : "No action plan on record",
      verification_findings: v?.reasoning ?? "Technical verification was inconclusive",
      failed_checkpoints: failedCheckpoints,
      reasons: v?.concerns?.length ? v.concerns : ["Repair did not meet verification standards"],
      required_corrections: failedCheckpoints.length > 0
        ? failedCheckpoints.map((cp) => `Ensure completion: ${cp}`)
        : ["Address all verification checkpoints before resubmission"],
      expected_deliverables: [
        "Completed repair with photographic before/after evidence",
        "All verification checkpoints explicitly addressed in repair notes",
        ...(iir.inspection_required ? ["Post-repair site inspection sign-off"] : []),
      ],
      suggested_deadline: reworkDeadlineForSeverity(severity),
      priority: severity as "low" | "medium" | "high" | "critical",
      ai_reasoning: `${reworkCycles} previous attempt(s). Technical verification confidence: ${v?.confidence ?? 0}%. ${severity} severity issue.`,
    };
  }

  // ── Build accountability report ───────────────────────────────────────────

  let accountability: AccountabilityReport | null = null;
  if (accountabilityRequired) {
    accountability = {
      observed_deficiencies: v?.concerns?.length
        ? v.concerns
        : ["Repair quality below municipal standards"],
      missed_execution_steps: v?.remaining_issues
        ? [`Unresolved checkpoints: ${v.remaining_issues}`]
        : [],
      ignored_operational_constraints: iir.operational_constraints?.length
        ? iir.operational_constraints.map((c) => `May not have followed: ${c}`)
        : [],
      quality_concerns: [
        `${reworkCycles} rework cycle(s) required for ${severity} severity issue`,
        ...(deptPerformance === "unsatisfactory" ? ["Department performance rated unsatisfactory"] : []),
      ],
      recommendations: [
        "Senior engineer sign-off required before next repair attempt",
        ...(reworkCycles >= 2 ? ["Crew retraining assessment recommended"] : []),
        "Document root cause of repeated repair failure",
      ],
      supervisor_review_required: reworkCycles >= 2 || severity === "critical",
    };
  }

  // ── Build report text fields ──────────────────────────────────────────────

  const decisionLabel: Record<GovernanceDecision, string> = {
    APPROVE_RESOLUTION: "Approve Resolution",
    RETURN_FOR_REWORK: "Return for Rework",
    REQUEST_DEPARTMENT_EXPLANATION: "Request Department Explanation",
    ESCALATE_TO_HIGHER_AUTHORITY: "Escalate to Higher Authority",
    REQUIRES_MANUAL_INSPECTION: "Requires Manual Inspection",
    INVALID_CITIZEN_REPORT: "Invalid Report",
  };

  const executiveSummary = (() => {
    const base = `${iir.issue_type ?? "Issue"} (${severity} severity) in ${departmentName}.`;
    if (decision === "APPROVE_RESOLUTION")
      return `${base} Technical verification confirms successful repair with ${v?.confidence ?? 0}% confidence. Recommended for resolution approval.`;
    if (decision === "RETURN_FOR_REWORK")
      return `${base} Technical verification identified incomplete repair (${v?.confidence ?? 0}% confidence). Rework order issued to department.`;
    if (decision === "REQUEST_DEPARTMENT_EXPLANATION")
      return `${base} After ${reworkCycles} rework cycle(s), repair quality remains below standard. Formal explanation required from department.`;
    if (decision === "ESCALATE_TO_HIGHER_AUTHORITY")
      return `${base} Critical severity with low verification confidence (${v?.confidence ?? 0}%). Escalation to higher authority recommended.`;
    if (decision === "REQUIRES_MANUAL_INSPECTION")
      return `${base} Automated verification inconclusive. Field inspection required before approval decision.`;
    return `${base} Governance review recommends: ${decisionLabel[decision]}.`;
  })();

  const reasoning = (() => {
    const parts = [
      v ? `Technical verification: ${v.recommendation} at ${v.confidence}% confidence.` : "No technical verification report available.",
      reworkCycles > 0 ? `Issue has undergone ${reworkCycles} rework cycle(s).` : "First repair submission — no prior rework cycles.",
      `Department performance rating: ${deptPerformance}.`,
      `Severity: ${severity}. Citizen risk: ${citizenRisk}.`,
    ];
    if (v?.concerns?.length) parts.push(`Verification concerns: ${v.concerns.join("; ")}.`);
    return parts.join(" ");
  })();

  const officerNotes = (() => {
    if (decision === "APPROVE_RESOLUTION")
      return `Verification confidence is ${v?.confidence ?? 0}%. ${(v?.confidence ?? 0) >= 80 ? "Safe to approve." : "Consider field spot-check before finalizing."}`;
    if (decision === "RETURN_FOR_REWORK")
      return `Issue rework order sent. Department has ${reworkDeadlineForSeverity(severity)} to resubmit. Monitor resubmission closely.`;
    if (decision === "REQUEST_DEPARTMENT_EXPLANATION")
      return `After ${reworkCycles} failed attempts, request written explanation from department supervisor before proceeding.`;
    if (decision === "ESCALATE_TO_HIGHER_AUTHORITY")
      return "Escalate to municipal commissioner or higher authority. Do not approve repair until senior review is complete.";
    return "Manual field inspection required. Assign inspector before making decision.";
  })();

  const departmentFeedback = (() => {
    if (decision === "APPROVE_RESOLUTION")
      return `Good work by ${departmentName}. Repair meets quality standards. Performance: ${deptPerformance}.`;
    if (decision === "RETURN_FOR_REWORK")
      return `${departmentName}: Repair did not pass technical verification. Please address all listed checkpoints and resubmit with photographic evidence.`;
    if (decision === "REQUEST_DEPARTMENT_EXPLANATION")
      return `${departmentName}: After ${reworkCycles} repair attempts, a formal written explanation is required from department head regarding quality failures.`;
    return `${departmentName}: Please ensure all repair standards are met before resubmission.`;
  })();

  const requiredActions: string[] = [];
  if (decision === "APPROVE_RESOLUTION") {
    requiredActions.push("Mark issue as resolved in system");
    requiredActions.push("Notify original reporter of resolution");
  } else if (decision === "RETURN_FOR_REWORK") {
    requiredActions.push("Issue formal rework order to department");
    requiredActions.push(`Set rework deadline: ${reworkDeadlineForSeverity(severity)}`);
    requiredActions.push("Monitor resubmission for quality compliance");
  } else if (decision === "REQUEST_DEPARTMENT_EXPLANATION") {
    requiredActions.push("Send formal explanation request to department head");
    requiredActions.push("Review department's repair process and crew assignment");
    requiredActions.push("Consider assigning to alternate crew or department");
  } else if (decision === "ESCALATE_TO_HIGHER_AUTHORITY") {
    requiredActions.push("Escalate to municipal commissioner level");
    requiredActions.push("Conduct emergency site inspection");
    requiredActions.push("Assess public safety risk and consider immediate barriers");
  } else {
    requiredActions.push("Schedule physical field inspection");
    requiredActions.push("Document inspection findings before decision");
  }

  const executiveRecommendation = (() => {
    if (decision === "APPROVE_RESOLUTION")
      return `Approve and close. ${departmentName} delivered a ${deptPerformance} repair.`;
    if (decision === "RETURN_FOR_REWORK")
      return `Return to ${departmentName} with formal rework order. Deadline: ${reworkDeadlineForSeverity(severity)}.`;
    if (decision === "REQUEST_DEPARTMENT_EXPLANATION")
      return `Demand written accountability from ${departmentName} before allowing resubmission.`;
    if (decision === "ESCALATE_TO_HIGHER_AUTHORITY")
      return `Escalate immediately. ${severity} severity issue with unresolved quality concerns.`;
    return `Conduct field inspection before making approval decision.`;
  })();

  return {
    report: {
      executive_summary: executiveSummary,
      decision,
      decision_confidence: confidence,
      department_performance: deptPerformance,
      completion_quality: completionQuality,
      citizen_risk: citizenRisk,
      accountability_required: accountabilityRequired,
      accountability_reason: accountabilityRequired
        ? `${reworkCycles} rework cycle(s) — department performance: ${deptPerformance}`
        : null,
      rework_required: reworkOrder !== null,
      rework_priority: reworkOrder ? (severity as "low" | "medium" | "high" | "critical") : null,
      reasoning,
      officer_notes: officerNotes,
      department_feedback: departmentFeedback,
      required_actions: requiredActions,
      deadline_recommendation: decision === "APPROVE_RESOLUTION"
        ? "Issue closed — no further action required"
        : deadlineForSeverity(severity),
      escalation_required: decision === "ESCALATE_TO_HIGHER_AUTHORITY",
      executive_recommendation: executiveRecommendation,
    },
    accountability,
    rework_order: reworkOrder,
  };
}

// ── Gemini path ──────────────────────────────────────────────────────────────

import { getPrimaryGeminiModel } from "./geminiModelResolver";

export async function generateGovernanceReview(input: GovernanceInput, _keyOverride?: string): Promise<GovernanceOutput> {
  const apiKey = _keyOverride ?? process.env.GEMINI_API_KEY;
  if (!apiKey) return deterministicGovernanceReview(input);

  const { iir, verification: v, actionPlan, departmentName, departmentProgress, address } = input;

  const reworkCycles = departmentProgress.filter(
    (p) => p.stage === "needs_rework" || p.stage === "command_center_rejected",
  ).length;

  const prompt = `You are the Municipal Governance Review Agent for Chennai Corporation.

Your role: assess whether a repaired civic issue should be approved, reworked, or escalated.
You reason over the Issue Intelligence Report (IIR), the action plan, the technical verification,
and the department's workflow history.

## Issue Intelligence Report
Issue Type: ${iir.issue_type}
Severity: ${iir.severity}
Safety Risk: ${iir.safety_risk}
Repair Complexity: ${iir.repair_complexity ?? "unknown"}
Verification Checkpoints: ${(iir.verification_checkpoints ?? []).join("; ") || "none specified"}
Location: ${address ?? "unspecified"}
Department: ${departmentName}

## Action Plan Summary
${actionPlan ? `Crew: ${actionPlan.crew_required}
Duration: ${actionPlan.estimated_duration}
Workers: ${actionPlan.estimated_workers}
Steps: ${actionPlan.repair_steps.join("; ")}` : "No action plan on record"}

## Technical Verification Report
${v ? `Recommendation: ${v.recommendation}
Confidence: ${v.confidence}%
Was Issue Addressed: ${v.was_issue_addressed}
Reasoning: ${v.reasoning}
Concerns: ${v.concerns.join("; ") || "none"}
Remaining Issues: ${v.remaining_issues ?? "none"}` : "No verification report available"}

## Department Workflow History
Rework Cycles: ${reworkCycles}
Progress Stages: ${departmentProgress.map(p => p.stage).join(" → ")}

## Instructions
Provide a governance review as JSON with exactly these fields:
{
  "executive_summary": "2-3 sentence executive summary",
  "decision": "APPROVE_RESOLUTION | RETURN_FOR_REWORK | REQUEST_DEPARTMENT_EXPLANATION | ESCALATE_TO_HIGHER_AUTHORITY | REQUIRES_MANUAL_INSPECTION | INVALID_CITIZEN_REPORT",
  "decision_confidence": number 0-100,
  "department_performance": "excellent | satisfactory | needs_improvement | unsatisfactory",
  "completion_quality": "complete | partial | incomplete | unacceptable",
  "citizen_risk": "none | low | medium | high | critical",
  "accountability_required": boolean,
  "accountability_reason": "string or null",
  "rework_required": boolean,
  "rework_priority": "low | medium | high | critical | null",
  "reasoning": "detailed analysis paragraph",
  "officer_notes": "guidance for the commanding officer reviewing this",
  "department_feedback": "formal feedback message to the department",
  "required_actions": ["action1", "action2"],
  "deadline_recommendation": "human-readable deadline string",
  "escalation_required": boolean,
  "executive_recommendation": "one-sentence executive recommendation",
  "rework_order": null or {
    "failed_checkpoints": [],
    "reasons": [],
    "required_corrections": [],
    "expected_deliverables": [],
    "suggested_deadline": "string",
    "ai_reasoning": "string"
  },
  "accountability_report": null or {
    "observed_deficiencies": [],
    "missed_execution_steps": [],
    "ignored_operational_constraints": [],
    "quality_concerns": [],
    "recommendations": [],
    "supervisor_review_required": boolean
  }
}`;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const result = await ai.models.generateContent({
      model: getPrimaryGeminiModel(),
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        maxOutputTokens: 2048,
        temperature: 0.3,
      },
    });

    const text = result.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

    // Extract nested rework_order and accountability_report from Gemini response
    const geminiRework = parsed.rework_order as Record<string, unknown> | null;
    const geminiAcct = parsed.accountability_report as Record<string, unknown> | null;

    const report: GovernanceReport = {
      executive_summary: String(parsed.executive_summary ?? ""),
      decision: (parsed.decision as GovernanceDecision) ?? "REQUIRES_MANUAL_INSPECTION",
      decision_confidence: Number(parsed.decision_confidence ?? 50),
      department_performance: (parsed.department_performance as GovernanceReport["department_performance"]) ?? "satisfactory",
      completion_quality: (parsed.completion_quality as GovernanceReport["completion_quality"]) ?? "partial",
      citizen_risk: (parsed.citizen_risk as GovernanceReport["citizen_risk"]) ?? "medium",
      accountability_required: Boolean(parsed.accountability_required),
      accountability_reason: (parsed.accountability_reason as string | null) ?? null,
      rework_required: Boolean(parsed.rework_required),
      rework_priority: (parsed.rework_priority as GovernanceReport["rework_priority"]) ?? null,
      reasoning: String(parsed.reasoning ?? ""),
      officer_notes: String(parsed.officer_notes ?? ""),
      department_feedback: String(parsed.department_feedback ?? ""),
      required_actions: (parsed.required_actions as string[]) ?? [],
      deadline_recommendation: String(parsed.deadline_recommendation ?? ""),
      escalation_required: Boolean(parsed.escalation_required),
      executive_recommendation: String(parsed.executive_recommendation ?? ""),
    };

    const reworkOrder: ReworkOrder | null = geminiRework
      ? {
          department: departmentName,
          issue_type: iir.issue_type ?? "Unknown",
          previous_action_plan_summary: actionPlan
            ? `${actionPlan.crew_required}, ${actionPlan.estimated_duration}`
            : "No action plan on record",
          verification_findings: v?.reasoning ?? "Inconclusive",
          failed_checkpoints: (geminiRework.failed_checkpoints as string[]) ?? [],
          reasons: (geminiRework.reasons as string[]) ?? [],
          required_corrections: (geminiRework.required_corrections as string[]) ?? [],
          expected_deliverables: (geminiRework.expected_deliverables as string[]) ?? [],
          suggested_deadline: String(geminiRework.suggested_deadline ?? "72 hours"),
          priority: (iir.severity as "low" | "medium" | "high" | "critical") ?? "medium",
          ai_reasoning: String(geminiRework.ai_reasoning ?? ""),
        }
      : null;

    const accountability: AccountabilityReport | null = geminiAcct
      ? {
          observed_deficiencies: (geminiAcct.observed_deficiencies as string[]) ?? [],
          missed_execution_steps: (geminiAcct.missed_execution_steps as string[]) ?? [],
          ignored_operational_constraints: (geminiAcct.ignored_operational_constraints as string[]) ?? [],
          quality_concerns: (geminiAcct.quality_concerns as string[]) ?? [],
          recommendations: (geminiAcct.recommendations as string[]) ?? [],
          supervisor_review_required: Boolean(geminiAcct.supervisor_review_required),
        }
      : null;

    return { report, accountability, rework_order: reworkOrder };
  } catch (err) {
    console.error("[GovernanceReview] Gemini failed, using deterministic fallback:", err);
    return deterministicGovernanceReview(input);
  }
}
