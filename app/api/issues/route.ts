import { NextRequest } from "next/server";
import { getAdminDb, getAdminAuth } from "@/lib/firebase/admin";

const AUTHORITY_EMAIL = process.env.AUTHORITY_EMAIL ?? "";
const COMMANDCENTER_EMAIL = process.env.NEXT_PUBLIC_COMMANDCENTER_EMAIL ?? "";

function isCommandCenter(email: string): boolean {
  const e = email.toLowerCase();
  return (
    (!!AUTHORITY_EMAIL && e === AUTHORITY_EMAIL.toLowerCase()) ||
    (!!COMMANDCENTER_EMAIL && e === COMMANDCENTER_EMAIL.toLowerCase())
  );
}

function serializeTimestamp(ts: unknown): number | null {
  if (ts && typeof ts === "object" && "toMillis" in ts) {
    return (ts as { toMillis: () => number }).toMillis();
  }
  return null;
}

export async function GET(request: NextRequest) {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    if (!decoded.email || !isCommandCenter(decoded.email)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch (err) {
    console.error("Token verification failed details:", err);
    return Response.json({ error: "Invalid token" }, { status: 401 });
  }

  try {
    const db = getAdminDb();
    const snap = await db.collection("issues").orderBy("submitted_at", "desc").get();

    const issues = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        reporter_uid: data.reporter_uid as string,
        raw_description: (data.raw_description as string) ?? "",
        image_url: data.image_url as string,
        submitted_at: serializeTimestamp(data.submitted_at),
        updated_at: serializeTimestamp(data.updated_at),
        location: (data.location as Record<string, unknown>) ?? null,
        status: data.status as string,
        confirmation_count: (data.confirmation_count as number) ?? 0,
        escalated: (data.escalated as boolean) ?? false,
        escalated_at: serializeTimestamp(data.escalated_at),
        escalation_reason: (data.escalation_reason as string) ?? null,
        escalation_brief: (data.escalation_brief as Record<string, unknown>) ?? null,
        duplicate_candidate: (data.duplicate_candidate as boolean) ?? false,
        duplicate_of: (data.duplicate_of as string) ?? null,
        duplicate_distance_meters: (data.duplicate_distance_meters as number) ?? null,
        // Area intelligence
        area_category: (data.area_category as string) ?? null,
        area_confidence: (data.area_confidence as number) ?? null,
        // Community intelligence
        citizen_concern_level: (data.citizen_concern_level as string) ?? null,
        community_summary: (data.community_summary as string) ?? null,
        comment_count: (data.comment_count as number) ?? 0,
        // Department assignment (Routing Agent)
        assigned_department: (data.assigned_department as string) ?? null,
        assigned_department_name: (data.assigned_department_name as string) ?? null,
        assigned_department_email: (data.assigned_department_email as string) ?? null,
        assigned_at: serializeTimestamp(data.assigned_at),
        assignment_method: (data.assignment_method as string) ?? null,
        // Department operations
        department_status: (data.department_status as string) ?? null,
        verification: (data.verification as Record<string, unknown>) ?? null,
        // AI analysis blob
        ai: data.ai
          ? {
              ...(data.ai as Record<string, unknown>),
              generated_at: serializeTimestamp((data.ai as Record<string, unknown>).generated_at),
            }
          : null,
        // Governance blob
        governance: data.governance
          ? {
              ...(data.governance as Record<string, unknown>),
              generated_at: serializeTimestamp(
                (data.governance as Record<string, unknown>).generated_at,
              ),
              decided_at: serializeTimestamp(
                (data.governance as Record<string, unknown>).decided_at,
              ),
            }
          : null,
        department_progress: (data.department_progress as unknown[]) ?? [],
      };
    });

    return Response.json(issues);
  } catch (err) {
    console.error("[GET /api/issues]", err);
    return Response.json({ error: "Failed to load issues" }, { status: 500 });
  }
}
