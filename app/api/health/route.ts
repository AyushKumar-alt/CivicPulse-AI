export const maxDuration = 30;

export async function GET() {
  // Step 1: no imports at all
  const results: Record<string, unknown> = { step1_alive: true };

  // Step 2: check env vars without importing anything
  results.step2_env = {
    FIREBASE_SERVICE_ACCOUNT_JSON: process.env.FIREBASE_SERVICE_ACCOUNT_JSON
      ? `set (${process.env.FIREBASE_SERVICE_ACCOUNT_JSON.length} chars)`
      : "MISSING",
    GEMINI_API_KEY: process.env.GEMINI_API_KEY ? "set" : "MISSING",
    NODE_VERSION: process.version,
  };

  return Response.json(results);
}
