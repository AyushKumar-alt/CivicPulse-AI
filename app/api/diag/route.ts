import { GoogleGenAI } from "@google/genai";

export const maxDuration = 30;

export async function GET() {
  const results: Record<string, unknown> = {};

  // 1. Check GEMINI_API_KEY
  const apiKey = process.env.GEMINI_API_KEY ?? "";
  results.gemini_api_key = apiKey ? `set (${apiKey.length} chars, starts with ${apiKey.slice(0, 6)}...)` : "MISSING";

  // 2. Try calling Gemini with a simple text prompt
  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: 'Return the JSON: {"status":"ok"}' }] }],
        config: { responseMimeType: "application/json", maxOutputTokens: 50 },
      });
      results.gemini_test = { success: true, response: response.text?.slice(0, 200) ?? "(empty)" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.gemini_test = { success: false, error: msg.slice(0, 500) };
    }
  }

  // 3. Check Firebase Admin
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? "";
  let saValid = false;
  let saError = "";
  try {
    const parsed = JSON.parse(saJson);
    saValid = !!(parsed.project_id && parsed.private_key && parsed.client_email);
    results.firebase_sa = {
      length: saJson.length,
      valid: saValid,
      project_id: parsed.project_id ?? "MISSING",
      client_email: parsed.client_email ? `${parsed.client_email.slice(0, 20)}...` : "MISSING",
      has_private_key: !!parsed.private_key,
    };
  } catch (e) {
    saError = e instanceof Error ? e.message : String(e);
    results.firebase_sa = { length: saJson.length, valid: false, error: saError, first_chars: saJson.slice(0, 30) };
  }

  // 4. Try Firebase Admin init
  try {
    const { getAdminDb } = await import("@/lib/firebase/admin");
    const db = getAdminDb();
    // Try a simple read to test connectivity
    const testRef = db.collection("issues").limit(1);
    const snap = await testRef.get();
    results.firebase_admin = { success: true, docs_found: snap.size };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    results.firebase_admin = { success: false, error: msg.slice(0, 500) };
  }

  return Response.json(results, { headers: { "Cache-Control": "no-store" } });
}
