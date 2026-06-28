import { NextRequest } from "next/server";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getAdminDb, getAdminAuth } from "@/lib/firebase/admin";
import { isCommandCenterEmail } from "@/lib/auth/deptAuth";
import type { GovernanceDecision } from "@/lib/ai/generateGovernanceReview";

interface VerifyDecisionBody {
  decision?: "approve" | "reject";
  governance_decision?: GovernanceDecision;
  is_override?: boolean;
  override_reason?: string;
  notes?: string;
}

// Map governance AI decision to approve/reject for backward compatibility
function toBasicDecision(gov: GovernanceDecision): "approve" | "reject" {
  if (gov === "APPROVE_RESOLUTION") return "approve";
  return "reject";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let ccEmail = "";
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    if (!decoded.email || !isCommandCenterEmail(decoded.email)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    ccEmail = decoded.email;
  } catch {
    return Response.json({ error: "Invalid token" }, { status: 401 });
  }

  const body = (await request.json()) as VerifyDecisionBody;

  // Support both old-style "approve"/"reject" and new governance decisions
  let basicDecision: "approve" | "reject";
  let governanceDecision: GovernanceDecision | null = null;

  if (body.governance_decision) {
    governanceDecision = body.governance_decision;
    basicDecision = toBasicDecision(body.governance_decision);
  } else if (body.decision === "approve" || body.decision === "reject") {
    basicDecision = body.decision;
    governanceDecision = basicDecision === "approve" ? "APPROVE_RESOLUTION" : "RETURN_FOR_REWORK";
  } else {
    return Response.json(
      { error: "decision or governance_decision is required" },
      { status: 400 },
    );
  }

  const db = getAdminDb();
  const ref = db.collection("issues").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return Response.json({ error: "Issue not found" }, { status: 404 });

  const data = snap.data()!;
  if (data.status !== "pending_verification") {
    return Response.json(
      { error: "Issue is not pending verification" },
      { status: 400 },
    );
  }

  const now = Timestamp.now();
  const isApproved = basicDecision === "approve";

  const progressEntry = {
    stage: isApproved ? "command_center_approved" : "command_center_rejected",
    timestamp: now,
    notes:
      body.notes ??
      (isApproved
        ? "Repair verified and approved by Command Centre"
        : `Returned — Governance decision: ${governanceDecision}`),
    updated_by: ccEmail,
    workflow_recommendation: null,
    governance_decision: governanceDecision,
    is_officer_override: body.is_override ?? false,
  };

  // Build officer_override record if applicable
  const existingGov = (data.governance as Record<string, unknown> | null) ?? null;
  const aiDecision = (existingGov?.report as Record<string, unknown> | null)?.decision as GovernanceDecision | null;

  const officerOverride = body.is_override && aiDecision
    ? {
        original_ai_decision: aiDecision,
        officer_decision: governanceDecision,
        reason: body.override_reason ?? "Officer override — no reason provided",
        officer_email: ccEmail,
        timestamp: now,
      }
    : null;

  const updatePayload: Record<string, unknown> = {
    status: isApproved ? "resolved" : "in_progress",
    department_status: isApproved ? "command_center_approved" : "needs_rework",
    department_progress: FieldValue.arrayUnion(progressEntry),
    updated_at: now,
  };

  if (isApproved) updatePayload.resolved_at = now;

  // Update governance blob with officer override and decision
  if (existingGov) {
    updatePayload["governance.officer_override"] = officerOverride;
    updatePayload["governance.final_decision"] = governanceDecision;
    updatePayload["governance.decided_at"] = now;
    updatePayload["governance.decided_by"] = ccEmail;
  }

  await ref.update(updatePayload);

  return Response.json({
    ok: true,
    decision: basicDecision,
    governance_decision: governanceDecision,
    new_status: isApproved ? "resolved" : "in_progress",
    is_override: body.is_override ?? false,
  });
}
