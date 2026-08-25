import { NextRequest } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { AuthContextResolver } from "@/src/modules/auth";
import { FirestoreIssueRepository } from "@/src/modules/data";

export async function GET(request: NextRequest) {
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

  if (user.role !== "department_officer" && user.role !== "department_admin" && user.role !== "command_center_admin" && user.role !== "super_admin") {
    return Response.json({ error: "Forbidden: Department portal access required" }, { status: 403 });
  }

  const repo = new FirestoreIssueRepository(getAdminDb());

  try {
    if (user.role === "command_center_admin" || user.role === "super_admin") {
      const snap = await getAdminDb().collection("issues").get();
      const issues = snap.docs.map((d) => repo.toCanonicalModel(d.id, d.data()));
      return Response.json(issues);
    }

    if (!user.agencyScope) {
      return Response.json({ error: "Forbidden: User account has no assigned agency scope" }, { status: 403 });
    }

    // Server-side enforced agency isolation: agencyScope is derived strictly from verified identity
    const issues = await repo.queryByAgency(user.agencyScope);
    return Response.json(issues);
  } catch (err: any) {
    if (
      err?.code === 429 ||
      err?.status === 429 ||
      String(err?.message || err).includes("Quota limit exceeded") ||
      String(err?.message || err).includes("RESOURCE_EXHAUSTED")
    ) {
      console.warn("[FIRESTORE QUOTA EXCEEDED] Returning department fallback response");
      const fallbackAgency = user.agencyScope || "bengaluru_bwssb";
      const fallbackIssues = await repo.queryByAgency(fallbackAgency);
      return Response.json(fallbackIssues);
    }
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
