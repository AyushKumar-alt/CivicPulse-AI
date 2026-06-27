import { getApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { GoogleGenerativeAI } from "@google/generative-ai";

interface AiResult {
  issue_type: string;
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;
  summary: string;
  safety_risk: string;
  responsible_authority: string;
}

const VALID_SEVERITIES = new Set(["low", "medium", "high", "critical"]);

function getDb() {
  return getFirestore(getApp(), "default");
}

function mimeTypeFromUrl(url: string): string {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

function buildPrompt(description: string, lat: number, lng: number): string {
  return `You are an AI assistant for Community Hero, a civic issue reporting platform.

Analyze the provided image and classify the civic issue shown.

Reporter description: "${description}"
GPS coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)}

Return a JSON object with exactly these fields:
{
  "issue_type": "concise label (e.g. Pothole, Garbage Dump, Broken Streetlight, Waterlogging, Open Manhole, Road Cave-in, Damaged Footpath, Sewage Leak, Stray Animals, Traffic Signal Fault)",
  "severity": "one of: low | medium | high | critical",
  "confidence": a number from 0.0 to 1.0,
  "summary": "2-3 sentences describing the issue for a municipal authority, referencing what is visible in the image",
  "safety_risk": "one sentence describing the public safety risk if unaddressed",
  "responsible_authority": "the municipal department most responsible (e.g. Public Works Department, Sanitation Department, Electrical Department, Traffic Engineering, Water & Sewerage Board)"
}

Severity guide:
- critical: immediate danger to life (open sewer, collapsed road, downed power lines, serious flooding)
- high: significant injury risk or major disruption (large pothole, broken streetlight on busy road, main water break)
- medium: noticeable impact on daily life (moderate road damage, intermittent signal fault, recurring illegal dumping)
- low: minor inconvenience with low risk (small crack, scattered litter, cosmetic damage)

Return only valid JSON. No markdown, no code fences, no explanation.`;
}

export async function analyzeIssue(
  issueId: string,
  data: FirebaseFirestore.DocumentData,
  geminiApiKey: string
): Promise<void> {
  const db = getDb();
  const issueRef = db.collection("issues").doc(issueId);

  try {
    // 1. Fetch image from Cloudinary
    const imageUrl = data.image_url as string;
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      throw new Error(`Image fetch failed: ${imageRes.status} ${imageRes.statusText}`);
    }
    const imageBuffer = await imageRes.arrayBuffer();
    const imageBase64 = Buffer.from(imageBuffer).toString("base64");
    const mimeType = mimeTypeFromUrl(imageUrl);

    // 2. Build prompt
    const description = (data.raw_description as string | undefined) ?? "";
    const location = data.location as { lat: number; lng: number };
    const prompt = buildPrompt(description || "No description provided.", location.lat, location.lng);

    // 3. Call Gemini 2.5 Flash
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { data: imageBase64, mimeType } },
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
        maxOutputTokens: 512,
      },
    });

    const responseText = result.response.text().trim();

    // 4. Parse and validate
    let aiResult: AiResult;
    try {
      aiResult = JSON.parse(responseText) as AiResult;
    } catch {
      throw new Error(`JSON parse failed. Raw response: ${responseText.substring(0, 300)}`);
    }

    const required: (keyof AiResult)[] = [
      "issue_type", "severity", "confidence", "summary", "safety_risk", "responsible_authority",
    ];
    for (const field of required) {
      if (!(field in aiResult) || aiResult[field] === undefined) {
        throw new Error(`Gemini response missing required field: ${field}`);
      }
    }

    if (!VALID_SEVERITIES.has(aiResult.severity)) {
      aiResult.severity = "medium";
    }
    aiResult.confidence = Math.min(1, Math.max(0, Number(aiResult.confidence) || 0));

    // 5. Write results to Firestore
    await issueRef.update({
      ai: {
        issue_type: aiResult.issue_type,
        severity: aiResult.severity,
        confidence: aiResult.confidence,
        summary: aiResult.summary,
        safety_risk: aiResult.safety_risk,
        responsible_authority: aiResult.responsible_authority,
        generated_at: Timestamp.now(),
      },
      status: "analyzed",
      updated_at: Timestamp.now(),
    });

    console.info(`[${issueId}] Analyzed: ${aiResult.issue_type} / ${aiResult.severity} / confidence=${aiResult.confidence}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${issueId}] Analysis failed:`, message);

    await issueRef.update({
      status: "error",
      "ai.error": message,
      updated_at: Timestamp.now(),
    });
  }
}
