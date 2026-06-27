import { NextRequest } from "next/server";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getAdminDb, getAdminAuth } from "@/lib/firebase/admin";
import { getDeptKeyFromEmail } from "@/lib/auth/deptAuth";
import { STAGE_TRANSITIONS } from "@/lib/departments";
import { generateWorkflowAdvice } from "@/lib/ai/generateWorkflowAdvice";
import type { IssueIntelligenceReport, ActionPlanSummary } from "@/lib/ai/types";

// Valid forward transitions handled by this endpoint
// (repair_started → repair_completed is handled by /verify endpoint)
const VALID_TO_STAGES = new Set(Object.values(STAGE_TRANSITIONS));

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

  const body = (await request.json()) as { stage?: string; notes?: string };
  if (!body.stage || !VALID_TO_STAGES.has(body.stage)) {
    return Response.json({ error: "Invalid stage" }, { status: 400 });
  }

  const db = getAdminDb();
  const ref = db.collection("issues").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return Response.json({ error: "Issue not found" }, { status: 404 });

  const data = snap.data()!;
  const currentDeptStatus = (data.department_status as string) ?? "assigned";
  const expectedNext = STAGE_TRANSITIONS[currentDeptStatus];

  if (expectedNext !== body.stage) {
    return Response.json(
      { error: `Cannot transition from "${currentDeptStatus}" to "${body.stage}"` },
      { status: 400 },
    );
  }

  if (data.assigned_department !== deptKey) {
    return Response.json({ error: "This issue is not assigned to your department" }, { status: 403 });
  }

  const loc = (data.location as Record<string, unknown>) ?? {};
  const existingProgress = (data.department_progress as Array<Record<string, unknown>>) ?? [];

  // Extract action plan summary for workflow advisor context
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

  const advice = await generateWorkflowAdvice({
    iir: (data.ai ?? {}) as IssueIntelligenceReport,
    departmentName: (data.assigned_department_name as string) ?? "Municipal Department",
    address: (loc.address as string) ?? null,
    fromStage: currentDeptStatus,
    toStage: body.stage,
    actionPlan,
    previousStages: existingProgress.map((p) => p.stage as string),
    notes: body.notes,
  });

  const progressEntry = {
    stage: body.stage,
    timestamp: Timestamp.now(),
    notes: body.notes ?? null,
    updated_by: userEmail,
    workflow_recommendation: advice,
  };

  const mainStatusUpdate =
    body.stage === "accepted" ? { status: "in_progress" } : {};

  await ref.update({
    department_status: body.stage,
    department_progress: FieldValue.arrayUnion(progressEntry),
    updated_at: Timestamp.now(),
    ...mainStatusUpdate,
  });

  return Response.json({ department_status: body.stage, workflow_recommendation: advice });
}
