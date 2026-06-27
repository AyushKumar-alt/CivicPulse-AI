/**
 * Issue Intelligence Report (IIR)
 *
 * The canonical structured intelligence object produced by the Analysis Agent.
 * Every downstream AI agent (Action Planner, Workflow Advisor, Verification,
 * Morning Briefing) consumes this report instead of independently reconstructing
 * context from the raw issue or uploaded image.
 *
 * The image is analyzed exactly once — by the Analysis Agent.
 * All subsequent agents reason from this report.
 */
export interface IssueIntelligenceReport {
  // ── Core classification ───────────────────────────────────────────────────
  issue_type: string;
  severity: string;
  confidence: number;
  summary: string;
  safety_risk: string;
  responsible_authority: string;

  // ── Area intelligence ─────────────────────────────────────────────────────
  area_category: string;
  area_confidence: number;
  area_reasoning: string;
  affected_entity_type: string | null;
  functional_importance: string;
  likely_daily_activity: string;

  // ── Impact analysis ───────────────────────────────────────────────────────
  affected_groups: string[];
  estimated_population_impact: string;
  impact_score: number;
  impact_reasoning: string;

  // ── Priority ──────────────────────────────────────────────────────────────
  priority_score: number;
  priority_reasoning: string;

  // ── Context explainability ────────────────────────────────────────────────
  context_used: boolean;
  context_influence: string;
  generated_at?: unknown;

  // ── Repair intelligence (new — absent on older issues, agents fallback gracefully) ──
  repair_complexity?: string;           // "low" | "medium" | "high" | "complex"
  repair_category?: string;            // "patching" | "drainage" | "electrical" | etc.
  estimated_work_hours?: number;       // realistic crew hours
  weather_sensitive?: boolean;         // rain/heat significantly affects this repair
  inspection_required?: boolean;       // pre-repair site inspection mandatory
  temporary_public_safety_required?: boolean; // barriers / traffic management needed
  required_equipment?: string[];       // e.g. "JCB excavator", "suction pump"
  required_skills?: string[];          // e.g. "licensed electrician", "plumber"
  operational_constraints?: string[];  // e.g. "avoid peak hours", "night work only"
  verification_checkpoints?: string[]; // what to physically confirm after repair
  routing_reasoning?: string;          // why this department was assigned

  // ── Community intelligence (written by Community Agent after submission) ──
  community_signals?: string[];
  citizen_concern_level?: string;
  community_summary?: string;
  recurring_problem?: boolean;
  escalation_recommendation?: boolean;
  community_reasoning?: string;
  community_analyzed_at?: unknown;

  // Allow additional fields from Firestore without type errors
  [key: string]: unknown;
}

/** Compact summary of an action plan — passed to Workflow Advisor and Verification */
export interface ActionPlanSummary {
  crew_required: string;
  estimated_workers: number;
  estimated_duration: string;
  repair_steps: string[];
  traffic_management: string;
  safety_protocols: string[];
  expected_completion: string;
  reasoning?: string;
}
