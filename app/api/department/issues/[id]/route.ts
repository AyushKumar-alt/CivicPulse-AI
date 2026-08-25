import { NextRequest } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { AuthContextResolver } from "@/src/modules/auth";
import { FirestoreIssueRepository } from "@/src/modules/data";

function serializeTimestamp(val: any): string {
  if (!val) return new Date().toISOString();
  if (typeof val === "string") return val;
  if (typeof val === "number") return new Date(val).toISOString();
  if (typeof val.toDate === "function") return val.toDate().toISOString();
  if (typeof val._seconds === "number") return new Date(val._seconds * 1000).toISOString();
  if (typeof val.seconds === "number") return new Date(val.seconds * 1000).toISOString();
  return new Date().toISOString();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) {
    return Response.json({ error: "Unauthorized: Missing authentication token" }, { status: 401 });
  }

  let user;
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    user = AuthContextResolver.buildIdentity(decoded.uid, decoded.email ?? "", decoded);
  } catch {
    return Response.json({ error: "Unauthorized: Invalid authentication token" }, { status: 401 });
  }

  if (
    user.role !== "department_officer" &&
    user.role !== "department_admin" &&
    user.role !== "command_center_admin" &&
    user.role !== "super_admin"
  ) {
    return Response.json({ error: "Forbidden: Department portal access required" }, { status: 403 });
  }

  const db = getAdminDb();
  const repo = new FirestoreIssueRepository(db);

  try {
    const issue = await repo.getById(id);
    if (!issue) {
      return Response.json({ error: "Issue not found" }, { status: 404 });
    }

    // Verify agency scope if department officer
    if (user.role === "department_officer" || user.role === "department_admin") {
      if (user.agencyScope && issue.assignedAgencyId !== user.agencyScope) {
        return Response.json(
          { error: `Forbidden: Issue assigned to ${issue.assignedAgencyId}, but user scoped to ${user.agencyScope}` },
          { status: 403 }
        );
      }
    }

    // Fetch case_events subcollection timeline
    const eventsSnap = await db
      .collection("issues")
      .doc(id)
      .collection("case_events")
      .get();

    const caseEvents = eventsSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        eventType: data.eventType || data.event_type || "TRANSITION",
        fromState: data.fromState || data.from_state || null,
        toState: data.toState || data.to_state || data.state || null,
        actorId: data.actorId || data.actor_id || "system",
        actorRole: data.actorRole || data.actor_role || "SYSTEM",
        note: data.note || data.reason_notes || data.reasonNotes || null,
        evidenceUrl: data.evidenceUrl || data.afterEvidenceUrl || null,
        timestamp: serializeTimestamp(data.timestamp),
      };
    });

    // Sort events chronologically
    caseEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Cleanly serialize issue dates & resolution evidence
    const serializedIssue = {
      ...issue,
      submittedAt: serializeTimestamp(issue.submittedAt),
      updatedAt: serializeTimestamp(issue.updatedAt),
      ackDueAt: issue.ackDueAt ? serializeTimestamp(issue.ackDueAt) : null,
      slaDueAt: issue.slaDueAt ? serializeTimestamp(issue.slaDueAt) : null,
      citizenSlaDueAt: issue.citizenSlaDueAt ? serializeTimestamp(issue.citizenSlaDueAt) : null,
      afterEvidenceUrl: issue.afterEvidenceUrl || null,
    };

    return Response.json({ issue: serializedIssue, caseEvents });
  } catch (err: any) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
