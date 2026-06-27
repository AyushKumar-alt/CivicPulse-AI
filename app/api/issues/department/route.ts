import { NextRequest } from "next/server";
import { getAdminDb, getAdminAuth } from "@/lib/firebase/admin";
import { getDeptKeyFromEmail } from "@/lib/auth/deptAuth";

function serializeTimestamp(ts: unknown): number | null {
  if (ts && typeof ts === "object" && "toMillis" in ts) {
    return (ts as { toMillis: () => number }).toMillis();
  }
  return null;
}

export async function GET(request: NextRequest) {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let deptKey: string | null;
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    if (!decoded.email) return Response.json({ error: "Forbidden" }, { status: 403 });
    deptKey = getDeptKeyFromEmail(decoded.email);
    if (!deptKey) return Response.json({ error: "Forbidden" }, { status: 403 });
  } catch {
    return Response.json({ error: "Invalid token" }, { status: 401 });
  }

  const db = getAdminDb();
  // Single-field where clause (no composite index required)
  const snap = await db
    .collection("issues")
    .where("assigned_department", "==", deptKey)
    .get();

  const issues = snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        raw_description: (data.raw_description as string) ?? "",
        image_url: data.image_url as string,
        submitted_at: serializeTimestamp(data.submitted_at),
        updated_at: serializeTimestamp(data.updated_at),
        location: (data.location as Record<string, unknown>) ?? null,
        status: data.status as string,
        confirmation_count: (data.confirmation_count as number) ?? 0,
        escalated: (data.escalated as boolean) ?? false,
        escalation_reason: (data.escalation_reason as string) ?? null,
        area_category: (data.area_category as string) ?? null,
        area_confidence: (data.area_confidence as number) ?? null,
        citizen_concern_level: (data.citizen_concern_level as string) ?? null,
        community_summary: (data.community_summary as string) ?? null,
        comment_count: (data.comment_count as number) ?? 0,
        assigned_department: (data.assigned_department as string) ?? null,
        assigned_department_name: (data.assigned_department_name as string) ?? null,
        assigned_at: serializeTimestamp(data.assigned_at),
        assignment_method: (data.assignment_method as string) ?? null,
        department_status: (data.department_status as string) ?? null,
        department_progress: (data.department_progress as unknown[]) ?? [],
        action_plan: data.action_plan ?? null,
        action_plan_generated_at: serializeTimestamp(data.action_plan_generated_at),
        verification: data.verification ?? null,
        duplicate_candidate: (data.duplicate_candidate as boolean) ?? false,
        ai: data.ai
          ? {
              ...(data.ai as Record<string, unknown>),
              generated_at: serializeTimestamp((data.ai as Record<string, unknown>).generated_at),
            }
          : null,
      };
    })
    .sort((a, b) => (b.submitted_at ?? 0) - (a.submitted_at ?? 0));

  return Response.json(issues);
}
