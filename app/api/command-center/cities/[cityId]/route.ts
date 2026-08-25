import { NextRequest } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { AuthContextResolver } from "@/src/modules/auth";
import { FirestoreIssueRepository } from "@/src/modules/data";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ cityId: string }> }
) {
  const { cityId } = await params;
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

  let rawDocs: any[] = [];
  try {
    const snap = await db.collection("issues").get();
    rawDocs = snap.docs.filter((d) => {
      const data = d.data();
      const docCity = String(data.city_code || data.location?.cityId || "bengaluru").toLowerCase();
      return docCity === cityId.toLowerCase() || cityId.toLowerCase() === "all";
    });
  } catch (dbErr: any) {
    console.warn("[COMMAND CENTER CITY ROUTE DB QUOTA/ERROR]", dbErr?.message || dbErr);
    rawDocs = [];
  }

  const canonicalIssues = rawDocs.map((d) => repo.toCanonicalModel(d.id, d.data()));

  const agencyMap: Record<string, { agencyId: string; agencyName: string; activeIssues: number; criticalIssues: number; resolvedIssues: number; totalIssues: number }> = {};

  let cityActive = 0;
  let cityCritical = 0;
  let cityResolved = 0;

  for (const issue of canonicalIssues) {
    const agencyId = issue.assignedAgencyId;
    const agencyName = issue.assignedAgencyName;

    if (!agencyMap[agencyId]) {
      agencyMap[agencyId] = { agencyId, agencyName, activeIssues: 0, criticalIssues: 0, resolvedIssues: 0, totalIssues: 0 };
    }

    agencyMap[agencyId].totalIssues++;
    if (issue.primaryStatus === "resolved") {
      cityResolved++;
      agencyMap[agencyId].resolvedIssues++;
    } else {
      cityActive++;
      agencyMap[agencyId].activeIssues++;
      if (issue.aiObservations?.visualSeverity === "critical" || issue.ai?.severity === "critical") {
        cityCritical++;
        agencyMap[agencyId].criticalIssues++;
      }
    }
  }

  return Response.json({
    cityId,
    cityName: cityId.charAt(0).toUpperCase() + cityId.slice(1),
    statistics: {
      totalIssues: canonicalIssues.length,
      activeIssues: cityActive,
      criticalIssues: cityCritical,
      resolvedIssues: cityResolved,
    },
    agencies: Object.values(agencyMap),
    issues: canonicalIssues,
  });
}
