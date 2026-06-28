import { NextRequest } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb, getAdminAuth } from "@/lib/firebase/admin";
import { isCommandCenterEmail } from "@/lib/auth/deptAuth";
import { generateGovernanceReview } from "@/lib/ai/generateGovernanceReview";
import type { GovernanceInput, DepartmentProgressEntry } from "@/lib/ai/generateGovernanceReview";
import type { IssueIntelligenceReport, ActionPlanSummary } from "@/lib/ai/types";
import type { VerificationResult } from "@/lib/ai/generateVerification";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    if (!decoded.email || !isCommandCenterEmail(decoded.email)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return Response.json({ error: "Invalid token" }, { status: 401 });
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

  const iir = (data.ai ?? {}) as IssueIntelligenceReport;

  // Reconstruct ActionPlanSummary from stored action_plan
  let actionPlan: ActionPlanSummary | null = null;
  if (data.action_plan) {
    const ap = data.action_plan as Record<string, unknown>;
    actionPlan = {
      crew_required: String(ap.crew_required ?? ""),
      estimated_workers: Number(ap.estimated_workers ?? 0),
      estimated_duration: String(ap.estimated_duration ?? ""),
      repair_steps: (ap.repair_steps as string[]) ?? [],
      traffic_management: String(ap.traffic_management ?? ""),
      safety_protocols: (ap.safety_protocols as string[]) ?? [],
      expected_completion: String(ap.expected_completion ?? ""),
      reasoning: (ap.reasoning as string) ?? undefined,
    };
  }

  const verification = (data.verification ?? null) as VerificationResult | null;

  const departmentName =
    (data.assigned_department_name as string) ?? iir.responsible_authority ?? "Unknown Department";

  const departmentProgress = (data.department_progress ?? []) as DepartmentProgressEntry[];

  const address = (data.location as Record<string, unknown> | null)?.address as string | null ?? null;

  const input: GovernanceInput = {
    iir,
    actionPlan,
    verification,
    departmentName,
    departmentProgress,
    address,
  };

  const output = await generateGovernanceReview(input);

  const now = Timestamp.now();

  // Load existing governance to preserve history
  const existingGov = (data.governance as Record<string, unknown> | null) ?? null;
  const history = (existingGov?.history as unknown[]) ?? [];
  if (existingGov?.report) history.push(existingGov.report);

  await ref.update({
    governance: {
      report: output.report,
      generated_at: now,
      accountability: output.accountability ?? null,
      rework_order: output.rework_order ?? null,
      officer_override: existingGov?.officer_override ?? null,
      history,
    },
    updated_at: now,
  });

  return Response.json({ ok: true, ...output });
}
