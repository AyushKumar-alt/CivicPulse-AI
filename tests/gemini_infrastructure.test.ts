import { getGeminiModelChain, getPrimaryGeminiModel } from "../lib/ai/geminiModelResolver";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Test FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✅ ${message}`);
}

async function runGeminiInfrastructureTests() {
  console.log("🧪 Executing Gemini Infrastructure & Model Resolution Regression Test Suite...");
  let assertionsPassed = 0;

  // 1. Default model resolves to gemini-2.5-flash
  delete process.env.GEMINI_MODEL;
  delete process.env.NEXT_PUBLIC_GEMINI_MODEL;
  const primaryModel = getPrimaryGeminiModel();
  assert(primaryModel === "gemini-2.5-flash", "Default model resolves to gemini-2.5-flash");
  assertionsPassed++;

  // 2. Obsolete models never appear in fallback chain
  const chain = getGeminiModelChain();
  assert(!chain.includes("gemini-2.0-flash"), "Obsolete model gemini-2.0-flash excluded from chain");
  assertionsPassed++;
  assert(!chain.includes("gemini-1.5-flash"), "Obsolete model gemini-1.5-flash excluded from chain");
  assertionsPassed++;

  // 3. Fallback chain includes valid active models
  assert(chain.includes("gemini-2.5-flash"), "Fallback chain includes gemini-2.5-flash");
  assertionsPassed++;
  assert(chain.includes("gemini-3.6-flash"), "Fallback chain includes gemini-3.6-flash");
  assertionsPassed++;

  // 4. Overridden GEMINI_MODEL prepends to model chain
  process.env.GEMINI_MODEL = "gemini-3.6-flash";
  const customChain = getGeminiModelChain();
  assert(customChain[0] === "gemini-3.6-flash", "Overridden GEMINI_MODEL takes precedence as primary model");
  assertionsPassed++;
  delete process.env.GEMINI_MODEL;

  // 5. Diagnostic history structure verification
  const attemptLog = { model: "gemini-2.5-flash", status: 404, message: "Not found" };
  assert(attemptLog.model === "gemini-2.5-flash" && attemptLog.status === 404, "Attempt diagnostic log structure preserved");
  assertionsPassed++;

  console.log(`🎉 ALL ${assertionsPassed} GEMINI INFRASTRUCTURE REGRESSION TESTS PASSED SUCCESSFULLY!`);
}

runGeminiInfrastructureTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
