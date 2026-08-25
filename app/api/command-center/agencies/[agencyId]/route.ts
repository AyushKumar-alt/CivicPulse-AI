import { NextRequest } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { AuthContextResolver } from "@/src/modules/auth";
import { FirestoreIssueRepository } from "@/src/modules/data";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agencyId: string }> }
) {
  const { agencyId } = await params;
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) {
    return Response.json({ error: "Unauthorized: Missing authentication token" }, { status: 401 });
  }

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    const user = AuthContextResolver.buildIdentity(decoded.uid, decoded.email ?? "", decoded);
    if (
      user.role !== "command_center_admin" &&
      user.role !== "super_admin" &&
      user.role !== "department_officer" &&
      user.role !== "department_admin"
    ) {
      return Response.json({ error: "Forbidden: Operations portal access required" }, { status: 403 });
    }
  } catch {
    return Response.json({ error: "Unauthorized: Invalid authentication token" }, { status: 401 });
  }

  const db = getAdminDb();
  const repo = new FirestoreIssueRepository(db);
  const canonicalIssues = await repo.queryByAgency(agencyId);

  const severityCount: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  const statusCount: Record<string, number> = { submitted: 0, routed: 0, in_repair: 0, resolved: 0, unresolved_review: 0 };

  for (const issue of canonicalIssues) {
    const sev = issue.aiObservations?.visualSeverity || issue.ai?.severity || "medium";
    const st = issue.primaryStatus || "routed";

    severityCount[sev] = (severityCount[sev] || 0) + 1;
    statusCount[st] = (statusCount[st] || 0) + 1;
  }

  return Response.json({
    agencyId,
    statistics: {
      totalIssues: canonicalIssues.length,
      activeIssues: canonicalIssues.filter((i) => i.primaryStatus !== "resolved").length,
      criticalIssues: canonicalIssues.filter((i) => (i.aiObservations?.visualSeverity || i.ai?.severity) === "critical" && i.primaryStatus !== "resolved").length,
      resolvedIssues: canonicalIssues.filter((i) => i.primaryStatus === "resolved").length,
    },
    severityDistribution: severityCount,
    statusDistribution: statusCount,
    issues: canonicalIssues,
  });
}
