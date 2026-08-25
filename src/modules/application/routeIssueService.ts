import type { CanonicalCivicIssue, IssueRepository, RoutingDecision } from "@/src/modules/contracts";
import { err, ok, Result, ValidationError } from "@/src/modules/core";
import { DeterministicRoutingEngine } from "@/src/modules/routing";
import type { JurisdictionContext } from "@/src/modules/agency";

export class RouteIssueService {
  constructor(private issueRepository: IssueRepository) {}

  public async routeIssue(
    issueId: string,
    jurisdiction?: JurisdictionContext
  ): Promise<Result<RoutingDecision, ValidationError>> {
    if (!issueId || !issueId.trim()) {
      return err(new ValidationError("issueId must be a non-empty string", "issueId"));
    }

    const issue = await this.issueRepository.getById(issueId);
    if (!issue) {
      return err(new ValidationError(`Issue '${issueId}' not found`, "issueId"));
    }

    // Default classification if missing
    const classification = issue.aiObservations ?? {
      categoryKey: issue.categoryKey,
      subcategoryKey: "general",
      issueTypeKey: "general_civic_issue",
      issueTypeDisplayName: "Civic Issue",
      visualSeverity: "medium",
      confidence: 0.8,
      safetyRiskDescription: "Standard maintenance",
      priorityScore: 5.0,
      priorityReasoning: "Re-routing priority",
      visualObservations: [issue.rawDescription || "Citizen issue"],
    };

    // Execute Deterministic Routing Engine (AI has ZERO authority over agency assignment)
    const routingDecision = DeterministicRoutingEngine.route(issue.location, classification, jurisdiction);

    const updatedIssue: CanonicalCivicIssue = {
      ...issue,
      cityId: routingDecision.cityId || issue.cityId || "unresolved_city",
      assignedAgencyId: routingDecision.agencyId,
      assignedAgencyName: routingDecision.agencyName,
      routingDecision,
      updatedAt: new Date().toISOString(),
    };

    await this.issueRepository.save(updatedIssue);

    return ok(routingDecision);
  }
}
