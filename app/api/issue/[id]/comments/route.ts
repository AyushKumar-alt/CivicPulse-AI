import { NextRequest } from "next/server";
import { getAdminDb, getAdminAuth } from "@/lib/firebase/admin";

function serializeTimestamp(ts: unknown): number | null {
  if (ts && typeof ts === "object" && "toMillis" in ts) {
    return (ts as { toMillis: () => number }).toMillis();
  }
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await getAdminAuth().verifyIdToken(token);
  } catch {
    return Response.json({ error: "Invalid token" }, { status: 401 });
  }

  const db = getAdminDb();
  const snap = await db
    .collection("issues")
    .doc(id)
    .collection("comments")
    .orderBy("created_at", "asc")
    .limit(50)
    .get();

  const comments = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      user_uid: data.user_uid as string,
      text: data.text as string,
      created_at: serializeTimestamp(data.created_at),
    };
  });

  return Response.json(comments);
}
