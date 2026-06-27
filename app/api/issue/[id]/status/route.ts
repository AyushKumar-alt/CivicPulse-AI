import { NextRequest } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb, getAdminAuth } from "@/lib/firebase/admin";

const AUTHORITY_EMAIL = process.env.AUTHORITY_EMAIL ?? "";
const COMMANDCENTER_EMAIL = process.env.NEXT_PUBLIC_COMMANDCENTER_EMAIL ?? "";

function isCommandCenter(email: string): boolean {
  const e = email.toLowerCase();
  return (
    (!!AUTHORITY_EMAIL && e === AUTHORITY_EMAIL.toLowerCase()) ||
    (!!COMMANDCENTER_EMAIL && e === COMMANDCENTER_EMAIL.toLowerCase())
  );
}

const VALID_STATUSES = new Set([
  "processing",
  "analyzed",
  "assigned",
  "in_progress",
  "pending_verification",
  "resolved",
  "rejected",
]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    if (!decoded.email || !isCommandCenter(decoded.email)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return Response.json({ error: "Invalid token" }, { status: 401 });
  }

  const body = (await request.json()) as { status?: string };
  if (!body.status || !VALID_STATUSES.has(body.status)) {
    return Response.json({ error: "Invalid status value" }, { status: 400 });
  }

  const db = getAdminDb();
  const ref = db.collection("issues").doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return Response.json({ error: "Issue not found" }, { status: 404 });
  }

  await ref.update({
    status: body.status,
    updated_at: Timestamp.now(),
  });

  return Response.json({ ok: true, status: body.status });
}
