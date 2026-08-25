import { NextRequest } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
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
      : "DEPARTMENT_OFFICER";

  const actor: ActorContext = {
    actorId: user.uid,
    actorRole,
    assignedAgencyId: user.agencyScope || null,
  };

  try {
    await LifecycleService.startInvestigation(id, actor);
    return Response.json({ success: true, issueId: id, state: "UNDER_INVESTIGATION" });
  } catch (err: any) {
    const statusCode = err?.name === "ValidationError" ? 400 : err?.name === "ForbiddenError" ? 403 : err?.name === "ConflictError" ? 409 : 500;
    return Response.json({ error: err?.message || String(err) }, { status: statusCode });
  }
}
