import { NextRequest } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb, getAdminAuth } from "@/lib/firebase/admin";

// L2: State machine — only allow these forward transitions
const ALLOWED_TRANSITIONS: Record<string, Set<string>> = {
  processing:           new Set(["analyzed", "rejected"]),
  analyzed:             new Set(["assigned", "rejected"]),
  assigned:             new Set(["in_progress", "rejected"]),
  in_progress:          new Set(["pending_verification", "assigned", "rejected"]),
  pending_verification: new Set(["resolved", "in_progress", "rejected"]),
  resolved:             new Set([]),
  rejected:             new Set([]),
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let callerRole: string | undefined;
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    callerRole = decoded.role as string | undefined;
  } catch {
    return Response.json({ error: "Invalid token" }, { status: 401 });
  }

  // L3: Use server-only claim, not NEXT_PUBLIC env var
  if (callerRole !== "commandcenter") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as { status?: string };
  if (!body.status || !(body.status in ALLOWED_TRANSITIONS)) {
    return Response.json({ error: "Invalid status value" }, { status: 400 });
  }

  const db = getAdminDb();
  const ref = db.collection("issues").doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return Response.json({ error: "Issue not found" }, { status: 404 });
  }

  const currentStatus = (snap.data()?.status as string) ?? "";
  const allowed = ALLOWED_TRANSITIONS[currentStatus];

  if (!allowed || !allowed.has(body.status)) {
    return Response.json(
      { error: `Transition from '${currentStatus}' to '${body.status}' is not allowed` },
      { status: 422 },
    );
  }

  const extra: Record<string, unknown> = {};
  if (body.status === "resolved") extra.resolved_at = Timestamp.now();

  await ref.update({ status: body.status, updated_at: Timestamp.now(), ...extra });

  return Response.json({ ok: true, status: body.status });
}
