import { analyzeIssue } from "@/lib/ai/analyzeIssue";

// Vercel Hobby allows up to 60s — Gemini + image fetch needs more than the default 10s
export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await request.json() as { issueId?: string; force?: boolean };
  const { issueId, force } = body;

  if (!issueId || typeof issueId !== "string") {
    return Response.json({ error: "issueId is required" }, { status: 400 });
  }

  try {
    await analyzeIssue(issueId, !!force);
    return Response.json({ status: "done" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[analyzeRoute][${issueId}] Unhandled error:`, message);
    return Response.json({ error: message }, { status: 500 });
  }
}
