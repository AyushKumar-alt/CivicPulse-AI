import { NextRequest, after } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb, getAdminAuth } from "@/lib/firebase/admin";
import { summarizeCommunitySignals } from "@/lib/ai/communitySummarizer";

const SUMMARIZE_THRESHOLD = Number(process.env.COMMUNITY_SUMMARIZE_THRESHOLD ?? "3");

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let uid: string;
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return Response.json({ error: "Invalid token" }, { status: 401 });
  }

  const body = (await request.json()) as { text?: string };
  const text = (body.text ?? "").trim();
  if (!text || text.length > 300) {
    return Response.json(
      { error: "Comment must be 1-300 characters" },
      { status: 400 },
    );
  }

  const db = getAdminDb();
  const issueRef = db.collection("issues").doc(id);
  const issueSnap = await issueRef.get();
  if (!issueSnap.exists) {
    return Response.json({ error: "Issue not found" }, { status: 404 });
  }

  // Add comment to subcollection
  const commentRef = issueRef.collection("comments").doc();
  await commentRef.set({
    user_uid: uid,
    text,
    created_at: Timestamp.now(),
  });

  // Update comment count on issue doc
  const commentsSnap = await issueRef.collection("comments").count().get();
  const commentCount = commentsSnap.data().count;

  await issueRef.update({
    comment_count: commentCount,
    updated_at: Timestamp.now(),
  });

  // Trigger community summarizer if threshold met
  const issueData = issueSnap.data()!;
  const confirmations = (issueData.confirmation_count as number) ?? 0;
  if (commentCount >= SUMMARIZE_THRESHOLD || confirmations >= SUMMARIZE_THRESHOLD) {
    after(() => summarizeCommunitySignals(id));
  }

  return Response.json({ ok: true, comment_count: commentCount });
}
