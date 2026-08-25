import { NextRequest } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { AuthContextResolver, AuthorizationPolicy } from "@/src/modules/auth";
import { FirestoreIssueRepository } from "@/src/modules/data";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return Response.json({ error: "Unauthorized: Missing authentication token" }, { status: 401 });

  let user;
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    user = AuthContextResolver.buildIdentity(decoded.uid, decoded.email ?? "", decoded);
  } catch {
    return Response.json({ error: "Unauthorized: Invalid authentication token" }, { status: 401 });
  }

  const repo = new FirestoreIssueRepository(getAdminDb());
  const issue = await repo.getById(id);

  if (!issue) return Response.json({ error: "Issue not found" }, { status: 404 });

  // Server-side Authorization Check: Verifies identity, role, agency scope, city scope, or ownership
  if (!AuthorizationPolicy.canReadIssue(user, issue)) {
    return Response.json(
      { error: "Forbidden: You do not have permission to view this issue outside your authorized scope" },
      { status: 403 }
    );
  }

  return Response.json(issue);
}
