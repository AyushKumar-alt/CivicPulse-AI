export const maxDuration = 30;

export async function GET() {
  // Step 1: no imports at all
  const results: Record<string, unknown> = { step1_alive: true };

  // Step 2: check env vars without importing anything
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? "";
  let saValid = false;
  let saError = "";
  try {
    const parsed = JSON.parse(saJson);
    saValid = !!(parsed.project_id && parsed.private_key && parsed.client_email);
    if (!saValid) saError = `Missing fields. Keys found: ${Object.keys(parsed).join(", ")}`;
  } catch (e) {
    saError = `JSON parse failed: ${e instanceof Error ? e.message : String(e)}`;
  }

  results.step2_env = {
    FIREBASE_SERVICE_ACCOUNT_JSON: saJson ? `set (${saJson.length} chars, valid=${saValid})` : "MISSING",
    FIREBASE_SA_ERROR: saError || "none",
    GEMINI_API_KEY: process.env.GEMINI_API_KEY ? "set" : "MISSING",
    NEXT_PUBLIC_GEMINI_API_KEY: process.env.NEXT_PUBLIC_GEMINI_API_KEY ? `set (${process.env.NEXT_PUBLIC_GEMINI_API_KEY.length} chars)` : "MISSING",
    NODE_VERSION: process.version,
  };

  // Step 3: try Firebase Admin init
  try {
    const { getAdminDb } = await import("@/lib/firebase/admin");
    getAdminDb();
    results.step3_firebase_admin = "OK";
  } catch (e) {
    results.step3_firebase_admin = `FAILED: ${e instanceof Error ? e.message : String(e)}`;
  }

  return Response.json(results);
}
