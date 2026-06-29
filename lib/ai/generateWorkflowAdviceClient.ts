// Client-side wrapper — passes NEXT_PUBLIC_GEMINI_API_KEY to the shared server function.
export type { WorkflowAdvice, WorkflowAdviceInput } from "./generateWorkflowAdvice";

import { generateWorkflowAdvice } from "./generateWorkflowAdvice";
import type { WorkflowAdviceInput, WorkflowAdvice } from "./generateWorkflowAdvice";

export function callGenerateWorkflowAdvice(input: WorkflowAdviceInput): Promise<WorkflowAdvice> {
  const key = process.env.NEXT_PUBLIC_GEMINI_API_KEY ?? "";
  return generateWorkflowAdvice(input, key || undefined);
}
