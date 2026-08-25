import { NextRequest } from "next/server";
import { getAdminDb, getAdminAuth } from "@/lib/firebase/admin";
import { AuthContextResolver, AuthorizationPolicy } from "@/src/modules/auth";
import { FirestoreIssueRepository } from "@/src/modules/data";
import { RouteIssueService } from "@/src/modules/application";

// H2 Fix: department assignment runs server-side via admin SDK and RouteIssueService.
// Bypasses client-side rule overrides and deterministically routes via DeterministicRoutingEngine.

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

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

  // Only the original reporter or a Command Center Admin can trigger/change routing
  const isReporter = issue.reporterUid === user.uid;
  const canReRoute = AuthorizationPolicy.canReRouteIssue(user, issue);

  if (!isReporter && !canReRoute) {
    return Response.json({ error: "Forbidden: You do not have permission to re-route this issue" }, { status: 403 });
  }

  // Already assigned — idempotent
  if (issue.assignedAgencyId && issue.assignedAgencyId !== "UNRESOLVED") {
    return Response.json({ ok: true, assigned: issue.categoryKey });
  }

  const routeService = new RouteIssueService(repo);
  const routeResult = await routeService.routeIssue(id);

  if (routeResult.isFailure) {
    return Response.json({ error: routeResult.error.message }, { status: 400 });
  }

  return Response.json({ ok: true, assigned: issue.categoryKey });
}
