import { NextRequest } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { AuthContextResolver } from "@/src/modules/auth";
import { LifecycleService, type ActorContext } from "@/src/modules/lifecycle/lifecycleService";

export async function POST(
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
  } catch (err: any) {
    return Response.json({ error: `Unauthorized: ${err?.message || "Invalid token"}` }, { status: 401 });
  }

  const actorRole =
    user.role === "command_center_admin" || user.role === "super_admin"
      ? "COMMAND_CENTER"
      : "SUPERVISOR";

  const actor: ActorContext = {
    actorId: user.uid,
    actorRole,
    assignedAgencyId: user.agencyScope || null,
  };

  const body = await request.json().catch(() => ({}));
  const db = getAdminDb();
  const doc = await db.collection("issues").doc(id).get();
  if (!doc.exists) {
    return Response.json({ error: `Issue '${id}' not found.` }, { status: 404 });
  }

  const issueData = doc.data() as any;

  try {
    const res = await LifecycleService.reassign(
      {
        issueId: id,
        reasonCode: body.reasonCode || "WRONG_JURISDICTION",
        note: body.note,
      },
      actor,
      issueData.geoContext || issueData.location,
      issueData.aiObservations || issueData.ai
    );

    return Response.json({ success: true, issueId: id, state: "ROUTED", receivingAgencyId: res.receivingAgencyId });
  } catch (err: any) {
    const statusCode = err?.name === "ValidationError" ? 400 : err?.name === "ForbiddenError" ? 403 : err?.name === "ConflictError" ? 409 : 500;
    return Response.json({ error: err?.message || String(err) }, { status: statusCode });
  }
}
