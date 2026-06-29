// Client-side wrapper — passes NEXT_PUBLIC_GEMINI_API_KEY to the shared server function.
// The server function falls back to deterministic planning when the key is absent.
export { generateActionPlan as generateActionPlanClient } from "./generateActionPlan";
export type { ActionPlan, ActionPlanInput } from "./generateActionPlan";

import { generateActionPlan } from "./generateActionPlan";
import type { ActionPlanInput, ActionPlan } from "./generateActionPlan";

export function callGenerateActionPlan(input: ActionPlanInput): Promise<ActionPlan> {
  const key = process.env.NEXT_PUBLIC_GEMINI_API_KEY ?? "";
  return generateActionPlan(input, key || undefined);
}
