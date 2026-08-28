import { GoogleGenAI } from "@google/genai";
import type { IssueIntelligenceReport, ActionPlanSummary } from "./types";

export interface VerificationInput {
  iir: IssueIntelligenceReport;
  actionPlan: ActionPlanSummary | null;
  departmentName: string;
  repairType: string;
  repairNotes: string;
  beforeImageUrl?: string | null;
  afterImageUrl?: string | null;
}

export interface VerificationResult {
  confidence: number;
  recommendation: "approve" | "needs_inspection" | "needs_rework";
  was_issue_addressed: boolean;
  reasoning: string;
  concerns: string[];
  remaining_issues: string | null;
}

// ── Deterministic fallback ───────────────────────────────────────────────────

function deterministicVerification(input: VerificationInput): VerificationResult {
  const { iir, repairNotes, repairType, afterImageUrl } = input;
  const notes = repairNotes.toLowerCase();
  const checkpoints = iir.verification_checkpoints ?? [];

  // Score each checkpoint by keyword matching against repair notes
  const satisfied: string[] = [];
  const unsatisfied: string[] = [];

  for (const cp of checkpoints) {
    const keywords = cp
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 4 && !["should","that","from","with","been","have","this","area","site"].includes(w));

    const matched = keywords.some(kw => notes.includes(kw));
    if (matched) satisfied.push(cp);
    else unsatisfied.push(cp);
  }

  // Base confidence from checkpoint coverage
  let confidence: number;
  if (checkpoints.length === 0) {
    // No checkpoints to evaluate — score from notes quality
    confidence = notes.length > 150 ? 65 : notes.length > 80 ? 55 : 40;
  } else {
    const coverageRatio = satisfied.length / checkpoints.length;
    confidence = Math.round(20 + coverageRatio * 60); // 20–80 range
  }

  // Bonus for having an after-repair image
  if (afterImageUrl) confidence = Math.min(confidence + 10, 88);

  // Penalty deductions
  if (notes.length < 40) confidence = Math.min(confidence, 45);         // very short notes
  if (iir.severity === "critical") confidence = Math.min(confidence, 68); // critical = higher bar
  if (iir.repair_complexity === "complex") confidence = Math.min(confidence, 72);

  confidence = Math.max(20, Math.min(confidence, 90));

  // Determine recommendation
  let recommendation: "approve" | "needs_inspection" | "needs_rework";
  let was_issue_addressed: boolean;

  if (confidence >= 75 && iir.severity !== "critical" && unsatisfied.length === 0) {
    recommendation = "approve";
    was_issue_addressed = true;
  } else if (confidence >= 50) {
    recommendation = "needs_inspection";
    was_issue_addressed = false;
  } else {
    recommendation = "needs_rework";
    was_issue_addressed = false;
  }

  // Build structured reasoning
  const cpLines = checkpoints.map((cp, i) => {
    const ok = satisfied.includes(cp);
    return `  ${i + 1}. ${cp} — ${ok ? "addressed in repair notes" : "NOT clearly addressed"}`;
  });

  const reasoning = [
    `Deterministic verification for ${iir.issue_type ?? "unknown issue"} (${iir.severity ?? "unknown"} severity).`,
    `Repair type submitted: "${repairType}".`,
    `Repair notes: ${repairNotes.length} characters — ${repairNotes.length < 40 ? "very brief, insufficient detail" : repairNotes.length < 100 ? "brief" : "adequate detail"}.`,
    afterImageUrl ? "After-repair image provided." : "No after-repair image submitted.",
    checkpoints.length > 0
      ? `\nVerification checkpoints (${satisfied.length}/${checkpoints.length} addressed):\n${cpLines.join("\n")}`
      : "No specific verification checkpoints defined in IIR — evaluated from repair notes quality only.",
    `\nConclusion: ${recommendation === "approve"
      ? "All checkpoints addressed — repair appears complete."
      : recommendation === "needs_inspection"
      ? "Insufficient evidence for remote approval — physical inspection recommended."
      : "Repair evidence does not satisfy required checkpoints — rework needed."}`,
  ].join("\n");

  // Concerns
  const concerns: string[] = [];
  if (!afterImageUrl) concerns.push("No after-repair image submitted — visual confirmation not possible");
  if (unsatisfied.length > 0) concerns.push(`Checkpoints not clearly addressed: ${unsatisfied.join("; ")}`);
  if (notes.length < 40) concerns.push("Repair notes are too brief — detailed description required for verification");
  if (iir.severity === "critical") concerns.push("Critical severity issue — mandatory physical inspection before formal closure");

  return {
    confidence,
    recommendation,
    was_issue_addressed,
    reasoning,
    concerns,
    remaining_issues: unsatisfied.length > 0 ? unsatisfied.join("; ") : null,
  };
}

// ── Image loader ─────────────────────────────────────────────────────────────

async function fetchImageAsBase64(
  url: string,
): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    return { data: base64, mimeType: contentType.split(";")[0] };
  } catch {
    return null;
  }
}

// ── Main export ──────────────────────────────────────────────────────────────

export async function generateVerification(
  input: VerificationInput,
): Promise<VerificationResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("[Verification] No API key — using deterministic verifier");
    return deterministicVerification(input);
  }

  const iir = input.iir;
  const plan = input.actionPlan;
  const hasBeforeImage = !!input.beforeImageUrl;
  const hasAfterImage = !!input.afterImageUrl;

  const checkpoints = iir.verification_checkpoints?.length
    ? iir.verification_checkpoints
    : ["Issue visually resolved", "No immediate safety hazard remains", "Area safe for public use"];

  const planContext = plan
    ? `PLANNED REPAIR (Action Planning Agent):
- Crew: ${plan.crew_required} | Duration: ${plan.estimated_duration}
- Key steps: ${plan.repair_steps.slice(0, 4).join(" → ")}
- Traffic/Safety: ${plan.traffic_management}`
    : "Action plan not available.";

  const checkpointList = checkpoints.map((c, i) => `  ${i + 1}. ${c}`).join("\n");

  const imageNote = hasBeforeImage && hasAfterImage
    ? "Before and after images are provided. Use visual comparison as primary evidence."
    : hasAfterImage
    ? "An after-repair image is provided. Use it as primary visual evidence."
    : "No images provided. Evaluate based on repair description and plan alone.";

  const prompt = `You are the Quality Verification Agent for ${input.departmentName}.

IMPORTANT: You are NOT re-analyzing the original issue. The Analysis Agent has already classified it. Your sole responsibility is to verify whether the repair meets the required standards by checking against the Issue Intelligence Report, the Action Plan, and the specific verification checkpoints.

────────────────────────────────────────────────
ISSUE INTELLIGENCE REPORT
────────────────────────────────────────────────
Type: ${iir.issue_type} | Severity: ${iir.severity}
Summary: ${iir.summary}
Safety Risk: ${iir.safety_risk}
Repair Category: ${iir.repair_category ?? "unknown"} | Complexity: ${iir.repair_complexity ?? "unknown"}

${planContext}
────────────────────────────────────────────────
VERIFICATION CHECKPOINTS (from Analysis Agent):
${checkpointList}
────────────────────────────────────────────────
REPAIR SUBMITTED BY DEPARTMENT:
- Repair Type: ${input.repairType}
- Repair Notes: ${input.repairNotes}
- ${imageNote}
────────────────────────────────────────────────

Evaluate the repair against each verification checkpoint above.
For each checkpoint, determine if it was satisfied based on the repair notes and images.

Then provide an overall recommendation:
- "approve": all critical checkpoints satisfied, issue resolved
- "needs_inspection": unclear from evidence, physical inspection recommended
- "needs_rework": clear gaps against checkpoints or plan

Be appropriately skeptical. Safety issues demand higher confidence before approval.

Return ONLY valid JSON — no markdown, no extra text:
{
  "confidence": 0-100,
  "recommendation": "approve | needs_inspection | needs_rework",
  "was_issue_addressed": true or false,
  "reasoning": "structured evaluation referencing each checkpoint and whether the submitted repair satisfies it",
  "concerns": ["specific concern 1 if any", "specific concern 2 if any"],
  "remaining_issues": "description of what remains unresolved, or null if fully resolved"
}`;

  try {
    const ai = new GoogleGenAI({ apiKey });

    type ContentPart =
      | { text: string }
      | { inlineData: { data: string; mimeType: string } };

    const parts: ContentPart[] = [{ text: prompt }];

    if (hasBeforeImage && input.beforeImageUrl) {
      const imgData = await fetchImageAsBase64(input.beforeImageUrl);
      if (imgData) parts.push({ inlineData: imgData });
    }
    if (hasAfterImage && input.afterImageUrl) {
      const imgData = await fetchImageAsBase64(input.afterImageUrl);
      if (imgData) parts.push({ inlineData: imgData });
    }

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
      contents: [{ role: "user", parts }],
      config: {
        temperature: 0.2,
        maxOutputTokens: 700,
        responseMimeType: "application/json",
      },
    });

    const text = (response.text ?? "").trim();
    if (!text) {
      console.warn("[Verification] Empty Gemini response — using deterministic verifier");
      return deterministicVerification(input);
    }

    const parsed = JSON.parse(text) as VerificationResult;
    if (!parsed.recommendation) {
      console.warn("[Verification] Missing recommendation field — using deterministic verifier");
      return deterministicVerification(input);
    }
    parsed.confidence = Math.max(0, Math.min(100, parsed.confidence ?? 60));
    return parsed;
  } catch (err) {
    console.error("[Verification] Gemini failed — using deterministic verifier:", err instanceof Error ? err.message : err);
    return deterministicVerification(input);
  }
}
