// Client-side wrapper — passes NEXT_PUBLIC_GEMINI_API_KEY to the shared governance function.
export type { GovernanceDecision, GovernanceReport, GovernanceOutput, GovernanceInput, ReworkOrder, AccountabilityReport } from "./generateGovernanceReview";

import { generateGovernanceReview } from "./generateGovernanceReview";
import type { GovernanceInput, GovernanceOutput } from "./generateGovernanceReview";

export function generateGovernanceReviewClient(input: GovernanceInput): Promise<GovernanceOutput> {
  const key = process.env.NEXT_PUBLIC_GEMINI_API_KEY ?? "";
  return generateGovernanceReview(input, key || undefined);
}
