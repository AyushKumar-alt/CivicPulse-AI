import { NextRequest } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb, getAdminAuth } from "@/lib/firebase/admin";
import { mapToDepartment } from "@/lib/departments";
import { resolveCityFromAddress, resolveCityFromCoords, resolveAgencyForIssue, DepartmentCategory } from "@/lib/municipal";

// H2 Fix: department assignment runs server-side via admin SDK.
// The client writes the AI analysis result; this route reads it and assigns the department.
// Admin SDK bypasses Firestore rules, so the reporter cannot forge their own routing.

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let reporterUid: string;
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    reporterUid = decoded.uid;
  } catch {
    return Response.json({ error: "Invalid token" }, { status: 401 });
  }

  const db = getAdminDb();
  const ref = db.collection("issues").doc(id);
  const snap = await ref.get();

  if (!snap.exists) return Response.json({ error: "Issue not found" }, { status: 404 });

  const data = snap.data()!;

  // Only the reporter can trigger assignment for their own issue
  if (data.reporter_uid !== reporterUid) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Must be in analyzed state (AI result already written by client)
  if (data.status !== "analyzed") {
    return Response.json({ error: "Issue not in analyzed state" }, { status: 400 });
  }

  // Already assigned — idempotent
  if (data.assigned_department) {
    return Response.json({ ok: true, assigned: data.assigned_department });
  }

  const responsibleAuthority = data.ai?.responsible_authority as string | undefined;
  const issueType = data.ai?.issue_type as string | undefined;

  if (!responsibleAuthority) {
    return Response.json({ error: "No AI analysis result found" }, { status: 400 });
  }

  const address = (data.location?.address as string) || (data.location?.area_name as string) || "";
  const lat = Number(data.location?.lat ?? 13.1473);
  const lng = Number(data.location?.lng ?? 77.6200);

  const cityCode = resolveCityFromAddress(address) || resolveCityFromCoords(lat, lng);
  const dept = mapToDepartment(responsibleAuthority, issueType ?? "");
  const agency = resolveAgencyForIssue(cityCode, dept.key as DepartmentCategory);

  // Admin SDK write — bypasses Firestore rules intentionally
  await ref.update({
    assigned_department: dept.key,
    assigned_department_name: agency.name,
    assigned_department_email: agency.email_aliases[0] ?? dept.email,
    assigned_agency_id: agency.agency_id,
    city_code: cityCode,
    assigned_at: Timestamp.now(),
    assigned_by: "AI Analysis Agent (server)",
    assignment_method: "AI Analysis + Municipal Agency Routing",
    updated_at: Timestamp.now(),
  });

  return Response.json({ ok: true, assigned: dept.key });
}
