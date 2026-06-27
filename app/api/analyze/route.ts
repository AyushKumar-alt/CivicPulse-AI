import { after } from "next/server";
import { analyzeIssue } from "@/lib/ai/analyzeIssue";

export async function POST(request: Request) {
  const body = await request.json() as { issueId?: string };
  const { issueId } = body;

  if (!issueId || typeof issueId !== "string") {
    return Response.json({ error: "issueId is required" }, { status: 400 });
  }

  // Schedule analysis to run AFTER this response is sent.
  // The client receives {status:"accepted"} immediately and navigates away.
  // The after() callback completes the Gemini call and Firestore update in
  // the background, which the client's onSnapshot listener will pick up.
  after(async () => {
    await analyzeIssue(issueId);
  });

  return Response.json({ status: "accepted" });
}
