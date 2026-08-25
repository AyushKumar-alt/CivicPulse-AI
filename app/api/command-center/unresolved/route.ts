import { NextRequest } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { AuthContextResolver } from "@/src/modules/auth";
import { FirestoreIssueRepository } from "@/src/modules/data";

export async function GET(request: NextRequest) {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) {
    return Response.json({ error: "Unauthorized: Missing authentication token" }, { status: 401 });
  }

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    const user = AuthContextResolver.buildIdentity(decoded.uid, decoded.email ?? "", decoded);
    if (user.role !== "command_center_admin" && user.role !== "super_admin") {
      return Response.json({ error: "Forbidden: Command Center access required" }, { status: 403 });
    }
  } catch {
    return Response.json({ error: "Unauthorized: Invalid authentication token" }, { status: 401 });
  }

  const db = getAdminDb();
  const repo = new FirestoreIssueRepository(db);

  const snap = await db.collection("issues").where("assigned_agency_id", "==", "UNRESOLVED").get();
  const unresolvedIssues = snap.docs.map((d) => repo.toCanonicalModel(d.id, d.data()));

  return Response.json({
    count: unresolvedIssues.length,
    issues: unresolvedIssues,
  });
}
