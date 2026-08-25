import { NextRequest } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { AuditLogger } from "@/src/modules/audit";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) {
    return Response.json({ error: "Unauthorized: Missing authentication token" }, { status: 401 });
  }

  try {
    await getAdminAuth().verifyIdToken(token);
  } catch {
    return Response.json({ error: "Unauthorized: Invalid authentication token" }, { status: 401 });
  }

  const auditLogger = new AuditLogger(getAdminDb());
  const history = await auditLogger.getIssueHistory(id);

  return Response.json(history);
}
