import { analyzeIssue } from "@/lib/ai/analyzeIssue";

export async function POST(request: Request) {
  const body = await request.json() as { issueId?: string };
  const { issueId } = body;

  if (!issueId || typeof issueId !== "string") {
    return Response.json({ error: "issueId is required" }, { status: 400 });
  }

  await analyzeIssue(issueId);

  return Response.json({ status: "done" });
}
