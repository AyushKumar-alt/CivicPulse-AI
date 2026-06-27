import { Timestamp } from "firebase-admin/firestore";
import { GoogleGenAI } from "@google/genai";
import { getAdminDb } from "@/lib/firebase/admin";

interface CommunitySummaryResult {
  community_signals: string[];
  recurring_problem: boolean;
  citizen_concern_level: "low" | "medium" | "high";
  summary: string;
  escalation_recommendation: boolean;
  reasoning: string;
}

const VALID_CONCERN_LEVELS = new Set(["low", "medium", "high"]);

function extractJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`No complete JSON object found in response: ${text.substring(0, 120)}`);
  }
  return text.slice(start, end + 1);
}

export async function summarizeCommunitySignals(issueId: string): Promise<void> {
  const db = getAdminDb();
  const issueRef = db.collection("issues").doc(issueId);

  try {
    const [issueSnap, commentsSnap] = await Promise.all([
      issueRef.get(),
      issueRef.collection("comments").orderBy("created_at", "asc").limit(30).get(),
    ]);

    if (!issueSnap.exists) return;
    const data = issueSnap.data()!;
    const aiData = data.ai as Record<string, unknown> | null;
    if (!aiData?.issue_type) return;

    const comments = commentsSnap.docs.map((d) => d.data().text as string);
    const confirmCount = (data.confirmation_count as number) ?? 0;
    const commentCount = comments.length;

    // Skip if not enough community signals
    if (commentCount < 3 && confirmCount < 3) return;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return;

    const loc = data.location as {
      address?: string | null;
      area_name?: string | null;
      zone_type?: string | null;
    } | null;

    const prompt = `You are a community intelligence analyst for a civic operations platform.

Analyze the community feedback for this civic issue and identify key signals.

ISSUE DETAILS:
- Type: ${String(aiData.issue_type)}
- Severity: ${String(aiData.severity ?? "unknown")}
- Location: ${loc?.address ?? "Unknown"}
- Area category: ${String(data.area_category ?? "Unknown")}
- Community confirmations: ${confirmCount}
- Total comments: ${commentCount}

CITIZEN COMMENTS:
${comments.length > 0 ? comments.map((c, i) => `${i + 1}. "${c}"`).join("\n") : "No comments yet."}

Return a JSON object with ALL of the following fields:

{
  "community_signals": ["list of key themes from citizen reports — e.g. 'recurring flooding reported', 'school transportation affected', 'emergency access concerns'. 3-5 signals max."],
  "recurring_problem": true or false (whether citizens indicate this is a recurring issue, not a one-time event),
  "citizen_concern_level": "low | medium | high",
  "summary": "2-3 sentences summarizing the community's collective concern, written for a municipal authority",
  "escalation_recommendation": true or false (whether community feedback suggests this needs escalation beyond normal priority),
  "reasoning": "1-2 sentences explaining why you assessed the concern level and escalation recommendation"
}

CONCERN LEVEL GUIDE:
- low: few signals, minor inconvenience, no safety concerns mentioned
- medium: multiple signals, disruption to daily life, some safety mentions
- high: strong community consensus, safety risks highlighted, vulnerable populations mentioned, repeated or worsening problem

Return only valid JSON. No markdown, no code fences, no explanation.`;

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        temperature: 0.2,
        maxOutputTokens: 800,
      },
    });

    const rawText = (response.text ?? "").trim();
    const jsonText = extractJson(rawText);
    const result = JSON.parse(jsonText) as CommunitySummaryResult;

    // Validate
    if (!Array.isArray(result.community_signals)) result.community_signals = [];
    if (!VALID_CONCERN_LEVELS.has(result.citizen_concern_level)) {
      result.citizen_concern_level = "medium";
    }
    result.recurring_problem = Boolean(result.recurring_problem);
    result.escalation_recommendation = Boolean(result.escalation_recommendation);

    // Write community intelligence to Firestore
    // community_summary and citizen_concern_level at ROOT for querying
    // detailed signals inside ai blob
    await issueRef.update({
      citizen_concern_level: result.citizen_concern_level,
      community_summary: result.summary,
      "ai.community_signals": result.community_signals,
      "ai.citizen_concern_level": result.citizen_concern_level,
      "ai.community_summary": result.summary,
      "ai.recurring_problem": result.recurring_problem,
      "ai.escalation_recommendation": result.escalation_recommendation,
      "ai.community_reasoning": result.reasoning,
      "ai.community_analyzed_at": Timestamp.now(),
      updated_at: Timestamp.now(),
    });

    console.info(
      `[${issueId}] Community intelligence: concern=${result.citizen_concern_level}, ` +
      `signals=${result.community_signals.length}, escalate=${result.escalation_recommendation}`,
    );
  } catch (err) {
    console.error(
      `[${issueId}] Community summarization failed:`,
      err instanceof Error ? err.message : err,
    );
  }
}
