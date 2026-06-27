import { NextRequest } from "next/server";
import { getAdminDb, getAdminAuth } from "@/lib/firebase/admin";
import { generateMorningBriefing } from "@/lib/ai/generateMorningBriefing";
import type { BriefingIssue, BriefingInput } from "@/lib/ai/generateMorningBriefing";
import type { IssueIntelligenceReport } from "@/lib/ai/types";

const AUTHORITY_EMAIL = process.env.AUTHORITY_EMAIL ?? "";
const COMMANDCENTER_EMAIL = process.env.NEXT_PUBLIC_COMMANDCENTER_EMAIL ?? "";

function isCommandCenter(email: string): boolean {
  const e = email.toLowerCase();
  return (
    (!!AUTHORITY_EMAIL && e === AUTHORITY_EMAIL.toLowerCase()) ||
    (!!COMMANDCENTER_EMAIL && e === COMMANDCENTER_EMAIL.toLowerCase())
  );
}

function serializeTimestamp(ts: unknown): number | null {
  if (ts && typeof ts === "object" && "toMillis" in ts) {
    return (ts as { toMillis: () => number }).toMillis();
  }
  return null;
}

export async function POST(request: NextRequest) {
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

  try {
    const db = getAdminDb();

    const since = new Date();
    since.setDate(since.getDate() - 7);

    const snap = await db
      .collection("issues")
      .where("submitted_at", ">=", since)
      .get();

    const allDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<
      Record<string, unknown> & { id: string }
    >;

    const openIssues = allDocs.filter(
      (d) => d.status !== "resolved" && d.status !== "rejected",
    );

    const criticalCount = openIssues.filter(
      (d) => (d.ai as Record<string, unknown> | null)?.severity === "critical",
    ).length;

    const escalatedCount = openIssues.filter((d) => d.escalated).length;

    // Sort: critical + escalated + priority score first
    const sorted = [...openIssues].sort((a, b) => {
      const aiA = (a.ai as Record<string, unknown> | null) ?? {};
      const aiB = (b.ai as Record<string, unknown> | null) ?? {};
      const scoreA =
        (aiA.severity === "critical" ? 30 : 0) +
        (a.escalated ? 15 : 0) +
        ((aiA.priority_score as number) ?? 0) +
        (a.citizen_concern_level === "high" ? 5 : 0);
      const scoreB =
        (aiB.severity === "critical" ? 30 : 0) +
        (b.escalated ? 15 : 0) +
        ((aiB.priority_score as number) ?? 0) +
        (b.citizen_concern_level === "high" ? 5 : 0);
      return scoreB - scoreA;
    });

    // Pass full IIRs for top 20 issues — the briefing agent reads the reports, not just stats
    const issues: BriefingIssue[] = sorted.slice(0, 20).map((d) => {
      const loc = d.location as Record<string, unknown> | null;
      return {
        id: d.id,
        iir: (d.ai ?? null) as IssueIntelligenceReport | null,
        address: (loc?.address as string) ?? null,
        assigned_department_name: (d.assigned_department_name as string) ?? null,
        status: (d.status as string) ?? "unknown",
        department_status: (d.department_status as string) ?? null,
        escalated: Boolean(d.escalated),
        citizen_concern_level: (d.citizen_concern_level as string) ?? null,
        submitted_at: serializeTimestamp(d.submitted_at),
      };
    });

    const input: BriefingInput = {
      issues,
      totalOpen: openIssues.length,
      criticalCount,
      escalatedCount,
    };

    const briefing = await generateMorningBriefing(input);
    return Response.json({ briefing });
  } catch (err) {
    console.error("[Briefing]", err);
    return Response.json({ error: "Briefing generation failed" }, { status: 500 });
  }
}
