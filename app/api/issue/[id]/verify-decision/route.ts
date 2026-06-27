import { NextRequest } from "next/server";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getAdminDb, getAdminAuth } from "@/lib/firebase/admin";
import { isCommandCenterEmail } from "@/lib/auth/deptAuth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let ccEmail = "";
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    if (!decoded.email || !isCommandCenterEmail(decoded.email)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    ccEmail = decoded.email;
  } catch {
    return Response.json({ error: "Invalid token" }, { status: 401 });
  }

  const body = (await request.json()) as { decision?: "approve" | "reject"; notes?: string };
  if (body.decision !== "approve" && body.decision !== "reject") {
    return Response.json({ error: "decision must be 'approve' or 'reject'" }, { status: 400 });
  }

  const db = getAdminDb();
  const ref = db.collection("issues").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return Response.json({ error: "Issue not found" }, { status: 404 });

  const data = snap.data()!;
  if (data.status !== "pending_verification") {
    return Response.json(
      { error: "Issue is not pending verification" },
      { status: 400 },
    );
  }

  const now = Timestamp.now();
  const isApproved = body.decision === "approve";

  const progressEntry = {
    stage: isApproved ? "command_center_approved" : "command_center_rejected",
    timestamp: now,
    notes:
      body.notes ??
      (isApproved
        ? "Repair verified and approved by Command Center"
        : "Sent back for rework by Command Center"),
    updated_by: ccEmail,
    workflow_recommendation: null,
  };

  await ref.update({
    status: isApproved ? "resolved" : "in_progress",
    department_status: isApproved ? "command_center_approved" : "needs_rework",
    department_progress: FieldValue.arrayUnion(progressEntry),
    updated_at: now,
    ...(isApproved ? { resolved_at: now } : {}),
  });

  return Response.json({
    ok: true,
    decision: body.decision,
    new_status: isApproved ? "resolved" : "in_progress",
  });
}
