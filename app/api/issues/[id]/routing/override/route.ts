import { NextRequest } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { AuthContextResolver, AuthorizationPolicy } from "@/src/modules/auth";
import { FirestoreIssueRepository } from "@/src/modules/data";
import { AuditLogger } from "@/src/modules/audit";
import { getAgencyById } from "@/lib/municipal";

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
  } catch {
    return Response.json({ error: "Unauthorized: Invalid authentication token" }, { status: 401 });
  }

  if (!AuthorizationPolicy.canReRouteIssue(user)) {
    return Response.json({ error: "Forbidden: Only Command Center Admins can override routing" }, { status: 403 });
  }

  const db = getAdminDb();
  const repo = new FirestoreIssueRepository(db);
  const auditLogger = new AuditLogger(db);

  const issue = await repo.getById(id);
  if (!issue) {
    return Response.json({ error: `Issue '${id}' not found` }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const newAgencyId = body.newAgencyId || body.agencyId;
  const reason = body.reason || "Command center manual jurisdiction override";

  if (!newAgencyId) {
    return Response.json({ error: "Missing required parameter 'newAgencyId'" }, { status: 400 });
  }

  const agencyObj = getAgencyById(newAgencyId);
  const newAgencyName = agencyObj?.name || body.newAgencyName || newAgencyId;

  const previousState = {
    assignedAgencyId: issue.assignedAgencyId,
    assignedAgencyName: issue.assignedAgencyName,
    routingDecision: issue.routingDecision ?? null,
  };

  const now = new Date().toISOString();

  issue.routingOverride = {
    previousAgencyId: issue.assignedAgencyId,
    newAgencyId,
    newAgencyName,
    reason,
    overriddenBy: user.uid,
    overriddenAt: now,
    method: "ADMIN_OVERRIDE",
  };

  issue.assignedAgencyId = newAgencyId;
  issue.assignedAgencyName = newAgencyName;
  issue.primaryStatus = "routed";
  issue.updatedAt = now;

  await repo.save(issue);

  await auditLogger.logEvent({
    issueId: id,
    actorId: user.uid,
    actorEmail: user.email,
    actorRole: user.role,
    action: "ROUTING_OVERRIDDEN",
    previousState,
    newState: {
      assignedAgencyId: issue.assignedAgencyId,
      assignedAgencyName: issue.assignedAgencyName,
      routingOverride: issue.routingOverride,
    },
    reason,
    timestamp: now,
  });

  return Response.json(issue);
}
