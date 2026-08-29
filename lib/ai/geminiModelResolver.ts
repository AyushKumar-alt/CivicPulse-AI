export interface GeminiAttemptLog {
  model: string;
  status: number;
  message: string;
}

/**
 * Returns the canonical ordered chain of Gemini models to attempt.
 * Primary model defaults to "gemini-2.5-flash" unless overridden by GEMINI_MODEL env var.
 * Obsolete models ("gemini-2.0-flash", "gemini-1.5-flash") are strictly excluded.
 */
export function getGeminiModelChain(): string[] {
  const configuredModel = process.env.GEMINI_MODEL || process.env.NEXT_PUBLIC_GEMINI_MODEL || "gemini-2.5-flash";
  const validModels = ["gemini-2.5-flash", "gemini-3.6-flash", "gemini-3.5-flash"];
  return Array.from(new Set([configuredModel, ...validModels]));
}

/**
 * Returns the primary Gemini model name.
 */
export function getPrimaryGeminiModel(): string {
  return getGeminiModelChain()[0] || "gemini-2.5-flash";
}
