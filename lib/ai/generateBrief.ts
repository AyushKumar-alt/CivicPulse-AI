import { Timestamp } from "firebase-admin/firestore";
import { GoogleGenAI } from "@google/genai";
import { getAdminDb } from "@/lib/firebase/admin";

export interface EscalationBrief {
  title: string;
  location: string;
  risk_summary: string;
  affected_population_estimate: string;
  recommended_action: string;
  urgency_level: "immediate" | "urgent" | "high";
  generated_at: { seconds: number; nanoseconds: number };
}

export async function generateEscalationBrief(issueId: string): Promise<void> {
  const db = getAdminDb();
  const issueRef = db.collection("issues").doc(issueId);
  const snap = await issueRef.get();
  if (!snap.exists) return;

  const data = snap.data()!;
  if (data.escalation_brief) return; // already generated

  const aiData = data.ai as Record<string, unknown> | null;
  if (!aiData?.issue_type) return;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return;

  const loc = data.location as {
    lat?: number; lng?: number;
    address?: string | null; zone_type?: string | null;
  } | null;
  const locStr = loc?.address ?? (loc?.lat != null ? `${loc.lat.toFixed(5)}, ${loc.lng!.toFixed(5)}` : "Unknown");
  const zone = loc?.zone_type ? loc.zone_type.replace(/_/g, " ") : "residential";
  const confirmCount = Number(data.confirmation_count ?? 0);

  const prompt = `Generate a formal municipal escalation brief for this civic issue.

Issue type: ${String(aiData.issue_type)}
Location: ${locStr}
Zone: ${zone}
AI Summary: ${String(aiData.summary ?? "")}
Safety Risk: ${String(aiData.safety_risk ?? "")}
Severity: ${String(aiData.severity ?? "")}
Community confirmations: ${confirmCount}
Responsible authority: ${String(aiData.responsible_authority ?? "")}

Return ONLY valid JSON — no markdown, no code fences:
{
  "title": "concise title referencing issue type and location (max 10 words)",
  "location": "full location including address and zone",
  "risk_summary": "2-3 sentences: immediate risk, infrastructure impact, consequence if unaddressed",
  "affected_population_estimate": "estimated people affected (e.g. 500-1000 daily commuters, residents of 3 nearby streets)",
  "recommended_action": "specific immediate action required from the responsible authority",
  "urgency_level": "immediate (life-threatening) OR urgent (injury risk within 24h) OR high (significant disruption)"
}`;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL ?? "gemini-3.6-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { responseMimeType: "application/json", temperature: 0.2, maxOutputTokens: 600 },
    });

    const raw = (response.text ?? "").trim();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end <= start) return;

    const brief = JSON.parse(raw.slice(start, end + 1)) as Omit<EscalationBrief, "generated_at">;
    // Normalise urgency_level to expected enum
    const knownLevels = new Set<string>(["immediate", "urgent", "high"]);
    const firstWord = (brief.urgency_level ?? "").toLowerCase().split(/\s/)[0];
    if (!knownLevels.has(brief.urgency_level)) {
      (brief as Record<string, unknown>).urgency_level = knownLevels.has(firstWord) ? firstWord : "high";
    }

    await issueRef.update({
      escalation_brief: { ...brief, generated_at: Timestamp.now() },
    });
    console.info(`[${issueId}] Escalation brief generated.`);
  } catch (err) {
    console.error(`[${issueId}] Brief generation failed:`, err instanceof Error ? err.message : err);
  }
}
