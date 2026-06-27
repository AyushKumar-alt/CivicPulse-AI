import { NextRequest } from "next/server";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getAdminDb, getAdminAuth } from "@/lib/firebase/admin";
import { getDeptKeyFromEmail } from "@/lib/auth/deptAuth";
import { generateVerification } from "@/lib/ai/generateVerification";
import type { IssueIntelligenceReport, ActionPlanSummary } from "@/lib/ai/types";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let deptKey: string | null;
  let userEmail = "";
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    if (!decoded.email) return Response.json({ error: "Forbidden" }, { status: 403 });
    deptKey = getDeptKeyFromEmail(decoded.email);
    if (!deptKey) return Response.json({ error: "Forbidden" }, { status: 403 });
    userEmail = decoded.email;
  } catch {
    return Response.json({ error: "Invalid token" }, { status: 401 });
  }

  const body = (await request.json()) as {
    repair_type?: string;
    repair_notes?: string;
    after_image_url?: string | null;
  };

  if (!body.repair_type || !body.repair_notes) {
    return Response.json(
      { error: "repair_type and repair_notes are required" },
      { status: 400 },
    );
  }

  const db = getAdminDb();
  const ref = db.collection("issues").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return Response.json({ error: "Issue not found" }, { status: 404 });

  const data = snap.data()!;

  if (data.assigned_department !== deptKey) {
    return Response.json({ error: "Not assigned to your department" }, { status: 403 });
  }

  const currentStage = (data.department_status as string) ?? "repair_started";
  if (!["repair_started", "needs_rework"].includes(currentStage)) {
    return Response.json(
      { error: "Can only submit verification from repair_started or needs_rework stage" },
      { status: 400 },
    );
  }

  // Extract action plan summary
  const rawPlan = data.action_plan as Record<string, unknown> | null;
  const actionPlan: ActionPlanSummary | null = rawPlan
    ? {
        crew_required: (rawPlan.crew_required as string) ?? "",
        estimated_workers: (rawPlan.estimated_workers as number) ?? 0,
        estimated_duration: (rawPlan.estimated_duration as string) ?? "",
        repair_steps: (rawPlan.repair_steps as string[]) ?? [],
        traffic_management: (rawPlan.traffic_management as string) ?? "",
        safety_protocols: (rawPlan.safety_protocols as string[]) ?? [],
        expected_completion: (rawPlan.expected_completion as string) ?? "",
        reasoning: (rawPlan.reasoning as string) ?? "",
      }
    : null;

  const verificationResult = await generateVerification({
    iir: (data.ai ?? {}) as IssueIntelligenceReport,
    actionPlan,
    departmentName: (data.assigned_department_name as string) ?? "Municipal Department",
    repairType: body.repair_type,
    repairNotes: body.repair_notes,
    beforeImageUrl: (data.image_url as string) ?? null,
    afterImageUrl: body.after_image_url ?? null,
  });

  const now = Timestamp.now();

  const verificationDoc = {
    ...verificationResult,
    repair_type: body.repair_type,
    repair_notes: body.repair_notes,
    after_image_url: body.after_image_url ?? null,
    generated_at: now,
    submitted_by: userEmail,
  };

  const repairEntry = {
    stage: "repair_completed",
    timestamp: now,
    notes: `${body.repair_type} — ${body.repair_notes}`,
    updated_by: userEmail,
    workflow_recommendation: null,
  };

  const verifyEntry = {
    stage: "ready_for_verification",
    timestamp: now,
    notes: `AI Verification: ${verificationResult.recommendation} (${verificationResult.confidence}% confidence)`,
    updated_by: "AI Verification Agent",
    workflow_recommendation: null,
  };

  await ref.update({
    department_status: "ready_for_verification",
    status: "pending_verification",
    verification: verificationDoc,
    department_progress: FieldValue.arrayUnion(repairEntry, verifyEntry),
    updated_at: now,
  });

  return Response.json({
    verification: verificationDoc,
    department_status: "ready_for_verification",
  });
}
