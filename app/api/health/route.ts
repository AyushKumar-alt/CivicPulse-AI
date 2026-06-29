import { getAdminDb } from "@/lib/firebase/admin";

export const maxDuration = 30;

export async function GET() {
  const results: Record<string, unknown> = {};

  // Test 1: firebase-admin init
  try {
    const db = getAdminDb();
    results.firebase_admin = "ok";

    // Test 2: Firestore read
    try {
      const snap = await db.collection("issues").limit(1).get();
      results.firestore_read = `ok (${snap.size} docs)`;
    } catch (e) {
      results.firestore_read = `FAIL: ${e instanceof Error ? e.message : String(e)}`;
    }
  } catch (e) {
    results.firebase_admin = `FAIL: ${e instanceof Error ? e.message : String(e)}`;
    results.firestore_read = "skipped";
  }

  // Test 3: env vars present
  results.env = {
    FIREBASE_SERVICE_ACCOUNT_JSON: process.env.FIREBASE_SERVICE_ACCOUNT_JSON
      ? `set (${process.env.FIREBASE_SERVICE_ACCOUNT_JSON.length} chars)`
      : "MISSING",
    GEMINI_API_KEY: process.env.GEMINI_API_KEY ? "set" : "MISSING",
  };

  return Response.json(results);
}
