import { GoogleGenAI } from "@google/genai";
import type { IssueIntelligenceReport, ActionPlanSummary } from "./types";

export interface WorkflowAdviceInput {
  iir: IssueIntelligenceReport;
  departmentName: string;
  address: string | null;
  fromStage: string;
  toStage: string;
  actionPlan: ActionPlanSummary | null;
  previousStages: string[];
  notes?: string | null;
}

export interface WorkflowAdvice {
  recommendation: string;
  reason: string;
  expected_delay: string;
  possible_risks: string;
  next_action: string;
}

export const STAGE_LABEL: Record<string, string> = {
  assigned:               "Issue Assigned to Department",
  accepted:               "Accepted by Department",
  crew_assigned:          "Crew Assigned",
  repair_started:         "Repair Started",
  repair_completed:       "Repair Completed",
  ready_for_verification: "Submitted for Verification",
  needs_rework:           "Rework Required",
};

const DELAY_BY_COMPLEXITY: Record<string, string> = {
  low:     "1–2 hours",
  medium:  "2–4 hours",
  high:    "4–8 hours",
  complex: "1–2 working days",
};

// ── Deterministic fallback ───────────────────────────────────────────────────

function deterministicWorkflowAdvice(input: WorkflowAdviceInput): WorkflowAdvice {
  const { iir, fromStage, toStage, actionPlan, departmentName } = input;
  const complexity = iir.repair_complexity ?? "medium";
  const category   = iir.repair_category ?? "general";
  const skills     = iir.required_skills?.join(", ") ?? "appropriate skills";
  const workers    = actionPlan?.estimated_workers ?? (complexity === "complex" ? 12 : complexity === "high" ? 8 : 5);
  const equipment  = (iir.required_equipment ?? actionPlan?.repair_steps ?? []).slice(0, 2).join(" and ") || "required equipment";
  const constraints = iir.operational_constraints ?? [];
  const checkpoints = iir.verification_checkpoints ?? [];

  const key = `${fromStage}→${toStage}`;

  const TRANSITION_ADVICE: Record<string, WorkflowAdvice> = {
    "assigned→accepted": {
      recommendation: `Review the Issue Intelligence Report before accepting — this is a ${complexity}-complexity ${category} repair requiring ${skills}. Confirm that ${departmentName} has crew and equipment available before committing.`,
      reason: `Accepting without confirming resources leads to delays that affect priority score and citizen satisfaction. The IIR estimates ${iir.estimated_work_hours ?? "several"} hours of work${constraints.length ? ` with constraints: ${constraints[0]}` : ""}.`,
      expected_delay: DELAY_BY_COMPLEXITY[complexity] ?? "2–4 hours",
      possible_risks: `Resource unavailability for ${category} work.${iir.weather_sensitive ? " This repair is weather-sensitive — check forecast before accepting." : ""} Accepting without confirming crew quality for ${skills} will cause rework.`,
      next_action: `Confirm ${workers}-worker crew with ${skills} is available. ${iir.inspection_required ? "Schedule engineer site inspection — required before repair can commence." : "Schedule deployment."}`,
    },
    "accepted→crew_assigned": {
      recommendation: `Assign a crew specifically qualified in ${skills} for this ${category} repair. Target ${workers} workers based on ${complexity} complexity.`,
      reason: `The IIR specifies skills required: ${skills}. Assigning a general crew without these specialisations will result in substandard repair and rework.`,
      expected_delay: DELAY_BY_COMPLEXITY[complexity] ?? "2–4 hours",
      possible_risks: `Crew shortages for ${category} specialists. Ensure all ${equipment} is loaded before dispatch.${iir.weather_sensitive ? " Weather forecast should be confirmed before crew deployment." : ""}`,
      next_action: `Issue crew assignment order with full equipment manifest. Confirm crew lead is aware of operational constraints${constraints.length ? `: ${constraints[0]}` : ""}.`,
    },
    "crew_assigned→repair_started": {
      recommendation: `Deploy crew to site immediately. ${iir.temporary_public_safety_required ? "Traffic management MUST be set up before any repair work begins — this is a road safety requirement." : "Set up safety perimeter on arrival."} ${iir.inspection_required ? "Crew must wait for engineer/supervisor clearance before starting repair." : ""}`,
      reason: `IIR severity is ${iir.severity ?? "unknown"} — deployment delay directly impacts ${iir.estimated_population_impact ?? "the affected community"}. ${iir.functional_importance ? `Functional importance: ${iir.functional_importance}.` : ""}`,
      expected_delay: iir.inspection_required ? "30–60 min pre-work inspection + " + (DELAY_BY_COMPLEXITY[complexity] ?? "2–4 hours") : DELAY_BY_COMPLEXITY[complexity] ?? "2–4 hours",
      possible_risks: `Site conditions may have changed since IIR was generated — crew lead must reassess on arrival. ${iir.weather_sensitive ? "Rain or strong winds will require work suspension." : ""}${constraints.length ? ` Constraint to manage: ${constraints[0]}.` : ""}`,
      next_action: "Confirm crew arrival and site safety setup complete. Report any conditions that differ from IIR assessment before starting repair.",
    },
    "repair_started→ready_for_verification": {
      recommendation: `Before submitting for verification, systematically confirm each checkpoint from the IIR: ${checkpoints.length ? checkpoints.join("; ") : "visual resolution of the reported issue, no safety hazards remaining"}.`,
      reason: `Verification is evaluated against these specific checkpoints. Incomplete work or missing documentation will result in a 'needs_rework' outcome — adding delay and reducing department performance metrics.`,
      expected_delay: "1–2 hours for documentation, photography, and submission",
      possible_risks: `Most common failure: insufficient photographic evidence or vague repair notes. Document each checkpoint individually. ${checkpoints.length ? `Specifically address: ${checkpoints[0]}` : ""}`,
      next_action: "Photograph the completed repair from multiple angles. Write repair notes referencing each verification checkpoint by name before submitting.",
    },
    "needs_rework→repair_started": {
      recommendation: `Before restarting, review the verification report findings specifically. Address each item flagged as unsatisfactory — do not repeat the same repair approach if it failed verification.`,
      reason: `A second verification failure will escalate this issue and impact department performance. Identify the root cause of the first failure before mobilising crew.`,
      expected_delay: DELAY_BY_COMPLEXITY[complexity] ?? "2–4 hours",
      possible_risks: "Recurring failure if root cause of first failure is not addressed. Consider involving a senior supervisor or engineer in rework planning.",
      next_action: "Review verification findings with crew lead. Create a targeted rework checklist addressing each failed checkpoint before redeploying crew.",
    },
  };

  const advice = TRANSITION_ADVICE[key];
  if (advice) return advice;

  // Generic fallback for any unmatched transition
  return {
    recommendation: `Proceed with ${category} repair protocol for transition from ${STAGE_LABEL[fromStage] ?? fromStage} to ${STAGE_LABEL[toStage] ?? toStage}.`,
    reason: `${iir.issue_type ?? "This issue"} with ${complexity} complexity requires systematic execution at every stage.`,
    expected_delay: DELAY_BY_COMPLEXITY[complexity] ?? "2–4 hours",
    possible_risks: iir.weather_sensitive ? "Weather-sensitive repair — monitor conditions before proceeding" : "Follow standard site safety protocols",
    next_action: `Confirm current status with crew lead and execute ${toStage} stage requirements`,
  };
}

// ── Main export ──────────────────────────────────────────────────────────────

export async function generateWorkflowAdvice(input: WorkflowAdviceInput, _keyOverride?: string): Promise<WorkflowAdvice> {
  const apiKey = _keyOverride ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("[WorkflowAdvice] No API key — using deterministic advisor");
    return deterministicWorkflowAdvice(input);
  }

  const iir = input.iir;
  const plan = input.actionPlan;

  const planSection = plan
    ? `EXISTING ACTION PLAN (do not regenerate):
- Crew: ${plan.crew_required} (${plan.estimated_workers} workers)
- Duration: ${plan.estimated_duration} | Expected completion: ${plan.expected_completion}
- Key repair steps: ${plan.repair_steps.slice(0, 4).join(" → ")}
- Traffic management: ${plan.traffic_management}
- Safety: ${plan.safety_protocols.join("; ")}`
    : "Action plan not yet generated.";

  const repairContext = iir.repair_complexity
    ? `REPAIR INTELLIGENCE:
- Complexity: ${iir.repair_complexity} | Category: ${iir.repair_category ?? "other"}
- Est. work hours: ${iir.estimated_work_hours ?? "?"}h | Weather sensitive: ${iir.weather_sensitive ? "YES" : "No"}
- Constraints: ${iir.operational_constraints?.join(" | ") || "None"}
- Verification checkpoints: ${iir.verification_checkpoints?.join(" | ") || "None specified"}`
    : "";

  const prompt = `You are the Workflow Operations Advisor for ${input.departmentName}.

IMPORTANT: Do NOT generate a new action plan. Do NOT re-analyze the issue. The Analysis Agent has already produced the Issue Intelligence Report and the Action Planning Agent has already created the execution plan. Read both. Your sole responsibility is to advise on the current workflow transition and help the crew succeed at this specific stage.

────────────────────────────────────────────────
ISSUE INTELLIGENCE REPORT
────────────────────────────────────────────────
Type: ${iir.issue_type} | Severity: ${iir.severity} | Priority: ${iir.priority_score ?? "?"}/10
Location: ${input.address ?? "Unknown"} | Area: ${iir.area_category ?? "Unknown"}
Summary: ${iir.summary}
Safety Risk: ${iir.safety_risk}
Functional Importance: ${iir.functional_importance || ""}
${iir.citizen_concern_level ? `Community Concern: ${iir.citizen_concern_level} — ${iir.community_summary ?? ""}` : ""}

${repairContext}
────────────────────────────────────────────────
${planSection}
────────────────────────────────────────────────
WORKFLOW TRANSITION:
${STAGE_LABEL[input.fromStage] ?? input.fromStage} → ${STAGE_LABEL[input.toStage] ?? input.toStage}
Previously completed: ${input.previousStages.map((s) => STAGE_LABEL[s] ?? s).join(" → ") || "None"}
${input.notes ? `Field notes from crew: "${input.notes}"` : ""}
────────────────────────────────────────────────

Based on the Issue Intelligence Report and the existing action plan, advise the crew on this specific stage transition.
Reference the repair constraints and operational context from the IIR.
Be direct, specific, and practical. Reference Chennai-specific conditions where relevant.

Return ONLY valid JSON — no markdown, no extra text:
{
  "recommendation": "specific operational recommendation for this transition — reference IIR constraints if relevant",
  "reason": "why this recommendation matters for this specific issue and location",
  "expected_delay": "realistic time estimate for this stage based on complexity from the IIR",
  "possible_risks": "specific risks for this issue type and area at this stage",
  "next_action": "the single most important immediate action the crew must take next"
}`;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL ?? "gemini-3.6-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0.4,
        maxOutputTokens: 600,
        responseMimeType: "application/json",
      },
    });

    const text = (response.text ?? "").trim();
    if (!text) {
      console.warn("[WorkflowAdvice] Empty response — using deterministic advisor");
      return deterministicWorkflowAdvice(input);
    }

    const parsed = JSON.parse(text) as WorkflowAdvice;
    if (!parsed.recommendation) {
      console.warn("[WorkflowAdvice] Missing recommendation field — using deterministic advisor");
      return deterministicWorkflowAdvice(input);
    }
    return parsed;
  } catch (err) {
    console.error("[WorkflowAdvice] Gemini failed — using deterministic advisor:", err instanceof Error ? err.message : err);
    return deterministicWorkflowAdvice(input);
  }
}
