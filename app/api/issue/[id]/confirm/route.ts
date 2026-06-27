import { NextRequest, after } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb, getAdminAuth } from "@/lib/firebase/admin";
import { generateEscalationBrief } from "@/lib/ai/generateBrief";
import { summarizeCommunitySignals } from "@/lib/ai/communitySummarizer";

const ESCALATION_THRESHOLD = Number(process.env.ESCALATION_THRESHOLD ?? "3");
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

  const db = getAdminDb();
  const issueRef = db.collection("issues").doc(id);
  const confirmRef = issueRef.collection("confirmations").doc(uid);

  let newCount = 0;
  let justEscalated = false;

  try {
    await db.runTransaction(async (tx) => {
      const [issueSnap, confirmSnap] = await Promise.all([
        tx.get(issueRef),
        tx.get(confirmRef),
      ]);

      if (!issueSnap.exists) throw Object.assign(new Error("Issue not found"), { code: 404 });
      if (confirmSnap.exists) throw Object.assign(new Error("Already confirmed"), { code: 409 });

      const data = issueSnap.data()!;
      if (data.reporter_uid === uid) {
        throw Object.assign(new Error("Cannot confirm your own issue"), { code: 403 });
      }

      newCount = ((data.confirmation_count as number) ?? 0) + 1;

      const updateFields: Record<string, unknown> = {
        confirmation_count: newCount,
        updated_at: Timestamp.now(),
      };

      if (newCount >= ESCALATION_THRESHOLD && !data.escalated) {
        updateFields.escalated = true;
        updateFields.escalated_at = Timestamp.now();
        updateFields.escalation_reason = `Auto-escalated: ${newCount} community confirmations`;
        justEscalated = true;
      }

      tx.set(confirmRef, { uid, confirmed_at: Timestamp.now() });
      tx.update(issueRef, updateFields);
    });
  } catch (err) {
    const e = err as Error & { code?: number };
    const code = e.code ?? 500;
    return Response.json({ error: e.message }, { status: code });
  }

  // Generate escalation brief after response is sent (non-blocking)
  if (justEscalated) {
    after(() => generateEscalationBrief(id));
  }

  // Trigger community summarizer when confirmations hit threshold
  if (newCount >= SUMMARIZE_THRESHOLD) {
    after(() => summarizeCommunitySignals(id));
  }

  return Response.json({ ok: true, confirmation_count: newCount });
}
