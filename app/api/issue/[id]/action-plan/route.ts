import { NextRequest } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb, getAdminAuth } from "@/lib/firebase/admin";
import { getDeptKeyFromEmail } from "@/lib/auth/deptAuth";
import { generateActionPlan } from "@/lib/ai/generateActionPlan";
import type { IssueIntelligenceReport } from "@/lib/ai/types";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  console.log(`[ActionPlan:route] Received request for issue ${id}`);

  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) {
    console.log(`[ActionPlan:route] No token — returning 401`);
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    if (!decoded.email || !getDeptKeyFromEmail(decoded.email)) {
      console.log(`[ActionPlan:route] Forbidden — email: ${decoded.email}, deptKey: ${getDeptKeyFromEmail(decoded.email ?? "")}`);
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    console.log(`[ActionPlan:route] Auth OK — ${decoded.email}`);
  } catch (err) {
    console.log(`[ActionPlan:route] Token verification failed:`, err);
    return Response.json({ error: "Invalid token" }, { status: 401 });
  }

  const db = getAdminDb();
  const ref = db.collection("issues").doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    console.log(`[ActionPlan:route] Issue not found: ${id}`);
    return Response.json({ error: "Issue not found" }, { status: 404 });
  }

  const data = snap.data()!;
  console.log(`[ActionPlan:route] Issue loaded. action_plan exists: ${!!data.action_plan}, ai keys: ${Object.keys(data.ai ?? {}).join(", ")}`);

  if (data.action_plan) {
    console.log(`[ActionPlan:route] Returning cached plan`);
    return Response.json({ action_plan: data.action_plan, cached: true });
  }

  const loc = (data.location as Record<string, unknown>) ?? {};
  console.log(`[ActionPlan:route] Calling generateActionPlan() — dept: ${data.assigned_department_name}, address: ${loc.address}`);

  let plan;
  try {
    plan = await generateActionPlan({
      iir: (data.ai ?? {}) as IssueIntelligenceReport,
      departmentName: (data.assigned_department_name as string) ?? "Municipal Department",
      address: (loc.address as string) ?? null,
    });
  } catch (err) {
    console.error(`[ActionPlan:route] generateActionPlan() threw unexpectedly:`, err);
    return Response.json({ error: "Action plan generation failed" }, { status: 500 });
  }

  console.log(`[ActionPlan:route] generateActionPlan() returned. Is fallback: ${plan.reasoning === "Standard action plan applied — AI generation unavailable."}`);
  console.log(`[ActionPlan:route] Plan crew_required: "${plan.crew_required}", steps: ${plan.repair_steps?.length}`);

  try {
    await ref.update({
      action_plan: plan,
      action_plan_generated_at: Timestamp.now(),
    });
    console.log(`[ActionPlan:route] Firestore updated successfully`);
  } catch (err) {
    console.error(`[ActionPlan:route] Firestore update FAILED:`, err);
    return Response.json({ error: "Failed to save action plan" }, { status: 500 });
  }

  console.log(`[ActionPlan:route] Returning response`);
  return Response.json({ action_plan: plan, cached: false });
}
